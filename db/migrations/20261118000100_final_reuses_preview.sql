-- migrate:up

-- D-089: the final render reuses the preview job's full-size render. render_episode now renders
-- the approved code once at full size (master.mp4) and scales preview.mp4 down from it; the final
-- job gets the preview job's id and links master.mp4 as final.mp4 instead of rendering the same
-- code again. A preview job without master.mp4 (older workers) makes the final render as before.
-- Rollback: the down migration restores the input without preview_job_id; workers then render the
-- final again (they still accept both inputs).

CREATE OR REPLACE FUNCTION episode_final_job_create(p_version_id uuid) RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_render job := preview_render(p_version_id);
  v_input jsonb;
BEGIN
  IF v_render.id IS NULL OR v_render.status <> 'SUCCEEDED' THEN
    RAISE EXCEPTION 'version % has no approved preview', p_version_id;
  END IF;
  v_input := jsonb_build_object('episode_code_job_id', v_render.input->'episode_code_job_id',
                                'timing_job_id', v_render.input->'timing_job_id',
                                'quality', 'final',
                                'preview_job_id', v_render.id);
  RETURN job_create(p_version_id, 'render_final', 'q:render', v_input, md5(v_input::text),
                    '{}'::uuid[], 2);
END;
$$;

-- migrate:down

CREATE OR REPLACE FUNCTION episode_final_job_create(p_version_id uuid) RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_render job := preview_render(p_version_id);
  v_input jsonb;
BEGIN
  IF v_render.id IS NULL OR v_render.status <> 'SUCCEEDED' THEN
    RAISE EXCEPTION 'version % has no approved preview', p_version_id;
  END IF;
  v_input := jsonb_build_object('episode_code_job_id', v_render.input->'episode_code_job_id',
                                'timing_job_id', v_render.input->'timing_job_id',
                                'quality', 'final');
  RETURN job_create(p_version_id, 'render_final', 'q:render', v_input, md5(v_input::text),
                    '{}'::uuid[], 2);
END;
$$;
