-- migrate:up

-- STORYBOARD approval of an episode (D-052, docs/episode-pipeline.md §7). When the newest
-- episode_code job of a version succeeds, WF-12 sends its storyboard to Telegram (REQUEST rows of
-- storyboard_approvals_due). WF-06 decides through telegram_decide(): Approve creates the
-- render_episode job, Reject cancels, a reply with notes creates a revision of the code. Each
-- storyboard version is a round; after the 4th (3 rounds of notes) the version needs a decision.

ALTER TABLE video_version DROP CONSTRAINT video_version_status_check;
ALTER TABLE video_version ADD CONSTRAINT video_version_status_check CHECK (status IN (
  'BRIEF_SUBMITTED', 'SCRIPTING', 'AWAITING_SCRIPT_APPROVAL', 'GENERATING_ASSETS',
  'AWAITING_STORYBOARD_APPROVAL',
  'RENDERING_PREVIEW', 'QA_RUNNING', 'AWAITING_PREVIEW_APPROVAL', 'RENDERING_FINAL',
  'ARCHIVING', 'ARCHIVE_VERIFIED', 'COMPLETED',
  'NEEDS_DECISION', 'BLOCKED_PROVIDER',
  'SUPERSEDED', 'FAILED', 'CANCELLED'
));
ALTER TABLE approval DROP CONSTRAINT approval_type_check;
ALTER TABLE approval ADD CONSTRAINT approval_type_check
  CHECK (type IN ('SCRIPT', 'STORYBOARD', 'PREVIEW', 'DECISION'));

INSERT INTO video_status_transition (from_status, to_status) VALUES
  ('GENERATING_ASSETS', 'AWAITING_STORYBOARD_APPROVAL'),
  ('AWAITING_STORYBOARD_APPROVAL', 'GENERATING_ASSETS'),
  ('AWAITING_STORYBOARD_APPROVAL', 'RENDERING_PREVIEW');

-- Storyboard versions (rounds) allowed per video version: the first plus 3 rounds of notes.
CREATE FUNCTION storyboard_max_rounds() RETURNS integer
LANGUAGE sql IMMUTABLE
AS $$ SELECT 4; $$;

-- The newest episode_code job of a version (any status), or NULL.
CREATE FUNCTION episode_code_latest(p_version_id uuid) RETURNS job
LANGUAGE sql STABLE
AS $$
  SELECT * FROM job
  WHERE video_version_id = p_version_id AND step = 'episode_code' AND status <> 'CANCELLED'
  ORDER BY created_at DESC
  LIMIT 1;
$$;

-- Round of the current storyboard: how many episode_code jobs the version has had.
CREATE FUNCTION storyboard_round(p_version_id uuid) RETURNS integer
LANGUAGE sql STABLE
AS $$
  SELECT count(*)::integer FROM job
  WHERE video_version_id = p_version_id AND step = 'episode_code' AND status <> 'CANCELLED';
$$;

-- The approved content is the whole episode_code output (code, SFX script, board pages): its
-- SHA-256 over every output's path and digest binds a STORYBOARD approval to exactly that code.
CREATE FUNCTION storyboard_payload_hash(p_version_id uuid) RETURNS text
LANGUAGE sql STABLE
AS $$
  SELECT encode(sha256(convert_to(
           string_agg(o->>'path' || ':' || (o->>'sha256'), ',' ORDER BY o->>'path'), 'UTF8')), 'hex')
  FROM jsonb_array_elements(coalesce((episode_code_latest(p_version_id)).output->'outputs', '[]'::jsonb)) o
  WHERE (episode_code_latest(p_version_id)).status = 'SUCCEEDED';
$$;

-- What WF-12 needs to send a storyboard: the job, the worker's board token and the page paths.
CREATE FUNCTION storyboard_board(p_version_id uuid) RETURNS jsonb
LANGUAGE sql STABLE
AS $$
  SELECT jsonb_build_object(
           'job_id', j.id,
           'token', j.output->'result'->>'board_token',
           'pages', coalesce(j.output->'result'->'board_pages', '[]'::jsonb))
  FROM (SELECT (episode_code_latest(p_version_id)).*) j;
$$;

-- A revision of the newest episode code with the owner's notes (same script and timeline).
CREATE FUNCTION episode_code_revision_create(p_version_id uuid, p_feedback text) RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_previous job := episode_code_latest(p_version_id);
  v_input jsonb;
BEGIN
  IF v_previous.id IS NULL OR v_previous.status <> 'SUCCEEDED' THEN
    RAISE EXCEPTION 'version % has no finished episode code to revise', p_version_id;
  END IF;
  v_input := jsonb_build_object(
    'script_job_id', v_previous.input->'script_job_id',
    'timing_job_id', v_previous.input->'timing_job_id',
    'revision', jsonb_build_object('previous_job_id', v_previous.id, 'feedback', p_feedback));
  RETURN job_create(p_version_id, 'episode_code', 'q:render', v_input, md5(v_input::text),
                    '{}'::uuid[], 2);
END;
$$;

-- The 720p episode render (C4) from the approved episode code. No paid call.
CREATE FUNCTION episode_render_job_create(p_version_id uuid) RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_code job := episode_code_latest(p_version_id);
  v_input jsonb;
BEGIN
  IF v_code.id IS NULL OR v_code.status <> 'SUCCEEDED' THEN
    RAISE EXCEPTION 'version % has no finished episode code to render', p_version_id;
  END IF;
  v_input := jsonb_build_object('episode_code_job_id', v_code.id,
                                'timing_job_id', v_code.input->'timing_job_id');
  RETURN job_create(p_version_id, 'render_episode', 'q:render', v_input, md5(v_input::text),
                    '{}'::uuid[], 2);
END;
$$;

-- WF-12: storyboard requests for versions whose newest episode code just succeeded, and
-- reminders for pending ones. Each row is returned once (requests move the version on).
CREATE FUNCTION storyboard_approvals_due(p_remind_every interval DEFAULT interval '6 hours')
RETURNS TABLE (
  kind text,
  video_id uuid,
  version integer,
  video_version_id uuid,
  token text,
  expires_at timestamptz,
  round integer,
  title text,
  board jsonb
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
      AND storyboard_payload_hash(vv.id) IS NOT NULL
    ORDER BY vv.created_at
    FOR UPDATE OF vv SKIP LOCKED
  LOOP
    UPDATE video_version SET status = 'AWAITING_STORYBOARD_APPROVAL' WHERE id = v_row.id;
    v_token := approval_request(v_row.id, 'STORYBOARD', storyboard_payload_hash(v_row.id),
                                interval '72 hours');
    RETURN QUERY
    SELECT 'REQUEST', v_row.video_id, v_row.version, v_row.id, a.token, a.expires_at,
           storyboard_round(v_row.id), script_job_output(v_row.id)->'result'->>'title',
           storyboard_board(v_row.id)
    FROM approval a WHERE a.token = v_token;
  END LOOP;

  RETURN QUERY
  WITH reminded AS (
    UPDATE approval a
    SET last_reminded_at = now()
    WHERE a.type = 'STORYBOARD'
      AND a.status = 'PENDING'
      AND a.expires_at > now()
      AND coalesce(a.last_reminded_at, a.requested_at) <= now() - p_remind_every
    RETURNING a.token, a.expires_at, a.video_version_id
  )
  SELECT 'REMINDER', vv.video_id, vv.version, vv.id, r.token, r.expires_at,
         storyboard_round(vv.id), script_job_output(vv.id)->'result'->>'title', NULL::jsonb
  FROM reminded r JOIN video_version vv ON vv.id = r.video_version_id;
END;
$$;

-- A storyboard button or reply. Result codes as approval_decide, plus EMPTY_NOTE, NOT_SUPPORTED
-- and NEEDS_DECISION (notes after the last round).
CREATE FUNCTION storyboard_decide(p_approval approval, p_user_id bigint, p_action text, p_note text)
RETURNS TABLE (result text, round integer)
LANGUAGE plpgsql
AS $$
#variable_conflict use_column
DECLARE
  v_version_id uuid := p_approval.video_version_id;
  v_result text;
  v_round integer;
BEGIN
  IF p_action = 'REGENERATE' THEN
    RETURN QUERY SELECT 'NOT_SUPPORTED'::text, NULL::integer;
    RETURN;
  END IF;
  IF p_action = 'FEEDBACK' AND btrim(coalesce(p_note, '')) = ''
     AND EXISTS (SELECT 1 FROM approver WHERE telegram_user_id = p_user_id AND active) THEN
    RETURN QUERY SELECT 'EMPTY_NOTE'::text, NULL::integer;
    RETURN;
  END IF;

  v_result := approval_decide(
    p_approval.token, p_user_id,
    CASE p_action WHEN 'APPROVE' THEN 'APPROVED' ELSE 'REJECTED' END,
    coalesce(storyboard_payload_hash(v_version_id), '')
  );
  IF v_result <> 'OK' THEN
    RETURN QUERY SELECT v_result, NULL::integer;
    RETURN;
  END IF;

  IF p_action = 'APPROVE' THEN
    UPDATE video_version SET status = 'RENDERING_PREVIEW' WHERE id = v_version_id;
    PERFORM episode_render_job_create(v_version_id);
    RETURN QUERY SELECT 'OK'::text, storyboard_round(v_version_id);
  ELSIF p_action = 'REJECT' THEN
    UPDATE video_version SET status = 'CANCELLED' WHERE id = v_version_id;
    RETURN QUERY SELECT 'OK'::text, storyboard_round(v_version_id);
  ELSE
    UPDATE approval SET decision_note = left(btrim(p_note), 4000) WHERE id = p_approval.id;
    v_round := storyboard_round(v_version_id) + 1;
    IF v_round > storyboard_max_rounds() THEN
      UPDATE video_version SET status = 'NEEDS_DECISION' WHERE id = v_version_id;
      RETURN QUERY SELECT 'NEEDS_DECISION'::text, v_round - 1;
    ELSE
      UPDATE video_version SET status = 'GENERATING_ASSETS' WHERE id = v_version_id;
      PERFORM episode_code_revision_create(v_version_id, left(btrim(p_note), 4000));
      RETURN QUERY SELECT 'OK'::text, v_round;
    END IF;
  END IF;
END;
$$;

-- WF-06 entry point for every approval button and storyboard reply. Actions: APPROVE, REJECT,
-- REGENERATE (script only), FEEDBACK (storyboard only, with the reply text as p_note).
-- video_id/version are returned only to approvers, so strangers learn nothing.
CREATE FUNCTION telegram_decide(p_token text, p_user_id bigint, p_action text, p_note text DEFAULT NULL)
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
  SELECT * INTO v_approval FROM approval WHERE token = p_token;

  IF NOT FOUND OR v_approval.type <> 'STORYBOARD' THEN
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

  SELECT d.result, d.round INTO v_result, v_round
  FROM storyboard_decide(v_approval, p_user_id, p_action, p_note) d;
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

-- Fails while a version or approval uses the storyboard values: decide or cancel them first.
DROP FUNCTION telegram_decide(text, bigint, text, text);
DROP FUNCTION storyboard_decide(approval, bigint, text, text);
DROP FUNCTION storyboard_approvals_due(interval);
DROP FUNCTION episode_render_job_create(uuid);
DROP FUNCTION episode_code_revision_create(uuid, text);
DROP FUNCTION storyboard_board(uuid);
DROP FUNCTION storyboard_payload_hash(uuid);
DROP FUNCTION storyboard_round(uuid);
DROP FUNCTION episode_code_latest(uuid);
DROP FUNCTION storyboard_max_rounds();
DELETE FROM video_status_transition
WHERE (from_status, to_status) IN (('GENERATING_ASSETS', 'AWAITING_STORYBOARD_APPROVAL'),
                                   ('AWAITING_STORYBOARD_APPROVAL', 'GENERATING_ASSETS'),
                                   ('AWAITING_STORYBOARD_APPROVAL', 'RENDERING_PREVIEW'));
ALTER TABLE approval DROP CONSTRAINT approval_type_check;
ALTER TABLE approval ADD CONSTRAINT approval_type_check
  CHECK (type IN ('SCRIPT', 'PREVIEW', 'DECISION'));
ALTER TABLE video_version DROP CONSTRAINT video_version_status_check;
ALTER TABLE video_version ADD CONSTRAINT video_version_status_check CHECK (status IN (
  'BRIEF_SUBMITTED', 'SCRIPTING', 'AWAITING_SCRIPT_APPROVAL', 'GENERATING_ASSETS',
  'RENDERING_PREVIEW', 'QA_RUNNING', 'AWAITING_PREVIEW_APPROVAL', 'RENDERING_FINAL',
  'ARCHIVING', 'ARCHIVE_VERIFIED', 'COMPLETED',
  'NEEDS_DECISION', 'BLOCKED_PROVIDER',
  'SUPERSEDED', 'FAILED', 'CANCELLED'
));
