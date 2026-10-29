-- migrate:up

-- D-074: pin each video to one worker. Steps read earlier steps' files from the worker's local
-- WORK_ROOT, so with more than one worker every job of a video must run where its first job ran.
-- The first job_start pins the video; later jobs are dispatched to that worker's own Redis list
-- (q:<stream>:w:<worker id>). Videos stay pinned: re-pinning means redoing the work (runbook).

-- Plain text, no foreign key: a worker row appears only with its first heartbeat.
ALTER TABLE video ADD COLUMN worker_id text;
-- Worker API base URL as n8n sees it (Tailscale), for fetching a video's media from its worker.
ALTER TABLE worker ADD COLUMN api_url text CHECK (api_url ~ '^https?://[^\s/]+$');

-- Existing videos belong to the worker that ran their latest attempt.
UPDATE video v
SET worker_id = (
  SELECT a.worker_id
  FROM job_attempt a
  JOIN job j ON j.id = a.job_id
  JOIN video_version vv ON vv.id = j.video_version_id
  WHERE vv.video_id = v.id
  ORDER BY a.started_at DESC
  LIMIT 1
);

-- Redis list a job is pushed onto: the shared stream list, or the pinned worker's own list.
CREATE FUNCTION job_queue_key(p_stream text, p_worker_id text) RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE WHEN p_worker_id IS NULL THEN p_stream ELSE p_stream || ':w:' || p_worker_id END;
$$;

-- Same as 20261024000300 plus the pin: a job of a video pinned to another worker goes back to
-- READY (the dispatcher re-routes it), and the first start pins the video.
CREATE OR REPLACE FUNCTION job_start(p_job_id uuid, p_worker_id text, p_lease_seconds integer)
RETURNS TABLE (
  attempt_no integer,
  step text,
  input jsonb,
  video_version_id uuid,
  video_id uuid,
  version integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_attempt integer;
  v_step text;
  v_input jsonb;
  v_version uuid;
  v_video uuid;
  v_pinned text;
BEGIN
  PERFORM assert_worker_identity(p_worker_id);
  PERFORM set_config('app.actor', p_worker_id, true);

  SELECT v.id, v.worker_id INTO v_video, v_pinned
  FROM job j
  JOIN video_version vv ON vv.id = j.video_version_id
  JOIN video v ON v.id = vv.video_id
  WHERE j.id = p_job_id
  FOR UPDATE OF v;

  IF v_pinned IS NOT NULL AND v_pinned <> p_worker_id THEN
    UPDATE job SET status = 'READY', queued_at = NULL WHERE id = p_job_id AND status = 'QUEUED';
    RETURN;
  END IF;

  UPDATE job
  SET status = 'RUNNING',
      claimed_by = p_worker_id,
      lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      attempt_count = attempt_count + 1,
      last_error = NULL
  WHERE id = p_job_id AND status = 'QUEUED'
  RETURNING attempt_count, step, input, video_version_id INTO v_attempt, v_step, v_input, v_version;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  UPDATE video SET worker_id = p_worker_id WHERE id = v_video AND worker_id IS NULL;
  INSERT INTO job_attempt (job_id, attempt_no, worker_id) VALUES (p_job_id, v_attempt, p_worker_id);

  RETURN QUERY
  SELECT v_attempt, v_step, v_input, v_version, vv.video_id, vv.version
  FROM video_version vv WHERE vv.id = v_version;
END;
$$;

-- Same as 20261024000300, but routes each job to its queue (job_queue_key) and applies
-- p_max_in_flight per queue: per pinned worker, and once more for the shared list.
DROP FUNCTION dispatch_claim(text, integer);
CREATE FUNCTION dispatch_claim(p_stream text, p_max_in_flight integer)
RETURNS TABLE (job_id uuid, step text, video_version_id uuid, queue text)
LANGUAGE plpgsql
AS $$
#variable_conflict use_column
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('dispatch:' || p_stream));

  RETURN QUERY
  WITH in_flight AS (
    SELECT v.worker_id, count(*)::integer AS n
    FROM job j
    JOIN video_version vv ON vv.id = j.video_version_id
    JOIN video v ON v.id = vv.video_id
    WHERE j.stream = p_stream AND j.status IN ('QUEUED', 'RUNNING')
    GROUP BY v.worker_id
  ),
  locked AS (
    SELECT j.id, v.worker_id, b.created_at AS batch_created_at, v.sequence,
           j.created_at AS job_created_at
    FROM job j
    JOIN video_version vv ON vv.id = j.video_version_id
    JOIN video v ON v.id = vv.video_id
    JOIN batch b ON b.id = v.batch_id
    WHERE j.stream = p_stream
      AND j.status = 'READY'
      AND NOT video_is_blocked(vv.status)
      AND NOT video_is_terminal(vv.status)
    FOR UPDATE OF j SKIP LOCKED
  ),
  ranked AS (
    SELECT l.*, row_number() OVER (
      PARTITION BY l.worker_id ORDER BY l.batch_created_at, l.sequence, l.job_created_at
    ) AS rn
    FROM locked l
  ),
  candidates AS (
    SELECT r.*
    FROM ranked r
    LEFT JOIN in_flight f ON f.worker_id IS NOT DISTINCT FROM r.worker_id
    WHERE r.rn <= p_max_in_flight - coalesce(f.n, 0)
  ),
  claimed AS (
    UPDATE job j
    SET status = 'QUEUED', queued_at = now()
    FROM candidates c
    WHERE j.id = c.id
    RETURNING j.id, j.step, j.video_version_id
  )
  SELECT claimed.id, claimed.step, claimed.video_version_id, job_queue_key(p_stream, c.worker_id)
  FROM claimed
  JOIN candidates c ON c.id = claimed.id
  ORDER BY c.batch_created_at, c.sequence, c.job_created_at;
END;
$$;

-- Same as 20261024000500, but the stream column carries the Redis list key (job_queue_key), so
-- WF-02 keeps RPUSHing onto the list named by `stream` without a workflow change.
CREATE OR REPLACE FUNCTION dispatch_all() RETURNS TABLE (stream text, job_id uuid)
LANGUAGE plpgsql
AS $$
#variable_conflict use_column
DECLARE
  v_config stream_config%ROWTYPE;
BEGIN
  PERFORM set_config('app.actor', 'dispatcher', true);
  PERFORM job_promote();
  FOR v_config IN SELECT * FROM stream_config WHERE enabled ORDER BY stream LOOP
    RETURN QUERY
    SELECT c.queue, c.job_id FROM dispatch_claim(v_config.stream, v_config.max_in_flight) c;
  END LOOP;
END;
$$;

-- Same as 20261024000300, but a job of a pinned video counts as lost only once its own worker
-- has found every queue empty.
CREATE OR REPLACE FUNCTION job_requeue_stale(p_older_than interval) RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_count integer;
BEGIN
  PERFORM set_config('app.actor', 'watchdog', true);
  UPDATE job j SET status = 'READY', queued_at = NULL
  FROM video_version vv
  JOIN video v ON v.id = vv.video_id
  WHERE vv.id = j.video_version_id
    AND j.status = 'QUEUED'
    AND j.queued_at < now() - p_older_than
    AND EXISTS (
      SELECT 1 FROM worker w
      WHERE j.stream = ANY (w.capabilities)
        AND w.last_idle_at > j.queued_at + interval '30 seconds'
        AND (v.worker_id IS NULL OR w.id = v.worker_id)
    );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- The two-argument worker_heartbeat stays for workers still running the previous release.
CREATE FUNCTION worker_heartbeat(p_worker_id text, p_capabilities text[], p_api_url text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM assert_worker_identity(p_worker_id);
  INSERT INTO worker (id, capabilities, last_seen_at, api_url)
  VALUES (p_worker_id, p_capabilities, now(), p_api_url)
  ON CONFLICT (id) DO UPDATE
    SET capabilities = excluded.capabilities,
        last_seen_at = excluded.last_seen_at,
        api_url = excluded.api_url;
END;
$$;

-- API base URL of the worker a video is pinned to; NULL when unpinned or unknown (n8n then
-- falls back to the WORKER_URL it was deployed with).
CREATE FUNCTION video_worker_url(p_video_id uuid) RETURNS text
LANGUAGE sql STABLE
AS $$
  SELECT w.api_url FROM video v JOIN worker w ON w.id = v.worker_id WHERE v.id = p_video_id;
$$;

-- Same as 20261025000100 plus stalled_pinned: videos with waiting jobs whose worker is offline.
CREATE OR REPLACE FUNCTION watchdog_run(
  p_stale_after interval DEFAULT interval '10 minutes',
  p_worker_offline_after interval DEFAULT interval '2 minutes'
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_expired integer;
  v_requeued integer;
  v_approvals integer;
  v_offline jsonb;
  v_blocked jsonb;
  v_needs_decision jsonb;
  v_stalled jsonb;
BEGIN
  v_expired := job_expire_leases();
  v_requeued := job_requeue_stale(p_stale_after);
  v_approvals := approval_expire();
  SELECT coalesce(jsonb_agg(worker_id ORDER BY worker_id), '[]'::jsonb) INTO v_offline
  FROM worker_offline(p_worker_offline_after);
  SELECT coalesce(jsonb_agg(DISTINCT video_id), '[]'::jsonb) INTO v_blocked
  FROM video_version WHERE status = 'BLOCKED_PROVIDER';
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'video_id', vv.video_id, 'version', vv.version, 'step', f.step, 'error', f.last_error
         ) ORDER BY vv.updated_at), '[]'::jsonb)
  INTO v_needs_decision
  FROM video_version vv
  LEFT JOIN LATERAL (
    SELECT j.step, left(j.last_error, 200) AS last_error
    FROM job j
    WHERE j.video_version_id = vv.id AND j.status = 'FAILED_PERMANENT'
    ORDER BY j.updated_at DESC
    LIMIT 1
  ) f ON true
  WHERE vv.status = 'NEEDS_DECISION';
  SELECT coalesce(jsonb_agg(jsonb_build_object('video_id', s.id, 'worker_id', s.worker_id)
           ORDER BY s.worker_id, s.id), '[]'::jsonb)
  INTO v_stalled
  FROM (
    SELECT DISTINCT v.id, v.worker_id
    FROM video v
    JOIN video_version vv ON vv.video_id = v.id
    JOIN job j ON j.video_version_id = vv.id
    JOIN worker_offline(p_worker_offline_after) o ON o.worker_id = v.worker_id
    WHERE j.status IN ('READY', 'QUEUED')
  ) s;

  RETURN jsonb_build_object(
    'expired_leases', v_expired,
    'requeued', v_requeued,
    'approvals_expired', v_approvals,
    'offline_workers', v_offline,
    'blocked_videos', v_blocked,
    'needs_decision', v_needs_decision,
    'stalled_pinned', v_stalled
  );
END;
$$;

-- migrate:down

-- Restores watchdog_run of 20261025000100.
CREATE OR REPLACE FUNCTION watchdog_run(
  p_stale_after interval DEFAULT interval '10 minutes',
  p_worker_offline_after interval DEFAULT interval '2 minutes'
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_expired integer;
  v_requeued integer;
  v_approvals integer;
  v_offline jsonb;
  v_blocked jsonb;
  v_needs_decision jsonb;
BEGIN
  v_expired := job_expire_leases();
  v_requeued := job_requeue_stale(p_stale_after);
  v_approvals := approval_expire();
  SELECT coalesce(jsonb_agg(worker_id ORDER BY worker_id), '[]'::jsonb) INTO v_offline
  FROM worker_offline(p_worker_offline_after);
  SELECT coalesce(jsonb_agg(DISTINCT video_id), '[]'::jsonb) INTO v_blocked
  FROM video_version WHERE status = 'BLOCKED_PROVIDER';
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'video_id', vv.video_id, 'version', vv.version, 'step', f.step, 'error', f.last_error
         ) ORDER BY vv.updated_at), '[]'::jsonb)
  INTO v_needs_decision
  FROM video_version vv
  LEFT JOIN LATERAL (
    SELECT j.step, left(j.last_error, 200) AS last_error
    FROM job j
    WHERE j.video_version_id = vv.id AND j.status = 'FAILED_PERMANENT'
    ORDER BY j.updated_at DESC
    LIMIT 1
  ) f ON true
  WHERE vv.status = 'NEEDS_DECISION';

  RETURN jsonb_build_object(
    'expired_leases', v_expired,
    'requeued', v_requeued,
    'approvals_expired', v_approvals,
    'offline_workers', v_offline,
    'blocked_videos', v_blocked,
    'needs_decision', v_needs_decision
  );
END;
$$;

DROP FUNCTION video_worker_url(uuid);
DROP FUNCTION worker_heartbeat(text, text[], text);

-- Restores job_requeue_stale of 20261024000300.
CREATE OR REPLACE FUNCTION job_requeue_stale(p_older_than interval) RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_count integer;
BEGIN
  PERFORM set_config('app.actor', 'watchdog', true);
  UPDATE job j SET status = 'READY', queued_at = NULL
  WHERE j.status = 'QUEUED'
    AND j.queued_at < now() - p_older_than
    AND EXISTS (
      SELECT 1 FROM worker w
      WHERE j.stream = ANY (w.capabilities) AND w.last_idle_at > j.queued_at + interval '30 seconds'
    );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Restores dispatch_all of 20261024000500.
CREATE OR REPLACE FUNCTION dispatch_all() RETURNS TABLE (stream text, job_id uuid)
LANGUAGE plpgsql
AS $$
#variable_conflict use_column
DECLARE
  v_config stream_config%ROWTYPE;
BEGIN
  PERFORM set_config('app.actor', 'dispatcher', true);
  PERFORM job_promote();
  FOR v_config IN SELECT * FROM stream_config WHERE enabled ORDER BY stream LOOP
    RETURN QUERY
    SELECT v_config.stream, c.job_id FROM dispatch_claim(v_config.stream, v_config.max_in_flight) c;
  END LOOP;
END;
$$;

-- Restores dispatch_claim of 20261024000300.
DROP FUNCTION dispatch_claim(text, integer);
CREATE FUNCTION dispatch_claim(p_stream text, p_max_in_flight integer)
RETURNS TABLE (job_id uuid, step text, video_version_id uuid)
LANGUAGE plpgsql
AS $$
#variable_conflict use_column
DECLARE
  v_slots integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('dispatch:' || p_stream));

  SELECT greatest(p_max_in_flight - count(*), 0)::integer INTO v_slots
  FROM job j
  WHERE j.stream = p_stream AND j.status IN ('QUEUED', 'RUNNING');

  IF v_slots = 0 THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT j.id, b.created_at AS batch_created_at, v.sequence, j.created_at AS job_created_at
    FROM job j
    JOIN video_version vv ON vv.id = j.video_version_id
    JOIN video v ON v.id = vv.video_id
    JOIN batch b ON b.id = v.batch_id
    WHERE j.stream = p_stream
      AND j.status = 'READY'
      AND NOT video_is_blocked(vv.status)
      AND NOT video_is_terminal(vv.status)
    ORDER BY b.created_at, v.sequence, j.created_at
    LIMIT v_slots
    FOR UPDATE OF j SKIP LOCKED
  ),
  claimed AS (
    UPDATE job j
    SET status = 'QUEUED', queued_at = now()
    FROM candidates c
    WHERE j.id = c.id
    RETURNING j.id, j.step, j.video_version_id
  )
  SELECT claimed.id, claimed.step, claimed.video_version_id
  FROM claimed
  JOIN candidates c ON c.id = claimed.id
  ORDER BY c.batch_created_at, c.sequence, c.job_created_at;
END;
$$;

-- Restores job_start of 20261024000300.
CREATE OR REPLACE FUNCTION job_start(p_job_id uuid, p_worker_id text, p_lease_seconds integer)
RETURNS TABLE (
  attempt_no integer,
  step text,
  input jsonb,
  video_version_id uuid,
  video_id uuid,
  version integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_attempt integer;
  v_step text;
  v_input jsonb;
  v_version uuid;
BEGIN
  PERFORM assert_worker_identity(p_worker_id);
  PERFORM set_config('app.actor', p_worker_id, true);

  UPDATE job
  SET status = 'RUNNING',
      claimed_by = p_worker_id,
      lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      attempt_count = attempt_count + 1,
      last_error = NULL
  WHERE id = p_job_id AND status = 'QUEUED'
  RETURNING attempt_count, step, input, video_version_id INTO v_attempt, v_step, v_input, v_version;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  INSERT INTO job_attempt (job_id, attempt_no, worker_id) VALUES (p_job_id, v_attempt, p_worker_id);

  RETURN QUERY
  SELECT v_attempt, v_step, v_input, v_version, vv.video_id, vv.version
  FROM video_version vv WHERE vv.id = v_version;
END;
$$;

DROP FUNCTION job_queue_key(text, text);
ALTER TABLE worker DROP COLUMN api_url;
ALTER TABLE video DROP COLUMN worker_id;
