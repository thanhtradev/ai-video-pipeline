-- migrate:up

-- Approval binding from docs/quality-and-approval.md §2: a token is valid only for the exact
-- video version and payload it was issued for, decided once, by an allowed approver, before expiry.

-- Creates version n+1 of a video. The previous version, its pending approvals, and its unfinished
-- jobs are superseded/cancelled so stale approvals and work cannot affect the new version.
CREATE FUNCTION video_new_version(p_video_id uuid, p_brief jsonb) RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_current integer;
  v_old_id uuid;
  v_old_status text;
  v_new_id uuid;
  v_job_id uuid;
BEGIN
  SELECT current_version INTO v_current FROM video WHERE id = p_video_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'video % not found', p_video_id;
  END IF;

  SELECT id, status INTO v_old_id, v_old_status
  FROM video_version WHERE video_id = p_video_id AND version = v_current FOR UPDATE;

  IF NOT video_is_terminal(v_old_status) THEN
    UPDATE video_version SET status = 'SUPERSEDED' WHERE id = v_old_id;
  END IF;

  UPDATE approval SET status = 'SUPERSEDED'
  WHERE video_version_id = v_old_id AND status = 'PENDING';

  FOR v_job_id IN
    SELECT id FROM job WHERE video_version_id = v_old_id AND status NOT IN ('SUCCEEDED', 'CANCELLED')
  LOOP
    PERFORM job_cancel(v_job_id, current_actor());
  END LOOP;

  INSERT INTO video_version (video_id, version, brief)
  VALUES (p_video_id, v_current + 1, p_brief)
  RETURNING id INTO v_new_id;

  UPDATE video SET current_version = v_current + 1 WHERE id = p_video_id;
  RETURN v_new_id;
END;
$$;

-- Issues a new approval token; any earlier pending request of the same type is superseded.
CREATE FUNCTION approval_request(
  p_video_version_id uuid,
  p_type text,
  p_payload_hash text,
  p_ttl interval DEFAULT interval '24 hours'
) RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_token text := replace(gen_random_uuid()::text, '-', '');
BEGIN
  UPDATE approval SET status = 'SUPERSEDED'
  WHERE video_version_id = p_video_version_id AND type = p_type AND status = 'PENDING';

  INSERT INTO approval (video_version_id, type, token, payload_hash, expires_at)
  VALUES (p_video_version_id, p_type, v_token, p_payload_hash, now() + p_ttl);

  RETURN v_token;
END;
$$;

-- Result codes: OK, NOT_ALLOWED, NOT_FOUND, NOT_PENDING, EXPIRED, SUPERSEDED, HASH_MISMATCH.
CREATE FUNCTION approval_decide(p_token text, p_user_id bigint, p_decision text, p_payload_hash text)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_approval approval%ROWTYPE;
  v_version_status text;
  v_is_current boolean;
BEGIN
  IF p_decision NOT IN ('APPROVED', 'REJECTED') THEN
    RAISE EXCEPTION 'invalid decision %', p_decision;
  END IF;

  -- Check the allow-list first so strangers learn nothing about tokens.
  IF NOT EXISTS (SELECT 1 FROM approver WHERE telegram_user_id = p_user_id AND active) THEN
    PERFORM audit('telegram:' || p_user_id, 'approval_denied', 'approval', p_token,
                  jsonb_build_object('reason', 'NOT_ALLOWED'));
    RETURN 'NOT_ALLOWED';
  END IF;

  SELECT * INTO v_approval FROM approval WHERE token = p_token FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 'NOT_FOUND';
  END IF;
  IF v_approval.status = 'SUPERSEDED' THEN
    RETURN 'SUPERSEDED';
  END IF;
  IF v_approval.status <> 'PENDING' THEN
    RETURN 'NOT_PENDING';
  END IF;
  IF v_approval.expires_at <= now() THEN
    UPDATE approval SET status = 'EXPIRED' WHERE id = v_approval.id;
    RETURN 'EXPIRED';
  END IF;

  SELECT vv.status, (v.current_version = vv.version) INTO v_version_status, v_is_current
  FROM video_version vv JOIN video v ON v.id = vv.video_id
  WHERE vv.id = v_approval.video_version_id
  FOR UPDATE OF vv;
  IF NOT v_is_current OR video_is_terminal(v_version_status) THEN
    UPDATE approval SET status = 'SUPERSEDED' WHERE id = v_approval.id;
    RETURN 'SUPERSEDED';
  END IF;
  IF v_approval.payload_hash <> p_payload_hash THEN
    RETURN 'HASH_MISMATCH';
  END IF;

  PERFORM set_config('app.actor', 'telegram:' || p_user_id, true);
  UPDATE approval
  SET status = p_decision, decided_by = p_user_id, decided_at = now()
  WHERE id = v_approval.id;
  PERFORM audit(current_actor(), 'approval_' || lower(p_decision), 'approval', v_approval.id::text,
                jsonb_build_object('type', v_approval.type, 'video_version_id', v_approval.video_version_id));

  IF p_decision = 'APPROVED' THEN
    IF v_approval.type = 'SCRIPT' AND v_version_status = 'AWAITING_SCRIPT_APPROVAL' THEN
      UPDATE video_version SET status = 'GENERATING_ASSETS' WHERE id = v_approval.video_version_id;
    ELSIF v_approval.type = 'PREVIEW' AND v_version_status = 'AWAITING_PREVIEW_APPROVAL' THEN
      UPDATE video_version SET status = 'RENDERING_FINAL' WHERE id = v_approval.video_version_id;
    END IF;
  END IF;

  RETURN 'OK';
END;
$$;

CREATE FUNCTION approval_expire() RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE approval SET status = 'EXPIRED' WHERE status = 'PENDING' AND expires_at <= now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Pending approvals not reminded within p_every; marks them reminded so each fires once per window.
CREATE FUNCTION approval_due_reminders(p_every interval)
RETURNS TABLE (approval_id uuid, token text, video_version_id uuid, type text, expires_at timestamptz)
LANGUAGE sql
AS $$
  UPDATE approval
  SET last_reminded_at = now()
  WHERE status = 'PENDING'
    AND expires_at > now()
    AND coalesce(last_reminded_at, requested_at) <= now() - p_every
  RETURNING id, token, video_version_id, type, expires_at;
$$;

-- migrate:down

DROP FUNCTION approval_due_reminders(interval);
DROP FUNCTION approval_expire();
DROP FUNCTION approval_decide(text, bigint, text, text);
DROP FUNCTION approval_request(uuid, text, text, interval);
DROP FUNCTION video_new_version(uuid, jsonb);
