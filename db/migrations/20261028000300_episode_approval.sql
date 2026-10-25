-- migrate:up

-- Approving an episode script (A1) creates its TTS job and its timing job (q:heavy, after the
-- narration); the 2c typography render_preview stays for Shorts (docs/episode-pipeline.md §1).

-- Creates (or returns) the timing job of a version: it reads the approved script.json and the
-- narration clips, both through their jobs' checkpoints. No paid call.
CREATE FUNCTION timing_job_create(p_version_id uuid) RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_script_id uuid;
  v_tts_id uuid;
  v_input jsonb;
BEGIN
  SELECT id INTO v_script_id FROM job
  WHERE video_version_id = p_version_id AND step = 'script' AND status = 'SUCCEEDED'
  ORDER BY updated_at DESC
  LIMIT 1;
  SELECT id INTO v_tts_id FROM job
  WHERE video_version_id = p_version_id AND step = 'tts' AND status <> 'CANCELLED'
  ORDER BY created_at DESC
  LIMIT 1;
  IF v_script_id IS NULL OR v_tts_id IS NULL THEN
    RAISE EXCEPTION 'version % needs a succeeded script job and a tts job', p_version_id;
  END IF;

  v_input := jsonb_build_object('script_job_id', v_script_id, 'tts_job_id', v_tts_id,
                                'language', 'vi');
  RETURN job_create(p_version_id, 'timing', 'q:heavy', v_input, md5(v_input::text),
                    ARRAY[v_tts_id], 2);
END;
$$;

-- Creates (or returns) the episode_code job of a version (q:render, after the timeline): the agent
-- writes the episode from the approved script.json and timing.json. No paid call (subscription).
CREATE FUNCTION episode_code_job_create(p_version_id uuid) RETURNS uuid
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

-- Same as 20261027000100 except that episodes get timing and episode_code jobs instead of
-- render_preview.
CREATE OR REPLACE FUNCTION approval_telegram_decide(p_token text, p_user_id bigint, p_action text)
RETURNS TABLE (result text, video_id uuid, version integer)
LANGUAGE plpgsql
AS $$
#variable_conflict use_column
DECLARE
  v_approval approval%ROWTYPE;
  v_video_id uuid;
  v_brief jsonb;
  v_result text;
  v_new_version_id uuid;
BEGIN
  IF p_action NOT IN ('APPROVE', 'REJECT', 'REGENERATE') THEN
    RAISE EXCEPTION 'invalid action %', p_action;
  END IF;

  SELECT * INTO v_approval FROM approval WHERE token = p_token;

  v_result := approval_decide(
    p_token,
    p_user_id,
    CASE p_action WHEN 'APPROVE' THEN 'APPROVED' ELSE 'REJECTED' END,
    coalesce(CASE v_approval.type WHEN 'SCRIPT' THEN script_payload_hash(v_approval.video_version_id) END, '')
  );
  IF v_result IN ('NOT_ALLOWED', 'NOT_FOUND') THEN
    RETURN QUERY SELECT v_result, NULL::uuid, NULL::integer;
    RETURN;
  END IF;

  SELECT vv.video_id, vv.brief INTO v_video_id, v_brief
  FROM video_version vv WHERE vv.id = v_approval.video_version_id;

  IF v_result = 'OK' AND p_action = 'APPROVE' AND v_approval.type = 'SCRIPT' THEN
    PERFORM tts_job_create(v_approval.video_version_id);
    -- Episodes (16:9, D-050) continue with timing and episode code, not the typography preview.
    IF v_brief->>'format' = 'episode' THEN
      PERFORM timing_job_create(v_approval.video_version_id);
      PERFORM episode_code_job_create(v_approval.video_version_id);
    ELSE
      PERFORM render_preview_job_create(v_approval.video_version_id);
    END IF;
  ELSIF v_result = 'OK' AND p_action = 'REJECT' THEN
    UPDATE video_version SET status = 'CANCELLED' WHERE id = v_approval.video_version_id;
  ELSIF v_result = 'OK' AND p_action = 'REGENERATE' THEN
    v_new_version_id := video_new_version(v_video_id, v_brief);
    PERFORM script_job_create(v_new_version_id);
  END IF;

  RETURN QUERY
  SELECT v_result, v.id, v.current_version FROM video v WHERE v.id = v_video_id;
END;
$$;

-- migrate:down

CREATE OR REPLACE FUNCTION approval_telegram_decide(p_token text, p_user_id bigint, p_action text)
RETURNS TABLE (result text, video_id uuid, version integer)
LANGUAGE plpgsql
AS $$
#variable_conflict use_column
DECLARE
  v_approval approval%ROWTYPE;
  v_video_id uuid;
  v_brief jsonb;
  v_result text;
  v_new_version_id uuid;
BEGIN
  IF p_action NOT IN ('APPROVE', 'REJECT', 'REGENERATE') THEN
    RAISE EXCEPTION 'invalid action %', p_action;
  END IF;

  SELECT * INTO v_approval FROM approval WHERE token = p_token;

  v_result := approval_decide(
    p_token,
    p_user_id,
    CASE p_action WHEN 'APPROVE' THEN 'APPROVED' ELSE 'REJECTED' END,
    coalesce(CASE v_approval.type WHEN 'SCRIPT' THEN script_payload_hash(v_approval.video_version_id) END, '')
  );
  IF v_result IN ('NOT_ALLOWED', 'NOT_FOUND') THEN
    RETURN QUERY SELECT v_result, NULL::uuid, NULL::integer;
    RETURN;
  END IF;

  SELECT vv.video_id, vv.brief INTO v_video_id, v_brief
  FROM video_version vv WHERE vv.id = v_approval.video_version_id;

  IF v_result = 'OK' AND p_action = 'APPROVE' AND v_approval.type = 'SCRIPT' THEN
    PERFORM tts_job_create(v_approval.video_version_id);
    PERFORM render_preview_job_create(v_approval.video_version_id);
  ELSIF v_result = 'OK' AND p_action = 'REJECT' THEN
    UPDATE video_version SET status = 'CANCELLED' WHERE id = v_approval.video_version_id;
  ELSIF v_result = 'OK' AND p_action = 'REGENERATE' THEN
    v_new_version_id := video_new_version(v_video_id, v_brief);
    PERFORM script_job_create(v_new_version_id);
  END IF;

  RETURN QUERY
  SELECT v_result, v.id, v.current_version FROM video v WHERE v.id = v_video_id;
END;
$$;

DROP FUNCTION episode_code_job_create(uuid);
DROP FUNCTION timing_job_create(uuid);
