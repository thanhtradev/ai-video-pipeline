-- migrate:up

-- D-092 follow-up: a draft button that changes nothing failed WF-06 with Telegram's "message is
-- not modified" (n8n node "Edit confirmation", 2026-11-03). The Nhân vật button of an English
-- draft cycled to a Vietnamese cast that brief_pair_language() turned back into chip-en.
-- catalog_selection() now offers only casts of the kit's language, and telegram_intake_cycle()
-- answers UNCHANGED instead of DRAFT when the brief and worker stay the same (one option left),
-- which WF-06 shows as a short answer without editing the message.

-- Same as 20261106000100 except casts are limited to the kit's language.
CREATE OR REPLACE FUNCTION catalog_selection(p_brief jsonb) RETURNS jsonb
LANGUAGE sql STABLE
AS $$
  WITH chosen AS (
    SELECT k.kind, coalesce(p_brief->>k.kind, catalog_default(k.kind)) AS slug
    FROM (VALUES ('kit'), ('character_set')) AS k(kind)
  ),
  ranked AS (
    SELECT o.kind, o.slug, o.label,
           row_number() OVER (PARTITION BY o.kind ORDER BY o.sort_order, o.slug) AS pos,
           count(*) OVER (PARTITION BY o.kind) AS total
    FROM catalog_option o
    WHERE o.enabled
      -- a cast of the kit's language only (D-092)
      AND (o.kind = 'kit' OR o.language = kit_language(coalesce(p_brief->>'kit', catalog_default('kit'))))
  )
  SELECT jsonb_object_agg(c.kind, jsonb_build_object(
    'slug', cur.slug, 'label', cur.label,
    'next_slug', nxt.slug, 'next_label', nxt.label))
  FROM chosen c
  JOIN ranked cur ON cur.kind = c.kind AND cur.slug = c.slug
  JOIN ranked nxt ON nxt.kind = c.kind AND nxt.pos = (cur.pos % cur.total) + 1;
$$;

-- Same as 20261120000100 plus UNCHANGED.
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
  -- Nothing to change (a single option, e.g. the one English cast): Telegram would refuse to
  -- edit the message into the same content ("message is not modified").
  IF v_brief = v_draft.brief AND v_worker IS NOT DISTINCT FROM v_draft.worker_id THEN
    RETURN QUERY SELECT 'UNCHANGED'::text, v_draft.token, v_draft.expires_at, v_brief, NULL::boolean,
      intake_selection(v_brief, v_worker), NULL::text;
    RETURN;
  END IF;
  PERFORM set_config('app.actor', 'telegram:' || p_user_id, true);
  UPDATE intake_draft SET brief = v_brief, worker_id = v_worker WHERE id = v_draft.id;
  RETURN QUERY SELECT 'DRAFT'::text, v_draft.token, v_draft.expires_at, v_brief,
    CASE WHEN v_brief ? 'full_brief' THEN v_brief->>'full_brief' ~* '(^|\n)[#*\s]*VOICE' END,
    intake_selection(v_brief, v_worker), NULL::text;
END;
$$;

-- migrate:down

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

CREATE OR REPLACE FUNCTION catalog_selection(p_brief jsonb) RETURNS jsonb
LANGUAGE sql STABLE
AS $$
  WITH chosen AS (
    SELECT k.kind, coalesce(p_brief->>k.kind, catalog_default(k.kind)) AS slug
    FROM (VALUES ('kit'), ('character_set')) AS k(kind)
  ),
  ranked AS (
    SELECT o.kind, o.slug, o.label,
           row_number() OVER (PARTITION BY o.kind ORDER BY o.sort_order, o.slug) AS pos,
           count(*) OVER (PARTITION BY o.kind) AS total
    FROM catalog_option o WHERE o.enabled
  )
  SELECT jsonb_object_agg(c.kind, jsonb_build_object(
    'slug', cur.slug, 'label', cur.label,
    'next_slug', nxt.slug, 'next_label', nxt.label))
  FROM chosen c
  JOIN ranked cur ON cur.kind = c.kind AND cur.slug = c.slug
  JOIN ranked nxt ON nxt.kind = c.kind AND nxt.pos = (cur.pos % cur.total) + 1;
$$;
