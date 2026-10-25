-- migrate:up

-- Approving an episode script (A1) creates its TTS job only; the 2c typography render_preview
-- stays for Shorts. Episodes go on to timing and episode code (docs/episode-pipeline.md §1).

-- Same as 20261027000100 except that episodes get no render_preview job.
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
    IF v_brief->>'format' IS DISTINCT FROM 'episode' THEN
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
