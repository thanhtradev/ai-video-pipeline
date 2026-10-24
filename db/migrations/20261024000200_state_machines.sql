-- migrate:up

-- State machines from docs/job-lifecycle.md §2–§3, enforced by triggers so every caller
-- (n8n, worker, manual SQL) obeys the same rules. Status changes are written to audit_log.

CREATE FUNCTION audit(p_actor text, p_action text, p_object_type text, p_object_id text, p_detail jsonb)
RETURNS void
LANGUAGE sql
AS $$
  INSERT INTO audit_log (actor, action, object_type, object_id, detail)
  VALUES (p_actor, p_action, p_object_type, p_object_id, p_detail);
$$;

CREATE FUNCTION audit_log_append_only() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only';
END;
$$;

CREATE TRIGGER audit_log_no_update_delete
BEFORE UPDATE OR DELETE ON audit_log
FOR EACH ROW EXECUTE FUNCTION audit_log_append_only();

CREATE TRIGGER audit_log_no_truncate
BEFORE TRUNCATE ON audit_log
FOR EACH STATEMENT EXECUTE FUNCTION audit_log_append_only();

-- Actor for audit entries; callers may SET LOCAL app.actor = '...'.
CREATE FUNCTION current_actor() RETURNS text
LANGUAGE sql STABLE
AS $$
  SELECT coalesce(nullif(current_setting('app.actor', true), ''), current_user::text);
$$;

-- Job transitions -------------------------------------------------------------

CREATE TABLE job_status_transition (
  from_status text NOT NULL,
  to_status text NOT NULL,
  PRIMARY KEY (from_status, to_status)
);

INSERT INTO job_status_transition (from_status, to_status) VALUES
  ('PENDING', 'READY'),
  ('READY', 'QUEUED'),
  ('READY', 'BLOCKED'),
  ('QUEUED', 'RUNNING'),
  ('QUEUED', 'READY'),
  ('RUNNING', 'SUCCEEDED'),
  ('RUNNING', 'FAILED_RETRYABLE'),
  ('RUNNING', 'FAILED_PERMANENT'),
  ('FAILED_RETRYABLE', 'READY'),
  ('BLOCKED', 'READY'),
  ('FAILED_PERMANENT', 'READY'),
  ('PENDING', 'CANCELLED'),
  ('READY', 'CANCELLED'),
  ('QUEUED', 'CANCELLED'),
  ('RUNNING', 'CANCELLED'),
  ('FAILED_RETRYABLE', 'CANCELLED'),
  ('FAILED_PERMANENT', 'CANCELLED'),
  ('BLOCKED', 'CANCELLED');

CREATE FUNCTION job_check_transition() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM job_status_transition WHERE from_status = OLD.status AND to_status = NEW.status
  ) THEN
    RAISE EXCEPTION 'invalid job transition % -> %', OLD.status, NEW.status;
  END IF;
  NEW.updated_at := now();
  PERFORM audit(current_actor(), 'status_change', 'job', NEW.id::text,
                jsonb_build_object('from', OLD.status, 'to', NEW.status));
  RETURN NEW;
END;
$$;

CREATE TRIGGER job_status_guard
BEFORE UPDATE OF status ON job
FOR EACH ROW EXECUTE FUNCTION job_check_transition();

-- Video version transitions ---------------------------------------------------

CREATE TABLE video_status_transition (
  from_status text NOT NULL,
  to_status text NOT NULL,
  PRIMARY KEY (from_status, to_status)
);

INSERT INTO video_status_transition (from_status, to_status) VALUES
  ('BRIEF_SUBMITTED', 'SCRIPTING'),
  ('SCRIPTING', 'AWAITING_SCRIPT_APPROVAL'),
  ('AWAITING_SCRIPT_APPROVAL', 'GENERATING_ASSETS'),
  ('GENERATING_ASSETS', 'RENDERING_PREVIEW'),
  ('RENDERING_PREVIEW', 'QA_RUNNING'),
  ('QA_RUNNING', 'AWAITING_PREVIEW_APPROVAL'),
  ('AWAITING_PREVIEW_APPROVAL', 'RENDERING_FINAL'),
  ('RENDERING_FINAL', 'ARCHIVING'),
  ('ARCHIVING', 'ARCHIVE_VERIFIED'),
  ('ARCHIVE_VERIFIED', 'COMPLETED');

CREATE FUNCTION video_is_terminal(p_status text) RETURNS boolean
LANGUAGE sql IMMUTABLE
AS $$ SELECT p_status IN ('COMPLETED', 'SUPERSEDED', 'FAILED', 'CANCELLED'); $$;

CREATE FUNCTION video_is_blocked(p_status text) RETURNS boolean
LANGUAGE sql IMMUTABLE
AS $$ SELECT p_status IN ('NEEDS_DECISION', 'BLOCKED_PROVIDER'); $$;

CREATE FUNCTION video_version_check_transition() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  IF video_is_terminal(OLD.status) THEN
    RAISE EXCEPTION 'invalid video_version transition % -> %', OLD.status, NEW.status;
  END IF;

  IF video_is_blocked(OLD.status) THEN
    -- Leaving a blocking state: resume where we were, or end the version.
    IF NEW.status IN ('FAILED', 'CANCELLED', 'SUPERSEDED') THEN
      NEW.resume_status := NULL;
    ELSIF NEW.status = OLD.resume_status THEN
      NEW.resume_status := NULL;
    ELSE
      RAISE EXCEPTION 'video_version % must resume to %', NEW.id, OLD.resume_status;
    END IF;
  ELSIF video_is_blocked(NEW.status) THEN
    NEW.resume_status := OLD.status;
  ELSIF NEW.status IN ('CANCELLED', 'SUPERSEDED') THEN
    NULL;
  ELSIF NOT EXISTS (
    SELECT 1 FROM video_status_transition WHERE from_status = OLD.status AND to_status = NEW.status
  ) THEN
    RAISE EXCEPTION 'invalid video_version transition % -> %', OLD.status, NEW.status;
  END IF;

  NEW.updated_at := now();
  PERFORM audit(current_actor(), 'status_change', 'video_version', NEW.id::text,
                jsonb_build_object('from', OLD.status, 'to', NEW.status));
  RETURN NEW;
END;
$$;

CREATE TRIGGER video_version_status_guard
BEFORE UPDATE OF status ON video_version
FOR EACH ROW EXECUTE FUNCTION video_version_check_transition();

-- migrate:down

DROP TRIGGER video_version_status_guard ON video_version;
DROP FUNCTION video_version_check_transition();
DROP FUNCTION video_is_blocked(text);
DROP FUNCTION video_is_terminal(text);
DROP TABLE video_status_transition;
DROP TRIGGER job_status_guard ON job;
DROP FUNCTION job_check_transition();
DROP TABLE job_status_transition;
DROP FUNCTION current_actor();
DROP TRIGGER audit_log_no_truncate ON audit_log;
DROP TRIGGER audit_log_no_update_delete ON audit_log;
DROP FUNCTION audit_log_append_only();
DROP FUNCTION audit(text, text, text, text, jsonb);
