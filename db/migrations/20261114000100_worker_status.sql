-- migrate:up

-- /workers on Telegram (D-082): what each worker is doing right now. One row per worker (by id):
-- online when its last heartbeat is under 2 minutes old (the watchdog's offline threshold), the
-- jobs it is running (clip, step, attempt, start of the attempt, progress) and how many jobs of
-- the videos pinned to it (D-074) are waiting to be dispatched. Strangers get a single row with
-- allowed = false and nothing else.
CREATE FUNCTION telegram_workers(p_user_id bigint)
RETURNS TABLE (
  allowed boolean,
  worker_id text,
  online boolean,
  last_seen_at timestamptz,
  jobs jsonb,
  waiting integer
)
LANGUAGE plpgsql
STABLE
AS $$
#variable_conflict use_column
BEGIN
  IF NOT EXISTS (SELECT 1 FROM approver WHERE telegram_user_id = p_user_id AND active) THEN
    RETURN QUERY SELECT false, NULL::text, NULL::boolean, NULL::timestamptz, NULL::jsonb,
      NULL::integer;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT true, w.id,
         coalesce(w.last_seen_at > now() - interval '2 minutes', false),
         w.last_seen_at,
         (SELECT coalesce(jsonb_agg(jsonb_build_object(
                    'video_id', vv.video_id,
                    'version', vv.version,
                    'title', coalesce(script_job_output(vv.id)->'result'->>'title', vv.brief->>'topic'),
                    'video_status', vv.status,
                    'step', j.step,
                    'attempts', j.attempt_count,
                    'started', (SELECT max(a.started_at) FROM job_attempt a WHERE a.job_id = j.id),
                    'progress', j.progress)
                  ORDER BY j.updated_at), '[]'::jsonb)
          FROM job j
          JOIN video_version vv ON vv.id = j.video_version_id
          WHERE j.status = 'RUNNING' AND j.claimed_by = w.id),
         (SELECT count(*)::integer
          FROM job j
          JOIN video_version vv ON vv.id = j.video_version_id
          JOIN video v ON v.id = vv.video_id
          WHERE v.worker_id = w.id
            AND j.status IN ('READY', 'QUEUED')
            AND NOT video_is_terminal(vv.status))
  FROM worker w
  ORDER BY w.id;
END;
$$;

-- migrate:down

DROP FUNCTION telegram_workers(bigint);
