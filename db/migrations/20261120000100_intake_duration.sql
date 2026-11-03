-- migrate:up

-- D-091: the /new draft gets a "Thời lượng" button that cycles the episode length before Tạo:
-- Tự động (no duration_minutes, the script aims for about 6 minutes) → 3, 4, 5, 6, 8, 10, 12 →
-- Tự động. A full brief has no length to choose: its narration is copied verbatim from the VOICE
-- section, so the draft shows an estimate from the VOICE word count instead and the button is
-- refused (FULL_BRIEF). The rate matches the script step (WORDS_PER_SECOND = 3.2, D-052).

-- Spoken words of the VOICE section of a full brief: the lines after the first "VOICE" heading
-- (the has_voice test of telegram_intake_draft) up to the next "===" or "#" heading, without
-- [audio tags] and punctuation-only tokens. NULL when there is no VOICE section.
CREATE FUNCTION brief_voice_words(p_full_brief text) RETURNS integer
LANGUAGE sql IMMUTABLE
AS $$
  WITH lines AS (
    SELECT t.line, t.n FROM regexp_split_to_table(p_full_brief, E'\r?\n') WITH ORDINALITY AS t(line, n)
  ),
  heading AS (
    SELECT min(n) AS n FROM lines WHERE line ~* '^[#*\s]*VOICE'
  ),
  stop AS (
    SELECT min(l.n) AS n FROM lines l, heading h WHERE l.n > h.n AND l.line ~ '^\s*(===|#)'
  )
  SELECT CASE WHEN h.n IS NULL THEN NULL ELSE (
    SELECT count(*)::integer
    FROM lines l,
         regexp_split_to_table(regexp_replace(l.line, '\[[^]]*\]', ' ', 'g'), '\s+') AS w(word)
    WHERE l.n > h.n AND (s.n IS NULL OR l.n < s.n)
      AND w.word ~ '[^[:punct:][:space:]—–…“”‘’«»]'
  ) END
  FROM heading h, stop s;
$$;

-- The draft's length: the current choice plus the next one, as worker_selection(); for a full
-- brief the VOICE estimate (follows_voice).
CREATE FUNCTION duration_selection(p_brief jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  c_choices constant integer[] := ARRAY[3, 4, 5, 6, 8, 10, 12];
  c_words_per_minute constant numeric := 3.2 * 60;
  c_auto_label constant text := 'Tự động (~6 phút)';
  v_minutes integer := (p_brief->>'duration_minutes')::integer;
  v_words integer;
  v_next integer;
BEGIN
  IF p_brief ? 'full_brief' THEN
    v_words := brief_voice_words(p_brief->>'full_brief');
    RETURN jsonb_build_object(
      'follows_voice', true,
      'voice_words', v_words,
      'voice_minutes', round(v_words / c_words_per_minute, 1));
  END IF;
  SELECT min(c) INTO v_next FROM unnest(c_choices) AS c WHERE c > coalesce(v_minutes, 0);
  RETURN jsonb_build_object(
    'follows_voice', false,
    'minutes', v_minutes,
    'label', CASE WHEN v_minutes IS NULL THEN c_auto_label ELSE v_minutes || ' phút' END,
    'next_minutes', v_next,
    'next_label', CASE WHEN v_next IS NULL THEN 'Tự động' ELSE v_next || ' phút' END);
END;
$$;

-- Same as 20261117000100 plus the length.
CREATE OR REPLACE FUNCTION intake_selection(p_brief jsonb, p_worker_id text) RETURNS jsonb
LANGUAGE sql STABLE
AS $$
  SELECT catalog_selection(p_brief)
      || jsonb_build_object('worker', worker_selection(p_worker_id),
                            'duration', duration_selection(p_brief));
$$;

-- Same as 20261117000100 plus kind 'duration' (the Thời lượng button), refused for a full brief.
CREATE OR REPLACE FUNCTION telegram_intake_cycle(p_token text, p_user_id bigint, p_kind text)
RETURNS TABLE (result text, token text, expires_at timestamptz, brief jsonb, has_voice boolean,
               selection jsonb, error text)
LANGUAGE plpgsql
AS $$
#variable_conflict use_column
DECLARE
  v_draft intake_draft%ROWTYPE;
  v_next text;
  v_brief jsonb;
  v_worker text;
  v_minutes jsonb;
BEGIN
  IF p_kind NOT IN ('kit', 'character_set', 'worker', 'duration') THEN
    RAISE EXCEPTION 'invalid kind %', p_kind;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM approver WHERE telegram_user_id = p_user_id AND active) THEN
    RETURN QUERY SELECT 'NOT_APPROVER'::text, NULL::text, NULL::timestamptz, NULL::jsonb,
                        NULL::boolean, NULL::jsonb, NULL::text;
    RETURN;
  END IF;
  SELECT * INTO v_draft FROM intake_draft d WHERE d.token = p_token FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'NOT_FOUND'::text, NULL::text, NULL::timestamptz, NULL::jsonb,
                        NULL::boolean, NULL::jsonb, NULL::text;
    RETURN;
  END IF;
  IF v_draft.status <> 'PENDING' THEN
    RETURN QUERY SELECT 'NOT_PENDING'::text, NULL::text, NULL::timestamptz, NULL::jsonb,
                        NULL::boolean, NULL::jsonb, NULL::text;
    RETURN;
  END IF;
  IF v_draft.expires_at <= now() THEN
    UPDATE intake_draft SET status = 'EXPIRED' WHERE id = v_draft.id;
    RETURN QUERY SELECT 'EXPIRED'::text, NULL::text, NULL::timestamptz, NULL::jsonb,
                        NULL::boolean, NULL::jsonb, NULL::text;
    RETURN;
  END IF;
  IF p_kind = 'duration' AND v_draft.brief ? 'full_brief' THEN
    RETURN QUERY SELECT 'FULL_BRIEF'::text, NULL::text, NULL::timestamptz, NULL::jsonb,
                        NULL::boolean, NULL::jsonb, NULL::text;
    RETURN;
  END IF;
  v_brief := v_draft.brief;
  v_worker := v_draft.worker_id;
  IF p_kind = 'worker' THEN
    v_worker := worker_selection(v_draft.worker_id)->>'next_slug';
  ELSIF p_kind = 'duration' THEN
    v_minutes := duration_selection(v_draft.brief)->'next_minutes';
    v_brief := brief_normalize(CASE WHEN jsonb_typeof(v_minutes) = 'number'
                                    THEN v_draft.brief || jsonb_build_object('duration_minutes', v_minutes)
                                    ELSE v_draft.brief - 'duration_minutes' END);
  ELSE
    v_next := catalog_selection(v_draft.brief)->p_kind->>'next_slug';
    v_brief := brief_normalize(jsonb_set(v_draft.brief, ARRAY[p_kind], to_jsonb(v_next)));
  END IF;
  PERFORM set_config('app.actor', 'telegram:' || p_user_id, true);
  UPDATE intake_draft SET brief = v_brief, worker_id = v_worker WHERE id = v_draft.id;
  RETURN QUERY SELECT 'DRAFT'::text, v_draft.token, v_draft.expires_at, v_brief,
    CASE WHEN v_brief ? 'full_brief' THEN v_brief->>'full_brief' ~* '(^|\n)[#*\s]*VOICE' END,
    intake_selection(v_brief, v_worker), NULL::text;
END;
$$;

-- migrate:down

-- Restores telegram_intake_cycle and intake_selection of 20261117000100.
CREATE OR REPLACE FUNCTION telegram_intake_cycle(p_token text, p_user_id bigint, p_kind text)
RETURNS TABLE (result text, token text, expires_at timestamptz, brief jsonb, has_voice boolean,
               selection jsonb, error text)
LANGUAGE plpgsql
AS $$
#variable_conflict use_column
DECLARE
  v_draft intake_draft%ROWTYPE;
  v_next text;
  v_brief jsonb;
  v_worker text;
BEGIN
  IF p_kind NOT IN ('kit', 'character_set', 'worker') THEN
    RAISE EXCEPTION 'invalid kind %', p_kind;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM approver WHERE telegram_user_id = p_user_id AND active) THEN
    RETURN QUERY SELECT 'NOT_APPROVER'::text, NULL::text, NULL::timestamptz, NULL::jsonb,
                        NULL::boolean, NULL::jsonb, NULL::text;
    RETURN;
  END IF;
  SELECT * INTO v_draft FROM intake_draft d WHERE d.token = p_token FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'NOT_FOUND'::text, NULL::text, NULL::timestamptz, NULL::jsonb,
                        NULL::boolean, NULL::jsonb, NULL::text;
    RETURN;
  END IF;
  IF v_draft.status <> 'PENDING' THEN
    RETURN QUERY SELECT 'NOT_PENDING'::text, NULL::text, NULL::timestamptz, NULL::jsonb,
                        NULL::boolean, NULL::jsonb, NULL::text;
    RETURN;
  END IF;
  IF v_draft.expires_at <= now() THEN
    UPDATE intake_draft SET status = 'EXPIRED' WHERE id = v_draft.id;
    RETURN QUERY SELECT 'EXPIRED'::text, NULL::text, NULL::timestamptz, NULL::jsonb,
                        NULL::boolean, NULL::jsonb, NULL::text;
    RETURN;
  END IF;
  v_brief := v_draft.brief;
  v_worker := v_draft.worker_id;
  IF p_kind = 'worker' THEN
    v_worker := worker_selection(v_draft.worker_id)->>'next_slug';
  ELSE
    v_next := catalog_selection(v_draft.brief)->p_kind->>'next_slug';
    v_brief := brief_normalize(jsonb_set(v_draft.brief, ARRAY[p_kind], to_jsonb(v_next)));
  END IF;
  PERFORM set_config('app.actor', 'telegram:' || p_user_id, true);
  UPDATE intake_draft SET brief = v_brief, worker_id = v_worker WHERE id = v_draft.id;
  RETURN QUERY SELECT 'DRAFT'::text, v_draft.token, v_draft.expires_at, v_brief,
    CASE WHEN v_brief ? 'full_brief' THEN v_brief->>'full_brief' ~* '(^|\n)[#*\s]*VOICE' END,
    intake_selection(v_brief, v_worker), NULL::text;
END;
$$;

CREATE OR REPLACE FUNCTION intake_selection(p_brief jsonb, p_worker_id text) RETURNS jsonb
LANGUAGE sql STABLE
AS $$
  SELECT catalog_selection(p_brief) || jsonb_build_object('worker', worker_selection(p_worker_id));
$$;

DROP FUNCTION duration_selection(jsonb);
DROP FUNCTION brief_voice_words(text);
