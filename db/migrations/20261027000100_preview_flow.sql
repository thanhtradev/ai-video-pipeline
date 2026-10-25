-- migrate:up

-- Phase 2c: the `render_preview` job (q:render, docs/workflows.md): typography explainer at
-- 720x1280 timed by the measured narration, music bed, thumbnail, SRT/VTT. It is created with the
-- tts job when A1 is approved and waits (PENDING) on it. When it becomes READY, the version moves
-- GENERATING_ASSETS -> RENDERING_PREVIEW. No paid call: it needs no cost estimate or guard.

-- Creates (or returns) the render_preview job of a version. Like tts, its content is frozen from
-- the approved script. Scripts from before 2c have no music_style; they get 'calm'.
CREATE FUNCTION render_preview_job_create(p_version_id uuid) RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_result jsonb := script_job_output(p_version_id)->'result';
  v_scenes jsonb := script_scenes(p_version_id);
  v_tts_id uuid;
  v_input jsonb;
BEGIN
  IF v_scenes IS NULL THEN
    RAISE EXCEPTION 'script of version % has no scenes; regenerate it', p_version_id;
  END IF;
  SELECT id INTO v_tts_id FROM job
  WHERE video_version_id = p_version_id AND step = 'tts' AND status <> 'CANCELLED'
  ORDER BY created_at DESC
  LIMIT 1;
  IF v_tts_id IS NULL THEN
    RAISE EXCEPTION 'version % has no tts job', p_version_id;
  END IF;

  SELECT jsonb_build_object(
           'title', v_result->>'title',
           'hook', coalesce(v_result->>'hook', v_result->>'title'),
           'music_style', coalesce(v_result->>'music_style', 'calm'),
           'language', 'vi',
           'tts_job_id', v_tts_id,
           'scenes', jsonb_agg(jsonb_build_object(
                       'index', e.ord,
                       'narration', normalize(e.s->>'narration', NFC),
                       'on_screen_text', normalize(e.s->>'on_screen_text', NFC),
                       'emphasis', coalesce(e.s->'emphasis', '[]'::jsonb))
                     ORDER BY e.ord))
  INTO v_input
  FROM jsonb_array_elements(v_scenes) WITH ORDINALITY e(s, ord);

  RETURN job_create(p_version_id, 'render_preview', 'q:render', v_input, md5(v_input::text),
                    ARRAY[v_tts_id], 2);
END;
$$;

-- The version starts rendering when its render job becomes dispatchable (dependencies done).
CREATE FUNCTION render_preview_started() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE video_version SET status = 'RENDERING_PREVIEW'
  WHERE id = NEW.video_version_id AND status = 'GENERATING_ASSETS';
  RETURN NEW;
END;
$$;

CREATE TRIGGER job_render_preview_ready
AFTER UPDATE OF status ON job
FOR EACH ROW
WHEN (NEW.step = 'render_preview' AND NEW.status = 'READY' AND OLD.status <> 'READY')
EXECUTE FUNCTION render_preview_started();

-- Same as 20261026000100 plus: approving a script also creates the render_preview job.
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

-- migrate:down

-- Restores the 20261026000100 version (approval creates only the tts job).
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

DROP TRIGGER job_render_preview_ready ON job;
DROP FUNCTION render_preview_started();
DROP FUNCTION render_preview_job_create(uuid);
