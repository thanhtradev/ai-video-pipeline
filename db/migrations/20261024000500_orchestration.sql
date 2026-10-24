-- migrate:up

-- Entry points for n8n scheduled workflows (n8n/workflows/). Each workflow runs one query,
-- so all orchestration rules stay in tested SQL.

-- Per-stream concurrency. Seeded for the single active worker (D-034): one job per stream,
-- and the worker itself runs one job at a time. Tune after the Phase 3/4 benchmarks.
CREATE TABLE stream_config (
  stream text PRIMARY KEY CHECK (stream ~ '^q:[a-z0-9-]+$'),
  max_in_flight integer NOT NULL CHECK (max_in_flight >= 0),
  enabled boolean NOT NULL DEFAULT true
);

INSERT INTO stream_config (stream, max_in_flight) VALUES
  ('q:render', 1),
  ('q:heavy', 1),
  ('q:light', 1);

-- WF-02 Dispatcher: promote ready work, then claim per stream. n8n RPUSHes each row's job_id
-- onto the Redis list named by stream.
CREATE FUNCTION dispatch_all() RETURNS TABLE (stream text, job_id uuid)
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

-- WF-08 Watchdog: one call per minute; returns a summary n8n turns into Telegram alerts.
CREATE FUNCTION watchdog_run(
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
BEGIN
  v_expired := job_expire_leases();
  v_requeued := job_requeue_stale(p_stale_after);
  v_approvals := approval_expire();
  SELECT coalesce(jsonb_agg(worker_id ORDER BY worker_id), '[]'::jsonb) INTO v_offline
  FROM worker_offline(p_worker_offline_after);

  RETURN jsonb_build_object(
    'expired_leases', v_expired,
    'requeued', v_requeued,
    'approvals_expired', v_approvals,
    'offline_workers', v_offline
  );
END;
$$;

-- migrate:down

DROP FUNCTION watchdog_run(interval, interval);
DROP FUNCTION dispatch_all();
DROP TABLE stream_config;
