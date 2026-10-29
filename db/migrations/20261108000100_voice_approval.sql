-- migrate:up

-- VOICE approval of an episode (A1b, D-071, docs/episode-pipeline.md §5b). Approving an episode
-- script now creates the narration and the timeline only. When the newest timing job succeeds,
-- WF-15 sends the whole voice (voice.m4a, against the timing job's media token) with three
-- buttons: Duyệt creates the episode_code job, Từ chối cancels, Đọc lại pays for one more TTS
-- take. A take records its own estimate (cost_entry ESTIMATE, as A1 does), so cost_guard allows
-- exactly one more narration; after the 3rd take the version needs a decision.
-- The storyboard board also points WF-12 at the episode's audio mix (mix.m4a, D-071).

ALTER TABLE video_version DROP CONSTRAINT video_version_status_check;
ALTER TABLE video_version ADD CONSTRAINT video_version_status_check CHECK (status IN (
  'BRIEF_SUBMITTED', 'SCRIPTING', 'AWAITING_SCRIPT_APPROVAL', 'GENERATING_ASSETS',
  'AWAITING_VOICE_APPROVAL', 'AWAITING_STORYBOARD_APPROVAL',
  'RENDERING_PREVIEW', 'QA_RUNNING', 'AWAITING_PREVIEW_APPROVAL', 'RENDERING_FINAL',
  'AWAITING_METADATA_APPROVAL',
  'ARCHIVING', 'ARCHIVE_VERIFIED', 'COMPLETED',
  'NEEDS_DECISION', 'BLOCKED_PROVIDER',
  'SUPERSEDED', 'FAILED', 'CANCELLED'
));
ALTER TABLE approval DROP CONSTRAINT approval_type_check;
ALTER TABLE approval ADD CONSTRAINT approval_type_check
  CHECK (type IN ('SCRIPT', 'VOICE', 'STORYBOARD', 'PREVIEW', 'METADATA', 'CLEANUP', 'DECISION'));

INSERT INTO video_status_transition (from_status, to_status) VALUES
  ('GENERATING_ASSETS', 'AWAITING_VOICE_APPROVAL'),
  ('AWAITING_VOICE_APPROVAL', 'GENERATING_ASSETS');

-- Narration takes allowed per video version: the first plus 2 retakes.
CREATE FUNCTION voice_max_takes() RETURNS integer
LANGUAGE sql IMMUTABLE
AS $$ SELECT 3; $$;

-- The newest timing job of a version (any status), or NULL.
CREATE FUNCTION timing_latest(p_version_id uuid) RETURNS job
LANGUAGE sql STABLE
AS $$
  SELECT * FROM job
  WHERE video_version_id = p_version_id AND step = 'timing' AND status <> 'CANCELLED'
  ORDER BY created_at DESC
  LIMIT 1;
$$;

-- Take of the current narration: how many tts jobs the version has had.
CREATE FUNCTION voice_take(p_version_id uuid) RETURNS integer
LANGUAGE sql STABLE
AS $$
  SELECT count(*)::integer FROM job
  WHERE video_version_id = p_version_id AND step = 'tts' AND status <> 'CANCELLED';
$$;

-- The approved content is the newest timeline's whole output (voice, timing, captions): its
-- SHA-256 over every output's path and digest binds a VOICE approval to exactly that take.
CREATE FUNCTION voice_payload_hash(p_version_id uuid) RETURNS text
LANGUAGE sql STABLE
AS $$
  SELECT encode(sha256(convert_to(
           string_agg(o->>'path' || ':' || (o->>'sha256'), ',' ORDER BY o->>'path'), 'UTF8')), 'hex')
  FROM jsonb_array_elements(coalesce((timing_latest(p_version_id)).output->'outputs', '[]'::jsonb)) o
  WHERE (timing_latest(p_version_id)).status = 'SUCCEEDED';
$$;

-- What WF-15 shows: voice.m4a through the timing job and its media token (NULL for a timeline
-- built before A1b), its length, and the cost of one more take (NULL after the last take).
CREATE FUNCTION voice_details(p_version_id uuid, p_with_file boolean) RETURNS jsonb
LANGUAGE sql STABLE
AS $$
  SELECT jsonb_build_object(
           'file', CASE WHEN p_with_file AND j.output->'result'->>'media_token' IS NOT NULL
                          AND j.output->'outputs' @> '[{"path": "voice.m4a"}]'
                        THEN jsonb_build_object('job_id', j.id,
                                                'token', j.output->'result'->>'media_token') END,
           'seconds', j.output->'result'->'total_seconds',
           'max_takes', voice_max_takes(),
           'retake_cost', CASE WHEN voice_take(p_version_id) < voice_max_takes()
                               THEN (SELECT jsonb_build_object('amount', e->'amount',
                                                               'currency', e->'currency')
                                     FROM tts_estimate(p_version_id) e
                                     WHERE e IS NOT NULL) END)
  FROM (SELECT (timing_latest(p_version_id)).*) j;
$$;

-- One more take of the narration: the texts of the newest tts job (frozen from the approved
-- script) with a take number, so it is a new job with its own idempotency key.
CREATE FUNCTION tts_take_create(p_version_id uuid, p_take integer) RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_input jsonb;
BEGIN
  SELECT input || jsonb_build_object('take', p_take) INTO v_input FROM job
  WHERE video_version_id = p_version_id AND step = 'tts' AND status <> 'CANCELLED'
  ORDER BY created_at DESC
  LIMIT 1;
  IF v_input IS NULL THEN
    RAISE EXCEPTION 'version % has no narration to read again', p_version_id;
  END IF;
  RETURN job_create(p_version_id, 'tts', 'q:light', v_input, md5(v_input::text));
END;
$$;

-- Records the estimate of one more narration as part of the version's TTS budget (as
-- script_approvals_due does for the first). Nothing when no estimate is possible: cost_guard then
-- stops the take as over budget, and a person decides.
CREATE FUNCTION tts_estimate_record(p_version_id uuid) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_estimate jsonb := tts_estimate(p_version_id);
BEGIN
  IF v_estimate IS NULL THEN
    RETURN;
  END IF;
  INSERT INTO cost_entry (video_version_id, provider_model_id, price_id, kind, units, unit_price,
                          amount, currency)
  VALUES (p_version_id, (v_estimate->>'provider_model_id')::uuid, (v_estimate->>'price_id')::uuid,
          'ESTIMATE', (v_estimate->>'units')::numeric, (v_estimate->>'unit_price')::numeric,
          (v_estimate->>'amount')::numeric, v_estimate->>'currency');
END;
$$;

-- WF-15: voice requests for episodes whose newest timeline just succeeded and that have no
-- episode code yet (versions approved before A1b already have one), and reminders for pending
-- ones. Each request is returned once (it moves the version on).
CREATE FUNCTION voice_approvals_due(p_remind_every interval DEFAULT interval '6 hours')
RETURNS TABLE (
  kind text,
  video_id uuid,
  version integer,
  video_version_id uuid,
  token text,
  expires_at timestamptz,
  take integer,
  title text,
  voice jsonb
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
    WHERE vv.status = 'GENERATING_ASSETS'
      AND vv.brief->>'format' = 'episode'
      AND voice_payload_hash(vv.id) IS NOT NULL
      AND (episode_code_latest(vv.id)).id IS NULL
    ORDER BY vv.created_at
    FOR UPDATE OF vv SKIP LOCKED
  LOOP
    UPDATE video_version SET status = 'AWAITING_VOICE_APPROVAL' WHERE id = v_row.id;
    v_token := approval_request(v_row.id, 'VOICE', voice_payload_hash(v_row.id),
                                interval '72 hours');
    RETURN QUERY
    SELECT 'REQUEST', v_row.video_id, v_row.version, v_row.id, a.token, a.expires_at,
           voice_take(v_row.id), script_job_output(v_row.id)->'result'->>'title',
           voice_details(v_row.id, true)
    FROM approval a WHERE a.token = v_token;
  END LOOP;

  RETURN QUERY
  WITH reminded AS (
    UPDATE approval a
    SET last_reminded_at = now()
    WHERE a.type = 'VOICE'
      AND a.status = 'PENDING'
      AND a.expires_at > now()
      AND coalesce(a.last_reminded_at, a.requested_at) <= now() - p_remind_every
    RETURNING a.token, a.expires_at, a.video_version_id
  )
  SELECT 'REMINDER', vv.video_id, vv.version, vv.id, r.token, r.expires_at,
         voice_take(vv.id), script_job_output(vv.id)->'result'->>'title',
         voice_details(vv.id, false)
  FROM reminded r JOIN video_version vv ON vv.id = r.video_version_id;
END;
$$;

-- A voice button. Result codes as approval_decide, plus NOT_SUPPORTED (notes: a take cannot be
-- steered by text) and NEEDS_DECISION (Đọc lại after the last take). round = the take.
CREATE FUNCTION voice_decide(p_approval approval, p_user_id bigint, p_action text)
RETURNS TABLE (result text, round integer)
LANGUAGE plpgsql
AS $$
#variable_conflict use_column
DECLARE
  v_version_id uuid := p_approval.video_version_id;
  v_result text;
  v_take integer;
BEGIN
  IF p_action = 'FEEDBACK' THEN
    RETURN QUERY SELECT CASE WHEN EXISTS (SELECT 1 FROM approver
                                          WHERE telegram_user_id = p_user_id AND active)
                             THEN 'NOT_SUPPORTED' ELSE 'NOT_ALLOWED' END, NULL::integer;
    RETURN;
  END IF;

  v_result := approval_decide(
    p_approval.token, p_user_id,
    CASE p_action WHEN 'APPROVE' THEN 'APPROVED' ELSE 'REJECTED' END,
    coalesce(voice_payload_hash(v_version_id), '')
  );
  IF v_result <> 'OK' THEN
    RETURN QUERY SELECT v_result, NULL::integer;
    RETURN;
  END IF;

  IF p_action = 'APPROVE' THEN
    UPDATE video_version SET status = 'GENERATING_ASSETS' WHERE id = v_version_id;
    PERFORM episode_code_job_create(v_version_id);
    RETURN QUERY SELECT 'OK'::text, voice_take(v_version_id);
  ELSIF p_action = 'REJECT' THEN
    UPDATE video_version SET status = 'CANCELLED' WHERE id = v_version_id;
    RETURN QUERY SELECT 'OK'::text, voice_take(v_version_id);
  ELSE
    v_take := voice_take(v_version_id) + 1;
    IF v_take > voice_max_takes() THEN
      UPDATE video_version SET status = 'NEEDS_DECISION' WHERE id = v_version_id;
      RETURN QUERY SELECT 'NEEDS_DECISION'::text, v_take - 1;
    ELSE
      UPDATE video_version SET status = 'GENERATING_ASSETS' WHERE id = v_version_id;
      PERFORM tts_estimate_record(v_version_id);
      PERFORM tts_take_create(v_version_id, v_take);
      PERFORM timing_job_create(v_version_id);
      RETURN QUERY SELECT 'OK'::text, v_take;
    END IF;
  END IF;
END;
$$;

-- Same as 20261028000300 except that an episode waits for its voice approval before the episode
-- code (voice_decide creates it).
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
    -- Episodes (16:9, D-050) continue with the timeline, then the voice approval (A1b).
    IF v_brief->>'format' = 'episode' THEN
      PERFORM timing_job_create(v_approval.video_version_id);
    ELSE
      PERFORM render_preview_job_create(v_approval.video_version_id);
    END IF;
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

-- Same as 20261029000100 plus the mix: its media token when the episode code wrote mix.m4a.
CREATE OR REPLACE FUNCTION storyboard_board(p_version_id uuid) RETURNS jsonb
LANGUAGE sql STABLE
AS $$
  SELECT jsonb_build_object(
           'job_id', j.id,
           'token', j.output->'result'->>'board_token',
           'pages', coalesce(j.output->'result'->'board_pages', '[]'::jsonb),
           'mix_token', CASE WHEN j.output->'outputs' @> '[{"path": "mix.m4a"}]'
                             THEN j.output->'result'->>'media_token' END)
  FROM (SELECT (episode_code_latest(p_version_id)).*) j;
$$;

-- Same as 20261107000100 plus VOICE requests (voice_decide).
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

  IF NOT FOUND OR v_approval.type NOT IN ('VOICE', 'STORYBOARD', 'PREVIEW', 'METADATA', 'CLEANUP') THEN
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

  IF v_approval.type = 'VOICE' THEN
    SELECT d.result, d.round INTO v_result, v_round
    FROM voice_decide(v_approval, p_user_id, p_action) d;
  ELSIF v_approval.type = 'CLEANUP' THEN
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

-- Fails while a version or approval uses the VOICE values: decide or cancel them first.
-- Restores telegram_decide of 20261107000100.
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

-- Restores approval_telegram_decide of 20261028000300.
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
    -- Episodes (16:9, D-050) continue with timing and episode code, not the typography preview.
    IF v_brief->>'format' = 'episode' THEN
      PERFORM timing_job_create(v_approval.video_version_id);
      PERFORM episode_code_job_create(v_approval.video_version_id);
    ELSE
      PERFORM render_preview_job_create(v_approval.video_version_id);
    END IF;
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

-- Restores storyboard_board of 20261029000100.
CREATE OR REPLACE FUNCTION storyboard_board(p_version_id uuid) RETURNS jsonb
LANGUAGE sql STABLE
AS $$
  SELECT jsonb_build_object(
           'job_id', j.id,
           'token', j.output->'result'->>'board_token',
           'pages', coalesce(j.output->'result'->'board_pages', '[]'::jsonb))
  FROM (SELECT (episode_code_latest(p_version_id)).*) j;
$$;

DROP FUNCTION voice_decide(approval, bigint, text);
DROP FUNCTION voice_approvals_due(interval);
DROP FUNCTION tts_estimate_record(uuid);
DROP FUNCTION tts_take_create(uuid, integer);
DROP FUNCTION voice_details(uuid, boolean);
DROP FUNCTION voice_payload_hash(uuid);
DROP FUNCTION voice_take(uuid);
DROP FUNCTION timing_latest(uuid);
DROP FUNCTION voice_max_takes();
DELETE FROM video_status_transition
WHERE (from_status, to_status) IN (('GENERATING_ASSETS', 'AWAITING_VOICE_APPROVAL'),
                                   ('AWAITING_VOICE_APPROVAL', 'GENERATING_ASSETS'));
ALTER TABLE approval DROP CONSTRAINT approval_type_check;
ALTER TABLE approval ADD CONSTRAINT approval_type_check
  CHECK (type IN ('SCRIPT', 'STORYBOARD', 'PREVIEW', 'METADATA', 'CLEANUP', 'DECISION'));
ALTER TABLE video_version DROP CONSTRAINT video_version_status_check;
ALTER TABLE video_version ADD CONSTRAINT video_version_status_check CHECK (status IN (
  'BRIEF_SUBMITTED', 'SCRIPTING', 'AWAITING_SCRIPT_APPROVAL', 'GENERATING_ASSETS',
  'AWAITING_STORYBOARD_APPROVAL',
  'RENDERING_PREVIEW', 'QA_RUNNING', 'AWAITING_PREVIEW_APPROVAL', 'RENDERING_FINAL',
  'AWAITING_METADATA_APPROVAL',
  'ARCHIVING', 'ARCHIVE_VERIFIED', 'COMPLETED',
  'NEEDS_DECISION', 'BLOCKED_PROVIDER',
  'SUPERSEDED', 'FAILED', 'CANCELLED'
));
