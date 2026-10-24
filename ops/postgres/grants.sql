-- Least-privilege grants for the pipeline database. Idempotent: run after every migration
-- as the owner role, e.g. psql "$OWNER_URL" -f ops/postgres/grants.sql
-- Group roles are created by ops/postgres/bootstrap.sql.

-- Functions are executable by PUBLIC by default; nothing should be.
REVOKE ALL ON SCHEMA public FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO aivideo_n8n, aivideo_worker;

-- n8n orchestrates: read, insert and update pipeline tables; never delete or truncate.
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO aivideo_n8n;
REVOKE INSERT, UPDATE ON schema_migrations FROM aivideo_n8n;
REVOKE UPDATE ON audit_log FROM aivideo_n8n;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO aivideo_n8n;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO aivideo_n8n;

-- Workers touch no table directly: only the SECURITY DEFINER lifecycle functions, which check
-- that the caller is the worker that claimed the job.
GRANT EXECUTE ON FUNCTION
  job_start(uuid, text, integer),
  job_heartbeat(uuid, text, integer),
  job_succeed(uuid, text, jsonb),
  job_fail(uuid, text, text, boolean),
  worker_heartbeat(text, text[])
TO aivideo_worker;
