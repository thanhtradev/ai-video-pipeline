-- migrate:up

-- Kit and character set per clip (D-066, docs/episode-pipeline.md §3, §6). catalog_option mirrors
-- remotion/catalog.json for the parts the database needs: the slugs an episode brief may carry
-- and the Vietnamese labels Telegram shows. The brief keeps `kit` and `character_set`, filled
-- with the defaults when absent, so every job that gets the brief or version_selection() knows
-- which style and cast the clip uses.

CREATE TABLE catalog_option (
  kind text NOT NULL CHECK (kind IN ('kit', 'character_set')),
  slug text NOT NULL CHECK (slug ~ '^[a-z0-9-]{2,40}$'),
  label text NOT NULL,
  sort_order integer NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  enabled boolean NOT NULL DEFAULT true,
  PRIMARY KEY (kind, slug)
);
CREATE UNIQUE INDEX catalog_option_default_idx ON catalog_option (kind) WHERE is_default;

INSERT INTO catalog_option (kind, slug, label, sort_order, is_default) VALUES
  ('kit', 'whatif', 'Nếu bạn…', 1, true),
  ('kit', 'science', 'Khoa học', 2, false),
  ('character_set', 'chip', 'Chíp (BẠN)', 1, true),
  ('character_set', 'bip', 'Bíp', 2, false);

-- The default slug of a kind.
CREATE FUNCTION catalog_default(p_kind text) RETURNS text
LANGUAGE sql STABLE
AS $$
  SELECT slug FROM catalog_option WHERE kind = p_kind AND is_default AND enabled;
$$;

-- {"kit": {"slug", "label", "next_slug", "next_label"}, "character_set": {...}} for a brief: what
-- the clip uses and the option a Telegram button switches to (the next enabled one, wrapping).
CREATE FUNCTION catalog_selection(p_brief jsonb) RETURNS jsonb
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

-- Same as 20261028000100 plus kit / character_set: slugs of enabled catalog options, the
-- defaults when absent. STABLE now (reads catalog_option).
CREATE OR REPLACE FUNCTION episode_brief_normalize(p_brief jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_topic text := btrim(p_brief->>'topic');
  v_minutes numeric;
  v_full_brief text;
  v_kind text;
  v_slug text;
  v_selection jsonb := '{}'::jsonb;
BEGIN
  IF v_topic IS NULL OR length(v_topic) < 3 OR length(v_topic) > 500 THEN
    RAISE EXCEPTION 'invalid brief: topic must be 3-500 characters';
  END IF;

  IF p_brief ? 'duration_minutes' THEN
    IF jsonb_typeof(p_brief->'duration_minutes') <> 'number' THEN
      RAISE EXCEPTION 'invalid brief: duration_minutes must be a number';
    END IF;
    v_minutes := (p_brief->>'duration_minutes')::numeric;
    IF v_minutes <> trunc(v_minutes) OR v_minutes < 2 OR v_minutes > 12 THEN
      RAISE EXCEPTION 'invalid brief: duration_minutes must be an integer from 2 to 12';
    END IF;
  END IF;

  IF p_brief ? 'full_brief' AND jsonb_typeof(p_brief->'full_brief') <> 'string' THEN
    RAISE EXCEPTION 'invalid brief: full_brief must be text';
  END IF;
  -- Only surrounding blank lines are dropped: the narration inside must stay verbatim.
  v_full_brief := nullif(btrim(p_brief->>'full_brief', E' \t\r\n'), '');
  IF length(v_full_brief) > 30000 THEN
    RAISE EXCEPTION 'invalid brief: full_brief must be up to 30000 characters';
  END IF;

  IF p_brief ? 'notes' AND (jsonb_typeof(p_brief->'notes') <> 'string'
                            OR length(p_brief->>'notes') > 2000) THEN
    RAISE EXCEPTION 'invalid brief: notes must be text up to 2000 characters';
  END IF;

  FOREACH v_kind IN ARRAY ARRAY['kit', 'character_set'] LOOP
    v_slug := nullif(btrim(p_brief->>v_kind), '');
    IF v_slug IS NULL THEN
      v_slug := catalog_default(v_kind);
    ELSIF NOT EXISTS (SELECT 1 FROM catalog_option o
                      WHERE o.kind = v_kind AND o.slug = v_slug AND o.enabled) THEN
      RAISE EXCEPTION 'invalid brief: unknown % "%"', v_kind, v_slug;
    END IF;
    IF v_slug IS NULL THEN
      RAISE EXCEPTION 'invalid brief: no default % in catalog_option', v_kind;
    END IF;
    v_selection := v_selection || jsonb_build_object(v_kind, v_slug);
  END LOOP;

  RETURN jsonb_strip_nulls(jsonb_build_object(
    'format', 'episode',
    'topic', v_topic,
    'duration_minutes', v_minutes::integer,
    'full_brief', v_full_brief,
    'notes', nullif(btrim(p_brief->>'notes'), '')
  )) || v_selection;
END;
$$;

-- Same body as 20261028000100; STABLE because episode briefs read catalog_option.
CREATE OR REPLACE FUNCTION brief_normalize(p_brief jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_topic text := btrim(p_brief->>'topic');
  v_duration numeric;
  v_field text;
BEGIN
  IF p_brief->>'format' = 'episode' THEN
    RETURN episode_brief_normalize(p_brief);
  END IF;

  IF v_topic IS NULL OR length(v_topic) < 3 OR length(v_topic) > 500 THEN
    RAISE EXCEPTION 'invalid brief: topic must be 3-500 characters';
  END IF;

  IF jsonb_typeof(p_brief->'duration_seconds') <> 'number' THEN
    RAISE EXCEPTION 'invalid brief: duration_seconds must be a number';
  END IF;
  v_duration := (p_brief->>'duration_seconds')::numeric;
  -- Shorts must stay under 60 s (D-025).
  IF v_duration <> trunc(v_duration) OR v_duration < 15 OR v_duration > 59 THEN
    RAISE EXCEPTION 'invalid brief: duration_seconds must be an integer from 15 to 59';
  END IF;

  FOREACH v_field IN ARRAY ARRAY['audience', 'tone', 'notes'] LOOP
    IF p_brief ? v_field AND (jsonb_typeof(p_brief->v_field) <> 'string'
                              OR length(p_brief->>v_field) > 500) THEN
      RAISE EXCEPTION 'invalid brief: % must be text up to 500 characters', v_field;
    END IF;
  END LOOP;

  RETURN jsonb_strip_nulls(jsonb_build_object(
    'topic', v_topic,
    'duration_seconds', v_duration::integer,
    'audience', nullif(btrim(p_brief->>'audience'), ''),
    'tone', nullif(btrim(p_brief->>'tone'), ''),
    'notes', nullif(btrim(p_brief->>'notes'), '')
  ));
END;
$$;

-- {"kit", "character_set"} of a version's brief (the defaults for briefs made before D-066), for
-- the job inputs of steps that do not get the whole brief.
CREATE FUNCTION version_selection(p_version_id uuid) RETURNS jsonb
LANGUAGE sql STABLE
AS $$
  SELECT jsonb_build_object(
    'kit', coalesce(vv.brief->>'kit', catalog_default('kit')),
    'character_set', coalesce(vv.brief->>'character_set', catalog_default('character_set')))
  FROM video_version vv WHERE vv.id = p_version_id;
$$;

-- Same as 20261028000300 plus the selection.
CREATE OR REPLACE FUNCTION episode_code_job_create(p_version_id uuid) RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_script_id uuid;
  v_timing_id uuid;
  v_input jsonb;
BEGIN
  SELECT id INTO v_script_id FROM job
  WHERE video_version_id = p_version_id AND step = 'script' AND status = 'SUCCEEDED'
  ORDER BY updated_at DESC
  LIMIT 1;
  SELECT id INTO v_timing_id FROM job
  WHERE video_version_id = p_version_id AND step = 'timing' AND status <> 'CANCELLED'
  ORDER BY created_at DESC
  LIMIT 1;
  IF v_script_id IS NULL OR v_timing_id IS NULL THEN
    RAISE EXCEPTION 'version % needs a succeeded script job and a timing job', p_version_id;
  END IF;

  v_input := jsonb_build_object('script_job_id', v_script_id, 'timing_job_id', v_timing_id)
             || version_selection(p_version_id);
  RETURN job_create(p_version_id, 'episode_code', 'q:render', v_input, md5(v_input::text),
                    ARRAY[v_timing_id], 2);
END;
$$;

-- Same as 20261029000100 plus the selection (the version's, so a revision keeps its kit and cast).
CREATE OR REPLACE FUNCTION episode_code_revision_create(p_version_id uuid, p_feedback text) RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_previous job := episode_code_latest(p_version_id);
  v_input jsonb;
BEGIN
  IF v_previous.id IS NULL OR v_previous.status <> 'SUCCEEDED' THEN
    RAISE EXCEPTION 'version % has no finished episode code to revise', p_version_id;
  END IF;
  v_input := jsonb_build_object(
    'script_job_id', v_previous.input->'script_job_id',
    'timing_job_id', v_previous.input->'timing_job_id',
    'revision', jsonb_build_object('previous_job_id', v_previous.id, 'feedback', p_feedback))
    || version_selection(p_version_id);
  RETURN job_create(p_version_id, 'episode_code', 'q:render', v_input, md5(v_input::text),
                    '{}'::uuid[], 2);
END;
$$;

-- Same as 20261105000100 plus the selection (the metadata prompt describes the channel).
CREATE OR REPLACE FUNCTION metadata_job_create(p_version_id uuid, p_feedback text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_render job := final_render(p_version_id);
  v_previous job := final_step(p_version_id, 'metadata');
  v_input jsonb;
BEGIN
  IF v_render.id IS NULL OR v_render.status <> 'SUCCEEDED' THEN
    RAISE EXCEPTION 'version % has no finished final render', p_version_id;
  END IF;
  v_input := jsonb_build_object(
    'script_job_id', (episode_code_latest(p_version_id)).input->'script_job_id',
    'timing_job_id', v_render.input->'timing_job_id',
    'render_job_id', v_render.id,
    'round', metadata_round(p_version_id) + 1) || version_selection(p_version_id);
  IF v_previous.id IS NOT NULL THEN
    v_input := v_input || jsonb_build_object('revision', jsonb_build_object(
      'previous_job_id', v_previous.id, 'feedback', coalesce(p_feedback, '')));
  END IF;
  RETURN job_create(p_version_id, 'metadata', 'q:light', v_input, md5(v_input::text),
                    '{}'::uuid[], 2);
END;
$$;

-- Same as 20261102000100 plus `selection` (catalog_selection of the draft's brief) for the
-- confirmation message and its buttons.
DROP FUNCTION telegram_intake_draft(bigint, text, jsonb);
CREATE FUNCTION telegram_intake_draft(p_user_id bigint, p_chat_id text, p_brief jsonb)
RETURNS TABLE (result text, token text, expires_at timestamptz, brief jsonb, has_voice boolean,
               selection jsonb, error text)
LANGUAGE plpgsql
AS $$
#variable_conflict use_column
DECLARE
  v_brief jsonb;
  v_token text := replace(gen_random_uuid()::text, '-', '');
  v_expires timestamptz := now() + interval '1 hour';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM approver WHERE telegram_user_id = p_user_id AND active) THEN
    RETURN QUERY SELECT 'NOT_APPROVER'::text, NULL::text, NULL::timestamptz, NULL::jsonb,
                        NULL::boolean, NULL::jsonb, NULL::text;
    RETURN;
  END IF;
  BEGIN
    v_brief := brief_normalize(jsonb_set(coalesce(p_brief, '{}'::jsonb), '{format}', '"episode"'));
  EXCEPTION WHEN raise_exception THEN
    RETURN QUERY SELECT 'INVALID'::text, NULL::text, NULL::timestamptz, NULL::jsonb,
                        NULL::boolean, NULL::jsonb, SQLERRM;
    RETURN;
  END;
  PERFORM set_config('app.actor', 'telegram:' || p_user_id, true);
  INSERT INTO intake_draft (token, telegram_user_id, chat_id, brief, expires_at)
  VALUES (v_token, p_user_id, p_chat_id, v_brief, v_expires);
  RETURN QUERY SELECT 'DRAFT'::text, v_token, v_expires, v_brief,
    CASE WHEN v_brief ? 'full_brief' THEN v_brief->>'full_brief' ~* '(^|\n)[#*\s]*VOICE' END,
    catalog_selection(v_brief), NULL::text;
END;
$$;

-- A "Kit: …" / "Nhân vật: …" button on a pending draft: switches that choice to the next enabled
-- option and returns the draft as telegram_intake_draft() does. Result codes: DRAFT, NOT_APPROVER,
-- NOT_FOUND, NOT_PENDING, EXPIRED.
CREATE FUNCTION telegram_intake_cycle(p_token text, p_user_id bigint, p_kind text)
RETURNS TABLE (result text, token text, expires_at timestamptz, brief jsonb, has_voice boolean,
               selection jsonb, error text)
LANGUAGE plpgsql
AS $$
#variable_conflict use_column
DECLARE
  v_draft intake_draft%ROWTYPE;
  v_next text;
  v_brief jsonb;
BEGIN
  IF p_kind NOT IN ('kit', 'character_set') THEN
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
  v_next := catalog_selection(v_draft.brief)->p_kind->>'next_slug';
  v_brief := brief_normalize(jsonb_set(v_draft.brief, ARRAY[p_kind], to_jsonb(v_next)));
  PERFORM set_config('app.actor', 'telegram:' || p_user_id, true);
  UPDATE intake_draft SET brief = v_brief WHERE id = v_draft.id;
  RETURN QUERY SELECT 'DRAFT'::text, v_draft.token, v_draft.expires_at, v_brief,
    CASE WHEN v_brief ? 'full_brief' THEN v_brief->>'full_brief' ~* '(^|\n)[#*\s]*VOICE' END,
    catalog_selection(v_brief), NULL::text;
END;
$$;

-- migrate:down

DROP FUNCTION telegram_intake_cycle(text, bigint, text);
DROP FUNCTION telegram_intake_draft(bigint, text, jsonb);
-- Restores telegram_intake_draft of 20261102000100.
CREATE FUNCTION telegram_intake_draft(p_user_id bigint, p_chat_id text, p_brief jsonb)
RETURNS TABLE (result text, token text, expires_at timestamptz, brief jsonb, has_voice boolean,
               error text)
LANGUAGE plpgsql
AS $$
#variable_conflict use_column
DECLARE
  v_brief jsonb;
  v_token text := replace(gen_random_uuid()::text, '-', '');
  v_expires timestamptz := now() + interval '1 hour';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM approver WHERE telegram_user_id = p_user_id AND active) THEN
    RETURN QUERY SELECT 'NOT_APPROVER'::text, NULL::text, NULL::timestamptz, NULL::jsonb,
                        NULL::boolean, NULL::text;
    RETURN;
  END IF;
  BEGIN
    v_brief := brief_normalize(jsonb_set(coalesce(p_brief, '{}'::jsonb), '{format}', '"episode"'));
  EXCEPTION WHEN raise_exception THEN
    RETURN QUERY SELECT 'INVALID'::text, NULL::text, NULL::timestamptz, NULL::jsonb,
                        NULL::boolean, SQLERRM;
    RETURN;
  END;
  PERFORM set_config('app.actor', 'telegram:' || p_user_id, true);
  INSERT INTO intake_draft (token, telegram_user_id, chat_id, brief, expires_at)
  VALUES (v_token, p_user_id, p_chat_id, v_brief, v_expires);
  RETURN QUERY SELECT 'DRAFT'::text, v_token, v_expires, v_brief,
    CASE WHEN v_brief ? 'full_brief' THEN v_brief->>'full_brief' ~* '(^|\n)[#*\s]*VOICE' END,
    NULL::text;
END;
$$;

-- Restores metadata_job_create of 20261105000100.
CREATE OR REPLACE FUNCTION metadata_job_create(p_version_id uuid, p_feedback text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_render job := final_render(p_version_id);
  v_previous job := final_step(p_version_id, 'metadata');
  v_input jsonb;
BEGIN
  IF v_render.id IS NULL OR v_render.status <> 'SUCCEEDED' THEN
    RAISE EXCEPTION 'version % has no finished final render', p_version_id;
  END IF;
  v_input := jsonb_build_object(
    'script_job_id', (episode_code_latest(p_version_id)).input->'script_job_id',
    'timing_job_id', v_render.input->'timing_job_id',
    'render_job_id', v_render.id,
    'round', metadata_round(p_version_id) + 1);
  IF v_previous.id IS NOT NULL THEN
    v_input := v_input || jsonb_build_object('revision', jsonb_build_object(
      'previous_job_id', v_previous.id, 'feedback', coalesce(p_feedback, '')));
  END IF;
  RETURN job_create(p_version_id, 'metadata', 'q:light', v_input, md5(v_input::text),
                    '{}'::uuid[], 2);
END;
$$;

-- Restores episode_code_revision_create of 20261029000100.
CREATE OR REPLACE FUNCTION episode_code_revision_create(p_version_id uuid, p_feedback text) RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_previous job := episode_code_latest(p_version_id);
  v_input jsonb;
BEGIN
  IF v_previous.id IS NULL OR v_previous.status <> 'SUCCEEDED' THEN
    RAISE EXCEPTION 'version % has no finished episode code to revise', p_version_id;
  END IF;
  v_input := jsonb_build_object(
    'script_job_id', v_previous.input->'script_job_id',
    'timing_job_id', v_previous.input->'timing_job_id',
    'revision', jsonb_build_object('previous_job_id', v_previous.id, 'feedback', p_feedback));
  RETURN job_create(p_version_id, 'episode_code', 'q:render', v_input, md5(v_input::text),
                    '{}'::uuid[], 2);
END;
$$;

-- Restores episode_code_job_create of 20261028000300.
CREATE OR REPLACE FUNCTION episode_code_job_create(p_version_id uuid) RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_script_id uuid;
  v_timing_id uuid;
  v_input jsonb;
BEGIN
  SELECT id INTO v_script_id FROM job
  WHERE video_version_id = p_version_id AND step = 'script' AND status = 'SUCCEEDED'
  ORDER BY updated_at DESC
  LIMIT 1;
  SELECT id INTO v_timing_id FROM job
  WHERE video_version_id = p_version_id AND step = 'timing' AND status <> 'CANCELLED'
  ORDER BY created_at DESC
  LIMIT 1;
  IF v_script_id IS NULL OR v_timing_id IS NULL THEN
    RAISE EXCEPTION 'version % needs a succeeded script job and a timing job', p_version_id;
  END IF;

  v_input := jsonb_build_object('script_job_id', v_script_id, 'timing_job_id', v_timing_id);
  RETURN job_create(p_version_id, 'episode_code', 'q:render', v_input, md5(v_input::text),
                    ARRAY[v_timing_id], 2);
END;
$$;

DROP FUNCTION version_selection(uuid);

-- Restores brief_normalize and episode_brief_normalize of 20261028000100 (IMMUTABLE).
CREATE OR REPLACE FUNCTION brief_normalize(p_brief jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  v_topic text := btrim(p_brief->>'topic');
  v_duration numeric;
  v_field text;
BEGIN
  IF p_brief->>'format' = 'episode' THEN
    RETURN episode_brief_normalize(p_brief);
  END IF;

  IF v_topic IS NULL OR length(v_topic) < 3 OR length(v_topic) > 500 THEN
    RAISE EXCEPTION 'invalid brief: topic must be 3-500 characters';
  END IF;

  IF jsonb_typeof(p_brief->'duration_seconds') <> 'number' THEN
    RAISE EXCEPTION 'invalid brief: duration_seconds must be a number';
  END IF;
  v_duration := (p_brief->>'duration_seconds')::numeric;
  -- Shorts must stay under 60 s (D-025).
  IF v_duration <> trunc(v_duration) OR v_duration < 15 OR v_duration > 59 THEN
    RAISE EXCEPTION 'invalid brief: duration_seconds must be an integer from 15 to 59';
  END IF;

  FOREACH v_field IN ARRAY ARRAY['audience', 'tone', 'notes'] LOOP
    IF p_brief ? v_field AND (jsonb_typeof(p_brief->v_field) <> 'string'
                              OR length(p_brief->>v_field) > 500) THEN
      RAISE EXCEPTION 'invalid brief: % must be text up to 500 characters', v_field;
    END IF;
  END LOOP;

  RETURN jsonb_strip_nulls(jsonb_build_object(
    'topic', v_topic,
    'duration_seconds', v_duration::integer,
    'audience', nullif(btrim(p_brief->>'audience'), ''),
    'tone', nullif(btrim(p_brief->>'tone'), ''),
    'notes', nullif(btrim(p_brief->>'notes'), '')
  ));
END;
$$;

CREATE OR REPLACE FUNCTION episode_brief_normalize(p_brief jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  v_topic text := btrim(p_brief->>'topic');
  v_minutes numeric;
  v_full_brief text;
BEGIN
  IF v_topic IS NULL OR length(v_topic) < 3 OR length(v_topic) > 500 THEN
    RAISE EXCEPTION 'invalid brief: topic must be 3-500 characters';
  END IF;

  IF p_brief ? 'duration_minutes' THEN
    IF jsonb_typeof(p_brief->'duration_minutes') <> 'number' THEN
      RAISE EXCEPTION 'invalid brief: duration_minutes must be a number';
    END IF;
    v_minutes := (p_brief->>'duration_minutes')::numeric;
    IF v_minutes <> trunc(v_minutes) OR v_minutes < 2 OR v_minutes > 12 THEN
      RAISE EXCEPTION 'invalid brief: duration_minutes must be an integer from 2 to 12';
    END IF;
  END IF;

  IF p_brief ? 'full_brief' AND jsonb_typeof(p_brief->'full_brief') <> 'string' THEN
    RAISE EXCEPTION 'invalid brief: full_brief must be text';
  END IF;
  -- Only surrounding blank lines are dropped: the narration inside must stay verbatim.
  v_full_brief := nullif(btrim(p_brief->>'full_brief', E' \t\r\n'), '');
  IF length(v_full_brief) > 30000 THEN
    RAISE EXCEPTION 'invalid brief: full_brief must be up to 30000 characters';
  END IF;

  IF p_brief ? 'notes' AND (jsonb_typeof(p_brief->'notes') <> 'string'
                            OR length(p_brief->>'notes') > 2000) THEN
    RAISE EXCEPTION 'invalid brief: notes must be text up to 2000 characters';
  END IF;

  RETURN jsonb_strip_nulls(jsonb_build_object(
    'format', 'episode',
    'topic', v_topic,
    'duration_minutes', v_minutes::integer,
    'full_brief', v_full_brief,
    'notes', nullif(btrim(p_brief->>'notes'), '')
  ));
END;
$$;

DROP FUNCTION catalog_selection(jsonb);
DROP FUNCTION catalog_default(text);
DROP TABLE catalog_option;
