-- migrate:up

-- /auto <video id> (D-093, docs/quality-and-approval.md): an approver turns on automatic approval
-- for the current version of a video. Every gate still requested from then on — SCRIPT (A1), VOICE
-- (A1b), STORYBOARD, PREVIEW (A2) and METADATA (A3) — is requested as usual, bound to its own
-- payload hash, and approved at once in that approver's name (audit approval_auto), while they are
-- still an active approver. A QA WARN is approved too; a QA FAIL leaves the normal request. CLEANUP
-- (deleting the Mac copy) is never automatic. /auto on a video already waiting at a gate approves
-- that gate immediately; /auto <id> off clears it. A new version starts without it.
--
-- Also: final.mp4 now rides on the first A3 request of final_due() (metadata.final) instead of the
-- DONE row, so WF-14 sends it before the Google Drive archive starts (D-093, was D-073).
--
-- Rollback: drops the two columns (who turned /auto on is lost; the decisions stay recorded in
-- approval and audit_log) and restores the previous functions.

ALTER TABLE video_version
  ADD COLUMN auto_approve_by bigint,
  ADD COLUMN auto_approve_at timestamptz;

-- Who turned /auto on for the version, while they are still an active approver; else NULL.
CREATE FUNCTION auto_approve_active_by(p_version_id uuid) RETURNS bigint
LANGUAGE sql STABLE
AS $$
  SELECT vv.auto_approve_by
  FROM video_version vv
  JOIN approver a ON a.telegram_user_id = vv.auto_approve_by AND a.active
  WHERE vv.id = p_version_id;
$$;

-- The QA level a PREVIEW or METADATA request was made on; NULL for the gates without QA.
CREATE FUNCTION approval_qa_level(p_approval approval) RETURNS text
LANGUAGE sql STABLE
AS $$
  SELECT CASE p_approval.type
    WHEN 'PREVIEW' THEN (preview_qa(p_approval.video_version_id)).output->'result'->>'level'
    WHEN 'METADATA' THEN (final_step(p_approval.video_version_id, 'qa_final')).output->'result'->>'level'
  END;
$$;

-- Decides a just-requested approval automatically, or returns false and leaves it pending for
-- Telegram. /auto (D-093): any gate but CLEANUP/DECISION unless its QA FAILed. Render final
-- (D-076, as 20261111000100): PREVIEW and METADATA when their QA is PASS. Decided through
-- telegram_decide, exactly as the button would be.
CREATE OR REPLACE FUNCTION approval_auto_decide(p_token text, p_qa_level text)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  v_approval approval%ROWTYPE;
  v_by bigint;
  v_actor text;
  v_result text;
BEGIN
  SELECT * INTO v_approval FROM approval WHERE token = p_token;
  IF NOT FOUND OR v_approval.type NOT IN ('SCRIPT', 'VOICE', 'STORYBOARD', 'PREVIEW', 'METADATA') THEN
    RETURN false;
  END IF;

  v_by := auto_approve_active_by(v_approval.video_version_id);
  IF v_by IS NOT NULL AND p_qa_level IS DISTINCT FROM 'FAIL' THEN
    v_actor := 'auto-approve';
  ELSIF v_approval.type IN ('PREVIEW', 'METADATA') AND p_qa_level = 'PASS' THEN
    v_by := approve_all_by(v_approval.video_version_id);
    v_actor := 'approve-all';
  ELSE
    v_by := NULL;
  END IF;
  IF v_by IS NULL THEN
    RETURN false;
  END IF;

  SELECT d.result INTO v_result FROM telegram_decide(p_token, v_by, 'APPROVE') d;
  IF v_result = 'OK' THEN
    PERFORM audit(v_actor, 'approval_auto', 'approval', v_approval.id::text,
                  jsonb_build_object('type', v_approval.type, 'decided_by', v_by,
                                     'qa_level', p_qa_level,
                                     'video_version_id', v_approval.video_version_id));
  END IF;
  -- The decision sets the actor to the approver; the rest of the caller's loop is not theirs.
  PERFORM set_config('app.actor', 'approval-request', true);
  RETURN v_result = 'OK';
END;
$$;


-- Same as 20261107000100; AUTO when /auto approved the request just made.
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
  v_kind text;
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
    v_kind := CASE WHEN approval_auto_decide(v_token, NULL) THEN 'AUTO' ELSE 'REQUEST' END;
    RETURN QUERY
    SELECT v_kind, v_row.video_id, v_row.version, v_row.id, a.token, a.expires_at,
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

-- Same as 20261108000100; AUTO when /auto approved the request just made.
CREATE OR REPLACE FUNCTION voice_approvals_due(p_remind_every interval DEFAULT interval '6 hours')
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
  v_kind text;
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
    v_kind := CASE WHEN approval_auto_decide(v_token, NULL) THEN 'AUTO' ELSE 'REQUEST' END;
    RETURN QUERY
    SELECT v_kind, v_row.video_id, v_row.version, v_row.id, a.token, a.expires_at,
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

-- Same as 20261029000100; AUTO when /auto approved the request just made.
CREATE OR REPLACE FUNCTION storyboard_approvals_due(p_remind_every interval DEFAULT interval '6 hours')
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
  v_kind text;
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
    v_kind := CASE WHEN approval_auto_decide(v_token, NULL) THEN 'AUTO' ELSE 'REQUEST' END;
    RETURN QUERY
    SELECT v_kind, v_row.video_id, v_row.version, v_row.id, a.token, a.expires_at,
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

-- Same as 20261116000100, with final.mp4 on the first A3 request instead of the DONE row.
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
                   -- final.mp4 with the first A3 request, so it reaches Telegram before the
                   -- archive; a metadata rewrite does not upload it again (D-093).
                   || CASE WHEN metadata_round(v_row.id) = 1 AND final_video(v_row.id) IS NOT NULL
                           THEN jsonb_build_object('final', final_video(v_row.id))
                           ELSE '{}'::jsonb END
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

-- /auto <prefix> [off] from Telegram (WF-06). Results: NOT_APPROVER, NOT_FOUND, AMBIGUOUS,
-- NOT_ACTIVE (the version is archiving or finished: nothing left to approve), OK (on; decided_type
-- is the pending gate approved now, if any) and OFF.
CREATE FUNCTION telegram_auto(p_user_id bigint, p_prefix text, p_enable boolean DEFAULT true)
RETURNS TABLE (result text, video_id uuid, version integer, status text, decided_type text)
LANGUAGE plpgsql
AS $$
#variable_conflict use_column
DECLARE
  v_prefix text := lower(btrim(coalesce(p_prefix, '')));
  v_count integer;
  v_video_id uuid;
  v_version_id uuid;
  v_version integer;
  v_status text;
  v_pending approval%ROWTYPE;
  v_decided text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM approver WHERE telegram_user_id = p_user_id AND active) THEN
    RETURN QUERY SELECT 'NOT_APPROVER'::text, NULL::uuid, NULL::integer, NULL::text, NULL::text;
    RETURN;
  END IF;

  IF v_prefix ~ '^[0-9a-f-]{4,36}$' THEN
    SELECT count(*) INTO v_count FROM video v WHERE v.id::text LIKE v_prefix || '%';
  ELSE
    v_count := 0;
  END IF;
  IF v_count <> 1 THEN
    RETURN QUERY SELECT CASE WHEN v_count = 0 THEN 'NOT_FOUND' ELSE 'AMBIGUOUS' END,
      NULL::uuid, NULL::integer, NULL::text, NULL::text;
    RETURN;
  END IF;

  SELECT v.id, vv.id, vv.version, vv.status INTO v_video_id, v_version_id, v_version, v_status
  FROM video v
  JOIN video_version vv ON vv.video_id = v.id AND vv.version = v.current_version
  WHERE v.id::text LIKE v_prefix || '%'
  FOR UPDATE OF vv;

  PERFORM set_config('app.actor', 'telegram:' || p_user_id, true);
  IF NOT p_enable THEN
    UPDATE video_version SET auto_approve_by = NULL, auto_approve_at = NULL WHERE id = v_version_id;
    PERFORM audit('telegram:' || p_user_id, 'auto_approve_off', 'video_version',
                  v_version_id::text, '{}'::jsonb);
    RETURN QUERY SELECT 'OFF'::text, v_video_id, v_version, v_status, NULL::text;
    RETURN;
  END IF;

  IF v_status IN ('ARCHIVING', 'ARCHIVE_VERIFIED', 'COMPLETED', 'SUPERSEDED', 'FAILED',
                  'CANCELLED') THEN
    RETURN QUERY SELECT 'NOT_ACTIVE'::text, v_video_id, v_version, v_status, NULL::text;
    RETURN;
  END IF;

  UPDATE video_version SET auto_approve_by = p_user_id, auto_approve_at = now()
  WHERE id = v_version_id;
  PERFORM audit('telegram:' || p_user_id, 'auto_approve_on', 'video_version',
                v_version_id::text, jsonb_build_object('status', v_status));

  SELECT * INTO v_pending FROM approval a
  WHERE a.video_version_id = v_version_id AND a.status = 'PENDING' AND a.expires_at > now()
    AND a.type IN ('SCRIPT', 'VOICE', 'STORYBOARD', 'PREVIEW', 'METADATA')
  ORDER BY a.requested_at DESC
  LIMIT 1;
  IF FOUND AND approval_auto_decide(v_pending.token, approval_qa_level(v_pending)) THEN
    v_decided := v_pending.type;
  END IF;

  RETURN QUERY
  SELECT 'OK'::text, v_video_id, v_version, vv.status, v_decided
  FROM video_version vv WHERE vv.id = v_version_id;
END;
$$;


-- migrate:down

DROP FUNCTION telegram_auto(bigint, text, boolean);


-- Restores 20261116000100.
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

-- Restores 20261029000100.
CREATE OR REPLACE FUNCTION storyboard_approvals_due(p_remind_every interval DEFAULT interval '6 hours')
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

-- Restores 20261108000100.
CREATE OR REPLACE FUNCTION voice_approvals_due(p_remind_every interval DEFAULT interval '6 hours')
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

-- Restores 20261107000100.
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

-- Restores 20261111000100.
CREATE OR REPLACE FUNCTION approval_auto_decide(p_token text, p_qa_level text) RETURNS boolean
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

ALTER TABLE video_version DROP COLUMN auto_approve_at, DROP COLUMN auto_approve_by;
DROP FUNCTION approval_qa_level(approval);
DROP FUNCTION auto_approve_active_by(uuid);
