-- migrate:up

-- Web console, sign-in and read side (D-103).
-- Sign-in: /web in a private chat gives an approver a link that works once, for 5 minutes. It opens
-- a 12-hour session. Only hashes of both tokens are stored.
-- Every web_* function takes the session token, never a user id, so the web role (ops/postgres/
-- grants.sql: execute on web_* only, no table access) cannot act as anyone without their session,
-- and only n8n can issue a login. The functions are SECURITY DEFINER because that role has no table
-- access. An invalid session raises SQLSTATE WB401, which the service turns into a 401; not 28000,
-- which Postgres raises for connection failures.
-- Workers and the report reuse telegram_workers/worker_detail/report. A video's step and group repeat
-- the logic of telegram_status, whose result is limited to 20 rows; web-console.test.ts fails if the
-- two drift apart. telegram_pending is not used: it makes reminders due, so a page load would re-post
-- approval requests. Revoking an approver ends their sessions for good, even if they are approved
-- again later.
--
-- Rollback: drops the functions and both tables, which ends every session. WF-06 must be rolled back
-- first, or /web fails with an error. Nothing else depends on them.

CREATE TABLE web_login (
  token_hash text PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  telegram_user_id bigint NOT NULL REFERENCES approver (telegram_user_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);

CREATE INDEX web_login_open_idx ON web_login (telegram_user_id) WHERE used_at IS NULL;

CREATE TABLE web_session (
  token_hash text PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  telegram_user_id bigint NOT NULL REFERENCES approver (telegram_user_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);

CREATE FUNCTION web_token_hash(p_token text) RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex');
$$;

-- 244 random bits, as 64 hex characters.
CREATE FUNCTION web_new_token() RETURNS text
LANGUAGE sql VOLATILE
AS $$
  SELECT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
$$;

-- Result codes: OK, NOT_PRIVATE (an approver in a group, where anyone could open the link),
-- NOT_APPROVER. A newer link replaces an unused older one.
CREATE FUNCTION telegram_web_login(p_user_id bigint, p_is_private boolean)
RETURNS TABLE (result text, token text, expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  c_lifetime constant interval := interval '5 minutes';
  v_token text;
  v_expires timestamptz := now() + c_lifetime;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM approver WHERE telegram_user_id = p_user_id AND active) THEN
    RETURN QUERY SELECT 'NOT_APPROVER'::text, NULL::text, NULL::timestamptz;
    RETURN;
  END IF;
  IF NOT coalesce(p_is_private, false) THEN
    RETURN QUERY SELECT 'NOT_PRIVATE'::text, NULL::text, NULL::timestamptz;
    RETURN;
  END IF;
  UPDATE web_login SET used_at = now() WHERE telegram_user_id = p_user_id AND used_at IS NULL;
  v_token := web_new_token();
  INSERT INTO web_login (token_hash, telegram_user_id, expires_at)
  VALUES (web_token_hash(v_token), p_user_id, v_expires);
  RETURN QUERY SELECT 'OK'::text, v_token, v_expires;
END;
$$;

-- Result codes: OK, INVALID (unknown, used or expired link, or no longer an approver; the caller
-- gets no hint which).
CREATE FUNCTION web_login_consume(p_token text)
RETURNS TABLE (result text, session text, expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  c_lifetime constant interval := interval '12 hours';
  v_user bigint;
  v_session text;
  v_expires timestamptz := now() + c_lifetime;
BEGIN
  UPDATE web_login l SET used_at = now()
  WHERE l.token_hash = web_token_hash(p_token)
    AND l.used_at IS NULL
    AND l.expires_at > now()
    AND EXISTS (SELECT 1 FROM approver a
                WHERE a.telegram_user_id = l.telegram_user_id AND a.active)
  RETURNING l.telegram_user_id INTO v_user;
  IF v_user IS NULL THEN
    RETURN QUERY SELECT 'INVALID'::text, NULL::text, NULL::timestamptz;
    RETURN;
  END IF;
  v_session := web_new_token();
  INSERT INTO web_session (token_hash, telegram_user_id, expires_at)
  VALUES (web_token_hash(v_session), v_user, v_expires);
  INSERT INTO audit_log (actor, action, object_type, object_id, detail)
  VALUES ('telegram:' || v_user, 'web_login', 'approver', v_user::text,
          jsonb_build_object('source', 'web'));
  RETURN QUERY SELECT 'OK'::text, v_session, v_expires;
END;
$$;

-- SECURITY DEFINER because the revoke path runs as n8n, which has no access to these tables.
CREATE FUNCTION web_end_sessions_of_revoked() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE web_session SET revoked_at = now()
  WHERE telegram_user_id = NEW.telegram_user_id AND revoked_at IS NULL;
  UPDATE web_login SET used_at = now()
  WHERE telegram_user_id = NEW.telegram_user_id AND used_at IS NULL;
  RETURN NULL;
END;
$$;

CREATE TRIGGER approver_end_web_sessions
AFTER UPDATE OF active ON approver
FOR EACH ROW WHEN (OLD.active AND NOT NEW.active)
EXECUTE FUNCTION web_end_sessions_of_revoked();

-- The user of a live session whose approver is still active; raises WB401 otherwise. Not granted to
-- the web role: web_* call it.
CREATE FUNCTION web_session_user(p_session text) RETURNS bigint
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_user bigint;
BEGIN
  SELECT s.telegram_user_id INTO v_user
  FROM web_session s
  JOIN approver a ON a.telegram_user_id = s.telegram_user_id AND a.active
  WHERE s.token_hash = web_token_hash(p_session)
    AND s.revoked_at IS NULL
    AND s.expires_at > now();
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'invalid web session' USING ERRCODE = 'WB401';
  END IF;
  RETURN v_user;
END;
$$;

CREATE FUNCTION web_me(p_session text) RETURNS jsonb
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object('user_id', a.telegram_user_id, 'name', a.name, 'is_owner', a.is_owner)
  FROM approver a
  WHERE a.telegram_user_id = web_session_user(p_session);
$$;

CREATE FUNCTION web_logout(p_session text) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE web_session SET revoked_at = now()
  WHERE token_hash = web_token_hash(p_session) AND revoked_at IS NULL;
$$;

CREATE FUNCTION web_video_title(p_version_id uuid, p_brief jsonb) RETURNS text
LANGUAGE sql STABLE
AS $$
  SELECT coalesce(script_job_output(p_version_id)->'result'->>'title', p_brief->>'topic');
$$;

-- The state a video is grouped under, as in telegram_status (D-102), plus DONE for finished videos.
CREATE FUNCTION web_video_group(p_version_id uuid, p_status text) RETURNS text
LANGUAGE sql STABLE
AS $$
  SELECT CASE
    WHEN video_is_terminal(p_status) THEN 'DONE'
    WHEN video_is_blocked(p_status) THEN 'STOPPED'
    WHEN EXISTS (SELECT 1 FROM approval a
                 WHERE a.video_version_id = p_version_id
                   AND a.status = 'PENDING' AND a.expires_at > now()) THEN 'APPROVAL'
    WHEN EXISTS (SELECT 1 FROM job j
                 WHERE j.video_version_id = p_version_id AND j.status = 'RUNNING') THEN 'RUNNING'
    ELSE 'WAITING'
  END;
$$;

-- One row of the video list. A failed job outranks PENDING ones as the current step, as in
-- telegram_status (D-102).
CREATE FUNCTION web_video_summary(p_version_id uuid) RETURNS jsonb
LANGUAGE sql STABLE
AS $$
  SELECT jsonb_build_object(
    'video_id', v.id,
    'version', vv.version,
    'title', web_video_title(vv.id, vv.brief),
    'kit', vv.brief->>'kit',
    'status', vv.status,
    'state_group', web_video_group(vv.id, vv.status),
    'step', cur.step,
    'step_status', cur.status,
    'steps_done', (SELECT count(*) FROM job j
                   WHERE j.video_version_id = vv.id AND j.status = 'SUCCEEDED'),
    'steps_total', (SELECT count(*) FROM job j
                    WHERE j.video_version_id = vv.id AND j.status <> 'CANCELLED'),
    'strip', (SELECT coalesce(jsonb_agg(jsonb_build_object('step', j.step, 'status', j.status)
                                        ORDER BY j.created_at), '[]'::jsonb)
              FROM job j
              WHERE j.video_version_id = vv.id AND j.status <> 'CANCELLED'),
    'approval_type', open_approval.type,
    'approval_expires_at', open_approval.expires_at,
    'cost', video_cost_report(vv.id)->'cost',
    'worker_id', v.worker_id,
    'worker_online', CASE WHEN v.worker_id IS NULL THEN NULL
                          ELSE coalesce((SELECT w.last_seen_at > now() - interval '2 minutes'
                                         FROM worker w WHERE w.id = v.worker_id), false) END,
    'auto', vv.auto_approve_by IS NOT NULL,
    'created_at', vv.created_at,
    'updated_at', vv.updated_at
  )
  FROM video_version vv
  JOIN video v ON v.id = vv.video_id
  LEFT JOIN LATERAL (
    SELECT j.step, j.status FROM job j
    WHERE j.video_version_id = vv.id AND j.status <> 'CANCELLED'
    ORDER BY CASE j.status
               WHEN 'RUNNING' THEN 0 WHEN 'QUEUED' THEN 1 WHEN 'READY' THEN 2 WHEN 'BLOCKED' THEN 3
               WHEN 'FAILED_RETRYABLE' THEN 4 WHEN 'FAILED_PERMANENT' THEN 5 WHEN 'PENDING' THEN 6
               ELSE 7 END,
             j.updated_at DESC
    LIMIT 1
  ) cur ON true
  LEFT JOIN LATERAL (
    SELECT a.type, a.expires_at FROM approval a
    WHERE a.video_version_id = vv.id AND a.status = 'PENDING' AND a.expires_at > now()
    ORDER BY a.requested_at DESC LIMIT 1
  ) open_approval ON true
  WHERE vv.id = p_version_id;
$$;

-- p_state: all, active (not finished), stopped, approval, running, waiting, done.
-- p_search: a video id prefix or part of the title, without wildcards.
CREATE FUNCTION web_videos(p_session text, p_state text, p_search text, p_limit integer,
                           p_offset integer) RETURNS jsonb
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  c_max_limit constant integer := 200;
  v_search text := lower(btrim(coalesce(p_search, '')));
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), c_max_limit);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_result jsonb;
BEGIN
  PERFORM web_session_user(p_session);
  IF p_state NOT IN ('all', 'active', 'stopped', 'approval', 'running', 'waiting', 'done') THEN
    RAISE EXCEPTION 'invalid filter %', p_state;
  END IF;

  WITH base AS (
    SELECT vv.id, vv.created_at, web_video_group(vv.id, vv.status) AS state_group
    FROM video v
    JOIN video_version vv ON vv.video_id = v.id AND vv.version = v.current_version
    WHERE v_search = ''
       OR starts_with(v.id::text, v_search)
       OR strpos(lower(web_video_title(vv.id, vv.brief)), v_search) > 0
  ),
  filtered AS (
    SELECT b.* FROM base b
    WHERE p_state = 'all'
       OR (p_state = 'active' AND b.state_group <> 'DONE')
       OR b.state_group = upper(p_state)
  ),
  page AS (
    SELECT f.id,
           row_number() OVER (
             ORDER BY CASE f.state_group
                        WHEN 'STOPPED' THEN 0 WHEN 'APPROVAL' THEN 1 WHEN 'RUNNING' THEN 2
                        WHEN 'WAITING' THEN 3 ELSE 4 END,
                      f.created_at DESC, f.id
           ) AS position
    FROM filtered f
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM page),
    'items', coalesce((
      SELECT jsonb_agg(web_video_summary(p.id) ORDER BY p.position)
      FROM (SELECT * FROM page ORDER BY position LIMIT v_limit OFFSET v_offset) p
    ), '[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END;
$$;

-- One video, or NULL. No approval token ever leaves: the page refers to an approval by its id.
CREATE FUNCTION web_video(p_session text, p_video_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user bigint := web_session_user(p_session);
  v_version_id uuid;
  v_brief jsonb;
  v_jobs jsonb;
BEGIN
  SELECT vv.id, vv.brief INTO v_version_id, v_brief
  FROM video v
  JOIN video_version vv ON vv.video_id = v.id AND vv.version = v.current_version
  WHERE v.id = p_video_id;
  IF v_version_id IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT s.jobs INTO v_jobs FROM telegram_status(v_user, p_video_id::text) s;
  RETURN web_video_summary(v_version_id) || jsonb_build_object(
    'brief', v_brief,
    'jobs', coalesce(v_jobs, '[]'::jsonb),
    'costs', video_cost_report(v_version_id),
    'approvals', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
               'approval_id', a.id,
               'type', a.type,
               'requested_at', a.requested_at,
               'expires_at', a.expires_at) ORDER BY a.requested_at), '[]'::jsonb)
      FROM approval a
      WHERE a.video_version_id = v_version_id AND a.status = 'PENDING' AND a.expires_at > now()
    )
  );
END;
$$;

-- What needs this person: the same two lists as telegram_pending, read-only, and without the Mac
-- cleanup for anyone but the owner, who alone can approve it.
CREATE FUNCTION web_attention(p_session text) RETURNS jsonb
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user bigint := web_session_user(p_session);
  v_result jsonb;
BEGIN
  WITH current_version AS (
    SELECT vv.* FROM video_version vv
    JOIN video v ON v.id = vv.video_id AND v.current_version = vv.version
  ),
  open AS (
    SELECT a.id, a.type, a.requested_at, a.expires_at, c.id AS version_id, c.video_id, c.version,
           c.brief
    FROM approval a
    JOIN current_version c ON c.id = a.video_version_id
    WHERE a.status = 'PENDING' AND a.expires_at > now() AND NOT video_is_terminal(c.status)
      AND (a.type <> 'CLEANUP' OR is_owner(v_user))
  )
  SELECT jsonb_build_object(
    'approvals', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
               'approval_id', o.id,
               'video_id', o.video_id,
               'version', o.version,
               'title', web_video_title(o.version_id, o.brief),
               'type', o.type,
               'requested_at', o.requested_at,
               'expires_at', o.expires_at) ORDER BY o.requested_at), '[]'::jsonb)
      FROM open o
    ),
    'stopped', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
               'video_id', c.video_id,
               'version', c.version,
               'title', web_video_title(c.id, c.brief),
               'status', c.status,
               'created_at', c.created_at) ORDER BY c.created_at), '[]'::jsonb)
      FROM current_version c
      WHERE video_is_blocked(c.status)
        AND NOT EXISTS (SELECT 1 FROM open o WHERE o.version_id = c.id)
    )
  ) INTO v_result;
  RETURN v_result;
END;
$$;

CREATE FUNCTION web_workers(p_session text) RETURNS jsonb
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(t) - 'allowed' ORDER BY t.worker_id), '[]'::jsonb)
  FROM telegram_workers(web_session_user(p_session)) t;
$$;

CREATE FUNCTION web_worker(p_session text, p_worker_id text) RETURNS jsonb
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT to_jsonb(t) - 'allowed'
  FROM telegram_worker_detail(web_session_user(p_session), p_worker_id) t;
$$;

CREATE FUNCTION web_report(p_session text, p_period text) RETURNS jsonb
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT to_jsonb(t) - 'allowed'
  FROM telegram_report(web_session_user(p_session), p_period) t;
$$;

-- migrate:down

DROP FUNCTION web_report(text, text);
DROP FUNCTION web_worker(text, text);
DROP FUNCTION web_workers(text);
DROP FUNCTION web_attention(text);
DROP FUNCTION web_video(text, uuid);
DROP FUNCTION web_videos(text, text, text, integer, integer);
DROP FUNCTION web_video_summary(uuid);
DROP FUNCTION web_video_group(uuid, text);
DROP FUNCTION web_video_title(uuid, jsonb);
DROP FUNCTION web_logout(text);
DROP FUNCTION web_me(text);
DROP FUNCTION web_session_user(text);
DROP TRIGGER approver_end_web_sessions ON approver;
DROP FUNCTION web_end_sessions_of_revoked();
DROP FUNCTION web_login_consume(text);
DROP FUNCTION telegram_web_login(bigint, boolean);
DROP FUNCTION web_new_token();
DROP FUNCTION web_token_hash(text);
DROP TABLE web_session;
DROP TABLE web_login;
