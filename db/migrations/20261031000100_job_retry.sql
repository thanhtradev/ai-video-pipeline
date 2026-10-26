-- migrate:up

-- /retry on Telegram (D-056): an approver retries a video stopped by a permanent job failure
-- (NEEDS_DECISION), e.g. after fixing what broke it. The failed job gets one more attempt and the
-- video resumes where it was. The worker's checkpoints decide what is redone: episode_code resumes
-- its agent session (agent-turns.json), tts reuses finished clips.
--
-- Result codes: RETRIED; NOT_APPROVER; NOT_FOUND (no video id starts with the prefix);
-- AMBIGUOUS (several do); NOT_STOPPED (the current version is not NEEDS_DECISION);
-- NO_FAILED_JOB (stopped for another reason, e.g. storyboard rounds used up).
CREATE FUNCTION telegram_retry(p_user_id bigint, p_prefix text)
RETURNS TABLE (result text, video_id uuid, step text, attempt integer)
LANGUAGE plpgsql
AS $$
#variable_conflict use_column
DECLARE
  v_prefix text := lower(btrim(coalesce(p_prefix, '')));
  v_count integer;
  v_video_id uuid;
  v_version_id uuid;
  v_status text;
  v_job job%ROWTYPE;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM approver WHERE telegram_user_id = p_user_id AND active) THEN
    RETURN QUERY SELECT 'NOT_APPROVER'::text, NULL::uuid, NULL::text, NULL::integer;
    RETURN;
  END IF;

  IF v_prefix ~ '^[0-9a-f-]{4,36}$' THEN
    SELECT count(*) INTO v_count FROM video v WHERE v.id::text LIKE v_prefix || '%';
  ELSE
    v_count := 0;
  END IF;
  IF v_count <> 1 THEN
    RETURN QUERY SELECT CASE WHEN v_count = 0 THEN 'NOT_FOUND' ELSE 'AMBIGUOUS' END,
      NULL::uuid, NULL::text, NULL::integer;
    RETURN;
  END IF;

  SELECT v.id, vv.id, vv.status INTO v_video_id, v_version_id, v_status
  FROM video v
  JOIN video_version vv ON vv.video_id = v.id AND vv.version = v.current_version
  WHERE v.id::text LIKE v_prefix || '%'
  FOR UPDATE OF vv;
  IF v_status <> 'NEEDS_DECISION' THEN
    RETURN QUERY SELECT 'NOT_STOPPED'::text, v_video_id, NULL::text, NULL::integer;
    RETURN;
  END IF;

  SELECT * INTO v_job FROM job j
  WHERE j.video_version_id = v_version_id AND j.status = 'FAILED_PERMANENT'
  ORDER BY j.updated_at DESC
  LIMIT 1
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'NO_FAILED_JOB'::text, v_video_id, NULL::text, NULL::integer;
    RETURN;
  END IF;

  PERFORM set_config('app.actor', 'telegram:' || p_user_id, true);
  UPDATE job SET status = 'READY', max_attempts = attempt_count + 1, next_attempt_at = NULL
  WHERE id = v_job.id;
  -- Resume only once no other job of the version still waits for a decision.
  UPDATE video_version vv SET status = vv.resume_status
  WHERE vv.id = v_version_id
    AND vv.resume_status IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM job j WHERE j.video_version_id = v_version_id AND j.status = 'FAILED_PERMANENT'
    );
  RETURN QUERY SELECT 'RETRIED'::text, v_video_id, v_job.step, v_job.attempt_count + 1;
END;
$$;

-- migrate:down

DROP FUNCTION telegram_retry(bigint, text);
