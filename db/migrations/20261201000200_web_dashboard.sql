-- migrate:up

-- Web console dashboard (D-110): one read for the home page. A period is whole Asia/Ho_Chi_Minh
-- days: today, or the last 7 or 30 days ending today, so the per-day rows line up with the
-- calendar (telegram_report's 7d and 30d are rolling windows; today is the same in both).
-- started, completed and failed follow telegram_report: created_at of the current version, and
-- status with updated_at, which the status guard sets on every change. Costs are ACTUAL entries by
-- created_at. A kit is resolved as in library_rows: the brief's kit, else the catalog default; a
-- kit no longer in the catalog is the row with no slug. Failures are failed jobs of videos still
-- in flight or failed. can_retry says whether web_retry would accept the video: it is decided per
-- video, and a retry takes the newest FAILED_PERMANENT job, so two failed jobs of one video can
-- both show it.
--
-- Rollback: drops the function. Only the web service calls it; roll the service back first.

CREATE FUNCTION web_dashboard(p_session text, p_period text) RETURNS jsonb
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  c_zone constant text := 'Asia/Ho_Chi_Minh';
  c_failure_limit constant integer := 10;
  c_max_manual_retries constant integer := 5;
  v_today date := (now() AT TIME ZONE c_zone)::date;
  v_first date;
  v_since timestamptz;
  v_until timestamptz;
  v_result jsonb;
BEGIN
  PERFORM web_session_user(p_session);
  IF p_period NOT IN ('today', '7d', '30d') THEN
    RAISE EXCEPTION 'invalid period %', p_period;
  END IF;
  v_first := v_today - CASE p_period WHEN '7d' THEN 6 WHEN '30d' THEN 29 ELSE 0 END;
  v_since := v_first::timestamp AT TIME ZONE c_zone;
  v_until := (v_today + 1)::timestamp AT TIME ZONE c_zone;

  WITH current_version AS (
    SELECT vv.*, v.id AS vid
    FROM video_version vv
    JOIN video v ON v.id = vv.video_id AND v.current_version = vv.version
  ),
  days AS (
    SELECT d::date AS day
    FROM generate_series(v_first::timestamp, v_today::timestamp, interval '1 day') d
  ),
  started AS (
    SELECT (c.created_at AT TIME ZONE c_zone)::date AS day, count(*)::integer AS n
    FROM current_version c
    WHERE c.created_at >= v_since AND c.created_at < v_until
    GROUP BY 1
  ),
  ended AS (
    SELECT (c.updated_at AT TIME ZONE c_zone)::date AS day,
           count(*) FILTER (WHERE c.status = 'COMPLETED')::integer AS completed,
           count(*) FILTER (WHERE c.status = 'FAILED')::integer AS failed
    FROM current_version c
    WHERE c.status IN ('COMPLETED', 'FAILED')
      AND c.updated_at >= v_since AND c.updated_at < v_until
    GROUP BY 1
  ),
  spent AS (
    SELECT (e.created_at AT TIME ZONE c_zone)::date AS day, e.video_version_id,
           trim(e.currency) AS currency, e.amount
    FROM cost_entry e
    WHERE e.kind = 'ACTUAL' AND e.created_at >= v_since AND e.created_at < v_until
  ),
  day_cost AS (
    SELECT s.day, jsonb_object_agg(s.currency, s.total) AS cost
    FROM (SELECT day, currency, sum(amount)::float8 AS total FROM spent GROUP BY 1, 2) s
    GROUP BY s.day
  ),
  version_kit AS (
    SELECT vv.id AS version_id, k.slug, k.label, k.sort_order
    FROM video_version vv
    LEFT JOIN catalog_option k
      ON k.kind = 'kit' AND k.slug = coalesce(vv.brief->>'kit', catalog_default('kit'))
  ),
  kit_counts AS (
    SELECT vk.slug, vk.label, vk.sort_order,
           count(*) FILTER (WHERE c.created_at >= v_since AND c.created_at < v_until)::integer
             AS started,
           count(*) FILTER (WHERE c.status = 'COMPLETED'
                              AND c.updated_at >= v_since AND c.updated_at < v_until)::integer
             AS completed
    FROM current_version c
    JOIN version_kit vk ON vk.version_id = c.id
    GROUP BY 1, 2, 3
  ),
  kit_cost AS (
    SELECT vk.slug, jsonb_object_agg(t.currency, t.total) AS cost
    FROM (SELECT s.video_version_id, s.currency, sum(s.amount)::float8 AS total
          FROM spent s GROUP BY 1, 2) t
    JOIN version_kit vk ON vk.version_id = t.video_version_id
    GROUP BY vk.slug
  ),
  -- Every enabled kit, plus any other kit (disabled, or none for an unknown slug) with activity.
  kit_rows AS (
    SELECT k.slug, k.label, k.sort_order FROM catalog_option k
    WHERE k.kind = 'kit' AND k.enabled
    UNION
    SELECT kc.slug, kc.label, kc.sort_order FROM kit_counts kc
    WHERE kc.started > 0 OR kc.completed > 0
    UNION
    SELECT vk.slug, vk.label, vk.sort_order
    FROM kit_cost kco
    JOIN LATERAL (SELECT DISTINCT vk.slug, vk.label, vk.sort_order FROM version_kit vk
                  WHERE vk.slug IS NOT DISTINCT FROM kco.slug) vk ON true
  ),
  failed_jobs AS (
    SELECT c.vid AS video_id, c.version, c.id AS version_id, c.brief, c.status AS video_status,
           j.step, j.status, j.last_error, j.attempt_count, j.manual_retries,
           coalesce(last_attempt.finished_at, j.updated_at) AS failed_at
    FROM job j
    JOIN current_version c ON c.id = j.video_version_id
    LEFT JOIN LATERAL (
      SELECT a.finished_at FROM job_attempt a
      WHERE a.job_id = j.id ORDER BY a.attempt_no DESC LIMIT 1
    ) last_attempt ON true
    WHERE j.status IN ('FAILED_RETRYABLE', 'FAILED_PERMANENT')
      AND (NOT video_is_terminal(c.status) OR c.status = 'FAILED')
    ORDER BY coalesce(last_attempt.finished_at, j.updated_at) DESC, j.id
    LIMIT c_failure_limit
  ),
  grouped AS (
    SELECT web_video_group(c.id, c.status) AS state_group FROM current_version c
  )
  SELECT jsonb_build_object(
    'period', p_period,
    'since', v_since,
    'days', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
               'day', to_char(d.day, 'YYYY-MM-DD'),
               'started', coalesce(s.n, 0),
               'completed', coalesce(e.completed, 0),
               'failed', coalesce(e.failed, 0),
               'cost', coalesce(dc.cost, '{}'::jsonb)) ORDER BY d.day), '[]'::jsonb)
      FROM days d
      LEFT JOIN started s ON s.day = d.day
      LEFT JOIN ended e ON e.day = d.day
      LEFT JOIN day_cost dc ON dc.day = d.day
    ),
    'kits', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
               'slug', r.slug,
               'label', r.label,
               'started', coalesce(kc.started, 0),
               'completed', coalesce(kc.completed, 0),
               'cost', coalesce(kco.cost, '{}'::jsonb))
             ORDER BY r.sort_order NULLS LAST, r.slug NULLS LAST), '[]'::jsonb)
      FROM (SELECT DISTINCT slug, label, sort_order FROM kit_rows) r
      LEFT JOIN kit_counts kc ON kc.slug IS NOT DISTINCT FROM r.slug
      LEFT JOIN kit_cost kco ON kco.slug IS NOT DISTINCT FROM r.slug
    ),
    'failures', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
               'video_id', f.video_id,
               'version', f.version,
               'title', web_video_title(f.version_id, f.brief),
               'kit', f.brief->>'kit',
               'step', f.step,
               'status', f.status,
               'error', f.last_error,
               'failed_at', f.failed_at,
               'attempts', f.attempt_count,
               'can_retry', f.video_status = 'NEEDS_DECISION'
                            AND f.status = 'FAILED_PERMANENT'
                            AND f.manual_retries < c_max_manual_retries)
             ORDER BY f.failed_at DESC), '[]'::jsonb)
      FROM failed_jobs f
    ),
    'status_counts', (
      SELECT jsonb_build_object(
        'stopped', count(*) FILTER (WHERE g.state_group = 'STOPPED'),
        'approval', count(*) FILTER (WHERE g.state_group = 'APPROVAL'),
        'running', count(*) FILTER (WHERE g.state_group = 'RUNNING'),
        'waiting', count(*) FILTER (WHERE g.state_group = 'WAITING'),
        'done', count(*) FILTER (WHERE g.state_group = 'DONE'))
      FROM grouped g
    )
  ) INTO v_result;
  RETURN v_result;
END;
$$;

-- migrate:down

DROP FUNCTION web_dashboard(text, text);
