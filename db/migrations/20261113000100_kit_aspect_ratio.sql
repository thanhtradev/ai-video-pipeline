-- migrate:up

-- The frame is a kit property (D-080): "Nếu bạn…" (whatif) stays 16:9, "Khoa học" (science) is
-- vertical 9:16. catalog_option keeps each kit's aspect ratio (mirroring remotion/catalog.json
-- `frame`), and video_submit gives an episode the aspect ratio of its kit instead of always 16:9.
-- Existing videos keep theirs.

ALTER TABLE catalog_option ADD COLUMN aspect_ratio text CHECK (aspect_ratio IN ('9:16', '16:9'));
UPDATE catalog_option SET aspect_ratio = '16:9' WHERE kind = 'kit' AND slug = 'whatif';
UPDATE catalog_option SET aspect_ratio = '9:16' WHERE kind = 'kit' AND slug = 'science';
-- every kit has one, character sets none
ALTER TABLE catalog_option ADD CONSTRAINT catalog_option_kit_aspect_ratio
  CHECK ((kind = 'kit') = (aspect_ratio IS NOT NULL));

-- Same as 20261028000100 except the aspect ratio of an episode comes from its kit.
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
  v_aspect text := '9:16';
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

  -- Episodes take the frame of their kit (D-080); Shorts stay 9:16. brief_normalize has already
  -- checked that the kit is an enabled catalog option.
  IF v_brief->>'format' = 'episode' THEN
    SELECT o.aspect_ratio INTO v_aspect FROM catalog_option o
    WHERE o.kind = 'kit' AND o.slug = v_brief->>'kit';
    IF v_aspect IS NULL THEN
      RAISE EXCEPTION 'kit "%" has no aspect ratio', v_brief->>'kit';
    END IF;
  END IF;

  INSERT INTO batch (project_id, submission_id) VALUES (v_project_id, p_submission_id)
  RETURNING id INTO v_batch_id;
  SELECT c.video_id, c.version_id INTO v_video_id, v_version_id
  FROM video_create(
    v_batch_id, 1,
    v_aspect,
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
  FROM video_create(
    v_batch_id, 1,
    CASE WHEN v_brief->>'format' = 'episode' THEN '16:9' ELSE '9:16' END,
    v_brief
  ) c;

  RETURN QUERY SELECT v_video_id, v_version_id, script_job_create(v_version_id), true;
END;
$$;

ALTER TABLE catalog_option DROP COLUMN aspect_ratio;
