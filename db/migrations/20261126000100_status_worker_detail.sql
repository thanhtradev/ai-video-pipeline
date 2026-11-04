-- migrate:up

-- /status grouped by state with each video's worker, and /worker <id> (D-102).
-- telegram_status(): adds the pinned worker, whether it is online, the group a video belongs to and
-- the number of matches before the limit. Groups come first in the order, so a stopped video is
-- never cut off by LIMIT 20. A failed job now outranks PENDING ones as the current step, so a
-- stopped video shows the step that failed instead of a later step waiting behind it.
-- telegram_worker_detail(): one worker, by exact id: telegram_workers() plus its active videos and
-- its last 24 hours. Strangers get a single row with allowed = false; an unknown id gets no rows.
--
-- Rollback: restores telegram_status of 20261030000100 and drops telegram_worker_detail. WF-06 must
-- be rolled back first. Re-run ops/postgres/grants.sql after either direction: recreated functions
-- lose their grants.

DROP FUNCTION telegram_status(bigint, text);

CREATE FUNCTION telegram_status(p_user_id bigint, p_prefix text DEFAULT '')
RETURNS TABLE (
  allowed boolean,
  video_id uuid,
  version integer,
  title text,
  status text,
  status_since timestamptz,
  step text,
  step_status text,
  step_since timestamptz,
  progress jsonb,
  steps_done integer,
  steps_total integer,
  approval text,
  cost jsonb,
  jobs jsonb,
  worker_id text,
  worker_online boolean,
  state_group text,
  total integer
)
LANGUAGE plpgsql
STABLE
AS $$
#variable_conflict use_column
DECLARE
  v_prefix text := lower(btrim(coalesce(p_prefix, '')));
BEGIN
  IF NOT EXISTS (SELECT 1 FROM approver WHERE telegram_user_id = p_user_id AND active) THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::integer, NULL::text, NULL::text,
      NULL::timestamptz, NULL::text, NULL::text, NULL::timestamptz, NULL::jsonb, NULL::integer,
      NULL::integer, NULL::text, NULL::jsonb, NULL::jsonb, NULL::text, NULL::boolean, NULL::text,
      NULL::integer;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT true, v.id, vv.version,
         coalesce(script_job_output(vv.id)->'result'->>'title', vv.brief->>'topic'),
         vv.status, vv.updated_at,
         cur.step, cur.status,
         CASE WHEN cur.status = 'RUNNING'
              THEN (SELECT max(a.started_at) FROM job_attempt a WHERE a.job_id = cur.id)
              ELSE cur.updated_at END,
         CASE WHEN cur.status = 'RUNNING' THEN cur.progress END,
         (SELECT count(*)::integer FROM job j WHERE j.video_version_id = vv.id AND j.status = 'SUCCEEDED'),
         (SELECT count(*)::integer FROM job j WHERE j.video_version_id = vv.id AND j.status <> 'CANCELLED'),
         open_approval.label,
         (SELECT coalesce(jsonb_object_agg(c.currency, c.total), '{}'::jsonb)
          FROM (SELECT trim(currency) AS currency, sum(amount)::float8 AS total
                FROM cost_entry
                WHERE video_version_id = vv.id AND kind = 'ACTUAL'
                GROUP BY currency) c),
         CASE WHEN v_prefix = '' THEN NULL ELSE (
           SELECT jsonb_agg(jsonb_build_object(
                    'step', j.step,
                    'status', j.status,
                    'attempts', j.attempt_count,
                    'started', (SELECT min(a.started_at) FROM job_attempt a WHERE a.job_id = j.id),
                    'finished', (SELECT max(a.finished_at) FROM job_attempt a WHERE a.job_id = j.id),
                    'error', left(j.last_error, 160),
                    'progress', CASE WHEN j.status = 'RUNNING' THEN j.progress END)
                  ORDER BY j.created_at)
           FROM job j WHERE j.video_version_id = vv.id AND j.status <> 'CANCELLED')
         END,
         v.worker_id,
         CASE WHEN v.worker_id IS NULL THEN NULL
              ELSE coalesce((SELECT w.last_seen_at > now() - interval '2 minutes'
                             FROM worker w WHERE w.id = v.worker_id), false) END,
         grp.name,
         (count(*) OVER ())::integer
  FROM video v
  JOIN video_version vv ON vv.video_id = v.id AND vv.version = v.current_version
  LEFT JOIN LATERAL (
    SELECT j.* FROM job j
    WHERE j.video_version_id = vv.id AND j.status <> 'CANCELLED'
    ORDER BY CASE j.status
               WHEN 'RUNNING' THEN 0 WHEN 'QUEUED' THEN 1 WHEN 'READY' THEN 2 WHEN 'BLOCKED' THEN 3
               WHEN 'FAILED_RETRYABLE' THEN 4 WHEN 'FAILED_PERMANENT' THEN 5 WHEN 'PENDING' THEN 6
               ELSE 7 END,
             j.updated_at DESC
    LIMIT 1
  ) cur ON true
  LEFT JOIN LATERAL (
    SELECT a.type || ' until ' || to_char(a.expires_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI') || ' UTC' AS label
    FROM approval a
    WHERE a.video_version_id = vv.id AND a.status = 'PENDING' AND a.expires_at > now()
    ORDER BY a.requested_at DESC LIMIT 1
  ) open_approval ON true
  CROSS JOIN LATERAL (
    SELECT CASE WHEN video_is_blocked(vv.status) THEN 'STOPPED'
                WHEN open_approval.label IS NOT NULL THEN 'APPROVAL'
                WHEN cur.status = 'RUNNING' THEN 'RUNNING'
                ELSE 'WAITING' END AS name
  ) grp
  WHERE CASE WHEN v_prefix = '' THEN NOT video_is_terminal(vv.status)
             ELSE v.id::text LIKE v_prefix || '%' END
  ORDER BY CASE grp.name WHEN 'STOPPED' THEN 0 WHEN 'APPROVAL' THEN 1 WHEN 'RUNNING' THEN 2 ELSE 3 END,
           vv.created_at DESC
  LIMIT 20;
END;
$$;

-- The videos that are not finished and pinned to a worker, with the approval each one waits for.
CREATE FUNCTION worker_active_videos(p_worker_id text)
RETURNS TABLE (id uuid, version integer, status text, approval text, created_at timestamptz)
LANGUAGE sql
STABLE
AS $$
  SELECT v.id, vv.version, vv.status,
         (SELECT a.type
          FROM approval a
          WHERE a.video_version_id = vv.id AND a.status = 'PENDING' AND a.expires_at > now()
          ORDER BY a.requested_at DESC LIMIT 1),
         vv.created_at
  FROM video v
  JOIN video_version vv ON vv.video_id = v.id AND vv.version = v.current_version
  WHERE v.worker_id = p_worker_id AND NOT video_is_terminal(vv.status);
$$;

CREATE FUNCTION telegram_worker_detail(p_user_id bigint, p_worker_id text)
RETURNS TABLE (
  allowed boolean,
  worker_id text,
  online boolean,
  last_seen_at timestamptz,
  jobs jsonb,
  waiting integer,
  moves jsonb,
  last_idle_at timestamptz,
  capabilities text[],
  videos jsonb,
  videos_total integer,
  stats jsonb
)
LANGUAGE plpgsql
STABLE
AS $$
#variable_conflict use_column
DECLARE
  c_video_limit constant integer := 15;
  c_slowest_limit constant integer := 3;
  c_window constant interval := interval '24 hours';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM approver WHERE telegram_user_id = p_user_id AND active) THEN
    RETURN QUERY SELECT false, NULL::text, NULL::boolean, NULL::timestamptz, NULL::jsonb,
      NULL::integer, NULL::jsonb, NULL::timestamptz, NULL::text[], NULL::jsonb, NULL::integer,
      NULL::jsonb;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT t.allowed, t.worker_id, t.online, t.last_seen_at, t.jobs, t.waiting, t.moves,
         w.last_idle_at, w.capabilities,
         (SELECT coalesce(jsonb_agg(jsonb_build_object(
                    'video_id', a.id,
                    'version', a.version,
                    'status', a.status,
                    'approval', a.approval)
                  ORDER BY a.created_at DESC), '[]'::jsonb)
          FROM (
            SELECT p.* FROM worker_active_videos(w.id) p
            ORDER BY p.created_at DESC
            LIMIT c_video_limit
          ) a),
         (SELECT count(*)::integer FROM worker_active_videos(w.id)),
         (SELECT jsonb_build_object(
                   'succeeded', count(*) FILTER (WHERE a.status = 'SUCCEEDED'),
                   'failed', count(*) FILTER (WHERE a.status IN ('FAILED_RETRYABLE', 'FAILED_PERMANENT')),
                   'completed', (SELECT count(*)
                                 FROM video v
                                 JOIN video_version vv ON vv.video_id = v.id AND vv.version = v.current_version
                                 WHERE v.worker_id = w.id
                                   AND vv.status = 'COMPLETED'
                                   AND vv.updated_at >= now() - c_window),
                   'slowest', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                                        'step', s.step, 'median_seconds', s.median_seconds)
                                      ORDER BY s.median_seconds DESC), '[]'::jsonb)
                               FROM (
                                 SELECT j.step,
                                        round(percentile_cont(0.5) WITHIN GROUP (
                                          ORDER BY extract(epoch FROM x.finished_at - x.started_at)))::integer
                                          AS median_seconds
                                 FROM job_attempt x
                                 JOIN job j ON j.id = x.job_id
                                 WHERE x.worker_id = w.id
                                   AND x.status = 'SUCCEEDED'
                                   AND x.finished_at >= now() - c_window
                                 GROUP BY j.step
                                 ORDER BY 2 DESC
                                 LIMIT c_slowest_limit
                               ) s))
          FROM job_attempt a
          WHERE a.worker_id = w.id AND a.finished_at >= now() - c_window)
  FROM telegram_workers(p_user_id) t
  JOIN worker w ON w.id = t.worker_id
  WHERE t.worker_id = lower(btrim(p_worker_id));
END;
$$;

-- migrate:down

DROP FUNCTION telegram_worker_detail(bigint, text);
DROP FUNCTION worker_active_videos(text);
DROP FUNCTION telegram_status(bigint, text);

CREATE FUNCTION telegram_status(p_user_id bigint, p_prefix text DEFAULT '')
RETURNS TABLE (
  allowed boolean,
  video_id uuid,
  version integer,
  title text,
  status text,
  status_since timestamptz,
  step text,
  step_status text,
  step_since timestamptz,
  progress jsonb,
  steps_done integer,
  steps_total integer,
  approval text,
  cost jsonb,
  jobs jsonb
)
LANGUAGE plpgsql
STABLE
AS $$
#variable_conflict use_column
DECLARE
  v_prefix text := lower(btrim(coalesce(p_prefix, '')));
BEGIN
  IF NOT EXISTS (SELECT 1 FROM approver WHERE telegram_user_id = p_user_id AND active) THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::integer, NULL::text, NULL::text,
      NULL::timestamptz, NULL::text, NULL::text, NULL::timestamptz, NULL::jsonb, NULL::integer,
      NULL::integer, NULL::text, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT true, v.id, vv.version,
         coalesce(script_job_output(vv.id)->'result'->>'title', vv.brief->>'topic'),
         vv.status, vv.updated_at,
         cur.step, cur.status,
         CASE WHEN cur.status = 'RUNNING'
              THEN (SELECT max(a.started_at) FROM job_attempt a WHERE a.job_id = cur.id)
              ELSE cur.updated_at END,
         CASE WHEN cur.status = 'RUNNING' THEN cur.progress END,
         (SELECT count(*)::integer FROM job j WHERE j.video_version_id = vv.id AND j.status = 'SUCCEEDED'),
         (SELECT count(*)::integer FROM job j WHERE j.video_version_id = vv.id AND j.status <> 'CANCELLED'),
         (SELECT a.type || ' until ' || to_char(a.expires_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI') || ' UTC'
          FROM approval a
          WHERE a.video_version_id = vv.id AND a.status = 'PENDING' AND a.expires_at > now()
          ORDER BY a.requested_at DESC LIMIT 1),
         (SELECT coalesce(jsonb_object_agg(c.currency, c.total), '{}'::jsonb)
          FROM (SELECT trim(currency) AS currency, sum(amount)::float8 AS total
                FROM cost_entry
                WHERE video_version_id = vv.id AND kind = 'ACTUAL'
                GROUP BY currency) c),
         CASE WHEN v_prefix = '' THEN NULL ELSE (
           SELECT jsonb_agg(jsonb_build_object(
                    'step', j.step,
                    'status', j.status,
                    'attempts', j.attempt_count,
                    'started', (SELECT min(a.started_at) FROM job_attempt a WHERE a.job_id = j.id),
                    'finished', (SELECT max(a.finished_at) FROM job_attempt a WHERE a.job_id = j.id),
                    'error', left(j.last_error, 160),
                    'progress', CASE WHEN j.status = 'RUNNING' THEN j.progress END)
                  ORDER BY j.created_at)
           FROM job j WHERE j.video_version_id = vv.id AND j.status <> 'CANCELLED')
         END
  FROM video v
  JOIN video_version vv ON vv.video_id = v.id AND vv.version = v.current_version
  LEFT JOIN LATERAL (
    SELECT j.* FROM job j
    WHERE j.video_version_id = vv.id AND j.status <> 'CANCELLED'
    ORDER BY CASE j.status
               WHEN 'RUNNING' THEN 0 WHEN 'QUEUED' THEN 1 WHEN 'READY' THEN 2 WHEN 'BLOCKED' THEN 3
               WHEN 'FAILED_RETRYABLE' THEN 4 WHEN 'PENDING' THEN 5 ELSE 6 END,
             j.updated_at DESC
    LIMIT 1
  ) cur ON true
  WHERE CASE WHEN v_prefix = '' THEN NOT video_is_terminal(vv.status)
             ELSE v.id::text LIKE v_prefix || '%' END
  ORDER BY vv.created_at DESC
  LIMIT 20;
END;
$$;
