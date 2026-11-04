-- migrate:up

-- Web console, actions and media (D-103). Each action resolves the user from the session and calls
-- the function the bot calls, so every check stays in one place. Each adds an audit_log row with
-- detail.source = 'web', so a web action can be told from a Telegram one.
-- Approval tokens stay in the database: the page names an approval by its id. The Mac cleanup stays
-- on Telegram because it deletes files.
-- web_video_media_file returns a worker media token to the service, which uses it to fetch that file
-- and never passes it on. web_video_media, which the page sees, has no tokens.
--
-- Rollback: drops these functions. Nothing else depends on them; run after rolling back the service.

CREATE FUNCTION web_audit(p_user bigint, p_action text, p_object_type text, p_object_id text,
                          p_detail jsonb) RETURNS void
LANGUAGE sql
AS $$
  SELECT audit('telegram:' || p_user, p_action, p_object_type, p_object_id,
               p_detail || jsonb_build_object('source', 'web'));
$$;

-- Results: those of telegram_decide, plus NOT_FOUND (no such approval, or an older version of the
-- video) and USE_TELEGRAM (a gate the page does not decide).
CREATE FUNCTION web_decide(p_session text, p_approval_id uuid, p_action text, p_note text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user bigint := web_session_user(p_session);
  v_token text;
  v_type text;
  v_decided record;
BEGIN
  SELECT a.token, a.type INTO v_token, v_type
  FROM approval a
  JOIN video_version vv ON vv.id = a.video_version_id
  JOIN video v ON v.id = vv.video_id AND v.current_version = vv.version
  WHERE a.id = p_approval_id;
  IF v_token IS NULL THEN
    RETURN jsonb_build_object('result', 'NOT_FOUND');
  END IF;
  IF v_type NOT IN ('SCRIPT', 'VOICE', 'STORYBOARD', 'PREVIEW', 'METADATA') THEN
    RETURN jsonb_build_object('result', 'USE_TELEGRAM');
  END IF;
  SELECT * INTO v_decided FROM telegram_decide(v_token, v_user, p_action, p_note);
  PERFORM web_audit(v_user, 'web_decide', 'approval', p_approval_id::text,
                    jsonb_build_object('type', v_type, 'decision', p_action,
                                       'result', v_decided.result));
  RETURN jsonb_build_object('result', v_decided.result, 'version', v_decided.version,
                            'round', v_decided.round);
END;
$$;

CREATE FUNCTION web_retry(p_session text, p_video_id uuid) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user bigint := web_session_user(p_session);
  v_row record;
BEGIN
  SELECT * INTO v_row FROM telegram_retry(v_user, p_video_id::text);
  PERFORM web_audit(v_user, 'web_retry', 'video', p_video_id::text,
                    jsonb_build_object('result', v_row.result, 'step', v_row.step));
  RETURN jsonb_build_object('result', v_row.result, 'step', v_row.step, 'attempt', v_row.attempt);
END;
$$;

CREATE FUNCTION web_auto(p_session text, p_video_id uuid, p_enable boolean) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user bigint := web_session_user(p_session);
  v_row record;
BEGIN
  SELECT * INTO v_row FROM telegram_auto(v_user, p_video_id::text, p_enable);
  PERFORM web_audit(v_user, 'web_auto', 'video', p_video_id::text,
                    jsonb_build_object('enable', p_enable, 'result', v_row.result));
  RETURN jsonb_build_object('result', v_row.result, 'status', v_row.status,
                            'decided_type', v_row.decided_type);
END;
$$;

-- The preview: result, a token for web_cancel_confirm, and what cancelling would affect. The owner
-- check is telegram_cancel's. The audit row holds the token's hash, which ties it to the confirmation
-- without storing a usable token.
CREATE FUNCTION web_cancel(p_session text, p_video_id uuid) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user bigint := web_session_user(p_session);
  v_row record;
BEGIN
  SELECT * INTO v_row FROM telegram_cancel(v_user, p_video_id::text);
  PERFORM web_audit(v_user, 'web_cancel_preview', 'video', p_video_id::text,
                    jsonb_build_object('result', v_row.result,
                                       'confirm', web_token_hash(v_row.token)));
  RETURN jsonb_build_object('result', v_row.result, 'token', v_row.token,
                            'expires_at', v_row.expires_at, 'items', v_row.items);
END;
$$;

-- Only a cancellation: telegram_confirm also carries /auto all and /deploy, which stay on Telegram.
-- result OK says the confirmation was used; each item says what happened to its video.
CREATE FUNCTION web_cancel_confirm(p_session text, p_token text, p_confirm boolean) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user bigint := web_session_user(p_session);
  v_row record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM command_confirm c WHERE c.token = p_token AND c.action = 'CANCEL') THEN
    RETURN jsonb_build_object('result', 'NOT_FOUND');
  END IF;
  SELECT * INTO v_row
  FROM telegram_confirm(p_token, v_user, CASE WHEN p_confirm THEN 'A' ELSE 'R' END);
  PERFORM web_audit(v_user, 'web_cancel', 'command_confirm', web_token_hash(p_token),
                    jsonb_build_object('confirm', p_confirm, 'result', v_row.result,
                                       'items', v_row.items));
  RETURN jsonb_build_object('result', v_row.result, 'items', v_row.items);
END;
$$;

-- Every file of a version with what fetches it: {file, kind, job_id, token}. kind 'media' is /media
-- on the worker, 'board' is /boards. Holds tokens, so it is not granted to the web role.
CREATE FUNCTION web_media_entries(p_version_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_script jsonb := script_file(p_version_id);
  v_voice job := timing_latest(p_version_id);
  v_board jsonb := storyboard_board(p_version_id);
  v_preview jsonb := preview_media(p_version_id);
  v_final jsonb := final_video(p_version_id);
  v_metadata job := final_step(p_version_id, 'metadata');
  v_entries jsonb;
BEGIN
  SELECT coalesce(jsonb_agg(e.entry) FILTER (
           WHERE e.entry->>'job_id' IS NOT NULL AND e.entry->>'token' IS NOT NULL), '[]'::jsonb)
  INTO v_entries
  FROM (
    SELECT jsonb_build_object('file', 'script.md', 'kind', 'media',
                              'job_id', v_script->>'job_id', 'token', v_script->>'token') AS entry
    UNION ALL
    SELECT jsonb_build_object('file', 'voice.m4a', 'kind', 'media', 'job_id', v_voice.id,
                              'token', CASE WHEN v_voice.output->'outputs' @> '[{"path": "voice.m4a"}]'
                                            THEN v_voice.output->'result'->>'media_token' END)
    UNION ALL
    SELECT jsonb_build_object('file', 'mix.m4a', 'kind', 'media',
                              'job_id', v_board->>'job_id', 'token', v_board->>'mix_token')
    UNION ALL
    SELECT jsonb_build_object('file', 'preview.mp4', 'kind', 'media',
                              'job_id', v_preview->>'job_id', 'token', v_preview->>'token')
    UNION ALL
    SELECT jsonb_build_object('file', 'final.mp4', 'kind', 'media',
                              'job_id', v_final->>'job_id', 'token', v_final->>'token')
    UNION ALL
    SELECT jsonb_build_object('file', 'thumbnail.jpg', 'kind', 'media', 'job_id', v_metadata.id,
                              'token', v_metadata.output->'result'->>'media_token')
    UNION ALL
    SELECT jsonb_build_object('file', split_part(page.value, '/', -1), 'kind', 'board',
                              'job_id', v_board->>'job_id', 'token', v_board->>'token')
    FROM jsonb_array_elements_text(coalesce(v_board->'pages', '[]'::jsonb)) page
  ) e;
  RETURN v_entries;
END;
$$;

-- What the page shows of a video, without tokens. A file's revision is the job that made it, so a
-- rewritten file reloads even though its name is the same. voice carries the cost of another take,
-- which the page shows on the button, as WF-15 does.
CREATE FUNCTION web_video_media(p_session text, p_video_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_version_id uuid;
  v_status text;
  v_language text;
  v_preview jsonb;
  v_qa jsonb;
  v_voice jsonb;
BEGIN
  PERFORM web_session_user(p_session);
  SELECT vv.id, vv.status, v.language INTO v_version_id, v_status, v_language
  FROM video v
  JOIN video_version vv ON vv.video_id = v.id AND vv.version = v.current_version
  WHERE v.id = p_video_id;
  IF v_version_id IS NULL THEN
    RETURN NULL;
  END IF;
  v_preview := preview_media(v_version_id);
  v_qa := (final_step(v_version_id, 'qa_final')).output->'result';
  IF EXISTS (SELECT 1 FROM approval a
             WHERE a.video_version_id = v_version_id AND a.type = 'VOICE'
               AND a.status = 'PENDING' AND a.expires_at > now()) THEN
    v_voice := voice_details(v_version_id, false) - 'file'
               || jsonb_build_object('take', voice_take(v_version_id));
  END IF;
  RETURN jsonb_build_object(
    'language', v_language,
    'files', (SELECT coalesce(jsonb_agg(jsonb_build_object('file', e->>'file',
                                                           'revision', e->>'job_id')), '[]'::jsonb)
              FROM jsonb_array_elements(web_media_entries(v_version_id)) e),
    'review', jsonb_build_object(
      'qa_level', coalesce(v_qa->>'level', v_preview->>'level'),
      'qa_checks', coalesce(v_qa->'checks', v_preview->'checks'),
      'metadata', (final_step(v_version_id, 'metadata')).output->'result'->'metadata',
      'voice', v_voice
    )
  );
END;
$$;

-- One file, for the service to fetch from the worker: the worker's address, the path parts and the
-- token. NULL unless the current version lists that file.
CREATE FUNCTION web_video_media_file(p_session text, p_video_id uuid, p_file text) RETURNS jsonb
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_version_id uuid;
  v_version integer;
  v_entry jsonb;
BEGIN
  PERFORM web_session_user(p_session);
  SELECT vv.id, vv.version INTO v_version_id, v_version
  FROM video v
  JOIN video_version vv ON vv.video_id = v.id AND vv.version = v.current_version
  WHERE v.id = p_video_id;
  IF v_version_id IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT e INTO v_entry
  FROM jsonb_array_elements(web_media_entries(v_version_id)) e
  WHERE e->>'file' = p_file;
  IF v_entry IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN v_entry || jsonb_build_object('version', v_version,
                                       'base_url', video_worker_url(p_video_id));
END;
$$;

-- migrate:down

DROP FUNCTION web_video_media_file(text, uuid, text);
DROP FUNCTION web_video_media(text, uuid);
DROP FUNCTION web_media_entries(uuid);
DROP FUNCTION web_cancel_confirm(text, text, boolean);
DROP FUNCTION web_cancel(text, uuid);
DROP FUNCTION web_auto(text, uuid, boolean);
DROP FUNCTION web_retry(text, uuid);
DROP FUNCTION web_decide(text, uuid, text, text);
DROP FUNCTION web_audit(bigint, text, text, text, jsonb);
