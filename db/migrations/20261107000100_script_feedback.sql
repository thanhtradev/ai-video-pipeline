-- migrate:up

-- A1 notes and the script file (D-070, docs/episode-pipeline.md §3). A reply with notes to an
-- episode's A1 request revises its script: the request is rejected with the note, a new version
-- gets a script job that revises the previous script (the worker reads it from the previous
-- version's job directory). At most 3 rounds of notes; a 4th needs a decision. A1 rows also carry
-- script.file (script job id + media token) so WF-05 can attach script.md.

-- Rounds of notes allowed on a script: after the 3rd revision, notes need a decision.
CREATE FUNCTION script_max_revisions() RETURNS integer
LANGUAGE sql IMMUTABLE
AS $$ SELECT 3; $$;

-- The newest succeeded script job of a version, or NULL (same choice as script_job_output).
CREATE FUNCTION script_job_latest(p_version_id uuid) RETURNS job
LANGUAGE sql STABLE
AS $$
  SELECT * FROM job
  WHERE video_version_id = p_version_id AND step = 'script' AND status = 'SUCCEEDED'
  ORDER BY updated_at DESC
  LIMIT 1;
$$;

-- What WF-05 needs to fetch script.md from the worker, or NULL for scripts without a media token.
CREATE FUNCTION script_file(p_version_id uuid) RETURNS jsonb
LANGUAGE sql STABLE
AS $$
  SELECT CASE WHEN j.output->'result'->>'media_token' IS NOT NULL
              THEN jsonb_build_object('job_id', j.id, 'token', j.output->'result'->>'media_token')
         END
  FROM (SELECT (script_job_latest(p_version_id)).*) j;
$$;

-- Same as 20261026000100 plus script.file.
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
           ((script_job_output(v_row.id)->'result') - 'scenes' - 'media_token')
             || jsonb_build_object('tts_estimate', tts_budget(v_row.id), 'file', script_file(v_row.id))
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
         ((script_job_output(vv.id)->'result') - 'scenes' - 'media_token')
           || jsonb_build_object('tts_estimate', tts_budget(vv.id), 'file', script_file(vv.id))
  FROM reminded r JOIN video_version vv ON vv.id = r.video_version_id;
END;
$$;

-- Creates the script job of a new version that revises p_previous (a succeeded script job of the
-- version before) following the owner's notes.
CREATE FUNCTION script_revision_create(p_version_id uuid, p_previous job, p_feedback text,
                                       p_round integer) RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_input jsonb;
  v_job_id uuid;
BEGIN
  SELECT jsonb_build_object(
           'brief', vv.brief,
           'language', 'vi',
           'revision', jsonb_build_object(
             'previous_job_id', p_previous.id,
             'previous_version', prev.version,
             'feedback', p_feedback,
             'round', p_round))
  INTO v_input
  FROM video_version vv, video_version prev
  WHERE vv.id = p_version_id AND prev.id = p_previous.video_version_id;

  v_job_id := job_create(p_version_id, 'script', 'q:light', v_input, md5(v_input::text));
  UPDATE video_version SET status = 'SCRIPTING' WHERE id = p_version_id AND status = 'BRIEF_SUBMITTED';
  RETURN v_job_id;
END;
$$;

-- A reply with notes to an A1 request. Result codes as approval_decide, plus EMPTY_NOTE,
-- NOT_SUPPORTED (Shorts) and NEEDS_DECISION (notes after the last round). video_id/version are
-- the new version's, and only for approvers.
CREATE FUNCTION script_feedback(p_approval approval, p_user_id bigint, p_note text)
RETURNS TABLE (result text, video_id uuid, version integer, round integer)
LANGUAGE plpgsql
AS $$
#variable_conflict use_column
DECLARE
  v_version video_version%ROWTYPE;
  v_previous job;
  v_note text := left(btrim(coalesce(p_note, '')), 4000);
  v_round integer;
  v_result text;
  v_new_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM approver WHERE telegram_user_id = p_user_id AND active) THEN
    RETURN QUERY SELECT 'NOT_ALLOWED'::text, NULL::uuid, NULL::integer, NULL::integer;
    RETURN;
  END IF;
  SELECT * INTO v_version FROM video_version vv WHERE vv.id = p_approval.video_version_id;
  IF v_version.brief->>'format' IS DISTINCT FROM 'episode' THEN
    RETURN QUERY SELECT 'NOT_SUPPORTED'::text, NULL::uuid, NULL::integer, NULL::integer;
    RETURN;
  END IF;
  IF v_note = '' THEN
    RETURN QUERY SELECT 'EMPTY_NOTE'::text, NULL::uuid, NULL::integer, NULL::integer;
    RETURN;
  END IF;

  v_result := approval_decide(p_approval.token, p_user_id, 'REJECTED',
                              coalesce(script_payload_hash(v_version.id), ''));
  IF v_result <> 'OK' THEN
    RETURN QUERY SELECT v_result, v_version.video_id, v_version.version, NULL::integer;
    RETURN;
  END IF;
  UPDATE approval SET decision_note = v_note WHERE id = p_approval.id;

  v_previous := script_job_latest(v_version.id);
  v_round := coalesce((v_previous.input->'revision'->>'round')::integer, 0) + 1;
  IF v_round > script_max_revisions() THEN
    UPDATE video_version SET status = 'NEEDS_DECISION' WHERE id = v_version.id;
    RETURN QUERY SELECT 'NEEDS_DECISION'::text, v_version.video_id, v_version.version, v_round - 1;
    RETURN;
  END IF;

  v_new_id := video_new_version(v_version.video_id, v_version.brief);
  PERFORM script_revision_create(v_new_id, v_previous, v_note, v_round);
  RETURN QUERY
  SELECT 'OK'::text, vv.video_id, vv.version, v_round FROM video_version vv WHERE vv.id = v_new_id;
END;
$$;

-- Same as 20261105000100 plus FEEDBACK on SCRIPT approvals (script_feedback).
CREATE OR REPLACE FUNCTION telegram_decide(p_token text, p_user_id bigint, p_action text, p_note text DEFAULT NULL)
RETURNS TABLE (result text, video_id uuid, version integer, round integer)
LANGUAGE plpgsql
AS $$
#variable_conflict use_column
DECLARE
  v_approval approval%ROWTYPE;
  v_result text;
  v_round integer;
BEGIN
  IF p_action NOT IN ('APPROVE', 'REJECT', 'REGENERATE', 'FEEDBACK') THEN
    RAISE EXCEPTION 'invalid action %', p_action;
  END IF;
  IF EXISTS (SELECT 1 FROM member_request m WHERE m.token = p_token) THEN
    RETURN QUERY SELECT d.result, NULL::uuid, NULL::integer, NULL::integer
                 FROM member_decide(p_token, p_user_id, p_action) d;
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM intake_draft d WHERE d.token = p_token) THEN
    RETURN QUERY SELECT d.result, d.video_id, d.version, NULL::integer
                 FROM intake_decide(p_token, p_user_id, p_action) d;
    RETURN;
  END IF;
  SELECT * INTO v_approval FROM approval WHERE token = p_token;

  IF FOUND AND v_approval.type = 'SCRIPT' AND p_action = 'FEEDBACK' THEN
    RETURN QUERY SELECT d.result,
                        CASE WHEN d.result = 'NOT_ALLOWED' THEN NULL ELSE d.video_id END,
                        CASE WHEN d.result = 'NOT_ALLOWED' THEN NULL ELSE d.version END,
                        d.round
                 FROM script_feedback(v_approval, p_user_id, p_note) d;
    RETURN;
  END IF;

  IF NOT FOUND OR v_approval.type NOT IN ('STORYBOARD', 'PREVIEW', 'METADATA', 'CLEANUP') THEN
    IF p_action = 'FEEDBACK' THEN
      v_result := CASE
        WHEN NOT EXISTS (SELECT 1 FROM approver WHERE telegram_user_id = p_user_id AND active)
          THEN 'NOT_ALLOWED'
        WHEN v_approval.id IS NULL THEN 'NOT_FOUND'
        ELSE 'NOT_SUPPORTED' END;
      RETURN QUERY SELECT v_result, NULL::uuid, NULL::integer, NULL::integer;
      RETURN;
    END IF;
    RETURN QUERY SELECT d.result, d.video_id, d.version, NULL::integer
                 FROM approval_telegram_decide(p_token, p_user_id, p_action) d;
    RETURN;
  END IF;

  IF v_approval.type = 'CLEANUP' THEN
    SELECT d.result, d.round INTO v_result, v_round
    FROM cleanup_decide(v_approval, p_user_id, p_action) d;
  ELSIF v_approval.type = 'METADATA' THEN
    SELECT d.result, d.round INTO v_result, v_round
    FROM metadata_decide(v_approval, p_user_id, p_action, p_note) d;
  ELSIF v_approval.type = 'PREVIEW' THEN
    SELECT d.result, d.round INTO v_result, v_round
    FROM preview_decide(v_approval, p_user_id, p_action, p_note) d;
  ELSE
    SELECT d.result, d.round INTO v_result, v_round
    FROM storyboard_decide(v_approval, p_user_id, p_action, p_note) d;
  END IF;
  IF v_result = 'NOT_ALLOWED' THEN
    RETURN QUERY SELECT v_result, NULL::uuid, NULL::integer, NULL::integer;
    RETURN;
  END IF;
  RETURN QUERY
  SELECT v_result, vv.video_id, vv.version, v_round
  FROM video_version vv WHERE vv.id = v_approval.video_version_id;
END;
$$;

-- migrate:down

-- Restores telegram_decide of 20261105000100 and script_approvals_due of 20261026000100. Script
-- jobs created as revisions stay; they only differ in their input.
CREATE OR REPLACE FUNCTION telegram_decide(p_token text, p_user_id bigint, p_action text, p_note text DEFAULT NULL)
RETURNS TABLE (result text, video_id uuid, version integer, round integer)
LANGUAGE plpgsql
AS $$
#variable_conflict use_column
DECLARE
  v_approval approval%ROWTYPE;
  v_result text;
  v_round integer;
BEGIN
  IF p_action NOT IN ('APPROVE', 'REJECT', 'REGENERATE', 'FEEDBACK') THEN
    RAISE EXCEPTION 'invalid action %', p_action;
  END IF;
  IF EXISTS (SELECT 1 FROM member_request m WHERE m.token = p_token) THEN
    RETURN QUERY SELECT d.result, NULL::uuid, NULL::integer, NULL::integer
                 FROM member_decide(p_token, p_user_id, p_action) d;
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM intake_draft d WHERE d.token = p_token) THEN
    RETURN QUERY SELECT d.result, d.video_id, d.version, NULL::integer
                 FROM intake_decide(p_token, p_user_id, p_action) d;
    RETURN;
  END IF;
  SELECT * INTO v_approval FROM approval WHERE token = p_token;

  IF NOT FOUND OR v_approval.type NOT IN ('STORYBOARD', 'PREVIEW', 'METADATA', 'CLEANUP') THEN
    IF p_action = 'FEEDBACK' THEN
      v_result := CASE
        WHEN NOT EXISTS (SELECT 1 FROM approver WHERE telegram_user_id = p_user_id AND active)
          THEN 'NOT_ALLOWED'
        WHEN v_approval.id IS NULL THEN 'NOT_FOUND'
        ELSE 'NOT_SUPPORTED' END;
      RETURN QUERY SELECT v_result, NULL::uuid, NULL::integer, NULL::integer;
      RETURN;
    END IF;
    RETURN QUERY SELECT d.result, d.video_id, d.version, NULL::integer
                 FROM approval_telegram_decide(p_token, p_user_id, p_action) d;
    RETURN;
  END IF;

  IF v_approval.type = 'CLEANUP' THEN
    SELECT d.result, d.round INTO v_result, v_round
    FROM cleanup_decide(v_approval, p_user_id, p_action) d;
  ELSIF v_approval.type = 'METADATA' THEN
    SELECT d.result, d.round INTO v_result, v_round
    FROM metadata_decide(v_approval, p_user_id, p_action, p_note) d;
  ELSIF v_approval.type = 'PREVIEW' THEN
    SELECT d.result, d.round INTO v_result, v_round
    FROM preview_decide(v_approval, p_user_id, p_action, p_note) d;
  ELSE
    SELECT d.result, d.round INTO v_result, v_round
    FROM storyboard_decide(v_approval, p_user_id, p_action, p_note) d;
  END IF;
  IF v_result = 'NOT_ALLOWED' THEN
    RETURN QUERY SELECT v_result, NULL::uuid, NULL::integer, NULL::integer;
    RETURN;
  END IF;
  RETURN QUERY
  SELECT v_result, vv.video_id, vv.version, v_round
  FROM video_version vv WHERE vv.id = v_approval.video_version_id;
END;
$$;

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

DROP FUNCTION script_feedback(approval, bigint, text);
DROP FUNCTION script_revision_create(uuid, job, text, integer);
DROP FUNCTION script_file(uuid);
DROP FUNCTION script_job_latest(uuid);
DROP FUNCTION script_max_revisions();
