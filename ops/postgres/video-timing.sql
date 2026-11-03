-- Where the time of a video goes: worker run time per step and human wait per approval.
-- Read-only. Run by the owner, never by an agent:
--   psql "$DATABASE_URL" -v video=<video uuid> -f ops/postgres/video-timing.sql   -- one video
--   psql "$DATABASE_URL" -f ops/postgres/video-timing.sql                         -- last 7 days
-- Columns: wait = job created → attempt started (dispatch, backoff, a busy worker);
-- run = attempt started → finished (the worker's own time).

\if :{?video}

\echo '== Steps (one row per attempt)'
SELECT j.step,
       a.attempt_no AS attempt,
       a.worker_id AS worker,
       a.status,
       to_char(a.started_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'MM-DD HH24:MI') AS started_utc7,
       date_trunc('second', a.started_at - j.created_at) AS wait,
       date_trunc('second', a.finished_at - a.started_at) AS run
FROM job j
JOIN video_version vv ON vv.id = j.video_version_id
JOIN job_attempt a ON a.job_id = j.id
WHERE vv.video_id = :'video'
ORDER BY a.started_at;

\echo '== Approvals (human wait)'
SELECT ap.type,
       ap.status,
       to_char(ap.requested_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'MM-DD HH24:MI') AS requested_utc7,
       date_trunc('second', coalesce(ap.decided_at, now()) - ap.requested_at) AS wait
FROM approval ap
JOIN video_version vv ON vv.id = ap.video_version_id
WHERE vv.video_id = :'video'
ORDER BY ap.requested_at;

\else

\echo '== Steps, last 7 days (succeeded attempts)'
SELECT j.step,
       count(*) AS runs,
       date_trunc('second', percentile_cont(0.5) WITHIN GROUP (
         ORDER BY a.finished_at - a.started_at)) AS median_run,
       date_trunc('second', max(a.finished_at - a.started_at)) AS max_run,
       date_trunc('second', percentile_cont(0.5) WITHIN GROUP (
         ORDER BY a.started_at - j.created_at)) AS median_wait
FROM job j
JOIN job_attempt a ON a.job_id = j.id
WHERE a.status = 'SUCCEEDED' AND a.started_at > now() - interval '7 days'
GROUP BY j.step
ORDER BY median_run DESC;

\echo '== Approvals, last 7 days (decided)'
SELECT ap.type,
       count(*) AS decided,
       date_trunc('second', percentile_cont(0.5) WITHIN GROUP (
         ORDER BY ap.decided_at - ap.requested_at)) AS median_wait,
       date_trunc('second', max(ap.decided_at - ap.requested_at)) AS max_wait
FROM approval ap
WHERE ap.decided_at IS NOT NULL AND ap.requested_at > now() - interval '7 days'
GROUP BY ap.type
ORDER BY median_wait DESC;

\endif
