-- migrate:up

-- Safety nets found by the 2026-11-02 review (D-086):
--   1. indexes for the filters the dispatcher, watchdog and approval functions run every 30 s;
--   2. at most one PENDING approval per version and type, enforced by the database and not only
--      by the version row lock the *_due() callers take;
--   3. final_due(): a malformed archive output stops only that video (NEEDS_DECISION with the
--      error in the audit log) instead of aborting the whole call for every video;
--   4. /retry is bounded: at most 5 manual retries per job, then RETRY_LIMIT.
-- video.worker_id gets an index but no foreign key: job_start() pins the video to the claiming
-- worker, and a worker whose first heartbeat has not landed yet must still be able to start jobs.
--
-- Rollback: drops the indexes and job.manual_retries (the count of manual retries is lost;
-- nothing else), and restores the previous final_due() and telegram_retry().

CREATE INDEX job_running_lease_idx ON job (lease_expires_at) WHERE status = 'RUNNING';
CREATE INDEX job_retry_due_idx ON job (next_attempt_at)
  WHERE status IN ('FAILED_RETRYABLE', 'BLOCKED');
CREATE INDEX job_queued_idx ON job (queued_at) WHERE status = 'QUEUED';
CREATE INDEX job_dependency_depends_on_idx ON job_dependency (depends_on_job_id);
CREATE INDEX video_version_status_idx ON video_version (status);
CREATE INDEX video_worker_idx ON video (worker_id);

-- Older duplicates (possible only from a manual fix before this constraint) are superseded first,
-- the same rule approval_request() applies, so the index can always be built.
UPDATE approval a SET status = 'SUPERSEDED'
WHERE a.status = 'PENDING'
  AND EXISTS (SELECT 1 FROM approval b
              WHERE b.video_version_id = a.video_version_id AND b.type = a.type
                AND b.status = 'PENDING' AND b.requested_at > a.requested_at);
CREATE UNIQUE INDEX approval_one_pending_idx ON approval (video_version_id, type)
  WHERE status = 'PENDING';

ALTER TABLE job ADD COLUMN manual_retries integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION final_due(p_remind_every interval DEFAULT interval '6 hours')
RETURNS TABLE (
  kind text,
  video_id uuid,
  version integer,
  video_version_id uuid,
  token text,
  expires_at timestamptz,
  round integer,
  title text,
  metadata jsonb,
  report jsonb
)
LANGUAGE plpgsql
AS $$
#variable_conflict use_column
DECLARE
  v_row record;
  v_token text;
  v_archive job;
  v_kind text;
  v_error text;
BEGIN
  PERFORM set_config('app.actor', 'approval-request', true);

  FOR v_row IN
    SELECT vv.id FROM video_version vv
    WHERE vv.status = 'RENDERING_FINAL'
      AND vv.brief->>'format' = 'episode'
      AND (final_render(vv.id)).status = 'SUCCEEDED'
      AND (final_step(vv.id, 'qa_final')).id IS NULL
    ORDER BY vv.created_at
    FOR UPDATE OF vv SKIP LOCKED
  LOOP
    PERFORM final_jobs_create(v_row.id);
  END LOOP;

  FOR v_row IN
    SELECT vv.id, vv.video_id, vv.version FROM video_version vv
    WHERE vv.status = 'RENDERING_FINAL'
      AND vv.brief->>'format' = 'episode'
      AND (final_step(vv.id, 'qa_final')).status = 'SUCCEEDED'
      AND metadata_payload_hash(vv.id) IS NOT NULL
    ORDER BY vv.created_at
    FOR UPDATE OF vv SKIP LOCKED
  LOOP
    UPDATE video_version SET status = 'AWAITING_METADATA_APPROVAL' WHERE id = v_row.id;
    v_token := approval_request(v_row.id, 'METADATA', metadata_payload_hash(v_row.id),
                                interval '72 hours');
    v_kind := CASE WHEN approval_auto_decide(
                     v_token, (final_step(v_row.id, 'qa_final')).output->'result'->>'level')
                   THEN 'AUTO' ELSE 'REQUEST' END;
    RETURN QUERY
    SELECT v_kind, v_row.video_id, v_row.version, v_row.id, a.token, a.expires_at,
           metadata_round(v_row.id), script_job_output(v_row.id)->'result'->>'title',
           (SELECT jsonb_build_object(
                     'job_id', m.id,
                     'token', m.output->'result'->>'media_token',
                     'title', m.output->'result'->'metadata'->>'title',
                     'description', m.output->'result'->'metadata'->>'description',
                     'tags', m.output->'result'->'metadata'->'tags',
                     'thumbnail_shot', m.output->'result'->'metadata'->>'thumbnail_shot',
                     'qa', (final_step(v_row.id, 'qa_final')).output->'result'->'checks',
                     'qa_level', (final_step(v_row.id, 'qa_final')).output->'result'->>'level')
            FROM (SELECT (final_step(v_row.id, 'metadata')).*) m),
           NULL::jsonb
    FROM approval a WHERE a.token = v_token;
  END LOOP;

  FOR v_row IN
    SELECT vv.id, vv.video_id, vv.version FROM video_version vv
    WHERE vv.status = 'ARCHIVING'
      AND (job_latest(vv.id, 'archive')).status = 'SUCCEEDED'
      AND NOT EXISTS (SELECT 1 FROM archive_record r WHERE r.video_version_id = vv.id)
    ORDER BY vv.created_at
    FOR UPDATE OF vv SKIP LOCKED
  LOOP
    v_archive := job_latest(v_row.id, 'archive');
    -- Each video is independent (CLAUDE.md §5): a malformed archive output stops this video
    -- for a decision and leaves the others in this call untouched. The archive job itself has
    -- SUCCEEDED, so /retry has nothing to re-run: this is a worker bug, fixed in code and then
    -- by the owner (the error is in audit_log, action archive_record_failed).
    BEGIN
      INSERT INTO archive_record (video_version_id, target, path, file_count, total_bytes,
                                  manifest_sha256, verified_at)
      VALUES (v_row.id, v_archive.output->'result'->>'target', v_archive.output->'result'->>'path',
              (v_archive.output->'result'->>'file_count')::integer,
              (v_archive.output->'result'->>'total_bytes')::bigint,
              v_archive.output->'result'->>'manifest_sha256',
              (v_archive.output->'result'->>'verified_at')::timestamptz);
    EXCEPTION WHEN OTHERS THEN
      v_error := SQLERRM;
      UPDATE video_version SET status = 'NEEDS_DECISION' WHERE id = v_row.id;
      PERFORM audit('approval-request', 'archive_record_failed', 'video_version', v_row.id::text,
                    jsonb_build_object('job_id', v_archive.id, 'error', left(v_error, 2000)));
      CONTINUE;
    END;
    UPDATE video_version SET status = 'ARCHIVE_VERIFIED' WHERE id = v_row.id;
    v_token := approval_request(v_row.id, 'CLEANUP', v_archive.output->'result'->>'manifest_sha256',
                                interval '7 days');
    RETURN QUERY
    SELECT 'DONE', v_row.video_id, v_row.version, v_row.id, a.token, a.expires_at,
           NULL::integer, script_job_output(v_row.id)->'result'->>'title',
           (final_step(v_row.id, 'metadata')).output->'result'->'metadata',
           video_cost_report(v_row.id) || jsonb_build_object(
             'target', v_archive.output->'result'->>'target',
             'path', v_archive.output->'result'->>'path',
             'file_count', (v_archive.output->'result'->>'file_count')::integer,
             'total_bytes', (v_archive.output->'result'->>'total_bytes')::bigint,
             'local_bytes', (v_archive.output->'result'->>'local_bytes')::bigint,
             'final', final_video(v_row.id))
    FROM approval a WHERE a.token = v_token;
  END LOOP;

  -- The Mac copy was deleted after the owner's approval: done.
  FOR v_row IN
    SELECT vv.id, vv.video_id, vv.version FROM video_version vv
    WHERE vv.status = 'ARCHIVE_VERIFIED'
      AND (job_latest(vv.id, 'cleanup')).status = 'SUCCEEDED'
    ORDER BY vv.created_at
    FOR UPDATE OF vv SKIP LOCKED
  LOOP
    UPDATE video_version SET status = 'COMPLETED' WHERE id = v_row.id;
    RETURN QUERY
    SELECT 'CLEANED', v_row.video_id, v_row.version, v_row.id, NULL::text, NULL::timestamptz,
           NULL::integer, script_job_output(v_row.id)->'result'->>'title', NULL::jsonb,
           (job_latest(v_row.id, 'cleanup')).output->'result';
  END LOOP;

  -- Kept: the owner chose Giữ lại, or the request expired unanswered. No message.
  UPDATE video_version vv SET status = 'COMPLETED'
  WHERE vv.status = 'ARCHIVE_VERIFIED'
    AND (job_latest(vv.id, 'cleanup')).id IS NULL
    AND NOT EXISTS (SELECT 1 FROM approval a
                    WHERE a.video_version_id = vv.id AND a.type = 'CLEANUP'
                      AND a.status IN ('PENDING', 'APPROVED')
                      AND a.expires_at > now());

  RETURN QUERY
  WITH reminded AS (
    UPDATE approval a
    SET last_reminded_at = now()
    WHERE a.type = 'METADATA'
      AND a.status = 'PENDING'
      AND a.expires_at > now()
      AND coalesce(a.last_reminded_at, a.requested_at) <= now() - p_remind_every
    RETURNING a.token, a.expires_at, a.video_version_id
  )
  SELECT 'REMINDER', vv.video_id, vv.version, vv.id, r.token, r.expires_at,
         metadata_round(vv.id), script_job_output(vv.id)->'result'->>'title', NULL::jsonb,
         NULL::jsonb
  FROM reminded r JOIN video_version vv ON vv.id = r.video_version_id;
END;
$$;

-- /retry (D-056) with a bound: a job takes at most 5 manual retries (job.manual_retries), after
-- which the answer is RETRY_LIMIT and the video stays at NEEDS_DECISION for a real fix.
CREATE OR REPLACE FUNCTION telegram_retry(p_user_id bigint, p_prefix text)
RETURNS TABLE (result text, video_id uuid, step text, attempt integer)
LANGUAGE plpgsql
AS $$
#variable_conflict use_column
DECLARE
  c_max_manual_retries constant integer := 5;
  v_prefix text := lower(btrim(coalesce(p_prefix, '')));
  v_count integer;
  v_video_id uuid;
  v_version_id uuid;
  v_status text;
  v_job job%ROWTYPE;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM approver WHERE telegram_user_id = p_user_id AND active) THEN
    RETURN QUERY SELECT 'NOT_APPROVER'::text, NULL::uuid, NULL::text, NULL::integer;
    RETURN;
  END IF;

  IF v_prefix ~ '^[0-9a-f-]{4,36}$' THEN
    SELECT count(*) INTO v_count FROM video v WHERE v.id::text LIKE v_prefix || '%';
  ELSE
    v_count := 0;
  END IF;
  IF v_count <> 1 THEN
    RETURN QUERY SELECT CASE WHEN v_count = 0 THEN 'NOT_FOUND' ELSE 'AMBIGUOUS' END,
      NULL::uuid, NULL::text, NULL::integer;
    RETURN;
  END IF;

  SELECT v.id, vv.id, vv.status INTO v_video_id, v_version_id, v_status
  FROM video v
  JOIN video_version vv ON vv.video_id = v.id AND vv.version = v.current_version
  WHERE v.id::text LIKE v_prefix || '%'
  FOR UPDATE OF vv;
  IF v_status <> 'NEEDS_DECISION' THEN
    RETURN QUERY SELECT 'NOT_STOPPED'::text, v_video_id, NULL::text, NULL::integer;
    RETURN;
  END IF;

  SELECT * INTO v_job FROM job j
  WHERE j.video_version_id = v_version_id AND j.status = 'FAILED_PERMANENT'
  ORDER BY j.updated_at DESC
  LIMIT 1
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'NO_FAILED_JOB'::text, v_video_id, NULL::text, NULL::integer;
    RETURN;
  END IF;
  IF v_job.manual_retries >= c_max_manual_retries THEN
    RETURN QUERY SELECT 'RETRY_LIMIT'::text, v_video_id, v_job.step, v_job.attempt_count;
    RETURN;
  END IF;

  PERFORM set_config('app.actor', 'telegram:' || p_user_id, true);
  UPDATE job
  SET status = 'READY', max_attempts = attempt_count + 1, next_attempt_at = NULL,
      manual_retries = manual_retries + 1
  WHERE id = v_job.id;
  PERFORM audit('telegram:' || p_user_id, 'manual_retry', 'job', v_job.id::text,
                jsonb_build_object('manual_retries', v_job.manual_retries + 1,
                                   'of', c_max_manual_retries));
  -- Resume only once no other job of the version still waits for a decision.
  UPDATE video_version vv SET status = vv.resume_status
  WHERE vv.id = v_version_id
    AND vv.resume_status IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM job j WHERE j.video_version_id = v_version_id AND j.status = 'FAILED_PERMANENT'
    );
  RETURN QUERY SELECT 'RETRIED'::text, v_video_id, v_job.step, v_job.attempt_count + 1;
END;
$$;

-- migrate:down

CREATE OR REPLACE FUNCTION telegram_retry(p_user_id bigint, p_prefix text)
RETURNS TABLE (result text, video_id uuid, step text, attempt integer)
LANGUAGE plpgsql
AS $$
#variable_conflict use_column
DECLARE
  v_prefix text := lower(btrim(coalesce(p_prefix, '')));
  v_count integer;
  v_video_id uuid;
  v_version_id uuid;
  v_status text;
  v_job job%ROWTYPE;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM approver WHERE telegram_user_id = p_user_id AND active) THEN
    RETURN QUERY SELECT 'NOT_APPROVER'::text, NULL::uuid, NULL::text, NULL::integer;
    RETURN;
  END IF;

  IF v_prefix ~ '^[0-9a-f-]{4,36}$' THEN
    SELECT count(*) INTO v_count FROM video v WHERE v.id::text LIKE v_prefix || '%';
  ELSE
    v_count := 0;
  END IF;
  IF v_count <> 1 THEN
    RETURN QUERY SELECT CASE WHEN v_count = 0 THEN 'NOT_FOUND' ELSE 'AMBIGUOUS' END,
      NULL::uuid, NULL::text, NULL::integer;
    RETURN;
  END IF;

  SELECT v.id, vv.id, vv.status INTO v_video_id, v_version_id, v_status
  FROM video v
  JOIN video_version vv ON vv.video_id = v.id AND vv.version = v.current_version
  WHERE v.id::text LIKE v_prefix || '%'
  FOR UPDATE OF vv;
  IF v_status <> 'NEEDS_DECISION' THEN
    RETURN QUERY SELECT 'NOT_STOPPED'::text, v_video_id, NULL::text, NULL::integer;
    RETURN;
  END IF;

  SELECT * INTO v_job FROM job j
  WHERE j.video_version_id = v_version_id AND j.status = 'FAILED_PERMANENT'
  ORDER BY j.updated_at DESC
  LIMIT 1
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'NO_FAILED_JOB'::text, v_video_id, NULL::text, NULL::integer;
    RETURN;
  END IF;

  PERFORM set_config('app.actor', 'telegram:' || p_user_id, true);
  UPDATE job SET status = 'READY', max_attempts = attempt_count + 1, next_attempt_at = NULL
  WHERE id = v_job.id;
  -- Resume only once no other job of the version still waits for a decision.
  UPDATE video_version vv SET status = vv.resume_status
  WHERE vv.id = v_version_id
    AND vv.resume_status IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM job j WHERE j.video_version_id = v_version_id AND j.status = 'FAILED_PERMANENT'
    );
  RETURN QUERY SELECT 'RETRIED'::text, v_video_id, v_job.step, v_job.attempt_count + 1;
END;
$$;

CREATE OR REPLACE FUNCTION final_due(p_remind_every interval DEFAULT interval '6 hours')
RETURNS TABLE (
  kind text,
  video_id uuid,
  version integer,
  video_version_id uuid,
  token text,
  expires_at timestamptz,
  round integer,
  title text,
  metadata jsonb,
  report jsonb
)
LANGUAGE plpgsql
AS $$
#variable_conflict use_column
DECLARE
  v_row record;
  v_token text;
  v_archive job;
  v_kind text;
BEGIN
  PERFORM set_config('app.actor', 'approval-request', true);

  FOR v_row IN
    SELECT vv.id FROM video_version vv
    WHERE vv.status = 'RENDERING_FINAL'
      AND vv.brief->>'format' = 'episode'
      AND (final_render(vv.id)).status = 'SUCCEEDED'
      AND (final_step(vv.id, 'qa_final')).id IS NULL
    ORDER BY vv.created_at
    FOR UPDATE OF vv SKIP LOCKED
  LOOP
    PERFORM final_jobs_create(v_row.id);
  END LOOP;

  FOR v_row IN
    SELECT vv.id, vv.video_id, vv.version FROM video_version vv
    WHERE vv.status = 'RENDERING_FINAL'
      AND vv.brief->>'format' = 'episode'
      AND (final_step(vv.id, 'qa_final')).status = 'SUCCEEDED'
      AND metadata_payload_hash(vv.id) IS NOT NULL
    ORDER BY vv.created_at
    FOR UPDATE OF vv SKIP LOCKED
  LOOP
    UPDATE video_version SET status = 'AWAITING_METADATA_APPROVAL' WHERE id = v_row.id;
    v_token := approval_request(v_row.id, 'METADATA', metadata_payload_hash(v_row.id),
                                interval '72 hours');
    v_kind := CASE WHEN approval_auto_decide(
                     v_token, (final_step(v_row.id, 'qa_final')).output->'result'->>'level')
                   THEN 'AUTO' ELSE 'REQUEST' END;
    RETURN QUERY
    SELECT v_kind, v_row.video_id, v_row.version, v_row.id, a.token, a.expires_at,
           metadata_round(v_row.id), script_job_output(v_row.id)->'result'->>'title',
           (SELECT jsonb_build_object(
                     'job_id', m.id,
                     'token', m.output->'result'->>'media_token',
                     'title', m.output->'result'->'metadata'->>'title',
                     'description', m.output->'result'->'metadata'->>'description',
                     'tags', m.output->'result'->'metadata'->'tags',
                     'thumbnail_shot', m.output->'result'->'metadata'->>'thumbnail_shot',
                     'qa', (final_step(v_row.id, 'qa_final')).output->'result'->'checks',
                     'qa_level', (final_step(v_row.id, 'qa_final')).output->'result'->>'level')
            FROM (SELECT (final_step(v_row.id, 'metadata')).*) m),
           NULL::jsonb
    FROM approval a WHERE a.token = v_token;
  END LOOP;

  FOR v_row IN
    SELECT vv.id, vv.video_id, vv.version FROM video_version vv
    WHERE vv.status = 'ARCHIVING'
      AND (job_latest(vv.id, 'archive')).status = 'SUCCEEDED'
      AND NOT EXISTS (SELECT 1 FROM archive_record r WHERE r.video_version_id = vv.id)
    ORDER BY vv.created_at
    FOR UPDATE OF vv SKIP LOCKED
  LOOP
    v_archive := job_latest(v_row.id, 'archive');
    INSERT INTO archive_record (video_version_id, target, path, file_count, total_bytes,
                                manifest_sha256, verified_at)
    VALUES (v_row.id, v_archive.output->'result'->>'target', v_archive.output->'result'->>'path',
            (v_archive.output->'result'->>'file_count')::integer,
            (v_archive.output->'result'->>'total_bytes')::bigint,
            v_archive.output->'result'->>'manifest_sha256',
            (v_archive.output->'result'->>'verified_at')::timestamptz);
    UPDATE video_version SET status = 'ARCHIVE_VERIFIED' WHERE id = v_row.id;
    v_token := approval_request(v_row.id, 'CLEANUP', v_archive.output->'result'->>'manifest_sha256',
                                interval '7 days');
    RETURN QUERY
    SELECT 'DONE', v_row.video_id, v_row.version, v_row.id, a.token, a.expires_at,
           NULL::integer, script_job_output(v_row.id)->'result'->>'title',
           (final_step(v_row.id, 'metadata')).output->'result'->'metadata',
           video_cost_report(v_row.id) || jsonb_build_object(
             'target', v_archive.output->'result'->>'target',
             'path', v_archive.output->'result'->>'path',
             'file_count', (v_archive.output->'result'->>'file_count')::integer,
             'total_bytes', (v_archive.output->'result'->>'total_bytes')::bigint,
             'local_bytes', (v_archive.output->'result'->>'local_bytes')::bigint,
             'final', final_video(v_row.id))
    FROM approval a WHERE a.token = v_token;
  END LOOP;

  -- The Mac copy was deleted after the owner's approval: done.
  FOR v_row IN
    SELECT vv.id, vv.video_id, vv.version FROM video_version vv
    WHERE vv.status = 'ARCHIVE_VERIFIED'
      AND (job_latest(vv.id, 'cleanup')).status = 'SUCCEEDED'
    ORDER BY vv.created_at
    FOR UPDATE OF vv SKIP LOCKED
  LOOP
    UPDATE video_version SET status = 'COMPLETED' WHERE id = v_row.id;
    RETURN QUERY
    SELECT 'CLEANED', v_row.video_id, v_row.version, v_row.id, NULL::text, NULL::timestamptz,
           NULL::integer, script_job_output(v_row.id)->'result'->>'title', NULL::jsonb,
           (job_latest(v_row.id, 'cleanup')).output->'result';
  END LOOP;

  -- Kept: the owner chose Giữ lại, or the request expired unanswered. No message.
  UPDATE video_version vv SET status = 'COMPLETED'
  WHERE vv.status = 'ARCHIVE_VERIFIED'
    AND (job_latest(vv.id, 'cleanup')).id IS NULL
    AND NOT EXISTS (SELECT 1 FROM approval a
                    WHERE a.video_version_id = vv.id AND a.type = 'CLEANUP'
                      AND a.status IN ('PENDING', 'APPROVED')
                      AND a.expires_at > now());

  RETURN QUERY
  WITH reminded AS (
    UPDATE approval a
    SET last_reminded_at = now()
    WHERE a.type = 'METADATA'
      AND a.status = 'PENDING'
      AND a.expires_at > now()
      AND coalesce(a.last_reminded_at, a.requested_at) <= now() - p_remind_every
    RETURNING a.token, a.expires_at, a.video_version_id
  )
  SELECT 'REMINDER', vv.video_id, vv.version, vv.id, r.token, r.expires_at,
         metadata_round(vv.id), script_job_output(vv.id)->'result'->>'title', NULL::jsonb,
         NULL::jsonb
  FROM reminded r JOIN video_version vv ON vv.id = r.video_version_id;
END;
$$;

ALTER TABLE job DROP COLUMN manual_retries;
DROP INDEX approval_one_pending_idx;
DROP INDEX video_worker_idx;
DROP INDEX video_version_status_idx;
DROP INDEX job_dependency_depends_on_idx;
DROP INDEX job_queued_idx;
DROP INDEX job_retry_due_idx;
DROP INDEX job_running_lease_idx;
