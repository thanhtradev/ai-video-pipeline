-- migrate:up

-- Job lifecycle API used by n8n (dispatch, watchdog) and workers (start, heartbeat, finish).
-- Worker-facing functions are SECURITY DEFINER so the worker role needs only EXECUTE (ops/postgres).
-- Every transition is guarded by an expected-status condition, so duplicate or late calls are no-ops.

CREATE FUNCTION video_create(p_batch_id uuid, p_sequence integer, p_aspect_ratio text, p_brief jsonb)
RETURNS TABLE (video_id uuid, version_id uuid)
LANGUAGE plpgsql
AS $$
#variable_conflict use_column
DECLARE
  v_video_id uuid;
  v_version_id uuid;
BEGIN
  INSERT INTO video (batch_id, sequence, aspect_ratio)
  VALUES (p_batch_id, p_sequence, p_aspect_ratio)
  RETURNING id INTO v_video_id;

  INSERT INTO video_version (video_id, version, brief)
  VALUES (v_video_id, 1, p_brief)
  RETURNING id INTO v_version_id;

  RETURN QUERY SELECT v_video_id, v_version_id;
END;
$$;

CREATE FUNCTION job_create(
  p_video_version_id uuid,
  p_step text,
  p_stream text,
  p_input jsonb,
  p_input_hash text,
  p_depends_on uuid[] DEFAULT '{}',
  p_max_attempts integer DEFAULT 3
) RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_key text := p_video_version_id::text || ':' || p_step || ':' || p_input_hash;
  v_id uuid;
BEGIN
  INSERT INTO job (video_version_id, step, stream, idempotency_key, status, input, max_attempts)
  VALUES (p_video_version_id, p_step, p_stream, v_key, 'PENDING', p_input, p_max_attempts)
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM job WHERE idempotency_key = v_key;
    RETURN v_id;
  END IF;

  INSERT INTO job_dependency (job_id, depends_on_job_id)
  SELECT v_id, unnest(p_depends_on);

  IF NOT EXISTS (
    SELECT 1
    FROM job_dependency d
    JOIN job dep ON dep.id = d.depends_on_job_id
    WHERE d.job_id = v_id AND dep.status <> 'SUCCEEDED'
  ) THEN
    UPDATE job SET status = 'READY' WHERE id = v_id;
  END IF;

  RETURN v_id;
END;
$$;

-- PENDING jobs whose dependencies succeeded, and retryable jobs whose backoff elapsed, become READY.
CREATE FUNCTION job_promote() RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_ready integer;
  v_retry integer;
BEGIN
  UPDATE job j SET status = 'READY'
  WHERE j.status = 'PENDING'
    AND NOT EXISTS (
      SELECT 1
      FROM job_dependency d
      JOIN job dep ON dep.id = d.depends_on_job_id
      WHERE d.job_id = j.id AND dep.status <> 'SUCCEEDED'
    );
  GET DIAGNOSTICS v_ready = ROW_COUNT;

  UPDATE job j SET status = 'READY', next_attempt_at = NULL
  WHERE j.status = 'FAILED_RETRYABLE' AND j.next_attempt_at <= now();
  GET DIAGNOSTICS v_retry = ROW_COUNT;

  RETURN v_ready + v_retry;
END;
$$;

-- Claims READY jobs for one stream in FIFO order (batch, video sequence, job), skipping videos that
-- are blocked or finished, and never exceeding p_max_in_flight QUEUED+RUNNING jobs on the stream.
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

-- Moves a QUEUED job to RUNNING for one worker. Returns no row when the job is not QUEUED
-- (duplicate queue message, already running, cancelled), so the worker simply drops the message.
CREATE FUNCTION job_start(p_job_id uuid, p_worker_id text, p_lease_seconds integer)
RETURNS TABLE (attempt_no integer, step text, input jsonb, video_version_id uuid)
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

  RETURN QUERY SELECT v_attempt, v_step, v_input, v_version;
END;
$$;

-- Extends the lease. Returns RUNNING, CANCELLED (stop work), LOST (not ours / not running), NOT_FOUND.
CREATE FUNCTION job_heartbeat(p_job_id uuid, p_worker_id text, p_lease_seconds integer)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status text;
  v_claimed_by text;
BEGIN
  SELECT status, claimed_by INTO v_status, v_claimed_by FROM job WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 'NOT_FOUND';
  END IF;
  IF v_claimed_by IS DISTINCT FROM p_worker_id THEN
    RETURN 'LOST';
  END IF;
  IF v_status = 'CANCELLED' THEN
    RETURN 'CANCELLED';
  END IF;
  IF v_status <> 'RUNNING' THEN
    RETURN 'LOST';
  END IF;

  UPDATE job SET lease_expires_at = now() + make_interval(secs => p_lease_seconds) WHERE id = p_job_id;
  RETURN 'RUNNING';
END;
$$;

CREATE FUNCTION job_succeed(p_job_id uuid, p_worker_id text, p_output jsonb)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM set_config('app.actor', p_worker_id, true);

  UPDATE job
  SET status = 'SUCCEEDED', output = p_output, lease_expires_at = NULL
  WHERE id = p_job_id AND status = 'RUNNING' AND claimed_by = p_worker_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  UPDATE job_attempt
  SET status = 'SUCCEEDED', finished_at = now()
  WHERE job_id = p_job_id AND status = 'RUNNING';
  RETURN true;
END;
$$;

-- Shared failure path for workers and the lease watchdog. Caller must hold the row lock.
CREATE FUNCTION job_fail_locked(p_job_id uuid, p_error text, p_retryable boolean, p_attempt_status text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_job job%ROWTYPE;
  v_new_status text;
  v_backoff_seconds double precision;
  v_version_status text;
BEGIN
  SELECT * INTO v_job FROM job WHERE id = p_job_id;

  IF p_retryable AND v_job.attempt_count < v_job.max_attempts THEN
    v_new_status := 'FAILED_RETRYABLE';
    -- 30s, 60s, 120s ... capped at 15 min, plus up to 20% jitter.
    v_backoff_seconds := least(30 * power(2, v_job.attempt_count - 1), 900) * (1 + random() * 0.2);
  ELSE
    v_new_status := 'FAILED_PERMANENT';
  END IF;

  UPDATE job
  SET status = v_new_status,
      last_error = left(p_error, 2000),
      lease_expires_at = NULL,
      next_attempt_at = CASE
        WHEN v_new_status = 'FAILED_RETRYABLE' THEN now() + make_interval(secs => v_backoff_seconds)
      END
  WHERE id = p_job_id;

  UPDATE job_attempt
  SET status = CASE WHEN p_attempt_status = 'ABANDONED' THEN 'ABANDONED' ELSE v_new_status END,
      error = left(p_error, 2000),
      finished_at = now()
  WHERE job_id = p_job_id AND status = 'RUNNING';

  IF v_new_status = 'FAILED_PERMANENT' THEN
    SELECT status INTO v_version_status FROM video_version WHERE id = v_job.video_version_id FOR UPDATE;
    IF NOT video_is_terminal(v_version_status) AND NOT video_is_blocked(v_version_status) THEN
      UPDATE video_version SET status = 'NEEDS_DECISION' WHERE id = v_job.video_version_id;
    END IF;
  END IF;

  RETURN v_new_status;
END;
$$;

-- Returns the new status, or LOST when the job is not RUNNING for this worker.
CREATE FUNCTION job_fail(p_job_id uuid, p_worker_id text, p_error text, p_retryable boolean)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM set_config('app.actor', p_worker_id, true);
  PERFORM 1 FROM job
  WHERE id = p_job_id AND status = 'RUNNING' AND claimed_by = p_worker_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 'LOST';
  END IF;
  RETURN job_fail_locked(p_job_id, p_error, p_retryable, NULL);
END;
$$;

CREATE FUNCTION job_cancel(p_job_id uuid, p_actor text) RETURNS boolean
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('app.actor', p_actor, true);
  UPDATE job SET status = 'CANCELLED', lease_expires_at = NULL
  WHERE id = p_job_id AND status NOT IN ('SUCCEEDED', 'CANCELLED');
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  UPDATE job_attempt SET status = 'CANCELLED', finished_at = now()
  WHERE job_id = p_job_id AND status = 'RUNNING';
  RETURN true;
END;
$$;

-- Watchdog: RUNNING jobs whose worker stopped heart-beating.
CREATE FUNCTION job_expire_leases() RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_id uuid;
  v_count integer := 0;
BEGIN
  PERFORM set_config('app.actor', 'watchdog', true);
  FOR v_id IN
    SELECT id FROM job
    WHERE status = 'RUNNING' AND lease_expires_at < now()
    FOR UPDATE SKIP LOCKED
  LOOP
    PERFORM job_fail_locked(v_id, 'lease expired', true, 'ABANDONED');
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

-- Watchdog: QUEUED jobs never started (queue message lost, e.g. Redis restart) go back to READY.
-- Safe because job_start only accepts QUEUED jobs: a late duplicate message is dropped.
CREATE FUNCTION job_requeue_stale(p_older_than interval) RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_count integer;
BEGIN
  PERFORM set_config('app.actor', 'watchdog', true);
  UPDATE job SET status = 'READY', queued_at = NULL
  WHERE status = 'QUEUED' AND queued_at < now() - p_older_than;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE FUNCTION worker_heartbeat(p_worker_id text, p_capabilities text[]) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  INSERT INTO worker (id, capabilities, last_seen_at)
  VALUES (p_worker_id, p_capabilities, now())
  ON CONFLICT (id) DO UPDATE SET capabilities = excluded.capabilities, last_seen_at = excluded.last_seen_at;
$$;

CREATE FUNCTION worker_offline(p_after interval)
RETURNS TABLE (worker_id text, last_seen_at timestamptz)
LANGUAGE sql
AS $$
  SELECT id, last_seen_at FROM worker WHERE last_seen_at IS NULL OR last_seen_at < now() - p_after;
$$;

-- migrate:down

DROP FUNCTION worker_offline(interval);
DROP FUNCTION worker_heartbeat(text, text[]);
DROP FUNCTION job_requeue_stale(interval);
DROP FUNCTION job_expire_leases();
DROP FUNCTION job_cancel(uuid, text);
DROP FUNCTION job_fail(uuid, text, text, boolean);
DROP FUNCTION job_fail_locked(uuid, text, boolean, text);
DROP FUNCTION job_succeed(uuid, text, jsonb);
DROP FUNCTION job_heartbeat(uuid, text, integer);
DROP FUNCTION job_start(uuid, text, integer);
DROP FUNCTION dispatch_claim(text, integer);
DROP FUNCTION job_promote();
DROP FUNCTION job_create(uuid, text, text, jsonb, text, uuid[], integer);
DROP FUNCTION video_create(uuid, integer, text, jsonb);
