-- Least-privilege grants for the pipeline database. Idempotent: run after every migration
-- as the owner role, e.g. psql "$OWNER_URL" -f ops/postgres/grants.sql
-- Group roles are created by ops/postgres/bootstrap.sql.

-- Functions are executable by PUBLIC by default; nothing should be.
REVOKE ALL ON SCHEMA public FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO aivideo_n8n, aivideo_worker;

-- n8n orchestrates: read, insert and update pipeline tables; never delete or truncate.
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO aivideo_n8n;
-- The state machine definition and stream limits are owner-managed (migrations), not runtime data.
REVOKE INSERT, UPDATE ON schema_migrations, job_status_transition, video_status_transition,
  stream_config FROM aivideo_n8n;
REVOKE UPDATE ON audit_log FROM aivideo_n8n;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO aivideo_n8n;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO aivideo_n8n;

-- Workers touch no table directly: only the SECURITY DEFINER lifecycle functions. Each binds the
-- worker id to the login role (assert_worker_identity) and checks the job is claimed by it.
GRANT EXECUTE ON FUNCTION
  job_start(uuid, text, integer),
  job_heartbeat(uuid, text, integer),
  job_report_progress(uuid, text, jsonb),
  job_succeed(uuid, text, jsonb),
  job_fail(uuid, text, text, boolean),
  job_block(uuid, text, text, integer),
  cost_guard(uuid, text, numeric),
  cost_record(uuid, text, text, numeric, numeric),
  worker_heartbeat(text, text[]),
  worker_idle(text)
TO aivideo_worker;
