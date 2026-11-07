-- migrate:up

-- Claude API as owner-approved overflow for the Max subscription (D-118, ops/claude-api.md).
-- Max stays the default. A Claude step (claude_api_step) blocked by the Max usage limit is offered
-- once per block: WF-08 sends a button from claude_api_offers_due(), a command_confirm row with
-- action CLAUDE_API. Only the owner's tap (telegram_confirm) grants that one job a USD cap and
-- wakes it. The worker asks claude_api_begin() before every CLI run: SUBSCRIPTION (no grant),
-- ALLOW with a reservation and --max-budget-usd, or DENIED. claude_api_record() writes the CLI's
-- cost as an ACTUAL cost_entry in USD. A reservation never recorded (a crash) counts as fully
-- spent, so a crash can never let the month overspend. The job leaving RUNNING for BLOCKED, a
-- success or a permanent failure ends its grant: nothing spends again without a new tap.
-- The month limit is provider_quota.limit_value (USD, Vietnam calendar month), set below the
-- Console workspace limit, which is the hard stop outside this database.
--
-- Rollback: restores telegram_confirm and the command_confirm action check, drops the trigger,
-- functions and tables, and removes the provider rows when no cost_entry uses them (recorded API
-- costs are kept). Roll WF-06 and WF-08 back first, and remove PIPELINE_ANTHROPIC_API_KEY.

INSERT INTO provider (id, name, capability, billing, data_sent_description, enabled)
VALUES ('anthropic-api', 'Claude API (overflow)', 'llm', 'per_request',
        'The same prompts the Claude Code CLI sends on Max: brief, script, rules, episode code',
        false);
-- One row for the CLI: the model is the worker's CLAUDE_MODEL / CLAUDE_AGENT_MODEL, recorded per
-- run in claude_api_spend.detail. Amounts are the CLI's USD figure, so the price is 1 per USD.
INSERT INTO provider_model (provider_id, model_id, default_params, max_concurrency, enabled)
VALUES ('anthropic-api', 'claude-code-cli', '{}'::jsonb, 3, false);
INSERT INTO provider_price (provider_model_id, unit, unit_price, currency, valid_from, source_note)
SELECT id, 'per_usd', 1, 'USD', '2026-11-01', 'CLI total_cost_usd recorded as is (D-118)'
FROM provider_model WHERE provider_id = 'anthropic-api';
-- $90 of a $100 Console limit (owner, 2026-11-07: the key is used only by the pipeline):
-- --max-budget-usd can overshoot, so the guard refuses first.
INSERT INTO provider_quota (provider_model_id, period, limit_value)
SELECT id, 'month', 90 FROM provider_model WHERE provider_id = 'anthropic-api';

-- Steps that may be offered, with the USD cap of one grant. No rows at first: the owner sets
-- them from ops/postgres/claude-usage.sql (Q-004), never a guess.
CREATE TABLE claude_api_step (
  step text PRIMARY KEY CHECK (step IN ('script', 'metadata', 'episode_code')),
  cap_usd numeric(10, 4) NOT NULL CHECK (cap_usd > 0)
);

CREATE TABLE claude_api_grant (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES job (id),
  video_version_id uuid NOT NULL REFERENCES video_version (id),
  confirm_token text NOT NULL UNIQUE REFERENCES command_confirm (token),
  cap_usd numeric(10, 4) NOT NULL CHECK (cap_usd > 0),
  granted_by bigint NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'GRANTED' CHECK (status IN ('GRANTED', 'CLOSED')),
  closed_at timestamptz,
  close_reason text
);

CREATE UNIQUE INDEX claude_api_grant_one_open ON claude_api_grant (job_id) WHERE status = 'GRANTED';

CREATE TABLE claude_api_spend (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grant_id uuid NOT NULL REFERENCES claude_api_grant (id),
  job_id uuid NOT NULL REFERENCES job (id),
  attempt_id uuid REFERENCES job_attempt (id),
  worker_id text NOT NULL,
  reserved_usd numeric(10, 4) NOT NULL CHECK (reserved_usd >= 0),
  actual_usd numeric(10, 4) CHECK (actual_usd >= 0),
  detail jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  recorded_at timestamptz
);

CREATE INDEX claude_api_spend_created_idx ON claude_api_spend (created_at);

ALTER TABLE command_confirm DROP CONSTRAINT command_confirm_action_check;
ALTER TABLE command_confirm ADD CONSTRAINT command_confirm_action_check
  CHECK (action IN ('CANCEL', 'AUTO_ALL', 'DEPLOY', 'CLAUDE_API'));

-- Below this much left in the month, no button is offered; below c_min_run, no run starts.
CREATE FUNCTION claude_api_min_offer_usd() RETURNS numeric LANGUAGE sql IMMUTABLE AS $$ SELECT 1.00 $$;
CREATE FUNCTION claude_api_min_run_usd() RETURNS numeric LANGUAGE sql IMMUTABLE AS $$ SELECT 0.10 $$;

-- USD spent (or reserved and never recorded) since the start of this Vietnam calendar month.
CREATE FUNCTION claude_api_month_spent() RETURNS numeric
LANGUAGE sql STABLE
AS $$
  SELECT coalesce(sum(coalesce(s.actual_usd, s.reserved_usd)), 0)
  FROM claude_api_spend s
  WHERE s.created_at >= date_trunc('month', now() AT TIME ZONE 'Asia/Ho_Chi_Minh')
                        AT TIME ZONE 'Asia/Ho_Chi_Minh';
$$;

-- The month limit when the API is switched on (provider and model), else NULL.
CREATE FUNCTION claude_api_month_limit() RETURNS numeric
LANGUAGE sql STABLE
AS $$
  SELECT q.limit_value
  FROM provider p
  JOIN provider_model pm ON pm.provider_id = p.id
  LEFT JOIN provider_quota q ON q.provider_model_id = pm.id
  WHERE p.id = 'anthropic-api' AND p.enabled AND pm.enabled;
$$;

-- Ends the job's grant when it stops running for good or blocks: a later run needs a new tap.
CREATE FUNCTION claude_api_close_grant() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE claude_api_grant
  SET status = 'CLOSED', closed_at = now(), close_reason = 'job ' || NEW.status
  WHERE job_id = NEW.id AND status = 'GRANTED';
  RETURN NEW;
END;
$$;

CREATE TRIGGER job_claude_api_close_grant
AFTER UPDATE OF status ON job
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status
      AND NEW.status IN ('BLOCKED', 'SUCCEEDED', 'FAILED_PERMANENT', 'CANCELLED'))
EXECUTE FUNCTION claude_api_close_grant();

-- WF-08, every minute: new offers for Claude steps blocked by the Max usage limit, one per block
-- (a block after the latest attempt started). Pending offers whose job left BLOCKED (Max reset
-- first) expire. Offers nothing while the API is off or less than claude_api_min_offer_usd() is
-- left of the month.
CREATE FUNCTION claude_api_offers_due()
RETURNS TABLE (
  token text,
  job_id uuid,
  video_id uuid,
  version integer,
  step text,
  cap_usd numeric,
  month_spent_usd numeric,
  month_limit_usd numeric
)
LANGUAGE plpgsql
AS $$
#variable_conflict use_column
DECLARE
  v_limit numeric := claude_api_month_limit();
  v_spent numeric := claude_api_month_spent();
BEGIN
  UPDATE command_confirm c SET status = 'EXPIRED', decided_at = now()
  WHERE c.action = 'CLAUDE_API' AND c.status = 'PENDING'
    AND (c.expires_at <= now()
         OR NOT EXISTS (SELECT 1 FROM job j
                        WHERE j.id = (c.payload->>'job_id')::uuid AND j.status = 'BLOCKED'));

  IF v_limit IS NULL OR v_limit - v_spent < claude_api_min_offer_usd() THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH due AS (
    SELECT j.id, j.video_version_id, least(s.cap_usd, v_limit - v_spent) AS cap
    FROM job j
    JOIN claude_api_step s ON s.step = j.step
    WHERE j.status = 'BLOCKED'
      AND j.last_error LIKE 'claude-code usage limit:%'
      AND NOT EXISTS (
        SELECT 1 FROM command_confirm c
        WHERE c.action = 'CLAUDE_API' AND c.payload->>'job_id' = j.id::text
          AND c.created_at >= coalesce((SELECT max(a.started_at) FROM job_attempt a
                                        WHERE a.job_id = j.id), j.created_at))
  ), offered AS (
    INSERT INTO command_confirm (token, action, payload, requested_by, expires_at)
    SELECT replace(gen_random_uuid()::text, '-', ''), 'CLAUDE_API',
           jsonb_build_object('job_id', d.id, 'video_version_id', d.video_version_id,
                              'cap_usd', d.cap),
           0, now() + interval '12 hours'
    FROM due d
    RETURNING command_confirm.token, command_confirm.payload
  )
  SELECT o.token, j.id, vv.video_id, vv.version, j.step,
         round((o.payload->>'cap_usd')::numeric, 2), round(v_spent, 2), round(v_limit, 2)
  FROM offered o
  JOIN job j ON j.id = (o.payload->>'job_id')::uuid
  JOIN video_version vv ON vv.id = j.video_version_id
  ORDER BY j.created_at;
END;
$$;

-- The owner's tap on an offer: grants the job its cap (never more than the month has left) and
-- wakes it now. STALE when the job no longer waits on the block; DISABLED or BUDGET otherwise.
CREATE FUNCTION claude_api_grant_apply(p_token text, p_payload jsonb, p_user_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_job job%ROWTYPE;
  v_video uuid;
  v_version integer;
  v_limit numeric;
  v_cap numeric;
  v_result text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('claude_api_budget'));
  SELECT * INTO v_job FROM job WHERE id = (p_payload->>'job_id')::uuid FOR UPDATE;
  SELECT vv.video_id, vv.version INTO v_video, v_version
  FROM video_version vv WHERE vv.id = v_job.video_version_id;
  v_limit := claude_api_month_limit();
  v_cap := least((p_payload->>'cap_usd')::numeric, v_limit - claude_api_month_spent());

  IF v_job.status IS DISTINCT FROM 'BLOCKED' THEN
    v_result := 'STALE';
  ELSIF v_limit IS NULL THEN
    v_result := 'DISABLED';
  ELSIF v_cap < claude_api_min_run_usd() THEN
    v_result := 'BUDGET';
  ELSE
    INSERT INTO claude_api_grant (job_id, video_version_id, confirm_token, cap_usd, granted_by)
    VALUES (v_job.id, v_job.video_version_id, p_token, v_cap, p_user_id);
    UPDATE job SET next_attempt_at = now() WHERE id = v_job.id;
    v_result := 'OK';
  END IF;

  PERFORM audit('telegram:' || p_user_id, 'claude_api_grant', 'job', v_job.id::text,
                jsonb_build_object('result', v_result, 'cap_usd', v_cap));
  RETURN jsonb_build_object('video_id', v_video, 'version', v_version, 'step', v_job.step,
                            'result', v_result, 'cap_usd', CASE WHEN v_result = 'OK' THEN v_cap END);
END;
$$;

-- Worker, before every Claude CLI run of a job:
--   SUBSCRIPTION  no open grant: run on Max as always
--   ALLOW         run with the API key and --max-budget-usd max_usd; record it with spend_id
--   DENIED        reason DISABLED or BUDGET; the grant is ended, the worker blocks the job
--   LOST          the job is not running for this worker
CREATE FUNCTION claude_api_begin(p_job_id uuid, p_worker_id text)
RETURNS TABLE (decision text, spend_id uuid, max_usd numeric, reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_job job%ROWTYPE;
  v_grant claude_api_grant%ROWTYPE;
  v_limit numeric;
  v_allow numeric;
  v_reason text;
  v_spend uuid;
BEGIN
  PERFORM assert_worker_identity(p_worker_id);
  PERFORM set_config('app.actor', p_worker_id, true);

  SELECT * INTO v_job FROM job
  WHERE id = p_job_id AND status = 'RUNNING' AND claimed_by = p_worker_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'LOST'::text, NULL::uuid, NULL::numeric, NULL::text;
    RETURN;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('claude_api_budget'));
  SELECT * INTO v_grant FROM claude_api_grant g
  WHERE g.job_id = p_job_id AND g.status = 'GRANTED' FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'SUBSCRIPTION'::text, NULL::uuid, NULL::numeric, NULL::text;
    RETURN;
  END IF;

  v_limit := claude_api_month_limit();
  v_allow := least(
    v_grant.cap_usd - (SELECT coalesce(sum(coalesce(s.actual_usd, s.reserved_usd)), 0)
                       FROM claude_api_spend s WHERE s.grant_id = v_grant.id),
    v_limit - claude_api_month_spent());
  IF v_limit IS NULL THEN
    v_reason := 'DISABLED';
  ELSIF v_allow < claude_api_min_run_usd() THEN
    v_reason := 'BUDGET';
  END IF;

  IF v_reason IS NOT NULL THEN
    UPDATE claude_api_grant SET status = 'CLOSED', closed_at = now(), close_reason = v_reason
    WHERE id = v_grant.id;
    PERFORM audit(p_worker_id, 'claude_api_begin', 'job', p_job_id::text,
                  jsonb_build_object('decision', 'DENIED', 'reason', v_reason));
    RETURN QUERY SELECT 'DENIED'::text, NULL::uuid, NULL::numeric, v_reason;
    RETURN;
  END IF;

  INSERT INTO claude_api_spend (grant_id, job_id, attempt_id, worker_id, reserved_usd)
  VALUES (v_grant.id, p_job_id,
          (SELECT a.id FROM job_attempt a WHERE a.job_id = p_job_id AND a.status = 'RUNNING'
           ORDER BY a.attempt_no DESC LIMIT 1),
          p_worker_id, v_allow)
  RETURNING id INTO v_spend;
  PERFORM audit(p_worker_id, 'claude_api_begin', 'job', p_job_id::text,
                jsonb_build_object('decision', 'ALLOW', 'spend_id', v_spend, 'max_usd', v_allow));
  RETURN QUERY SELECT 'ALLOW'::text, v_spend, v_allow::numeric(10, 4), NULL::text;
END;
$$;

-- Worker, after the run: the CLI's USD figure as an ACTUAL cost_entry (is_derived: the CLI's
-- estimate at list prices, not an invoice). Idempotent per reservation; false for a repeat.
-- Accepted after a lost lease, because the money is spent either way.
CREATE FUNCTION claude_api_record(p_spend_id uuid, p_worker_id text, p_usd numeric, p_detail jsonb)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_spend claude_api_spend%ROWTYPE;
  v_job job%ROWTYPE;
  v_model uuid;
  v_price provider_price;
BEGIN
  PERFORM assert_worker_identity(p_worker_id);
  PERFORM set_config('app.actor', p_worker_id, true);
  IF p_usd IS NULL OR p_usd < 0 THEN
    RAISE EXCEPTION 'usd must be a non-negative number';
  END IF;

  SELECT * INTO v_spend FROM claude_api_spend WHERE id = p_spend_id FOR UPDATE;
  IF NOT FOUND OR v_spend.worker_id <> p_worker_id THEN
    RAISE EXCEPTION 'spend % was not reserved by worker %', p_spend_id, p_worker_id;
  END IF;
  IF v_spend.actual_usd IS NOT NULL THEN
    RETURN false;
  END IF;

  UPDATE claude_api_spend SET actual_usd = p_usd, detail = p_detail, recorded_at = now()
  WHERE id = p_spend_id;
  SELECT * INTO v_job FROM job WHERE id = v_spend.job_id;
  SELECT id INTO v_model FROM provider_model WHERE provider_id = 'anthropic-api';
  v_price := price_current(v_model, 'per_usd');
  INSERT INTO cost_entry (video_version_id, job_id, attempt_id, provider_model_id, price_id, kind,
                          units, unit_price, amount, currency, is_derived, external_ref)
  VALUES (v_job.video_version_id, v_job.id, v_spend.attempt_id, v_model, v_price.id, 'ACTUAL',
          p_usd, 1, p_usd, 'USD', true, p_spend_id::text);
  RETURN true;
END;
$$;

-- Same as 20261125000400_deploy plus CLAUDE_API: owner only, any owner (the offer has no
-- requester), applied by claude_api_grant_apply.
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
  IF v_confirm.action <> 'CLAUDE_API' AND v_confirm.requested_by <> p_user_id THEN
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
    WHEN v_confirm.action IN ('CANCEL', 'DEPLOY', 'CLAUDE_API') THEN is_owner(p_user_id)
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
  IF v_confirm.action = 'CLAUDE_API' THEN
    RETURN QUERY SELECT 'OK'::text, v_confirm.action,
                        jsonb_build_array(claude_api_grant_apply(p_token, v_confirm.payload, p_user_id));
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

DROP TRIGGER job_claude_api_close_grant ON job;
DROP FUNCTION claude_api_close_grant();
DROP FUNCTION claude_api_record(uuid, text, numeric, jsonb);
DROP FUNCTION claude_api_begin(uuid, text);
DROP FUNCTION claude_api_grant_apply(text, jsonb, bigint);
DROP FUNCTION claude_api_offers_due();
DROP FUNCTION claude_api_month_limit();
DROP FUNCTION claude_api_month_spent();
DROP FUNCTION claude_api_min_run_usd();
DROP FUNCTION claude_api_min_offer_usd();
DROP TABLE claude_api_spend;
DROP TABLE claude_api_grant;
DROP TABLE claude_api_step;

UPDATE command_confirm SET status = 'EXPIRED', decided_at = now()
WHERE action = 'CLAUDE_API' AND status = 'PENDING';
DELETE FROM command_confirm WHERE action = 'CLAUDE_API';
ALTER TABLE command_confirm DROP CONSTRAINT command_confirm_action_check;
ALTER TABLE command_confirm ADD CONSTRAINT command_confirm_action_check
  CHECK (action IN ('CANCEL', 'AUTO_ALL', 'DEPLOY'));

DELETE FROM provider_quota WHERE provider_model_id IN (
  SELECT pm.id FROM provider_model pm WHERE pm.provider_id = 'anthropic-api'
    AND NOT EXISTS (SELECT 1 FROM cost_entry c WHERE c.provider_model_id = pm.id));
DELETE FROM provider_price WHERE provider_model_id IN (
  SELECT pm.id FROM provider_model pm WHERE pm.provider_id = 'anthropic-api'
    AND NOT EXISTS (SELECT 1 FROM cost_entry c WHERE c.provider_model_id = pm.id));
DELETE FROM provider_model pm WHERE pm.provider_id = 'anthropic-api'
  AND NOT EXISTS (SELECT 1 FROM cost_entry c WHERE c.provider_model_id = pm.id);
DELETE FROM provider p WHERE p.id = 'anthropic-api'
  AND NOT EXISTS (SELECT 1 FROM provider_model pm WHERE pm.provider_id = p.id);
