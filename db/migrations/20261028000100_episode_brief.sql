-- migrate:up

-- Intake of 16:9 TikTok 2 channel episodes (D-050, docs/episode-pipeline.md §3). WF-01 keeps
-- calling video_submit; a brief with format "episode" is validated here and becomes a 16:9 video.
-- Hybrid brief: a topic (Claude writes the episode) and/or the user's full brief (kept verbatim).

CREATE FUNCTION episode_brief_normalize(p_brief jsonb) RETURNS jsonb
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

-- Same as 20261025000100 for Shorts briefs; episode briefs go to episode_brief_normalize.
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

-- Same as 20261025000100 except the aspect ratio: episodes are 16:9 (D-050), Shorts 9:16.
CREATE OR REPLACE FUNCTION video_submit(p_submission_id text, p_brief jsonb)
RETURNS TABLE (video_id uuid, version_id uuid, job_id uuid, created boolean)
LANGUAGE plpgsql
AS $$
#variable_conflict use_column
DECLARE
  v_brief jsonb := brief_normalize(p_brief);
  v_project_id uuid;
  v_batch_id uuid;
  v_video_id uuid;
  v_version_id uuid;
BEGIN
  IF p_submission_id IS NULL OR length(p_submission_id) = 0 THEN
    RAISE EXCEPTION 'submission id is required';
  END IF;
  PERFORM set_config('app.actor', 'intake', true);

  SELECT b.id INTO v_batch_id FROM batch b WHERE b.submission_id = p_submission_id;
  IF FOUND THEN
    RETURN QUERY
    SELECT v.id, vv.id, j.id, false
    FROM video v
    JOIN video_version vv ON vv.video_id = v.id AND vv.version = 1
    JOIN job j ON j.video_version_id = vv.id AND j.step = 'script'
    WHERE v.batch_id = v_batch_id
    ORDER BY j.created_at
    LIMIT 1;
    RETURN;
  END IF;

  SELECT p.id INTO v_project_id FROM project p WHERE p.name = 'faceless-mvp' ORDER BY p.created_at LIMIT 1;
  IF NOT FOUND THEN
    INSERT INTO project (name) VALUES ('faceless-mvp') RETURNING id INTO v_project_id;
  END IF;

  INSERT INTO batch (project_id, submission_id) VALUES (v_project_id, p_submission_id)
  RETURNING id INTO v_batch_id;
  SELECT c.video_id, c.version_id INTO v_video_id, v_version_id
  FROM video_create(
    v_batch_id, 1,
    CASE WHEN v_brief->>'format' = 'episode' THEN '16:9' ELSE '9:16' END,
    v_brief
  ) c;

  RETURN QUERY SELECT v_video_id, v_version_id, script_job_create(v_version_id), true;
END;
$$;

-- migrate:down

CREATE OR REPLACE FUNCTION video_submit(p_submission_id text, p_brief jsonb)
RETURNS TABLE (video_id uuid, version_id uuid, job_id uuid, created boolean)
LANGUAGE plpgsql
AS $$
#variable_conflict use_column
DECLARE
  v_brief jsonb := brief_normalize(p_brief);
  v_project_id uuid;
  v_batch_id uuid;
  v_video_id uuid;
  v_version_id uuid;
BEGIN
  IF p_submission_id IS NULL OR length(p_submission_id) = 0 THEN
    RAISE EXCEPTION 'submission id is required';
  END IF;
  PERFORM set_config('app.actor', 'intake', true);

  SELECT b.id INTO v_batch_id FROM batch b WHERE b.submission_id = p_submission_id;
  IF FOUND THEN
    RETURN QUERY
    SELECT v.id, vv.id, j.id, false
    FROM video v
    JOIN video_version vv ON vv.video_id = v.id AND vv.version = 1
    JOIN job j ON j.video_version_id = vv.id AND j.step = 'script'
    WHERE v.batch_id = v_batch_id
    ORDER BY j.created_at
    LIMIT 1;
    RETURN;
  END IF;

  SELECT p.id INTO v_project_id FROM project p WHERE p.name = 'faceless-mvp' ORDER BY p.created_at LIMIT 1;
  IF NOT FOUND THEN
    INSERT INTO project (name) VALUES ('faceless-mvp') RETURNING id INTO v_project_id;
  END IF;

  INSERT INTO batch (project_id, submission_id) VALUES (v_project_id, p_submission_id)
  RETURNING id INTO v_batch_id;
  SELECT c.video_id, c.version_id INTO v_video_id, v_version_id
  FROM video_create(v_batch_id, 1, '9:16', v_brief) c;

  RETURN QUERY SELECT v_video_id, v_version_id, script_job_create(v_version_id), true;
END;
$$;

CREATE OR REPLACE FUNCTION brief_normalize(p_brief jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  v_topic text := btrim(p_brief->>'topic');
  v_duration numeric;
  v_field text;
BEGIN
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

DROP FUNCTION episode_brief_normalize(jsonb);
