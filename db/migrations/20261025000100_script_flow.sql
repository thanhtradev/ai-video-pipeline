-- migrate:up

-- Phase 2a: brief intake -> script job -> A1 script approval over Telegram, plus the
-- provider-blocked path (Claude Code usage limit) from docs/job-lifecycle.md §6.
-- n8n entry points: video_submit (WF-01), script_approvals_due (WF-05),
-- approval_telegram_decide (WF-06). Worker entry point: job_block.

-- One form submission creates one batch; the id makes a double submit harmless.
ALTER TABLE batch ADD COLUMN submission_id text UNIQUE;

-- A worker that hits a provider usage limit hands the job back without failing it.
INSERT INTO job_status_transition (from_status, to_status) VALUES ('RUNNING', 'BLOCKED');

-- Output of the newest successful script job of a version (worker checkpoint format).
CREATE FUNCTION script_job_output(p_version_id uuid) RETURNS jsonb
LANGUAGE sql STABLE
AS $$
  SELECT output FROM job
  WHERE video_version_id = p_version_id AND step = 'script' AND status = 'SUCCEEDED'
  ORDER BY updated_at DESC
  LIMIT 1;
$$;

-- The approved content is script.json: its SHA-256 binds an A1 approval to exactly that script.
CREATE FUNCTION script_payload_hash(p_version_id uuid) RETURNS text
LANGUAGE sql STABLE
AS $$
  SELECT o->>'sha256'
  FROM jsonb_array_elements(coalesce(script_job_output(p_version_id)->'outputs', '[]'::jsonb)) o
  WHERE o->>'path' = 'script.json';
$$;

-- Creates (or returns) the script job of a version and marks the version SCRIPTING.
CREATE FUNCTION script_job_create(p_version_id uuid) RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_brief jsonb;
  v_status text;
  v_job_id uuid;
BEGIN
  SELECT brief, status INTO v_brief, v_status FROM video_version WHERE id = p_version_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'video_version % not found', p_version_id;
  END IF;

  v_job_id := job_create(
    p_version_id, 'script', 'q:light',
    jsonb_build_object('brief', v_brief, 'language', 'vi'),
    md5(v_brief::text)
  );

  IF v_status = 'BRIEF_SUBMITTED' THEN
    UPDATE video_version SET status = 'SCRIPTING' WHERE id = p_version_id;
  END IF;
  RETURN v_job_id;
END;
$$;

-- Validates a brief from the intake form and returns the normalized copy that is stored.
CREATE FUNCTION brief_normalize(p_brief jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  v_topic text := btrim(p_brief->>'topic');
  v_duration numeric;
  v_field text;
BEGIN
  IF v_topic IS NULL OR length(v_topic) < 3 OR length(v_topic) > 500 THEN
    RAISE EXCEPTION 'invalid brief: topic must be 3-500 characters';
  END IF;

  IF jsonb_typeof(p_brief->'duration_seconds') <> 'number' THEN
    RAISE EXCEPTION 'invalid brief: duration_seconds must be a number';
  END IF;
  v_duration := (p_brief->>'duration_seconds')::numeric;
  -- Shorts must stay under 60 s (D-025).
  IF v_duration <> trunc(v_duration) OR v_duration < 15 OR v_duration > 59 THEN
    RAISE EXCEPTION 'invalid brief: duration_seconds must be an integer from 15 to 59';
  END IF;

  FOREACH v_field IN ARRAY ARRAY['audience', 'tone', 'notes'] LOOP
    IF p_brief ? v_field AND (jsonb_typeof(p_brief->v_field) <> 'string'
                              OR length(p_brief->>v_field) > 500) THEN
      RAISE EXCEPTION 'invalid brief: % must be text up to 500 characters', v_field;
    END IF;
  END LOOP;

  RETURN jsonb_strip_nulls(jsonb_build_object(
    'topic', v_topic,
    'duration_seconds', v_duration::integer,
    'audience', nullif(btrim(p_brief->>'audience'), ''),
    'tone', nullif(btrim(p_brief->>'tone'), ''),
    'notes', nullif(btrim(p_brief->>'notes'), '')
  ));
END;
$$;

-- WF-01 Intake: one 9:16 Short per form submission (D-025), scripted next.
CREATE FUNCTION video_submit(p_submission_id text, p_brief jsonb)
RETURNS TABLE (video_id uuid, version_id uuid, job_id uuid, created boolean)
LANGUAGE plpgsql
AS $$
#variable_conflict use_column
DECLARE
  v_brief jsonb := brief_normalize(p_brief);
  v_project_id uuid;
  v_batch_id uuid;
  v_video_id uuid;
  v_version_id uuid;
BEGIN
  IF p_submission_id IS NULL OR length(p_submission_id) = 0 THEN
    RAISE EXCEPTION 'submission id is required';
  END IF;
  PERFORM set_config('app.actor', 'intake', true);

  SELECT b.id INTO v_batch_id FROM batch b WHERE b.submission_id = p_submission_id;
  IF FOUND THEN
    RETURN QUERY
    SELECT v.id, vv.id, j.id, false
    FROM video v
    JOIN video_version vv ON vv.video_id = v.id AND vv.version = 1
    JOIN job j ON j.video_version_id = vv.id AND j.step = 'script'
    WHERE v.batch_id = v_batch_id
    ORDER BY j.created_at
    LIMIT 1;
    RETURN;
  END IF;

  SELECT p.id INTO v_project_id FROM project p WHERE p.name = 'faceless-mvp' ORDER BY p.created_at LIMIT 1;
  IF NOT FOUND THEN
    INSERT INTO project (name) VALUES ('faceless-mvp') RETURNING id INTO v_project_id;
  END IF;

  INSERT INTO batch (project_id, submission_id) VALUES (v_project_id, p_submission_id)
  RETURNING id INTO v_batch_id;
  SELECT c.video_id, c.version_id INTO v_video_id, v_version_id
  FROM video_create(v_batch_id, 1, '9:16', v_brief) c;

  RETURN QUERY SELECT v_video_id, v_version_id, script_job_create(v_version_id), true;
END;
$$;

-- WF-05: A1 requests for versions whose script just succeeded, and reminders for pending ones.
-- Each row is returned once: requests move the version on, reminders stamp last_reminded_at.
CREATE FUNCTION script_approvals_due(p_remind_every interval DEFAULT interval '6 hours')
RETURNS TABLE (
  kind text,
  video_id uuid,
  version integer,
  video_version_id uuid,
  token text,
  expires_at timestamptz,
  script jsonb
)
LANGUAGE plpgsql
AS $$
#variable_conflict use_column
DECLARE
  v_row record;
  v_token text;
BEGIN
  PERFORM set_config('app.actor', 'approval-request', true);

  FOR v_row IN
    SELECT vv.id, vv.video_id, vv.version
    FROM video_version vv
    WHERE vv.status = 'SCRIPTING' AND script_payload_hash(vv.id) IS NOT NULL
    ORDER BY vv.created_at
    FOR UPDATE OF vv SKIP LOCKED
  LOOP
    UPDATE video_version SET status = 'AWAITING_SCRIPT_APPROVAL' WHERE id = v_row.id;
    v_token := approval_request(v_row.id, 'SCRIPT', script_payload_hash(v_row.id));
    RETURN QUERY
    SELECT 'REQUEST', v_row.video_id, v_row.version, v_row.id, a.token, a.expires_at,
           script_job_output(v_row.id)->'result'
    FROM approval a WHERE a.token = v_token;
  END LOOP;

  RETURN QUERY
  WITH reminded AS (
    UPDATE approval a
    SET last_reminded_at = now()
    WHERE a.type = 'SCRIPT'
      AND a.status = 'PENDING'
      AND a.expires_at > now()
      AND coalesce(a.last_reminded_at, a.requested_at) <= now() - p_remind_every
    RETURNING a.token, a.expires_at, a.video_version_id
  )
  SELECT 'REMINDER', vv.video_id, vv.version, vv.id, r.token, r.expires_at,
         script_job_output(vv.id)->'result'
  FROM reminded r JOIN video_version vv ON vv.id = r.video_version_id;
END;
$$;

-- WF-06: a Telegram button press. Actions: APPROVE, REJECT (cancel the video version),
-- REGENERATE (new version with the same brief, new script job). The payload hash is taken from
-- the current script, so content changed after the request is refused (HASH_MISMATCH).
-- video_id/version are returned only to approvers, so strangers learn nothing.
CREATE FUNCTION approval_telegram_decide(p_token text, p_user_id bigint, p_action text)
RETURNS TABLE (result text, video_id uuid, version integer)
LANGUAGE plpgsql
AS $$
#variable_conflict use_column
DECLARE
  v_approval approval%ROWTYPE;
  v_video_id uuid;
  v_brief jsonb;
  v_result text;
  v_new_version_id uuid;
BEGIN
  IF p_action NOT IN ('APPROVE', 'REJECT', 'REGENERATE') THEN
    RAISE EXCEPTION 'invalid action %', p_action;
  END IF;

  SELECT * INTO v_approval FROM approval WHERE token = p_token;

  v_result := approval_decide(
    p_token,
    p_user_id,
    CASE p_action WHEN 'APPROVE' THEN 'APPROVED' ELSE 'REJECTED' END,
    coalesce(CASE v_approval.type WHEN 'SCRIPT' THEN script_payload_hash(v_approval.video_version_id) END, '')
  );
  IF v_result IN ('NOT_ALLOWED', 'NOT_FOUND') THEN
    RETURN QUERY SELECT v_result, NULL::uuid, NULL::integer;
    RETURN;
  END IF;

  SELECT vv.video_id, vv.brief INTO v_video_id, v_brief
  FROM video_version vv WHERE vv.id = v_approval.video_version_id;

  IF v_result = 'OK' AND p_action = 'REJECT' THEN
    UPDATE video_version SET status = 'CANCELLED' WHERE id = v_approval.video_version_id;
  ELSIF v_result = 'OK' AND p_action = 'REGENERATE' THEN
    v_new_version_id := video_new_version(v_video_id, v_brief);
    PERFORM script_job_create(v_new_version_id);
  END IF;

  RETURN QUERY
  SELECT v_result, v.id, v.current_version FROM video v WHERE v.id = v_video_id;
END;
$$;

-- Worker: the provider refused for quota/usage reasons (e.g. Claude Code usage limit). The job
-- waits as BLOCKED until p_retry_after_seconds pass (job_promote resumes it), the video shows
-- BLOCKED_PROVIDER, and the job gets one extra attempt so the block does not use up its retries.
-- Never switches provider (CLAUDE.md §5). Returns BLOCKED, or LOST when not running for this worker.
CREATE FUNCTION job_block(p_job_id uuid, p_worker_id text, p_reason text, p_retry_after_seconds integer)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_version_id uuid;
  v_version_status text;
BEGIN
  PERFORM assert_worker_identity(p_worker_id);
  PERFORM set_config('app.actor', p_worker_id, true);

  UPDATE job
  SET status = 'BLOCKED',
      last_error = left(p_reason, 2000),
      lease_expires_at = NULL,
      next_attempt_at = now() + make_interval(secs => least(greatest(p_retry_after_seconds, 60), 86400)),
      max_attempts = max_attempts + 1
  WHERE id = p_job_id AND status = 'RUNNING' AND claimed_by = p_worker_id
  RETURNING video_version_id INTO v_version_id;
  IF NOT FOUND THEN
    RETURN 'LOST';
  END IF;

  UPDATE job_attempt
  SET status = 'ABANDONED', error = left('blocked: ' || p_reason, 2000), finished_at = now()
  WHERE job_id = p_job_id AND status = 'RUNNING';

  SELECT status INTO v_version_status FROM video_version WHERE id = v_version_id FOR UPDATE;
  IF NOT video_is_terminal(v_version_status) AND NOT video_is_blocked(v_version_status) THEN
    UPDATE video_version SET status = 'BLOCKED_PROVIDER' WHERE id = v_version_id;
  END IF;
  RETURN 'BLOCKED';
END;
$$;

-- Same as 20261024000300 plus: BLOCKED jobs whose wait elapsed become READY, and their video
-- leaves BLOCKED_PROVIDER once no blocked job remains.
CREATE OR REPLACE FUNCTION job_promote() RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_ready integer;
  v_retry integer;
  v_unblocked integer;
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

  UPDATE job j SET status = 'READY', next_attempt_at = NULL
  WHERE j.status = 'BLOCKED' AND j.next_attempt_at <= now();
  GET DIAGNOSTICS v_unblocked = ROW_COUNT;

  UPDATE video_version vv SET status = vv.resume_status
  WHERE vv.status = 'BLOCKED_PROVIDER'
    AND vv.resume_status IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM job j WHERE j.video_version_id = vv.id AND j.status = 'BLOCKED');

  RETURN v_ready + v_retry + v_unblocked;
END;
$$;

-- Same as 20261024000500 plus blocked_videos and needs_decision (versions stopped by a permanent
-- job failure, with the failed step and error), which WF-08 alerts on when the set changes.
CREATE OR REPLACE FUNCTION watchdog_run(
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
  v_blocked jsonb;
  v_needs_decision jsonb;
BEGIN
  v_expired := job_expire_leases();
  v_requeued := job_requeue_stale(p_stale_after);
  v_approvals := approval_expire();
  SELECT coalesce(jsonb_agg(worker_id ORDER BY worker_id), '[]'::jsonb) INTO v_offline
  FROM worker_offline(p_worker_offline_after);
  SELECT coalesce(jsonb_agg(DISTINCT video_id), '[]'::jsonb) INTO v_blocked
  FROM video_version WHERE status = 'BLOCKED_PROVIDER';
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'video_id', vv.video_id, 'version', vv.version, 'step', f.step, 'error', f.last_error
         ) ORDER BY vv.updated_at), '[]'::jsonb)
  INTO v_needs_decision
  FROM video_version vv
  LEFT JOIN LATERAL (
    SELECT j.step, left(j.last_error, 200) AS last_error
    FROM job j
    WHERE j.video_version_id = vv.id AND j.status = 'FAILED_PERMANENT'
    ORDER BY j.updated_at DESC
    LIMIT 1
  ) f ON true
  WHERE vv.status = 'NEEDS_DECISION';

  RETURN jsonb_build_object(
    'expired_leases', v_expired,
    'requeued', v_requeued,
    'approvals_expired', v_approvals,
    'offline_workers', v_offline,
    'blocked_videos', v_blocked,
    'needs_decision', v_needs_decision
  );
END;
$$;

-- migrate:down

CREATE OR REPLACE FUNCTION watchdog_run(
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

CREATE OR REPLACE FUNCTION job_promote() RETURNS integer
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

DROP FUNCTION job_block(uuid, text, text, integer);
DROP FUNCTION approval_telegram_decide(text, bigint, text);
DROP FUNCTION script_approvals_due(interval);
DROP FUNCTION video_submit(text, jsonb);
DROP FUNCTION brief_normalize(jsonb);
DROP FUNCTION script_job_create(uuid);
DROP FUNCTION script_payload_hash(uuid);
DROP FUNCTION script_job_output(uuid);
DELETE FROM job_status_transition WHERE from_status = 'RUNNING' AND to_status = 'BLOCKED';
ALTER TABLE batch DROP COLUMN submission_id;
