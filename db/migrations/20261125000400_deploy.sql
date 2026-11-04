-- migrate:up

-- /deploy (D-100): the owner rolls origin/main out to the workers and n8n from Telegram. Agents never
-- deploy (D-011); this runs only after the owner presses Confirm.
--
-- PREFLIGHT: the deployer that can reach n8n reads origin/main and reports the commit and the
-- migrations on it. Any migration this database lacks refuses the deploy: migrations stay a manual
-- step with a backup. AWAITING_CONFIRM: a Confirm button (command_confirm, D-098) bound to that
-- commit. RUNNING: one target at a time, workers online at Confirm in id order, then n8n; offline
-- workers are skipped and reported. A worker drains first: job_start() gives it no new job, and it
-- updates once nothing runs on it and no video move involves it. A failure or timeout ends the
-- rollout, cancels the targets left, and ends draining. Nothing retries or rolls back by itself.
-- WF-08 calls deploy_notices_due() every minute for timeouts and messages, so the final message
-- survives the n8n restart of the rollout.
--
-- Rollback: restores job_start and telegram_confirm, drops the tables (the history of deploys is
-- lost; audit_log keeps confirmations) and functions. WF-06 and WF-08 must be rolled back first,
-- and every deployer stopped.

CREATE TABLE deploy_request (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by bigint NOT NULL,
  status text NOT NULL DEFAULT 'PREFLIGHT' CHECK (status IN (
    'PREFLIGHT', 'AWAITING_CONFIRM', 'REFUSED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED'
  )),
  sha text CHECK (sha ~ '^[0-9a-f]{40}$'),
  commits text,
  missing_migrations text[],
  detail text,
  claimed_by text,
  confirm_token text,
  notified_status text,
  created_at timestamptz NOT NULL DEFAULT now(),
  state_since timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

CREATE UNIQUE INDEX deploy_request_one_open ON deploy_request ((true))
  WHERE status IN ('PREFLIGHT', 'AWAITING_CONFIRM', 'RUNNING');

CREATE TABLE deploy_target (
  request_id uuid NOT NULL REFERENCES deploy_request (id),
  target text NOT NULL,
  position integer NOT NULL,
  status text NOT NULL DEFAULT 'WAITING' CHECK (status IN (
    'WAITING', 'DRAINING', 'UPDATING', 'DONE', 'FAILED', 'SKIPPED', 'CANCELLED'
  )),
  claimed_by text,
  detail text,
  state_since timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (request_id, target)
);

ALTER TABLE command_confirm DROP CONSTRAINT command_confirm_action_check;
ALTER TABLE command_confirm ADD CONSTRAINT command_confirm_action_check
  CHECK (action IN ('CANCEL', 'AUTO_ALL', 'DEPLOY'));

-- True while the worker's turn in a rollout has come and its update has not finished.
CREATE FUNCTION deploy_worker_draining(p_worker_id text) RETURNS boolean
LANGUAGE sql STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM deploy_target t
    JOIN deploy_request r ON r.id = t.request_id
    WHERE t.target = p_worker_id AND t.status IN ('DRAINING', 'UPDATING') AND r.status = 'RUNNING'
  );
$$;

CREATE OR REPLACE FUNCTION job_start(p_job_id uuid, p_worker_id text, p_lease_seconds integer)
RETURNS TABLE (
  attempt_no integer,
  step text,
  input jsonb,
  video_version_id uuid,
  video_id uuid,
  version integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_attempt integer;
  v_step text;
  v_input jsonb;
  v_version uuid;
  v_video uuid;
  v_pinned text;
BEGIN
  PERFORM assert_worker_identity(p_worker_id);
  PERFORM set_config('app.actor', p_worker_id, true);

  -- A worker waiting to update takes no new job (D-100). The job goes back unspent, as a pin
  -- mismatch does below: another worker can take it, or this one after its update.
  IF deploy_worker_draining(p_worker_id) THEN
    UPDATE job SET status = 'READY', queued_at = NULL WHERE id = p_job_id AND status = 'QUEUED';
    RETURN;
  END IF;

  SELECT v.id, v.worker_id INTO v_video, v_pinned
  FROM job j
  JOIN video_version vv ON vv.id = j.video_version_id
  JOIN video v ON v.id = vv.video_id
  WHERE j.id = p_job_id
  FOR UPDATE OF v;

  IF v_pinned IS NOT NULL AND v_pinned <> p_worker_id THEN
    UPDATE job SET status = 'READY', queued_at = NULL WHERE id = p_job_id AND status = 'QUEUED';
    RETURN;
  END IF;

  UPDATE job
  SET status = 'RUNNING',
      claimed_by = p_worker_id,
      lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      attempt_count = attempt_count + 1,
      last_error = NULL
  WHERE id = p_job_id AND status = 'QUEUED'
  RETURNING attempt_count, step, input, video_version_id INTO v_attempt, v_step, v_input, v_version;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  UPDATE video SET worker_id = p_worker_id WHERE id = v_video AND worker_id IS NULL;
  INSERT INTO job_attempt (job_id, attempt_no, worker_id) VALUES (p_job_id, v_attempt, p_worker_id);

  RETURN QUERY
  SELECT v_attempt, v_step, v_input, v_version, vv.video_id, vv.version
  FROM video_version vv WHERE vv.id = v_version;
END;
$$;

-- Ends a request: open targets become CANCELLED, which also ends draining.
CREATE FUNCTION deploy_finish(p_request_id uuid, p_status text, p_detail text) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE deploy_target SET status = 'CANCELLED', state_since = now()
  WHERE request_id = p_request_id AND status IN ('WAITING', 'DRAINING', 'UPDATING');
  UPDATE deploy_request
  SET status = p_status, detail = coalesce(p_detail, detail), state_since = now(),
      finished_at = now()
  WHERE id = p_request_id;
END;
$$;

-- Builds the rollout at Confirm.
CREATE FUNCTION deploy_start(p_request_id uuid) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  c_online constant interval := interval '2 minutes';
  v_position integer := 0;
  v_worker text;
BEGIN
  FOR v_worker IN
    SELECT w.id FROM worker w WHERE w.last_seen_at > now() - c_online ORDER BY w.id
  LOOP
    v_position := v_position + 1;
    INSERT INTO deploy_target (request_id, target, position) VALUES (p_request_id, v_worker, v_position);
  END LOOP;
  v_position := v_position + 1;
  INSERT INTO deploy_target (request_id, target, position) VALUES (p_request_id, 'n8n', v_position);
  FOR v_worker IN
    SELECT w.id FROM worker w
    WHERE w.last_seen_at IS NULL OR w.last_seen_at <= now() - c_online
    ORDER BY w.id
  LOOP
    v_position := v_position + 1;
    INSERT INTO deploy_target (request_id, target, position, status, detail)
    VALUES (p_request_id, v_worker, v_position, 'SKIPPED', 'offline');
  END LOOP;
  UPDATE deploy_request SET status = 'RUNNING', state_since = now() WHERE id = p_request_id;
END;
$$;

-- /deploy from Telegram (WF-06). Results: NOT_OWNER, OPEN (one is already open), OK.
CREATE FUNCTION telegram_deploy(p_user_id bigint)
RETURNS TABLE (result text, status text, sha text, targets jsonb)
LANGUAGE plpgsql
AS $$
#variable_conflict use_column
DECLARE
  v_open deploy_request%ROWTYPE;
BEGIN
  IF NOT is_owner(p_user_id) THEN
    RETURN QUERY SELECT 'NOT_OWNER'::text, NULL::text, NULL::text, NULL::jsonb;
    RETURN;
  END IF;

  BEGIN
    INSERT INTO deploy_request (requested_by) VALUES (p_user_id);
    PERFORM audit('telegram:' || p_user_id, 'deploy_requested', 'deploy_request', 'open', '{}'::jsonb);
    RETURN QUERY SELECT 'OK'::text, 'PREFLIGHT'::text, NULL::text, NULL::jsonb;
    RETURN;
  EXCEPTION WHEN unique_violation THEN
    SELECT r.* INTO v_open FROM deploy_request r
    WHERE r.status IN ('PREFLIGHT', 'AWAITING_CONFIRM', 'RUNNING');
  END;

  RETURN QUERY
  SELECT 'OPEN'::text, v_open.status, v_open.sha,
         (SELECT coalesce(jsonb_agg(jsonb_build_object('target', t.target, 'status', t.status)
                                    ORDER BY t.position), '[]'::jsonb)
          FROM deploy_target t WHERE t.request_id = v_open.id);
END;
$$;

-- One poll of a deployer. Actions: NONE, PREFLIGHT, UPDATE_WORKER, UPDATE_N8N. p_can_n8n: this
-- deployer can publish n8n workflows and runs the preflight.
CREATE FUNCTION deploy_poll(p_worker_id text, p_can_n8n boolean)
RETURNS TABLE (action text, request_id uuid, sha text, last_sha text, target text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_request deploy_request%ROWTYPE;
  v_target deploy_target%ROWTYPE;
  v_last text;
BEGIN
  PERFORM assert_worker_identity(p_worker_id);

  SELECT r.* INTO v_request FROM deploy_request r
  WHERE r.status IN ('PREFLIGHT', 'RUNNING')
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'NONE'::text, NULL::uuid, NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  IF v_request.status = 'PREFLIGHT' THEN
    IF p_can_n8n AND v_request.claimed_by IS NULL THEN
      UPDATE deploy_request r SET claimed_by = p_worker_id WHERE r.id = v_request.id;
      RETURN QUERY SELECT 'PREFLIGHT'::text, v_request.id, NULL::text, NULL::text, NULL::text;
    ELSE
      RETURN QUERY SELECT 'NONE'::text, NULL::uuid, NULL::text, NULL::text, NULL::text;
    END IF;
    RETURN;
  END IF;

  SELECT t.* INTO v_target FROM deploy_target t
  WHERE t.request_id = v_request.id AND t.status IN ('WAITING', 'DRAINING', 'UPDATING')
  ORDER BY t.position
  LIMIT 1
  FOR UPDATE;

  IF v_target.target = 'n8n' AND v_target.status = 'WAITING' AND p_can_n8n THEN
    SELECT r.sha INTO v_last FROM deploy_request r
    WHERE r.status = 'SUCCEEDED'
    ORDER BY r.finished_at DESC
    LIMIT 1;
    UPDATE deploy_target t SET status = 'UPDATING', claimed_by = p_worker_id, state_since = now()
    WHERE t.request_id = v_request.id AND t.target = 'n8n';
    RETURN QUERY SELECT 'UPDATE_N8N'::text, v_request.id, v_request.sha, v_last, 'n8n'::text;
    RETURN;
  END IF;

  IF v_target.target IS DISTINCT FROM p_worker_id OR v_target.status = 'UPDATING' THEN
    RETURN QUERY SELECT 'NONE'::text, NULL::uuid, NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  IF v_target.status = 'WAITING' THEN
    UPDATE deploy_target t SET status = 'DRAINING', state_since = now()
    WHERE t.request_id = v_request.id AND t.target = p_worker_id;
  END IF;

  -- An idea request is not waited for: an interrupted one is claimed again (D-083).
  IF EXISTS (SELECT 1 FROM job j WHERE j.claimed_by = p_worker_id AND j.status = 'RUNNING')
     OR EXISTS (SELECT 1 FROM video_move m
                WHERE m.status = 'COPYING' AND p_worker_id IN (m.from_worker, m.to_worker)) THEN
    RETURN QUERY SELECT 'NONE'::text, NULL::uuid, NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  UPDATE deploy_target t SET status = 'UPDATING', claimed_by = p_worker_id, state_since = now()
  WHERE t.request_id = v_request.id AND t.target = p_worker_id;
  RETURN QUERY SELECT 'UPDATE_WORKER'::text, v_request.id, v_request.sha, NULL::text, p_worker_id;
END;
$$;

-- What the preflight found; the status it led to. p_migrations: the versions on the commit.
CREATE FUNCTION deploy_preflight_report(
  p_worker_id text, p_request_id uuid, p_sha text, p_commits text, p_migrations text[], p_error text
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_request deploy_request%ROWTYPE;
  v_missing text[];
  v_confirm command_confirm;
BEGIN
  PERFORM assert_worker_identity(p_worker_id);
  SELECT * INTO v_request FROM deploy_request
  WHERE id = p_request_id AND status = 'PREFLIGHT' AND claimed_by = p_worker_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 'IGNORED';
  END IF;

  IF p_error IS NOT NULL THEN
    PERFORM deploy_finish(p_request_id, 'REFUSED', left(p_error, 1000));
    RETURN 'REFUSED';
  END IF;
  IF p_sha IS NULL OR p_sha !~ '^[0-9a-f]{40}$' THEN
    PERFORM deploy_finish(p_request_id, 'REFUSED', 'origin/main did not give a commit id');
    RETURN 'REFUSED';
  END IF;

  UPDATE deploy_request SET sha = p_sha, commits = left(p_commits, 2000) WHERE id = p_request_id;
  v_missing := ARRAY(
    SELECT m FROM unnest(p_migrations) AS m
    WHERE NOT EXISTS (SELECT 1 FROM schema_migrations s WHERE s.version = m)
    ORDER BY m
  );
  IF cardinality(v_missing) > 0 THEN
    UPDATE deploy_request SET missing_migrations = v_missing WHERE id = p_request_id;
    PERFORM deploy_finish(p_request_id, 'REFUSED', NULL);
    RETURN 'REFUSED';
  END IF;

  v_confirm := command_confirm_create('DEPLOY',
    jsonb_build_object('request_id', p_request_id, 'sha', p_sha), v_request.requested_by);
  UPDATE deploy_request
  SET status = 'AWAITING_CONFIRM', confirm_token = v_confirm.token, state_since = now()
  WHERE id = p_request_id;
  RETURN 'AWAITING_CONFIRM';
END;
$$;

-- The result of a target that is updating. False when it is not this deployer's to report, for
-- instance after a timeout.
CREATE FUNCTION deploy_target_report(
  p_worker_id text, p_request_id uuid, p_target text, p_ok boolean, p_detail text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM assert_worker_identity(p_worker_id);
  UPDATE deploy_target
  SET status = CASE WHEN p_ok THEN 'DONE' ELSE 'FAILED' END,
      detail = left(p_detail, 1000), state_since = now()
  WHERE request_id = p_request_id AND target = p_target AND status = 'UPDATING'
    AND claimed_by = p_worker_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF NOT p_ok THEN
    PERFORM deploy_finish(p_request_id, 'FAILED', NULL);
  ELSIF EXISTS (SELECT 1 FROM deploy_target
                WHERE request_id = p_request_id AND status = 'WAITING') THEN
    -- The next target's pickup deadline starts now.
    UPDATE deploy_target SET state_since = now()
    WHERE request_id = p_request_id AND status = 'WAITING';
  ELSE
    PERFORM deploy_finish(p_request_id, 'SUCCEEDED', NULL);
  END IF;
  RETURN true;
END;
$$;

-- Every minute from WF-08: applies the deadlines, then returns each message not yet sent, once.
CREATE FUNCTION deploy_notices_due()
RETURNS TABLE (
  kind text,
  request_id uuid,
  status text,
  sha text,
  commits text,
  detail text,
  missing text[],
  targets jsonb,
  workers text[],
  offline text[],
  token text
)
LANGUAGE plpgsql
AS $$
#variable_conflict use_column
DECLARE
  c_preflight constant interval := interval '5 minutes';
  c_pickup constant interval := interval '10 minutes';
  c_drain constant interval := interval '2 hours';
  c_update constant interval := interval '30 minutes';
  c_online constant interval := interval '2 minutes';
  v_row record;
BEGIN
  PERFORM deploy_finish(r.id, 'REFUSED', 'no deployer answered the preflight')
  FROM deploy_request r
  WHERE r.status = 'PREFLIGHT' AND r.state_since <= now() - c_preflight;

  UPDATE command_confirm c SET status = 'EXPIRED', decided_at = now()
  FROM deploy_request r
  WHERE c.token = r.confirm_token AND r.status = 'AWAITING_CONFIRM'
    AND c.status = 'PENDING' AND c.expires_at <= now();
  PERFORM deploy_finish(r.id, 'CANCELLED', 'not confirmed in time')
  FROM deploy_request r
  JOIN command_confirm c ON c.token = r.confirm_token
  WHERE r.status = 'AWAITING_CONFIRM' AND c.status = 'EXPIRED';

  FOR v_row IN
    SELECT t.request_id, t.target,
           CASE t.status
             WHEN 'WAITING' THEN 'no deployer answered in time'
             WHEN 'DRAINING' THEN 'still busy after the drain limit'
             ELSE 'no result from the update in time'
           END AS reason
    FROM deploy_target t
    JOIN deploy_request r ON r.id = t.request_id AND r.status = 'RUNNING'
    WHERE (t.status = 'WAITING' AND t.state_since <= now() - c_pickup
           AND NOT EXISTS (SELECT 1 FROM deploy_target e
                           WHERE e.request_id = t.request_id AND e.position < t.position
                             AND e.status IN ('WAITING', 'DRAINING', 'UPDATING')))
       OR (t.status = 'DRAINING' AND t.state_since <= now() - c_drain)
       OR (t.status = 'UPDATING' AND t.state_since <= now() - c_update)
  LOOP
    UPDATE deploy_target t SET status = 'FAILED', detail = v_row.reason, state_since = now()
    WHERE t.request_id = v_row.request_id AND t.target = v_row.target;
    PERFORM deploy_finish(v_row.request_id, 'FAILED', NULL);
  END LOOP;

  RETURN QUERY
  WITH due AS (
    UPDATE deploy_request r SET notified_status = r.status
    WHERE r.status IN ('AWAITING_CONFIRM', 'REFUSED', 'SUCCEEDED', 'FAILED', 'CANCELLED')
      AND r.notified_status IS DISTINCT FROM r.status
    RETURNING r.*
  )
  SELECT CASE WHEN d.status = 'AWAITING_CONFIRM' THEN 'CONFIRM' ELSE 'FINISHED' END,
         d.id, d.status, d.sha, d.commits, d.detail, d.missing_migrations,
         (SELECT jsonb_agg(jsonb_build_object('target', t.target, 'status', t.status,
                                              'detail', t.detail) ORDER BY t.position)
          FROM deploy_target t WHERE t.request_id = d.id),
         ARRAY(SELECT w.id FROM worker w WHERE w.last_seen_at > now() - c_online ORDER BY w.id),
         ARRAY(SELECT w.id FROM worker w
               WHERE w.last_seen_at IS NULL OR w.last_seen_at <= now() - c_online ORDER BY w.id),
         CASE WHEN d.status = 'AWAITING_CONFIRM' THEN d.confirm_token END
  FROM due d
  ORDER BY d.created_at;
END;
$$;

CREATE OR REPLACE FUNCTION telegram_confirm(p_token text, p_user_id bigint, p_action text)
RETURNS TABLE (result text, action text, items jsonb)
LANGUAGE plpgsql
AS $$
#variable_conflict use_column
DECLARE
  v_confirm command_confirm%ROWTYPE;
  v_allowed boolean;
  v_item jsonb;
  v_items jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO v_confirm FROM command_confirm c WHERE c.token = p_token FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'NOT_FOUND'::text, NULL::text, NULL::jsonb;
    RETURN;
  END IF;
  IF v_confirm.requested_by <> p_user_id THEN
    RETURN QUERY SELECT 'NOT_REQUESTER'::text, v_confirm.action, NULL::jsonb;
    RETURN;
  END IF;
  IF v_confirm.status <> 'PENDING' THEN
    RETURN QUERY SELECT 'ALREADY'::text, v_confirm.action, NULL::jsonb;
    RETURN;
  END IF;
  IF v_confirm.expires_at <= now() THEN
    UPDATE command_confirm c SET status = 'EXPIRED', decided_at = now() WHERE c.token = p_token;
    IF v_confirm.action = 'DEPLOY' THEN
      PERFORM deploy_finish((v_confirm.payload->>'request_id')::uuid, 'CANCELLED', NULL);
    END IF;
    RETURN QUERY SELECT 'EXPIRED'::text, v_confirm.action, NULL::jsonb;
    RETURN;
  END IF;
  v_allowed := CASE
    WHEN v_confirm.action IN ('CANCEL', 'DEPLOY') THEN is_owner(p_user_id)
    ELSE EXISTS (SELECT 1 FROM approver WHERE telegram_user_id = p_user_id AND active)
  END;
  IF NOT v_allowed THEN
    RETURN QUERY SELECT 'NOT_ALLOWED'::text, v_confirm.action, NULL::jsonb;
    RETURN;
  END IF;

  PERFORM set_config('app.actor', 'telegram:' || p_user_id, true);
  IF p_action <> 'A' THEN
    UPDATE command_confirm c SET status = 'REJECTED', decided_at = now() WHERE c.token = p_token;
    IF v_confirm.action = 'DEPLOY' THEN
      PERFORM deploy_finish((v_confirm.payload->>'request_id')::uuid, 'CANCELLED', NULL);
    END IF;
    RETURN QUERY SELECT 'REJECTED'::text, v_confirm.action, NULL::jsonb;
    RETURN;
  END IF;

  UPDATE command_confirm c SET status = 'CONFIRMED', decided_at = now() WHERE c.token = p_token;
  IF v_confirm.action = 'DEPLOY' THEN
    PERFORM deploy_start((v_confirm.payload->>'request_id')::uuid);
    PERFORM audit('telegram:' || p_user_id, 'deploy_confirmed', 'deploy_request',
                  v_confirm.payload->>'request_id', v_confirm.payload);
    RETURN QUERY SELECT 'OK'::text, v_confirm.action, '[]'::jsonb;
    RETURN;
  END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(v_confirm.payload->'items') LOOP
    v_items := v_items || command_confirm_apply(v_confirm.action, v_item, p_user_id);
  END LOOP;
  PERFORM audit('telegram:' || p_user_id, 'command_confirmed', 'command_confirm', p_token,
                jsonb_build_object('action', v_confirm.action, 'items', v_items));
  RETURN QUERY SELECT 'OK'::text, v_confirm.action, v_items;
END;
$$;

-- migrate:down

CREATE OR REPLACE FUNCTION telegram_confirm(p_token text, p_user_id bigint, p_action text)
RETURNS TABLE (result text, action text, items jsonb)
LANGUAGE plpgsql
AS $$
#variable_conflict use_column
DECLARE
  v_confirm command_confirm%ROWTYPE;
  v_allowed boolean;
  v_item jsonb;
  v_items jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO v_confirm FROM command_confirm c WHERE c.token = p_token FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'NOT_FOUND'::text, NULL::text, NULL::jsonb;
    RETURN;
  END IF;
  IF v_confirm.requested_by <> p_user_id THEN
    RETURN QUERY SELECT 'NOT_REQUESTER'::text, v_confirm.action, NULL::jsonb;
    RETURN;
  END IF;
  IF v_confirm.status <> 'PENDING' THEN
    RETURN QUERY SELECT 'ALREADY'::text, v_confirm.action, NULL::jsonb;
    RETURN;
  END IF;
  IF v_confirm.expires_at <= now() THEN
    UPDATE command_confirm c SET status = 'EXPIRED', decided_at = now() WHERE c.token = p_token;
    RETURN QUERY SELECT 'EXPIRED'::text, v_confirm.action, NULL::jsonb;
    RETURN;
  END IF;
  v_allowed := CASE v_confirm.action
    WHEN 'CANCEL' THEN is_owner(p_user_id)
    ELSE EXISTS (SELECT 1 FROM approver WHERE telegram_user_id = p_user_id AND active)
  END;
  IF NOT v_allowed THEN
    RETURN QUERY SELECT 'NOT_ALLOWED'::text, v_confirm.action, NULL::jsonb;
    RETURN;
  END IF;

  PERFORM set_config('app.actor', 'telegram:' || p_user_id, true);
  IF p_action <> 'A' THEN
    UPDATE command_confirm c SET status = 'REJECTED', decided_at = now() WHERE c.token = p_token;
    RETURN QUERY SELECT 'REJECTED'::text, v_confirm.action, NULL::jsonb;
    RETURN;
  END IF;

  UPDATE command_confirm c SET status = 'CONFIRMED', decided_at = now() WHERE c.token = p_token;
  FOR v_item IN SELECT value FROM jsonb_array_elements(v_confirm.payload->'items') LOOP
    v_items := v_items || command_confirm_apply(v_confirm.action, v_item, p_user_id);
  END LOOP;
  PERFORM audit('telegram:' || p_user_id, 'command_confirmed', 'command_confirm', p_token,
                jsonb_build_object('action', v_confirm.action, 'items', v_items));
  RETURN QUERY SELECT 'OK'::text, v_confirm.action, v_items;
END;
$$;

CREATE OR REPLACE FUNCTION job_start(p_job_id uuid, p_worker_id text, p_lease_seconds integer)
RETURNS TABLE (
  attempt_no integer,
  step text,
  input jsonb,
  video_version_id uuid,
  video_id uuid,
  version integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_attempt integer;
  v_step text;
  v_input jsonb;
  v_version uuid;
  v_video uuid;
  v_pinned text;
BEGIN
  PERFORM assert_worker_identity(p_worker_id);
  PERFORM set_config('app.actor', p_worker_id, true);

  SELECT v.id, v.worker_id INTO v_video, v_pinned
  FROM job j
  JOIN video_version vv ON vv.id = j.video_version_id
  JOIN video v ON v.id = vv.video_id
  WHERE j.id = p_job_id
  FOR UPDATE OF v;

  IF v_pinned IS NOT NULL AND v_pinned <> p_worker_id THEN
    UPDATE job SET status = 'READY', queued_at = NULL WHERE id = p_job_id AND status = 'QUEUED';
    RETURN;
  END IF;

  UPDATE job
  SET status = 'RUNNING',
      claimed_by = p_worker_id,
      lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      attempt_count = attempt_count + 1,
      last_error = NULL
  WHERE id = p_job_id AND status = 'QUEUED'
  RETURNING attempt_count, step, input, video_version_id INTO v_attempt, v_step, v_input, v_version;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  UPDATE video SET worker_id = p_worker_id WHERE id = v_video AND worker_id IS NULL;
  INSERT INTO job_attempt (job_id, attempt_no, worker_id) VALUES (p_job_id, v_attempt, p_worker_id);

  RETURN QUERY
  SELECT v_attempt, v_step, v_input, v_version, vv.video_id, vv.version
  FROM video_version vv WHERE vv.id = v_version;
END;
$$;

DROP FUNCTION deploy_notices_due();
DROP FUNCTION deploy_target_report(text, uuid, text, boolean, text);
DROP FUNCTION deploy_preflight_report(text, uuid, text, text, text[], text);
DROP FUNCTION deploy_poll(text, boolean);
DROP FUNCTION telegram_deploy(bigint);
DROP FUNCTION deploy_start(uuid);
DROP FUNCTION deploy_finish(uuid, text, text);
DROP FUNCTION deploy_worker_draining(text);
DELETE FROM command_confirm WHERE action = 'DEPLOY';
ALTER TABLE command_confirm DROP CONSTRAINT command_confirm_action_check;
ALTER TABLE command_confirm ADD CONSTRAINT command_confirm_action_check
  CHECK (action IN ('CANCEL', 'AUTO_ALL'));
DROP TABLE deploy_target;
DROP TABLE deploy_request;
