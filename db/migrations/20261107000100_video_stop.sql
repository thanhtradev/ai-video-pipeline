-- migrate:up

-- /stop on Telegram (D-067): an approver cancels a video that was created or approved by mistake,
-- in two steps. telegram_stop_preview() finds the video and stores a stop request with a token;
-- the bot shows what would be cancelled with Dừng / Giữ buttons. telegram_stop_decide() on Dừng
-- cancels every unfinished job of the current version (a running worker sees CANCELLED at its next
-- heartbeat and aborts), supersedes the pending approvals (old buttons answer "no longer valid")
-- and sets the version CANCELLED. Nothing is deleted: the workspace stays on the Mac. There is no
-- undo; a new video needs /new.

CREATE TABLE stop_request (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE CHECK (token ~ '^[0-9a-f]{32}$'),
  video_id uuid NOT NULL REFERENCES video (id),
  video_version_id uuid NOT NULL REFERENCES video_version (id),
  telegram_user_id bigint NOT NULL,
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'STOPPED', 'KEPT', 'EXPIRED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  decided_by bigint,
  decided_at timestamptz
);

-- Cancels the unfinished jobs of a version, supersedes its approvals, ends it. Returns the number
-- of cancelled jobs and the step that was running (NULL when none).
CREATE FUNCTION video_stop(p_version_id uuid, p_actor text)
RETURNS TABLE (cancelled_jobs integer, running_step text)
LANGUAGE plpgsql
AS $$
#variable_conflict use_column
DECLARE
  v_job_id uuid;
  v_cancelled integer := 0;
  v_running_step text;
BEGIN
  PERFORM set_config('app.actor', p_actor, true);
  SELECT j.step INTO v_running_step FROM job j
  WHERE j.video_version_id = p_version_id AND j.status = 'RUNNING'
  ORDER BY j.updated_at DESC
  LIMIT 1;
  FOR v_job_id IN
    SELECT j.id FROM job j
    WHERE j.video_version_id = p_version_id AND j.status NOT IN ('SUCCEEDED', 'CANCELLED')
    FOR UPDATE
  LOOP
    IF job_cancel(v_job_id, p_actor) THEN
      v_cancelled := v_cancelled + 1;
    END IF;
  END LOOP;
  UPDATE approval SET status = 'SUPERSEDED'
  WHERE video_version_id = p_version_id AND status = 'PENDING';
  UPDATE video_version SET status = 'CANCELLED' WHERE id = p_version_id;
  RETURN QUERY SELECT v_cancelled, v_running_step;
END;
$$;

-- Step 1: what /stop would cancel, with a token for the Dừng button (valid 10 minutes).
-- p_prefix empty: the only active video (current version not terminal).
-- Result codes: PREVIEW; NOT_APPROVER; NOT_FOUND (no video id starts with the prefix, or no
-- active video); AMBIGUOUS (several do); ALREADY_OVER (the current version is terminal).
CREATE FUNCTION telegram_stop_preview(p_user_id bigint, p_prefix text)
RETURNS TABLE (result text, token text, video_id uuid, topic text, status text,
               running_step text, pending_jobs integer, expires_at timestamptz)
LANGUAGE plpgsql
AS $$
#variable_conflict use_column
DECLARE
  v_prefix text := lower(btrim(coalesce(p_prefix, '')));
  v_count integer;
  v_video_id uuid;
  v_version_id uuid;
  v_status text;
  v_topic text;
  v_token text := replace(gen_random_uuid()::text, '-', '');
  v_expires timestamptz := now() + interval '10 minutes';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM approver WHERE telegram_user_id = p_user_id AND active) THEN
    RETURN QUERY SELECT 'NOT_APPROVER'::text, NULL::text, NULL::uuid, NULL::text, NULL::text,
                        NULL::text, NULL::integer, NULL::timestamptz;
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
      NULL::text, NULL::uuid, NULL::text, NULL::text, NULL::text, NULL::integer, NULL::timestamptz;
    RETURN;
  END IF;

  SELECT v.id, vv.id, vv.status, vv.brief->>'topic' INTO v_video_id, v_version_id, v_status, v_topic
  FROM video v
  JOIN video_version vv ON vv.video_id = v.id AND vv.version = v.current_version
  WHERE CASE WHEN v_prefix = '' THEN NOT video_is_terminal(vv.status)
             ELSE v.id::text LIKE v_prefix || '%' END;
  IF video_is_terminal(v_status) THEN
    RETURN QUERY SELECT 'ALREADY_OVER'::text, NULL::text, v_video_id, v_topic, v_status,
                        NULL::text, NULL::integer, NULL::timestamptz;
    RETURN;
  END IF;

  PERFORM set_config('app.actor', 'telegram:' || p_user_id, true);
  INSERT INTO stop_request (token, video_id, video_version_id, telegram_user_id, expires_at)
  VALUES (v_token, v_video_id, v_version_id, p_user_id, v_expires);
  RETURN QUERY
  SELECT 'PREVIEW'::text, v_token, v_video_id, v_topic, v_status,
    (SELECT j.step FROM job j WHERE j.video_version_id = v_version_id AND j.status = 'RUNNING'
     ORDER BY j.updated_at DESC LIMIT 1),
    (SELECT count(*)::integer FROM job j
     WHERE j.video_version_id = v_version_id AND j.status NOT IN ('SUCCEEDED', 'CANCELLED')),
    v_expires;
END;
$$;

-- Step 2: Dừng (APPROVE) stops the video, Giữ (REJECT) closes the request. Any active approver
-- may answer. Result codes: STOPPED, KEPT, NOT_APPROVER, NOT_FOUND, NOT_PENDING, EXPIRED,
-- ALREADY_OVER (the video ended by other means while the request was open).
CREATE FUNCTION telegram_stop_decide(p_token text, p_user_id bigint, p_action text)
RETURNS TABLE (result text, video_id uuid, cancelled_jobs integer, running_step text)
LANGUAGE plpgsql
AS $$
#variable_conflict use_column
DECLARE
  v_request stop_request%ROWTYPE;
  v_status text;
  v_cancelled integer;
  v_running text;
BEGIN
  IF p_action NOT IN ('APPROVE', 'REJECT') THEN
    RAISE EXCEPTION 'invalid action %', p_action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM approver WHERE telegram_user_id = p_user_id AND active) THEN
    RETURN QUERY SELECT 'NOT_APPROVER'::text, NULL::uuid, NULL::integer, NULL::text;
    RETURN;
  END IF;
  SELECT * INTO v_request FROM stop_request r WHERE r.token = p_token FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'NOT_FOUND'::text, NULL::uuid, NULL::integer, NULL::text;
    RETURN;
  END IF;
  IF v_request.status <> 'PENDING' THEN
    RETURN QUERY SELECT 'NOT_PENDING'::text, v_request.video_id, NULL::integer, NULL::text;
    RETURN;
  END IF;
  IF v_request.expires_at <= now() THEN
    UPDATE stop_request SET status = 'EXPIRED' WHERE id = v_request.id;
    RETURN QUERY SELECT 'EXPIRED'::text, v_request.video_id, NULL::integer, NULL::text;
    RETURN;
  END IF;

  PERFORM set_config('app.actor', 'telegram:' || p_user_id, true);
  IF p_action = 'REJECT' THEN
    UPDATE stop_request SET status = 'KEPT', decided_by = p_user_id, decided_at = now()
    WHERE id = v_request.id;
    RETURN QUERY SELECT 'KEPT'::text, v_request.video_id, NULL::integer, NULL::text;
    RETURN;
  END IF;

  SELECT vv.status INTO v_status FROM video_version vv
  WHERE vv.id = v_request.video_version_id FOR UPDATE;
  IF video_is_terminal(v_status) THEN
    UPDATE stop_request SET status = 'KEPT', decided_by = p_user_id, decided_at = now()
    WHERE id = v_request.id;
    RETURN QUERY SELECT 'ALREADY_OVER'::text, v_request.video_id, NULL::integer, NULL::text;
    RETURN;
  END IF;
  SELECT s.cancelled_jobs, s.running_step INTO v_cancelled, v_running
  FROM video_stop(v_request.video_version_id, 'telegram:' || p_user_id) s;
  UPDATE stop_request SET status = 'STOPPED', decided_by = p_user_id, decided_at = now()
  WHERE id = v_request.id;
  RETURN QUERY SELECT 'STOPPED'::text, v_request.video_id, v_cancelled, v_running;
END;
$$;

-- migrate:down

DROP FUNCTION telegram_stop_decide(text, bigint, text);
DROP FUNCTION telegram_stop_preview(bigint, text);
DROP FUNCTION video_stop(uuid, text);
DROP TABLE stop_request;
