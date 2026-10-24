-- Phase 1 smoke test (ops/README.md §9): one simulate job, no paid calls. Run as the owner:
--   psql "$OWNER_URL" -v ON_ERROR_STOP=1 -f ops/postgres/smoke-test.sql
-- Each run creates a new project/batch/video, so it does not exercise the idempotency key.
WITH p AS (INSERT INTO project (name) VALUES ('phase-1-smoke') RETURNING id),
     b AS (INSERT INTO batch (project_id) SELECT id FROM p RETURNING id),
     v AS (SELECT * FROM video_create((SELECT id FROM b), 1, '9:16', '{"smoke":true}'))
SELECT job_create((SELECT version_id FROM v), 'simulate', 'q:light',
                  '{"durationMs":5000}'::jsonb, 'smoke-1');
