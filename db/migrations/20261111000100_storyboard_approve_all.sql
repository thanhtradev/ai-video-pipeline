-- migrate:up

-- "Render final" on the storyboard (D-076): one tap approves the storyboard and pre-approves A2
-- (preview) and A3 (metadata) of that storyboard's code. Each of them is still requested, bound to
-- its own payload hash, and decided in the name of the approver who tapped Render final, but only when
-- its QA passed without warnings; a WARN sends the normal buttons, a FAIL needs a decision as
-- before. Notes on a later request start a new storyboard round, whose request clears the
-- pre-approval (the newest storyboard approval is the one that counts). CLEANUP is never automatic.

ALTER TABLE approval ADD COLUMN approve_all boolean NOT NULL DEFAULT false;

-- Who pre-approved the version's current storyboard with Render final, or NULL.
CREATE FUNCTION approve_all_by(p_version_id uuid) RETURNS bigint
LANGUAGE sql STABLE
AS $$
  SELECT CASE WHEN a.status = 'APPROVED' AND a.approve_all THEN a.decided_by END
  FROM approval a
  WHERE a.video_version_id = p_version_id AND a.type = 'STORYBOARD'
  ORDER BY a.requested_at DESC
  LIMIT 1;
$$;

-- Decides a just-requested PREVIEW or METADATA approval for the Render final approver when its QA
-- level is PASS. Returns true when it was approved; false leaves the request pending for Telegram.
CREATE FUNCTION approval_auto_decide(p_token text, p_qa_level text) RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  v_approval approval%ROWTYPE;
  v_by bigint;
  v_result text;
BEGIN
  SELECT * INTO v_approval FROM approval WHERE token = p_token;
  v_by := approve_all_by(v_approval.video_version_id);
  IF v_by IS NULL OR p_qa_level IS DISTINCT FROM 'PASS' THEN
    RETURN false;
  END IF;

  IF v_approval.type = 'PREVIEW' THEN
    SELECT d.result INTO v_result FROM preview_decide(v_approval, v_by, 'APPROVE', NULL) d;
  ELSIF v_approval.type = 'METADATA' THEN
    SELECT d.result INTO v_result FROM metadata_decide(v_approval, v_by, 'APPROVE', NULL) d;
  ELSE
    RAISE EXCEPTION 'approval type % is never decided automatically', v_approval.type;
  END IF;
  IF v_result = 'OK' THEN
    PERFORM audit('approve-all', 'approval_auto', 'approval', v_approval.id::text,
                  jsonb_build_object('type', v_approval.type, 'decided_by', v_by,
                                     'video_version_id', v_approval.video_version_id));
  END IF;
  -- approval_decide sets the actor to the approver; the rest of the caller's loop is not theirs.
  PERFORM set_config('app.actor', 'approval-request', true);
  RETURN v_result = 'OK';
END;
$$;

-- The Render final button: storyboard_decide's APPROVE plus the pre-approval. Result codes as
-- storyboard_decide; NOT_SUPPORTED on any other request.
CREATE FUNCTION storyboard_approve_all(p_token text, p_user_id bigint)
RETURNS TABLE (result text, video_id uuid, version integer, round integer)
LANGUAGE plpgsql
AS $$
#variable_conflict use_column
DECLARE
  v_approval approval%ROWTYPE;
  v_result text;
  v_round integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM approver WHERE telegram_user_id = p_user_id AND active) THEN
    RETURN QUERY SELECT 'NOT_ALLOWED'::text, NULL::uuid, NULL::integer, NULL::integer;
    RETURN;
  END IF;
  SELECT * INTO v_approval FROM approval WHERE token = p_token;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'NOT_FOUND'::text, NULL::uuid, NULL::integer, NULL::integer;
    RETURN;
  END IF;
  IF v_approval.type <> 'STORYBOARD' THEN
    RETURN QUERY SELECT 'NOT_SUPPORTED'::text, NULL::uuid, NULL::integer, NULL::integer;
    RETURN;
  END IF;

  SELECT d.result, d.round INTO v_result, v_round
  FROM storyboard_decide(v_approval, p_user_id, 'APPROVE', NULL) d;
  IF v_result = 'OK' THEN
    UPDATE approval SET approve_all = true WHERE id = v_approval.id;
  END IF;
  RETURN QUERY
  SELECT v_result, vv.video_id, vv.version, v_round
  FROM video_version vv WHERE vv.id = v_approval.video_version_id;
END;
$$;

-- Same as 20261101000100; a REQUEST whose QA passed is AUTO when the storyboard was Render final
-- (already approved, the 1080p render started; WF-13 sends the preview without buttons).
CREATE OR REPLACE FUNCTION preview_approvals_due(p_remind_every interval DEFAULT interval '6 hours')
RETURNS TABLE (
  kind text,
  video_id uuid,
  version integer,
  video_version_id uuid,
  token text,
  expires_at timestamptz,
  round integer,
  title text,
  cost jsonb,
  media jsonb
)
LANGUAGE plpgsql
AS $$
#variable_conflict use_column
DECLARE
  v_row record;
  v_token text;
  v_kind text;
BEGIN
  PERFORM set_config('app.actor', 'approval-request', true);

  FOR v_row IN
    SELECT vv.id FROM video_version vv
    WHERE vv.status = 'RENDERING_PREVIEW'
      AND vv.brief->>'format' = 'episode'
      AND preview_payload_hash(vv.id) IS NOT NULL
      AND (preview_qa(vv.id)).id IS NULL
    ORDER BY vv.created_at
    FOR UPDATE OF vv SKIP LOCKED
  LOOP
    UPDATE video_version SET status = 'QA_RUNNING' WHERE id = v_row.id;
    PERFORM preview_qa_job_create(v_row.id);
  END LOOP;

  FOR v_row IN
    SELECT vv.id, vv.video_id, vv.version FROM video_version vv
    WHERE vv.status = 'QA_RUNNING'
      AND vv.brief->>'format' = 'episode'
      AND (preview_qa(vv.id)).status = 'SUCCEEDED'
    ORDER BY vv.created_at
    FOR UPDATE OF vv SKIP LOCKED
  LOOP
    UPDATE video_version SET status = 'AWAITING_PREVIEW_APPROVAL' WHERE id = v_row.id;
    v_token := approval_request(v_row.id, 'PREVIEW', preview_payload_hash(v_row.id),
                                interval '72 hours');
    v_kind := CASE WHEN approval_auto_decide(v_token, (preview_qa(v_row.id)).output->'result'->>'level')
                   THEN 'AUTO' ELSE 'REQUEST' END;
    RETURN QUERY
    SELECT v_kind, v_row.video_id, v_row.version, v_row.id, a.token, a.expires_at,
           storyboard_round(v_row.id), script_job_output(v_row.id)->'result'->>'title',
           (SELECT coalesce(jsonb_object_agg(c.currency, c.total), '{}'::jsonb)
            FROM (SELECT trim(currency) AS currency, sum(amount)::float8 AS total
                  FROM cost_entry
                  WHERE video_version_id = v_row.id AND kind = 'ACTUAL'
                  GROUP BY currency) c),
           preview_media(v_row.id)
    FROM approval a WHERE a.token = v_token;
  END LOOP;

  RETURN QUERY
  WITH reminded AS (
    UPDATE approval a
    SET last_reminded_at = now()
    WHERE a.type = 'PREVIEW'
      AND a.status = 'PENDING'
      AND a.expires_at > now()
      AND coalesce(a.last_reminded_at, a.requested_at) <= now() - p_remind_every
    RETURNING a.token, a.expires_at, a.video_version_id
  )
  SELECT 'REMINDER', vv.video_id, vv.version, vv.id, r.token, r.expires_at,
         storyboard_round(vv.id), script_job_output(vv.id)->'result'->>'title', NULL::jsonb,
         NULL::jsonb
  FROM reminded r JOIN video_version vv ON vv.id = r.video_version_id;
END;
$$;

-- Same as 20261109000100; an A3 REQUEST whose final QA passed is AUTO when the storyboard was
-- Render final (already approved, archiving; WF-14 sends the thumbnail and metadata without buttons).
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

-- Same as 20261108000100 plus APPROVE_ALL (storyboard Render final, storyboard_approve_all).
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
  IF p_action NOT IN ('APPROVE', 'APPROVE_ALL', 'REJECT', 'REGENERATE', 'FEEDBACK') THEN
    RAISE EXCEPTION 'invalid action %', p_action;
  END IF;
  IF p_action = 'APPROVE_ALL' THEN
    RETURN QUERY SELECT d.result, d.video_id, d.version, d.round
                 FROM storyboard_approve_all(p_token, p_user_id) d;
    RETURN;
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

-- Pre-approved versions keep going: their A2/A3 were already decided. Pending ones get buttons.
-- Restores telegram_decide of 20261108000100.
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

-- Restores final_due of 20261109000100.
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

-- Restores preview_approvals_due of 20261101000100.
CREATE OR REPLACE FUNCTION preview_approvals_due(p_remind_every interval DEFAULT interval '6 hours')
RETURNS TABLE (
  kind text,
  video_id uuid,
  version integer,
  video_version_id uuid,
  token text,
  expires_at timestamptz,
  round integer,
  title text,
  cost jsonb,
  media jsonb
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
    SELECT vv.id FROM video_version vv
    WHERE vv.status = 'RENDERING_PREVIEW'
      AND vv.brief->>'format' = 'episode'
      AND preview_payload_hash(vv.id) IS NOT NULL
      AND (preview_qa(vv.id)).id IS NULL
    ORDER BY vv.created_at
    FOR UPDATE OF vv SKIP LOCKED
  LOOP
    UPDATE video_version SET status = 'QA_RUNNING' WHERE id = v_row.id;
    PERFORM preview_qa_job_create(v_row.id);
  END LOOP;

  FOR v_row IN
    SELECT vv.id, vv.video_id, vv.version FROM video_version vv
    WHERE vv.status = 'QA_RUNNING'
      AND vv.brief->>'format' = 'episode'
      AND (preview_qa(vv.id)).status = 'SUCCEEDED'
    ORDER BY vv.created_at
    FOR UPDATE OF vv SKIP LOCKED
  LOOP
    UPDATE video_version SET status = 'AWAITING_PREVIEW_APPROVAL' WHERE id = v_row.id;
    v_token := approval_request(v_row.id, 'PREVIEW', preview_payload_hash(v_row.id),
                                interval '72 hours');
    RETURN QUERY
    SELECT 'REQUEST', v_row.video_id, v_row.version, v_row.id, a.token, a.expires_at,
           storyboard_round(v_row.id), script_job_output(v_row.id)->'result'->>'title',
           (SELECT coalesce(jsonb_object_agg(c.currency, c.total), '{}'::jsonb)
            FROM (SELECT trim(currency) AS currency, sum(amount)::float8 AS total
                  FROM cost_entry
                  WHERE video_version_id = v_row.id AND kind = 'ACTUAL'
                  GROUP BY currency) c),
           preview_media(v_row.id)
    FROM approval a WHERE a.token = v_token;
  END LOOP;

  RETURN QUERY
  WITH reminded AS (
    UPDATE approval a
    SET last_reminded_at = now()
    WHERE a.type = 'PREVIEW'
      AND a.status = 'PENDING'
      AND a.expires_at > now()
      AND coalesce(a.last_reminded_at, a.requested_at) <= now() - p_remind_every
    RETURNING a.token, a.expires_at, a.video_version_id
  )
  SELECT 'REMINDER', vv.video_id, vv.version, vv.id, r.token, r.expires_at,
         storyboard_round(vv.id), script_job_output(vv.id)->'result'->>'title', NULL::jsonb,
         NULL::jsonb
  FROM reminded r JOIN video_version vv ON vv.id = r.video_version_id;
END;
$$;

DROP FUNCTION storyboard_approve_all(text, bigint);
DROP FUNCTION approval_auto_decide(text, text);
DROP FUNCTION approve_all_by(uuid);
ALTER TABLE approval DROP COLUMN approve_all;
