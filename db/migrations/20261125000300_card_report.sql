-- migrate:up

-- /v card and /report (D-099).
-- video_ref(): also accepts <video id>@<version>, the reference a /v button carries. It resolves
-- to the id while that version is current, and otherwise to 'stale', which no id matches, so every
-- telegram_* function answers NOT_FOUND and a button on an old card does nothing.
-- telegram_report(): outcomes and costs of a period, for approvers. Actual costs only. Cost per
-- minute uses only completed videos whose final QA recorded a duration.
--
-- Rollback: restores video_ref of 20261125000100 and drops telegram_report. WF-06 must be rolled
-- back first.

CREATE OR REPLACE FUNCTION video_ref(p_ref text) RETURNS text
LANGUAGE sql STABLE
AS $$
  SELECT CASE
    WHEN p_ref = 'last' THEN coalesce((
      SELECT v.id::text
      FROM video v
      JOIN video_version vv ON vv.video_id = v.id AND vv.version = v.current_version
      WHERE NOT video_is_terminal(vv.status)
      ORDER BY vv.created_at DESC, v.id
      LIMIT 1
    ), p_ref)
    WHEN p_ref ~ '^[0-9a-f-]{36}@[0-9]{1,6}$' THEN coalesce((
      SELECT v.id::text
      FROM video v
      WHERE v.id::text = split_part(p_ref, '@', 1)
        AND v.current_version = split_part(p_ref, '@', 2)::integer
    ), 'stale')
    ELSE p_ref
  END;
$$;

CREATE FUNCTION telegram_report(p_user_id bigint, p_period text DEFAULT 'today')
RETURNS TABLE (
  allowed boolean,
  period text,
  since timestamptz,
  created integer,
  completed integer,
  failed integer,
  cancelled integer,
  active integer,
  stopped integer,
  cost jsonb,
  minutes double precision,
  minutes_videos integer,
  completed_cost jsonb,
  steps jsonb,
  approvals jsonb
)
LANGUAGE plpgsql
STABLE
AS $$
#variable_conflict use_column
DECLARE
  c_step_limit constant integer := 5;
  v_since timestamptz;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM approver WHERE telegram_user_id = p_user_id AND active) THEN
    RETURN QUERY SELECT false, NULL::text, NULL::timestamptz, NULL::integer, NULL::integer,
      NULL::integer, NULL::integer, NULL::integer, NULL::integer, NULL::jsonb,
      NULL::double precision, NULL::integer, NULL::jsonb, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  v_since := CASE p_period
    WHEN '7d' THEN now() - interval '7 days'
    WHEN '30d' THEN now() - interval '30 days'
    ELSE date_trunc('day', now() AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'Asia/Ho_Chi_Minh'
  END;

  RETURN QUERY
  WITH current_version AS (
    SELECT vv.* FROM video_version vv
    JOIN video v ON v.id = vv.video_id AND v.current_version = vv.version
  ),
  measured AS (
    SELECT c.id,
           ((final_step(c.id, 'qa_final')).output->'result'->>'duration_seconds')::float8 AS seconds
    FROM current_version c
    WHERE c.status = 'COMPLETED' AND c.updated_at >= v_since
  )
  SELECT true, CASE WHEN p_period IN ('7d', '30d') THEN p_period ELSE 'today' END, v_since,
    (SELECT count(*)::integer FROM current_version c WHERE c.created_at >= v_since),
    (SELECT count(*)::integer FROM current_version c
     WHERE c.status = 'COMPLETED' AND c.updated_at >= v_since),
    (SELECT count(*)::integer FROM current_version c
     WHERE c.status = 'FAILED' AND c.updated_at >= v_since),
    (SELECT count(*)::integer FROM current_version c
     WHERE c.status = 'CANCELLED' AND c.updated_at >= v_since),
    (SELECT count(*)::integer FROM current_version c WHERE NOT video_is_terminal(c.status)),
    (SELECT count(*)::integer FROM current_version c WHERE video_is_blocked(c.status)),
    (SELECT coalesce(jsonb_object_agg(t.currency, t.total), '{}'::jsonb) FROM (
       SELECT trim(e.currency) AS currency, sum(e.amount)::float8 AS total
       FROM cost_entry e
       WHERE e.kind = 'ACTUAL' AND e.created_at >= v_since
       GROUP BY 1
     ) t),
    (SELECT coalesce(sum(m.seconds), 0)::float8 / 60 FROM measured m WHERE m.seconds > 0),
    (SELECT count(*)::integer FROM measured m WHERE m.seconds > 0),
    (SELECT coalesce(jsonb_object_agg(t.currency, t.total), '{}'::jsonb) FROM (
       SELECT trim(e.currency) AS currency, sum(e.amount)::float8 AS total
       FROM cost_entry e
       JOIN measured m ON m.id = e.video_version_id AND m.seconds > 0
       WHERE e.kind = 'ACTUAL'
       GROUP BY 1
     ) t),
    (SELECT coalesce(jsonb_agg(jsonb_build_object('step', t.step, 'runs', t.runs,
                                                  'median_seconds', t.median_seconds)
                               ORDER BY t.median_seconds DESC), '[]'::jsonb)
     FROM (
       SELECT j.step, count(*)::integer AS runs,
              round(percentile_cont(0.5) WITHIN GROUP (
                ORDER BY extract(epoch FROM a.finished_at - a.started_at)))::integer
                AS median_seconds
       FROM job j
       JOIN job_attempt a ON a.job_id = j.id
       WHERE a.status = 'SUCCEEDED' AND a.started_at >= v_since
       GROUP BY j.step
       ORDER BY 3 DESC
       LIMIT c_step_limit
     ) t),
    (SELECT jsonb_build_object('decided', count(*)::integer,
              'median_seconds', round(percentile_cont(0.5) WITHIN GROUP (
                ORDER BY extract(epoch FROM a.decided_at - a.requested_at)))::integer)
     FROM approval a
     WHERE a.decided_at IS NOT NULL AND a.requested_at >= v_since);
END;
$$;

-- migrate:down

DROP FUNCTION telegram_report(bigint, text);

CREATE OR REPLACE FUNCTION video_ref(p_ref text) RETURNS text
LANGUAGE sql STABLE
AS $$
  SELECT CASE
    WHEN p_ref = 'last' THEN coalesce((
      SELECT v.id::text
      FROM video v
      JOIN video_version vv ON vv.video_id = v.id AND vv.version = v.current_version
      WHERE NOT video_is_terminal(vv.status)
      ORDER BY vv.created_at DESC, v.id
      LIMIT 1
    ), p_ref)
    ELSE p_ref
  END;
$$;
