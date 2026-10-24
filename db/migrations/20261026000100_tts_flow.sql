-- migrate:up

-- Phase 2b: the `tts` step (ITERA TTS, D-040) with the cost rules of docs/cost-and-providers.md:
-- an estimate shown with A1 becomes the approved budget, and the worker asks cost_guard before
-- every paid call and reports what the provider charged with cost_record.
-- n8n entry points: script_approvals_due (WF-05, now with the estimate), approval_telegram_decide
-- (WF-06, approving a script creates the tts job). Worker entry points: cost_guard, cost_record.

-- Provider task id of an ACTUAL entry, so reporting the same provider task twice is a no-op.
ALTER TABLE cost_entry ADD COLUMN external_ref text;
CREATE UNIQUE INDEX cost_entry_external_ref_idx ON cost_entry (provider_model_id, external_ref)
  WHERE external_ref IS NOT NULL;

-- ITERA bills in its own credits; prices and amounts use the pseudo currency 'CRD' (D-043).
-- Both rows start disabled: the voice, the price and enabling are rollout steps
-- (ops/postgres/itera-tts.sql), so nothing is spent before the user configures it.
INSERT INTO provider (id, name, capability, billing, data_sent_description, enabled)
VALUES ('itera', 'ITERA TTS', 'tts', 'per_request',
        'Vietnamese narration text of each scene (no personal data)', false);
INSERT INTO provider_model (provider_id, model_id, default_params, max_concurrency, enabled)
VALUES ('itera', 'eleven_multilingual_v2',
        '{"provider": "elevenlabs", "language_code": "vi"}'::jsonb, 1, false);

-- The TTS model for new jobs: the enabled one, else the first registered (the cost guard then
-- blocks its jobs until it is enabled). Enable one TTS model at a time; jobs keep their model.
CREATE FUNCTION tts_provider_model() RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT pm.id
  FROM provider_model pm JOIN provider p ON p.id = pm.provider_id
  WHERE p.capability = 'tts'
  ORDER BY (p.enabled AND pm.enabled) DESC, pm.provider_id, pm.model_id
  LIMIT 1;
$$;

-- Price row in force now for a model and unit, or NULL.
CREATE FUNCTION price_current(p_provider_model_id uuid, p_unit text) RETURNS provider_price
LANGUAGE sql STABLE
AS $$
  SELECT * FROM provider_price
  WHERE provider_model_id = p_provider_model_id
    AND unit = p_unit
    AND valid_from <= now()
    AND (valid_to IS NULL OR valid_to > now())
  ORDER BY valid_from DESC
  LIMIT 1;
$$;

-- Characters a TTS provider bills for a text: code points after NFC normalization, the same
-- count the worker uses (worker/src/handlers/tts.ts).
CREATE FUNCTION tts_chars(p_text text) RETURNS integer
LANGUAGE sql IMMUTABLE
AS $$ SELECT char_length(normalize(p_text, NFC)); $$;

-- Scenes of the version's script (script step result, Phase 2b format), or NULL.
CREATE FUNCTION script_scenes(p_version_id uuid) RETURNS jsonb
LANGUAGE sql STABLE
AS $$
  SELECT CASE WHEN jsonb_typeof(s) = 'array' AND jsonb_array_length(s) > 0 THEN s END
  FROM (SELECT script_job_output(p_version_id)->'result'->'scenes' AS s) x;
$$;

-- A1 estimate for the narration: characters x current price, plus a 10% margin for counting
-- differences on the provider side, rounded up. NULL without scenes or price.
CREATE FUNCTION tts_estimate(p_version_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_model_id uuid := tts_provider_model();
  v_price provider_price;
  v_chars integer;
BEGIN
  SELECT sum(tts_chars(s->>'narration'))::integer INTO v_chars
  FROM jsonb_array_elements(coalesce(script_scenes(p_version_id), '[]'::jsonb)) s;
  v_price := price_current(v_model_id, 'per_char');
  IF v_chars IS NULL OR v_price.id IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN jsonb_build_object(
    'provider_model_id', v_model_id,
    'price_id', v_price.id,
    'units', v_chars,
    'unit_price', v_price.unit_price,
    'currency', v_price.currency,
    'amount', ceil(v_chars * v_price.unit_price * 1.10)
  );
END;
$$;

-- What A1 approves: the recorded TTS estimate of a version, or NULL when none was possible.
CREATE FUNCTION tts_budget(p_version_id uuid) RETURNS jsonb
LANGUAGE sql STABLE
AS $$
  SELECT jsonb_build_object('units', sum(units), 'amount', sum(amount), 'currency', min(currency))
  FROM cost_entry
  WHERE video_version_id = p_version_id AND kind = 'ESTIMATE'
  HAVING count(*) > 0;
$$;

-- Creates (or returns) the tts job of a version: one request per scene (Q-003), texts frozen from
-- the approved script so later edits cannot change what is spoken.
CREATE FUNCTION tts_job_create(p_version_id uuid) RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_scenes jsonb := script_scenes(p_version_id);
  v_input jsonb;
BEGIN
  IF v_scenes IS NULL THEN
    RAISE EXCEPTION 'script of version % has no scenes; regenerate it', p_version_id;
  END IF;

  SELECT jsonb_build_object(
           'scenes', jsonb_agg(jsonb_build_object('index', e.ord, 'text', normalize(e.s->>'narration', NFC))
                               ORDER BY e.ord),
           'provider_model_id', tts_provider_model(),
           'language', 'vi')
  INTO v_input
  FROM jsonb_array_elements(v_scenes) WITH ORDINALITY e(s, ord);

  RETURN job_create(p_version_id, 'tts', 'q:light', v_input, md5(v_input::text));
END;
$$;

-- Same as 20261025000100 plus: a request records the TTS estimate (cost_entry ESTIMATE), and
-- every row carries it as script.tts_estimate. The scenes stay out of the message payload.
CREATE OR REPLACE FUNCTION script_approvals_due(p_remind_every interval DEFAULT interval '6 hours')
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
  v_estimate jsonb;
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
    v_estimate := tts_estimate(v_row.id);
    IF v_estimate IS NOT NULL THEN
      INSERT INTO cost_entry (video_version_id, provider_model_id, price_id, kind, units, unit_price,
                              amount, currency)
      VALUES (v_row.id, (v_estimate->>'provider_model_id')::uuid, (v_estimate->>'price_id')::uuid,
              'ESTIMATE', (v_estimate->>'units')::numeric, (v_estimate->>'unit_price')::numeric,
              (v_estimate->>'amount')::numeric, v_estimate->>'currency');
    END IF;
    v_token := approval_request(v_row.id, 'SCRIPT', script_payload_hash(v_row.id));
    RETURN QUERY
    SELECT 'REQUEST', v_row.video_id, v_row.version, v_row.id, a.token, a.expires_at,
           ((script_job_output(v_row.id)->'result') - 'scenes')
             || jsonb_build_object('tts_estimate', tts_budget(v_row.id))
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
         ((script_job_output(vv.id)->'result') - 'scenes')
           || jsonb_build_object('tts_estimate', tts_budget(vv.id))
  FROM reminded r JOIN video_version vv ON vv.id = r.video_version_id;
END;
$$;

-- Same as 20261025000100 plus: approving a script creates the version's tts job.
CREATE OR REPLACE FUNCTION approval_telegram_decide(p_token text, p_user_id bigint, p_action text)
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

  IF v_result = 'OK' AND p_action = 'APPROVE' AND v_approval.type = 'SCRIPT' THEN
    PERFORM tts_job_create(v_approval.video_version_id);
  ELSIF v_result = 'OK' AND p_action = 'REJECT' THEN
    UPDATE video_version SET status = 'CANCELLED' WHERE id = v_approval.video_version_id;
  ELSIF v_result = 'OK' AND p_action = 'REGENERATE' THEN
    v_new_version_id := video_new_version(v_video_id, v_brief);
    PERFORM script_job_create(v_new_version_id);
  END IF;

  RETURN QUERY
  SELECT v_result, v.id, v.current_version FROM video v WHERE v.id = v_video_id;
END;
$$;

-- Worker, before every paid provider call (CLAUDE.md §5): may this job spend p_units more?
--   ALLOW        go ahead; params are the model's settings, so the call matches what was priced
--   DISABLED     provider or model switched off      -> the worker blocks the job (resumes later)
--   EXHAUSTED    provider_quota says EXHAUSTED/ERROR -> the worker blocks the job
--   NO_PRICE     no current per_char price           -> needs a decision
--   OVER_BUDGET  spent + this call > the estimate approved with A1 (D-023) -> needs a decision
--   LOST         the job is not running for this worker
-- Every answer is audited. Never picks another provider or model.
CREATE FUNCTION cost_guard(p_job_id uuid, p_worker_id text, p_units numeric)
RETURNS TABLE (
  decision text,
  provider_id text,
  model_id text,
  params jsonb,
  amount numeric,
  budget numeric,
  spent numeric,
  currency text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_job job%ROWTYPE;
  v_model provider_model%ROWTYPE;
  v_provider_enabled boolean;
  v_quota text;
  v_price provider_price;
  v_amount numeric;
  v_budget numeric := 0;
  v_spent numeric := 0;
  v_decision text;
BEGIN
  PERFORM assert_worker_identity(p_worker_id);
  PERFORM set_config('app.actor', p_worker_id, true);
  IF p_units IS NULL OR p_units < 0 THEN
    RAISE EXCEPTION 'units must be a non-negative number';
  END IF;

  SELECT * INTO v_job FROM job
  WHERE id = p_job_id AND status = 'RUNNING' AND claimed_by = p_worker_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'LOST', NULL::text, NULL::text, NULL::jsonb, NULL::numeric, NULL::numeric,
                        NULL::numeric, NULL::text;
    RETURN;
  END IF;

  SELECT * INTO v_model FROM provider_model WHERE id = (v_job.input->>'provider_model_id')::uuid;
  SELECT enabled INTO v_provider_enabled FROM provider WHERE id = v_model.provider_id;
  SELECT status INTO v_quota FROM provider_quota WHERE provider_model_id = v_model.id;
  v_price := price_current(v_model.id, 'per_char');

  IF v_model.id IS NULL OR NOT (v_provider_enabled AND v_model.enabled) THEN
    v_decision := 'DISABLED';
  ELSIF v_quota IN ('EXHAUSTED', 'ERROR') THEN
    v_decision := 'EXHAUSTED';
  ELSIF v_price.id IS NULL THEN
    v_decision := 'NO_PRICE';
  ELSE
    v_amount := p_units * v_price.unit_price;
    IF EXISTS (SELECT 1 FROM approval
               WHERE video_version_id = v_job.video_version_id AND type = 'SCRIPT'
                 AND status = 'APPROVED') THEN
      SELECT coalesce(sum(c.amount), 0) INTO v_budget FROM cost_entry c
      WHERE c.video_version_id = v_job.video_version_id AND c.kind = 'ESTIMATE'
        AND c.provider_model_id = v_model.id AND c.currency = v_price.currency;
    END IF;
    SELECT coalesce(sum(c.amount), 0) INTO v_spent FROM cost_entry c
    WHERE c.video_version_id = v_job.video_version_id AND c.kind = 'ACTUAL'
      AND c.provider_model_id = v_model.id AND c.currency = v_price.currency;
    v_decision := CASE WHEN v_spent + v_amount > v_budget THEN 'OVER_BUDGET' ELSE 'ALLOW' END;
  END IF;

  PERFORM audit(p_worker_id, 'cost_guard', 'job', p_job_id::text, jsonb_build_object(
    'decision', v_decision, 'units', p_units, 'amount', v_amount, 'budget', v_budget,
    'spent', v_spent, 'currency', v_price.currency));

  RETURN QUERY SELECT v_decision, v_model.provider_id, v_model.model_id, v_model.default_params,
                      v_amount, v_budget, v_spent, v_price.currency::text;
END;
$$;

-- Worker, after a paid call finished: records what the provider charged (its own amount, in the
-- price's currency) as ACTUAL. Idempotent per provider task (p_external_ref); returns false for a
-- repeat. Accepted from the worker that ran an attempt of the job even after it lost the lease,
-- because the money is spent either way.
CREATE FUNCTION cost_record(
  p_job_id uuid,
  p_worker_id text,
  p_external_ref text,
  p_units numeric,
  p_amount numeric
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_job job%ROWTYPE;
  v_attempt_id uuid;
  v_model_id uuid;
  v_price provider_price;
  v_inserted integer;
BEGIN
  PERFORM assert_worker_identity(p_worker_id);
  PERFORM set_config('app.actor', p_worker_id, true);
  IF p_external_ref IS NULL OR length(p_external_ref) = 0 THEN
    RAISE EXCEPTION 'external_ref is required';
  END IF;
  IF p_units IS NULL OR p_units < 0 OR p_amount IS NULL OR p_amount < 0 THEN
    RAISE EXCEPTION 'units and amount must be non-negative numbers';
  END IF;

  SELECT * INTO v_job FROM job WHERE id = p_job_id;
  SELECT a.id INTO v_attempt_id FROM job_attempt a
  WHERE a.job_id = p_job_id AND a.worker_id = p_worker_id
  ORDER BY a.attempt_no DESC
  LIMIT 1;
  IF v_attempt_id IS NULL THEN
    RAISE EXCEPTION 'job % was not run by worker %', p_job_id, p_worker_id;
  END IF;

  v_model_id := (v_job.input->>'provider_model_id')::uuid;
  v_price := price_current(v_model_id, 'per_char');
  IF v_price.id IS NULL THEN
    RAISE EXCEPTION 'no current price for provider model %', v_model_id;
  END IF;

  INSERT INTO cost_entry (video_version_id, job_id, attempt_id, provider_model_id, price_id, kind,
                          units, unit_price, amount, currency, external_ref)
  VALUES (v_job.video_version_id, p_job_id, v_attempt_id, v_model_id, v_price.id, 'ACTUAL',
          p_units, v_price.unit_price, p_amount, v_price.currency, p_external_ref)
  ON CONFLICT (provider_model_id, external_ref) WHERE external_ref IS NOT NULL DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted = 1;
END;
$$;

-- migrate:down

CREATE OR REPLACE FUNCTION script_approvals_due(p_remind_every interval DEFAULT interval '6 hours')
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

CREATE OR REPLACE FUNCTION approval_telegram_decide(p_token text, p_user_id bigint, p_action text)
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

DROP FUNCTION cost_record(uuid, text, text, numeric, numeric);
DROP FUNCTION cost_guard(uuid, text, numeric);
DROP FUNCTION tts_job_create(uuid);
DROP FUNCTION tts_budget(uuid);
DROP FUNCTION tts_estimate(uuid);
DROP FUNCTION script_scenes(uuid);
DROP FUNCTION tts_chars(text);
DROP FUNCTION price_current(uuid, text);
DROP FUNCTION tts_provider_model();
-- Fails on purpose once an ITERA estimate or cost was recorded: restore from a backup instead.
DELETE FROM provider_price WHERE provider_model_id IN (SELECT id FROM provider_model WHERE provider_id = 'itera');
DELETE FROM provider_quota WHERE provider_model_id IN (SELECT id FROM provider_model WHERE provider_id = 'itera');
DELETE FROM provider_model WHERE provider_id = 'itera';
DELETE FROM provider WHERE id = 'itera';
DROP INDEX cost_entry_external_ref_idx;
ALTER TABLE cost_entry DROP COLUMN external_ref;
