-- Cancels the current version of each listed video (D-094, runbook ops/cancel-videos.md). Run as
-- the owner role; a dry run unless apply=1:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -v ids='4e6f760a 878da929' -f ops/postgres/cancel-videos.sql
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -v ids='4e6f760a 878da929' -v apply=1 -f ops/postgres/cancel-videos.sql
-- ids: video id prefixes (at least 4 hex characters, as Telegram shows them), separated by spaces
-- or commas. Each video is independent: an unknown, ambiguous or finished id is reported and
-- skipped. For each other video: pending approvals -> SUPERSEDED, every job not yet SUCCEEDED ->
-- CANCELLED (job_cancel), /auto cleared, version -> CANCELLED, audit video_cancelled. Nothing is
-- deleted (files, jobs, approvals and costs stay). A job already running finishes on its worker,
-- but its result is dropped; credits it already spent are not refunded.
-- No secrets here.

\set ON_ERROR_STOP on
\if :{?ids}
\else
  \echo 'Usage: psql "$DATABASE_URL" -v ids=''<id prefix> …'' [-v apply=1] -f ops/postgres/cancel-videos.sql'
  \quit
\endif
\if :{?apply}
\else
  \set apply 0
\endif

BEGIN;
SELECT set_config('app.actor', 'rollout:' || current_user, true) \g /dev/null
SELECT set_config('cancel.ids', :'ids', true) \g /dev/null
SELECT set_config('cancel.apply', :'apply', true) \g /dev/null

CREATE TEMP TABLE cancel_result (
  n integer,
  prefix text,
  video_id uuid,
  from_status text,
  result text,
  jobs_cancelled integer
) ON COMMIT DROP;

DO $$
DECLARE
  c_apply constant boolean := current_setting('cancel.apply') = '1';
  c_actor constant text := current_setting('app.actor');
  v_item record;
  v_prefix text;
  v_count integer;
  v_video_id uuid;
  v_version_id uuid;
  v_status text;
  v_job uuid;
  v_jobs integer;
BEGIN
  FOR v_item IN
    SELECT t.value, t.n
    FROM unnest(regexp_split_to_array(btrim(current_setting('cancel.ids')), '[\s,]+'))
           WITH ORDINALITY AS t(value, n)
    WHERE t.value <> ''
  LOOP
    v_prefix := lower(v_item.value);
    v_count := 0;
    IF v_prefix ~ '^[0-9a-f-]{4,36}$' THEN
      SELECT count(*) INTO v_count FROM video v WHERE v.id::text LIKE v_prefix || '%';
    END IF;
    IF v_count <> 1 THEN
      INSERT INTO cancel_result VALUES (v_item.n, v_prefix, NULL, NULL,
        CASE WHEN v_count = 0 THEN 'NOT_FOUND' ELSE 'AMBIGUOUS' END, 0);
      CONTINUE;
    END IF;

    SELECT v.id, vv.id, vv.status INTO v_video_id, v_version_id, v_status
    FROM video v
    JOIN video_version vv ON vv.video_id = v.id AND vv.version = v.current_version
    WHERE v.id::text LIKE v_prefix || '%'
    FOR UPDATE OF vv;
    IF video_is_terminal(v_status) THEN
      INSERT INTO cancel_result VALUES (v_item.n, v_prefix, v_video_id, v_status,
        'ALREADY_' || v_status, 0);
      CONTINUE;
    END IF;

    UPDATE approval SET status = 'SUPERSEDED'
    WHERE video_version_id = v_version_id AND status = 'PENDING';
    v_jobs := 0;
    FOR v_job IN
      SELECT j.id FROM job j
      WHERE j.video_version_id = v_version_id AND j.status NOT IN ('SUCCEEDED', 'CANCELLED')
    LOOP
      IF job_cancel(v_job, c_actor) THEN
        v_jobs := v_jobs + 1;
      END IF;
    END LOOP;
    UPDATE video_version
    SET status = 'CANCELLED', auto_approve_by = NULL, auto_approve_at = NULL
    WHERE id = v_version_id;
    PERFORM audit(c_actor, 'video_cancelled', 'video_version', v_version_id::text,
                  jsonb_build_object('prefix', v_prefix, 'from_status', v_status,
                                     'jobs_cancelled', v_jobs));
    INSERT INTO cancel_result VALUES (v_item.n, v_prefix, v_video_id, v_status,
      CASE WHEN c_apply THEN 'CANCELLED' ELSE 'WOULD_CANCEL' END, v_jobs);
  END LOOP;
END;
$$;

SELECT prefix, video_id, from_status, result, jobs_cancelled FROM cancel_result ORDER BY n;

\if :apply
COMMIT;
\echo 'Cancelled.'
\else
ROLLBACK;
\echo 'Dry run: nothing changed. Run again with -v apply=1 to cancel.'
\endif
