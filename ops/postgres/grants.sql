-- Least-privilege grants for the pipeline database. Idempotent: run after every migration
-- as the owner role, e.g. psql "$OWNER_URL" -f ops/postgres/grants.sql
-- Group roles are created by ops/postgres/bootstrap.sql.

-- Functions are executable by PUBLIC by default; nothing should be.
REVOKE ALL ON SCHEMA public FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO aivideo_n8n, aivideo_worker, aivideo_web;

-- n8n orchestrates: read, insert and update pipeline tables; never delete or truncate.
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO aivideo_n8n;
-- The state machine definition and stream limits are owner-managed (migrations), not runtime data.
REVOKE INSERT, UPDATE ON schema_migrations, job_status_transition, video_status_transition,
  stream_config FROM aivideo_n8n;
REVOKE UPDATE ON audit_log FROM aivideo_n8n;
-- Web console credentials: reached only through SECURITY DEFINER functions (D-103).
REVOKE ALL ON web_login, web_session FROM aivideo_n8n;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO aivideo_n8n;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO aivideo_n8n;

-- Workers touch no table directly: only the SECURITY DEFINER lifecycle functions. Each binds the
-- worker id to the login role (assert_worker_identity) and checks the job is claimed by it.
GRANT EXECUTE ON FUNCTION
  job_start(uuid, text, integer),
  job_heartbeat(uuid, text, integer),
  job_report_progress(uuid, text, jsonb),
  rules_current(text),
  job_succeed(uuid, text, jsonb),
  job_fail(uuid, text, text, boolean),
  job_block(uuid, text, text, integer),
  cost_guard(uuid, text, numeric),
  cost_record(uuid, text, text, numeric, numeric),
  worker_heartbeat(text, text[]),
  worker_heartbeat(text, text[], text),
  worker_idle(text),
  idea_claim(text, integer),
  idea_complete(uuid, text, jsonb),
  idea_fail(uuid, text, text, boolean),
  idea_block(uuid, text, text, integer),
  video_move_claim(text, integer),
  video_move_token_valid(text, uuid, text),
  video_move_complete(uuid, text),
  video_move_fail(uuid, text, text),
  deploy_poll(text, boolean),
  deploy_preflight_report(text, uuid, text, text, text[], text),
  deploy_target_report(text, uuid, text, boolean, text)
TO aivideo_worker;

-- The web console touches no table and no telegram_* function: only web_* (D-103). Each resolves the
-- user from the session token, so this role cannot act as anyone without their session. Issuing a
-- login (telegram_web_login) stays with n8n.
GRANT EXECUTE ON FUNCTION
  web_login_consume(text),
  web_me(text),
  web_logout(text),
  web_attention(text),
  web_videos(text, text, text, integer, integer),
  web_video(text, uuid),
  web_workers(text),
  web_worker(text, text),
  web_report(text, text),
  web_decide(text, uuid, text, text),
  web_retry(text, uuid),
  web_auto(text, uuid, boolean),
  web_cancel(text, uuid),
  web_cancel_confirm(text, text, boolean),
  web_video_media(text, uuid),
  web_video_media_file(text, uuid, text),
  web_catalog(text),
  web_create_draft(text, jsonb, text, boolean),
  web_create_decide(text, text, boolean)
TO aivideo_web;
