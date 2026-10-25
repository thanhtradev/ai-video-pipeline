-- migrate:up

-- Progress check (P-017). Workers report what a long step is doing (job.progress); WF-06 answers
-- /status and /status <video id prefix> on Telegram from telegram_status(), for approvers only.

ALTER TABLE job ADD COLUMN progress jsonb;
ALTER TABLE job ADD COLUMN progress_at timestamptz;

-- Worker: the stage of a running job (e.g. {"stage":"agent","turn":2,"of":3}). False when the job
-- is not running for this worker or the report is too large; progress never changes job state.
CREATE FUNCTION job_report_progress(p_job_id uuid, p_worker_id text, p_progress jsonb)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM assert_worker_identity(p_worker_id);
  IF p_progress IS NULL OR octet_length(p_progress::text) > 2000 THEN
    RETURN false;
  END IF;
  UPDATE job SET progress = p_progress, progress_at = now()
  WHERE id = p_job_id AND status = 'RUNNING' AND claimed_by = p_worker_id;
  RETURN FOUND;
END;
$$;

-- /status: one row per active video (current version not ended), newest first; with a prefix of
-- the video id (any length, any case), that video in any state plus its jobs. Strangers get a
-- single row with allowed = false and nothing else.
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

-- migrate:down

DROP FUNCTION telegram_status(bigint, text);
DROP FUNCTION job_report_progress(uuid, text, jsonb);
ALTER TABLE job DROP COLUMN progress_at;
ALTER TABLE job DROP COLUMN progress;
