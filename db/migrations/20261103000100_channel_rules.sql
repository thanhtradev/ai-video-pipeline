-- migrate:up

-- Channel rules (D-059), kept by the owner from Telegram: `video` rules (what every video must or
-- must not do) and `tts` rules (how narration lines are written for the voice) go into the script
-- prompt and the episode agent's workspace; `pronunciation` maps a written term to how the voice
-- says it (the worker replaces it in the TTS text only; captions keep the term). Each step reads the
-- current rules when it starts and records their version. Rows are never deleted: an edit is a
-- removal (deleted_at) plus a new row, so the history stays.

CREATE TABLE rule (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  scope text NOT NULL CHECK (scope IN ('video', 'tts')),
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by bigint NOT NULL,
  deleted_at timestamptz,
  deleted_by bigint
);

CREATE TABLE pronunciation (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- Matched case-sensitively as a whole word ("AI" is not "ai").
  term text NOT NULL CHECK (length(term) BETWEEN 1 AND 100 AND term !~ '[=\[\]\n]'),
  spoken text NOT NULL CHECK (length(spoken) BETWEEN 1 AND 200 AND spoken !~ '[\[\]\n]'),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by bigint NOT NULL,
  deleted_at timestamptz,
  deleted_by bigint
);
CREATE UNIQUE INDEX pronunciation_active_term ON pronunciation (term) WHERE deleted_at IS NULL;

CREATE FUNCTION rules_max() RETURNS integer
LANGUAGE sql IMMUTABLE
AS $$ SELECT 200; $$;

-- The current rules; version is a hash of their content, recorded by every step that used them.
CREATE FUNCTION rules_snapshot() RETURNS jsonb
LANGUAGE sql STABLE
AS $$
  WITH content AS (
    SELECT
      coalesce((SELECT jsonb_agg(jsonb_build_object('id', id, 'text', body) ORDER BY id)
                FROM rule WHERE scope = 'video' AND deleted_at IS NULL), '[]'::jsonb) AS video,
      coalesce((SELECT jsonb_agg(jsonb_build_object('id', id, 'text', body) ORDER BY id)
                FROM rule WHERE scope = 'tts' AND deleted_at IS NULL), '[]'::jsonb) AS tts,
      coalesce((SELECT jsonb_agg(jsonb_build_object('id', id, 'term', term, 'spoken', spoken)
                                 ORDER BY term)
                FROM pronunciation WHERE deleted_at IS NULL), '[]'::jsonb) AS pronunciation
  )
  SELECT jsonb_build_object(
           'version', md5(jsonb_build_array(video, tts, pronunciation)::text),
           'video', video, 'tts', tts, 'pronunciation', pronunciation)
  FROM content;
$$;

-- Worker: the rules at the start of a step.
CREATE FUNCTION rules_current(p_worker_id text) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM assert_worker_identity(p_worker_id);
  RETURN rules_snapshot();
END;
$$;

-- One rule per list item of a Markdown text ("- …", "* …", "1. …"); other lines are ignored.
CREATE FUNCTION rules_parse_items(p_text text) RETURNS TABLE (item text)
LANGUAGE sql IMMUTABLE
AS $$
  SELECT btrim(m[1])
  FROM regexp_split_to_table(coalesce(p_text, ''), E'\r?\n') AS line,
       regexp_match(line, '^\s*(?:[-*+]|\d+[.)])\s+(.+)$') AS m
  WHERE m IS NOT NULL AND btrim(m[1]) <> '';
$$;

-- Telegram (WF-06), approvers only. Actions:
--   VIEW                      the snapshot (p_scope ignored)
--   ADD    scope video|tts    p_text = the rule
--   DELETE                    p_text = the rule id
--   SET    scope video|tts|pronunciation   p_text = Markdown list replacing the whole scope
--   SAY                       p_text = term, p_extra = how to say it (replaces an earlier one)
--   UNSAY                     p_text = term
-- Result codes: OK, NOT_APPROVER, NOT_FOUND, INVALID (detail says why). detail of ADD is the id.
CREATE FUNCTION telegram_rules(p_user_id bigint, p_action text, p_scope text, p_text text,
                               p_extra text DEFAULT NULL)
RETURNS TABLE (result text, detail text, rules jsonb)
LANGUAGE plpgsql
AS $$
#variable_conflict use_column
DECLARE
  v_text text := btrim(coalesce(p_text, ''));
  v_extra text := btrim(coalesce(p_extra, ''));
  v_id bigint;
  v_count integer;
  v_item text;
  v_pair text[];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM approver WHERE telegram_user_id = p_user_id AND active) THEN
    RETURN QUERY SELECT 'NOT_APPROVER'::text, NULL::text, NULL::jsonb;
    RETURN;
  END IF;
  PERFORM set_config('app.actor', 'telegram:' || p_user_id, true);

  BEGIN
    CASE p_action
    WHEN 'VIEW' THEN
      NULL;
    WHEN 'ADD' THEN
      IF p_scope NOT IN ('video', 'tts') THEN
        RAISE EXCEPTION 'scope must be video or tts';
      END IF;
      IF (SELECT count(*) FROM rule WHERE deleted_at IS NULL) >= rules_max() THEN
        RAISE EXCEPTION 'at most % rules', rules_max();
      END IF;
      INSERT INTO rule (scope, body, created_by) VALUES (p_scope, v_text, p_user_id)
      RETURNING id INTO v_id;
      PERFORM audit(current_actor(), 'rule_add', 'rule', v_id::text,
                    jsonb_build_object('scope', p_scope, 'text', v_text));
      RETURN QUERY SELECT 'OK'::text, v_id::text, rules_snapshot();
      RETURN;
    WHEN 'DELETE' THEN
      IF v_text !~ '^\d{1,18}$' THEN
        RAISE EXCEPTION 'give the rule number shown by /rules';
      END IF;
      UPDATE rule SET deleted_at = now(), deleted_by = p_user_id
      WHERE id = v_text::bigint AND deleted_at IS NULL;
      IF NOT FOUND THEN
        RETURN QUERY SELECT 'NOT_FOUND'::text, v_text, NULL::jsonb;
        RETURN;
      END IF;
      PERFORM audit(current_actor(), 'rule_delete', 'rule', v_text, '{}'::jsonb);
    WHEN 'SET' THEN
      IF p_scope NOT IN ('video', 'tts', 'pronunciation') THEN
        RAISE EXCEPTION 'scope must be video, tts or pronunciation';
      END IF;
      SELECT count(*) INTO v_count FROM rules_parse_items(v_text);
      IF v_count > rules_max() THEN
        RAISE EXCEPTION 'at most % items', rules_max();
      END IF;
      IF p_scope = 'pronunciation' THEN
        UPDATE pronunciation SET deleted_at = now(), deleted_by = p_user_id
        WHERE deleted_at IS NULL;
        FOR v_item IN SELECT item FROM rules_parse_items(v_text) LOOP
          v_pair := regexp_match(v_item, '^(.+?)\s*=\s*(.+)$');
          IF v_pair IS NULL THEN
            RAISE EXCEPTION 'not "term = how to say it": %', left(v_item, 80);
          END IF;
          INSERT INTO pronunciation (term, spoken, created_by)
          VALUES (btrim(v_pair[1]), btrim(v_pair[2]), p_user_id);
        END LOOP;
      ELSE
        UPDATE rule SET deleted_at = now(), deleted_by = p_user_id
        WHERE scope = p_scope AND deleted_at IS NULL;
        INSERT INTO rule (scope, body, created_by)
        SELECT p_scope, item, p_user_id FROM rules_parse_items(v_text);
      END IF;
      PERFORM audit(current_actor(), 'rules_set', 'rule', p_scope,
                    jsonb_build_object('items', v_count));
    WHEN 'SAY' THEN
      IF v_text = '' OR v_extra = '' THEN
        RAISE EXCEPTION 'use: /say <term> = <how to say it>';
      END IF;
      UPDATE pronunciation SET deleted_at = now(), deleted_by = p_user_id
      WHERE term = v_text AND deleted_at IS NULL;
      INSERT INTO pronunciation (term, spoken, created_by) VALUES (v_text, v_extra, p_user_id);
      PERFORM audit(current_actor(), 'pronunciation_set', 'pronunciation', v_text,
                    jsonb_build_object('spoken', v_extra));
    WHEN 'UNSAY' THEN
      UPDATE pronunciation SET deleted_at = now(), deleted_by = p_user_id
      WHERE term = v_text AND deleted_at IS NULL;
      IF NOT FOUND THEN
        RETURN QUERY SELECT 'NOT_FOUND'::text, v_text, NULL::jsonb;
        RETURN;
      END IF;
      PERFORM audit(current_actor(), 'pronunciation_delete', 'pronunciation', v_text, '{}'::jsonb);
    ELSE
      RAISE EXCEPTION 'unknown action %', p_action;
    END CASE;
  EXCEPTION
    WHEN raise_exception OR check_violation OR not_null_violation OR unique_violation THEN
      RETURN QUERY SELECT 'INVALID'::text, SQLERRM, NULL::jsonb;
      RETURN;
  END;
  RETURN QUERY SELECT 'OK'::text, NULL::text, rules_snapshot();
END;
$$;

-- migrate:down

DROP FUNCTION telegram_rules(bigint, text, text, text, text);
DROP FUNCTION rules_parse_items(text);
DROP FUNCTION rules_current(text);
DROP FUNCTION rules_snapshot();
DROP FUNCTION rules_max();
DROP TABLE pronunciation;
DROP TABLE rule;
