-- migrate:up

-- After the final render (D-062, docs/episode-pipeline.md §10). WF-14 polls final_due():
-- 1. a finished render_final gets qa_final (the 1080p file checked like the preview) and metadata
--    (Claude writes the Vietnamese title, description and tags and picks the thumbnail shot; the
--    worker grabs that frame);
-- 2. both done -> AWAITING_METADATA_APPROVAL and an A3 request (type METADATA) on Telegram;
--    Approve -> ARCHIVING and the archive job; Viết lại or a reply with notes -> a new metadata job;
-- 3. the archive job verified the copy on Google Drive (D-063) -> archive_record, ARCHIVE_VERIFIED,
--    a final message with the cost report and a CLEANUP request: only the owner can approve deleting
--    the Mac copy, and the cleanup job re-verifies Drive first. Approved and done, rejected or
--    expired -> COMPLETED. Nothing on the Mac is deleted without that approval.

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
ALTER TABLE approval DROP CONSTRAINT approval_type_check;
ALTER TABLE approval ADD CONSTRAINT approval_type_check
  CHECK (type IN ('SCRIPT', 'STORYBOARD', 'PREVIEW', 'METADATA', 'CLEANUP', 'DECISION'));

INSERT INTO video_status_transition (from_status, to_status) VALUES
  ('RENDERING_FINAL', 'AWAITING_METADATA_APPROVAL'),
  ('AWAITING_METADATA_APPROVAL', 'RENDERING_FINAL'),
  ('AWAITING_METADATA_APPROVAL', 'ARCHIVING');

-- Metadata versions allowed per final render: the first plus 5 rewrites.
CREATE FUNCTION metadata_max_rounds() RETURNS integer
LANGUAGE sql IMMUTABLE
AS $$ SELECT 6; $$;

CREATE FUNCTION final_render(p_version_id uuid) RETURNS job
LANGUAGE sql STABLE
AS $$ SELECT (job_latest(p_version_id, 'render_final')).*; $$;

-- A job of the current final render (qa_final, metadata), or NULL.
CREATE FUNCTION final_step(p_version_id uuid, p_step text) RETURNS job
LANGUAGE sql STABLE
AS $$
  SELECT j.* FROM (SELECT (job_latest(p_version_id, p_step)).*) j
  WHERE j.id IS NOT NULL
    AND j.input->>'render_job_id' = (final_render(p_version_id)).id::text;
$$;

CREATE FUNCTION metadata_round(p_version_id uuid) RETURNS integer
LANGUAGE sql STABLE
AS $$
  SELECT count(*)::integer FROM job
  WHERE video_version_id = p_version_id AND step = 'metadata' AND status <> 'CANCELLED'
    AND input->>'render_job_id' = (final_render(p_version_id)).id::text;
$$;

-- A3 binds the metadata (and its thumbnail) and the final render: SHA-256 over their outputs.
CREATE FUNCTION metadata_payload_hash(p_version_id uuid) RETURNS text
LANGUAGE sql STABLE
AS $$
  SELECT encode(sha256(convert_to(
           string_agg(o->>'path' || ':' || (o->>'sha256'), ',' ORDER BY o->>'path'), 'UTF8')), 'hex')
  FROM jsonb_array_elements(
         coalesce((final_step(p_version_id, 'metadata')).output->'outputs', '[]'::jsonb)
         || coalesce((final_render(p_version_id)).output->'outputs', '[]'::jsonb)) o
  WHERE (final_step(p_version_id, 'metadata')).status = 'SUCCEEDED'
    AND (final_render(p_version_id)).status = 'SUCCEEDED';
$$;

-- The metadata job of the final render; a rewrite carries the previous job and the owner's notes.
CREATE FUNCTION metadata_job_create(p_version_id uuid, p_feedback text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_render job := final_render(p_version_id);
  v_previous job := final_step(p_version_id, 'metadata');
  v_input jsonb;
BEGIN
  IF v_render.id IS NULL OR v_render.status <> 'SUCCEEDED' THEN
    RAISE EXCEPTION 'version % has no finished final render', p_version_id;
  END IF;
  v_input := jsonb_build_object(
    'script_job_id', (episode_code_latest(p_version_id)).input->'script_job_id',
    'timing_job_id', v_render.input->'timing_job_id',
    'render_job_id', v_render.id,
    'round', metadata_round(p_version_id) + 1);
  IF v_previous.id IS NOT NULL THEN
    v_input := v_input || jsonb_build_object('revision', jsonb_build_object(
      'previous_job_id', v_previous.id, 'feedback', coalesce(p_feedback, '')));
  END IF;
  RETURN job_create(p_version_id, 'metadata', 'q:light', v_input, md5(v_input::text),
                    '{}'::uuid[], 2);
END;
$$;

CREATE FUNCTION final_jobs_create(p_version_id uuid) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_render job := final_render(p_version_id);
  v_input jsonb := jsonb_build_object('render_job_id', v_render.id,
                                      'timing_job_id', v_render.input->'timing_job_id',
                                      'quality', 'final');
BEGIN
  PERFORM job_create(p_version_id, 'qa_final', 'q:light', v_input, md5(v_input::text),
                     '{}'::uuid[], 2);
  PERFORM metadata_job_create(p_version_id);
END;
$$;

-- Everything the archive gathers, by job (q:heavy: a long upload must not hold up scripts).
CREATE FUNCTION archive_job_create(p_version_id uuid) RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_code job := episode_code_latest(p_version_id);
  v_input jsonb;
BEGIN
  -- Path and freeze time are fixed here, so a retried archive builds the same manifest and finds
  -- an earlier verified copy instead of making another one.
  SELECT jsonb_build_object(
           'video_id', vv.video_id::text,
           'version', vv.version,
           'remote_dir', to_char(now() AT TIME ZONE 'UTC', 'YYYY/MM') || '/' || vv.video_id
                         || '/v' || vv.version,
           'frozen_at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
           'script_job_id', v_code.input->'script_job_id',
           'timing_job_id', v_code.input->'timing_job_id',
           'episode_code_job_id', v_code.id,
           'preview_render_job_id', (preview_render(p_version_id)).id,
           'preview_qa_job_id', (preview_qa(p_version_id)).id,
           'final_render_job_id', (final_render(p_version_id)).id,
           'final_qa_job_id', (final_step(p_version_id, 'qa_final')).id,
           'metadata_job_id', (final_step(p_version_id, 'metadata')).id,
           'approvals', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                           'type', a.type, 'decided_at', a.decided_at, 'decided_by', a.decided_by)
                           ORDER BY a.decided_at), '[]'::jsonb)
                         FROM approval a
                         WHERE a.video_version_id = p_version_id AND a.status = 'APPROVED'))
  INTO v_input
  FROM video_version vv WHERE vv.id = p_version_id;
  RETURN job_create(p_version_id, 'archive', 'q:heavy', v_input, md5(v_input::text),
                    '{}'::uuid[], 3);
END;
$$;

-- What the cost report says: money by currency and the agent's time.
CREATE FUNCTION video_cost_report(p_version_id uuid) RETURNS jsonb
LANGUAGE sql STABLE
AS $$
  SELECT jsonb_build_object(
    'cost', (SELECT coalesce(jsonb_object_agg(c.currency, c.total), '{}'::jsonb)
             FROM (SELECT trim(currency) AS currency, sum(amount)::float8 AS total
                   FROM cost_entry
                   WHERE video_version_id = p_version_id AND kind = 'ACTUAL'
                   GROUP BY currency) c),
    'agent_minutes', (SELECT round(coalesce(sum((output->'result'->>'agent_ms')::numeric), 0) / 60000, 1)
                      FROM job
                      WHERE video_version_id = p_version_id AND step = 'episode_code'
                        AND status = 'SUCCEEDED'),
    'jobs', (SELECT count(*) FROM job WHERE video_version_id = p_version_id AND status = 'SUCCEEDED'));
$$;

-- WF-14. Moves finished final renders and archives on; returns A3 requests (REQUEST), reminders
-- (REMINDER) and finished videos (DONE). Each REQUEST and DONE row is returned once.
CREATE FUNCTION final_due(p_remind_every interval DEFAULT interval '6 hours')
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
    RETURN QUERY
    SELECT 'REQUEST', v_row.video_id, v_row.version, v_row.id, a.token, a.expires_at,
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
             'local_bytes', (v_archive.output->'result'->>'local_bytes')::bigint)
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

-- An A3 button or reply: APPROVE archives; REGENERATE (Viết lại) or FEEDBACK (a reply with notes)
-- writes the metadata again; REJECT is not offered. Result codes as storyboard_decide.
CREATE FUNCTION metadata_decide(p_approval approval, p_user_id bigint, p_action text, p_note text)
RETURNS TABLE (result text, round integer)
LANGUAGE plpgsql
AS $$
#variable_conflict use_column
DECLARE
  v_version_id uuid := p_approval.video_version_id;
  v_result text;
BEGIN
  IF p_action = 'REJECT' THEN
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
    coalesce(metadata_payload_hash(v_version_id), '')
  );
  IF v_result <> 'OK' THEN
    RETURN QUERY SELECT v_result, NULL::integer;
    RETURN;
  END IF;

  IF p_action = 'APPROVE' THEN
    UPDATE video_version SET status = 'ARCHIVING' WHERE id = v_version_id;
    PERFORM archive_job_create(v_version_id);
    RETURN QUERY SELECT 'OK'::text, metadata_round(v_version_id);
    RETURN;
  END IF;
  IF metadata_round(v_version_id) >= metadata_max_rounds() THEN
    UPDATE video_version SET status = 'NEEDS_DECISION' WHERE id = v_version_id;
    RETURN QUERY SELECT 'NEEDS_DECISION'::text, metadata_round(v_version_id);
    RETURN;
  END IF;
  IF p_action = 'FEEDBACK' THEN
    UPDATE approval SET decision_note = left(btrim(p_note), 4000) WHERE id = p_approval.id;
  END IF;
  UPDATE video_version SET status = 'RENDERING_FINAL' WHERE id = v_version_id;
  PERFORM metadata_job_create(v_version_id,
                              CASE WHEN p_action = 'FEEDBACK' THEN left(btrim(p_note), 4000) END);
  RETURN QUERY SELECT 'OK'::text, metadata_round(v_version_id);
END;
$$;

-- The owner's answer to "delete the Mac copy?" (CLEANUP, D-063). APPROVE creates the cleanup job
-- (it re-verifies the archive before deleting); REJECT keeps the copy. Only the owner decides.
CREATE FUNCTION cleanup_decide(p_approval approval, p_user_id bigint, p_action text)
RETURNS TABLE (result text, round integer)
LANGUAGE plpgsql
AS $$
#variable_conflict use_column
DECLARE
  v_version_id uuid := p_approval.video_version_id;
  v_record archive_record%ROWTYPE;
  v_result text;
  v_input jsonb;
BEGIN
  IF p_action NOT IN ('APPROVE', 'REJECT') THEN
    RETURN QUERY SELECT 'NOT_SUPPORTED'::text, NULL::integer;
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM approver WHERE telegram_user_id = p_user_id AND active)
     AND NOT is_owner(p_user_id) THEN
    RETURN QUERY SELECT 'NOT_OWNER'::text, NULL::integer;
    RETURN;
  END IF;
  SELECT * INTO v_record FROM archive_record WHERE video_version_id = v_version_id;
  v_result := approval_decide(
    p_approval.token, p_user_id,
    CASE p_action WHEN 'APPROVE' THEN 'APPROVED' ELSE 'REJECTED' END,
    coalesce(v_record.manifest_sha256, ''));
  IF v_result <> 'OK' THEN
    RETURN QUERY SELECT v_result, NULL::integer;
    RETURN;
  END IF;

  IF p_action = 'REJECT' THEN
    UPDATE video_version SET status = 'COMPLETED' WHERE id = v_version_id;
  ELSE
    SELECT jsonb_build_object('video_id', vv.video_id::text, 'version', vv.version,
                              'target', v_record.target, 'remote_dir', v_record.path,
                              'manifest_sha256', v_record.manifest_sha256)
    INTO v_input FROM video_version vv WHERE vv.id = v_version_id;
    PERFORM job_create(v_version_id, 'cleanup', 'q:heavy', v_input, md5(v_input::text),
                       '{}'::uuid[], 2);
  END IF;
  RETURN QUERY SELECT 'OK'::text, NULL::integer;
END;
$$;

-- Same as 20261104000100 plus METADATA (metadata_decide) and CLEANUP (cleanup_decide) approvals.
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

-- migrate:down

-- Restores telegram_decide of 20261104000100; fails while a version is AWAITING_METADATA_APPROVAL
-- or an approval is of type METADATA or CLEANUP (decide or cancel them first).
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

  IF NOT FOUND OR v_approval.type NOT IN ('STORYBOARD', 'PREVIEW') THEN
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

  IF v_approval.type = 'PREVIEW' THEN
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
DROP FUNCTION cleanup_decide(approval, bigint, text);
DROP FUNCTION metadata_decide(approval, bigint, text, text);
DROP FUNCTION final_due(interval);
DROP FUNCTION video_cost_report(uuid);
DROP FUNCTION archive_job_create(uuid);
DROP FUNCTION final_jobs_create(uuid);
DROP FUNCTION metadata_job_create(uuid, text);
DROP FUNCTION metadata_payload_hash(uuid);
DROP FUNCTION metadata_round(uuid);
DROP FUNCTION final_step(uuid, text);
DROP FUNCTION final_render(uuid);
DROP FUNCTION metadata_max_rounds();
DELETE FROM video_status_transition
WHERE (from_status, to_status) IN (('RENDERING_FINAL', 'AWAITING_METADATA_APPROVAL'),
                                   ('AWAITING_METADATA_APPROVAL', 'RENDERING_FINAL'),
                                   ('AWAITING_METADATA_APPROVAL', 'ARCHIVING'));
ALTER TABLE approval DROP CONSTRAINT approval_type_check;
ALTER TABLE approval ADD CONSTRAINT approval_type_check
  CHECK (type IN ('SCRIPT', 'STORYBOARD', 'PREVIEW', 'DECISION'));
ALTER TABLE video_version DROP CONSTRAINT video_version_status_check;
ALTER TABLE video_version ADD CONSTRAINT video_version_status_check CHECK (status IN (
  'BRIEF_SUBMITTED', 'SCRIPTING', 'AWAITING_SCRIPT_APPROVAL', 'GENERATING_ASSETS',
  'AWAITING_STORYBOARD_APPROVAL',
  'RENDERING_PREVIEW', 'QA_RUNNING', 'AWAITING_PREVIEW_APPROVAL', 'RENDERING_FINAL',
  'ARCHIVING', 'ARCHIVE_VERIFIED', 'COMPLETED',
  'NEEDS_DECISION', 'BLOCKED_PROVIDER',
  'SUPERSEDED', 'FAILED', 'CANCELLED'
));
