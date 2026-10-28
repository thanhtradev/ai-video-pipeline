-- migrate:up

-- /stop on Telegram (D-067): an approver cancels a video that was created or approved by mistake.
-- Every unfinished job of the current version is cancelled (a running worker sees CANCELLED at its
-- next heartbeat and aborts), its pending approvals are superseded so their buttons answer
-- "no longer valid", and the version ends CANCELLED. Nothing is deleted: the workspace stays on
-- the Mac. There is no undo; a new video needs /new.
--
-- p_prefix empty: the only active video (current version not terminal) is stopped.
-- Result codes: STOPPED; NOT_APPROVER; NOT_FOUND (no video id starts with the prefix, or no
-- active video); AMBIGUOUS (several do); ALREADY_OVER (the current version is terminal).
CREATE FUNCTION telegram_stop(p_user_id bigint, p_prefix text)
RETURNS TABLE (result text, video_id uuid, cancelled_jobs integer, running_step text)
LANGUAGE plpgsql
AS $$
#variable_conflict use_column
DECLARE
  v_prefix text := lower(btrim(coalesce(p_prefix, '')));
  v_count integer;
  v_video_id uuid;
  v_version_id uuid;
  v_status text;
  v_running_step text;
  v_job_id uuid;
  v_cancelled integer := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM approver WHERE telegram_user_id = p_user_id AND active) THEN
    RETURN QUERY SELECT 'NOT_APPROVER'::text, NULL::uuid, NULL::integer, NULL::text;
    RETURN;
  END IF;

  IF v_prefix = '' THEN
    SELECT count(*) INTO v_count
    FROM video v
    JOIN video_version vv ON vv.video_id = v.id AND vv.version = v.current_version
    WHERE NOT video_is_terminal(vv.status);
  ELSIF v_prefix ~ '^[0-9a-f-]{4,36}$' THEN
    SELECT count(*) INTO v_count FROM video v WHERE v.id::text LIKE v_prefix || '%';
  ELSE
    v_count := 0;
  END IF;
  IF v_count <> 1 THEN
    RETURN QUERY SELECT CASE WHEN v_count = 0 THEN 'NOT_FOUND' ELSE 'AMBIGUOUS' END,
      NULL::uuid, NULL::integer, NULL::text;
    RETURN;
  END IF;

  SELECT v.id, vv.id, vv.status INTO v_video_id, v_version_id, v_status
  FROM video v
  JOIN video_version vv ON vv.video_id = v.id AND vv.version = v.current_version
  WHERE CASE WHEN v_prefix = '' THEN NOT video_is_terminal(vv.status)
             ELSE v.id::text LIKE v_prefix || '%' END
  FOR UPDATE OF vv;
  IF video_is_terminal(v_status) THEN
    RETURN QUERY SELECT 'ALREADY_OVER'::text, v_video_id, NULL::integer, NULL::text;
    RETURN;
  END IF;

  PERFORM set_config('app.actor', 'telegram:' || p_user_id, true);

  SELECT j.step INTO v_running_step FROM job j
  WHERE j.video_version_id = v_version_id AND j.status = 'RUNNING'
  ORDER BY j.updated_at DESC
  LIMIT 1;

  FOR v_job_id IN
    SELECT j.id FROM job j
    WHERE j.video_version_id = v_version_id AND j.status NOT IN ('SUCCEEDED', 'CANCELLED')
    FOR UPDATE
  LOOP
    IF job_cancel(v_job_id, 'telegram:' || p_user_id) THEN
      v_cancelled := v_cancelled + 1;
    END IF;
  END LOOP;

  UPDATE approval SET status = 'SUPERSEDED'
  WHERE video_version_id = v_version_id AND status = 'PENDING';

  UPDATE video_version SET status = 'CANCELLED' WHERE id = v_version_id;

  RETURN QUERY SELECT 'STOPPED'::text, v_video_id, v_cancelled, v_running_step;
END;
$$;

-- migrate:down

DROP FUNCTION telegram_stop(bigint, text);
