-- migrate:up

-- Members (D-060): approvers stay in the approver table, and exactly one of them is the owner. A
-- Telegram user asks with /join in the approval chat; only the owner's Approve adds them
-- (member_decide through telegram_decide). /members lists approvers; the owner can /revoke one.

ALTER TABLE approver ADD COLUMN is_owner boolean NOT NULL DEFAULT false;
ALTER TABLE approver ADD COLUMN added_by bigint;
ALTER TABLE approver ADD COLUMN added_at timestamptz;
CREATE UNIQUE INDEX approver_one_owner ON approver (is_owner) WHERE is_owner;
-- Setup registers one approver, the owner (ops/README.md §5). With several, nobody is marked and
-- the owner is set by hand (ops/member-approval.md).
UPDATE approver SET is_owner = true
WHERE active AND (SELECT count(*) FROM approver WHERE active) = 1;

CREATE TABLE member_request (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE CHECK (token ~ '^[0-9a-f]{32}$'),
  telegram_user_id bigint NOT NULL,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  chat_id text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  decided_by bigint,
  decided_at timestamptz
);
CREATE UNIQUE INDEX member_request_one_pending ON member_request (telegram_user_id)
  WHERE status = 'PENDING';

CREATE FUNCTION is_owner(p_user_id bigint) RETURNS boolean
LANGUAGE sql STABLE
AS $$
  SELECT EXISTS (SELECT 1 FROM approver WHERE telegram_user_id = p_user_id AND active AND is_owner);
$$;

CREATE FUNCTION members_list() RETURNS jsonb
LANGUAGE sql STABLE
AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'user_id', telegram_user_id::text, 'name', name, 'owner', is_owner)
           ORDER BY is_owner DESC, name), '[]'::jsonb)
  FROM approver WHERE active;
$$;

-- WF-06 /join, /members, /revoke. Actions and result codes:
--   JOIN    p_name = the Telegram name: REQUESTED (token: the request to send with buttons),
--           ALREADY_MEMBER, ALREADY_REQUESTED, NO_OWNER (nobody could decide)
--   LIST    approvers only: OK (members) or NOT_APPROVER
--   REVOKE  owner only, p_target = a user id: OK, NOT_OWNER, NOT_FOUND, INVALID (detail says why)
CREATE FUNCTION telegram_members(p_user_id bigint, p_action text, p_name text, p_chat_id text,
                                 p_target text DEFAULT NULL)
RETURNS TABLE (result text, token text, detail text, members jsonb)
LANGUAGE plpgsql
AS $$
#variable_conflict use_column
DECLARE
  v_token text := replace(gen_random_uuid()::text, '-', '');
  v_name text := left(btrim(coalesce(p_name, '')), 200);
BEGIN
  IF p_action = 'JOIN' THEN
    IF EXISTS (SELECT 1 FROM approver WHERE telegram_user_id = p_user_id AND active) THEN
      RETURN QUERY SELECT 'ALREADY_MEMBER'::text, NULL::text, NULL::text, NULL::jsonb;
      RETURN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM approver WHERE active AND is_owner) THEN
      RETURN QUERY SELECT 'NO_OWNER'::text, NULL::text, NULL::text, NULL::jsonb;
      RETURN;
    END IF;
    UPDATE member_request SET status = 'EXPIRED'
    WHERE telegram_user_id = p_user_id AND status = 'PENDING' AND expires_at <= now();
    IF EXISTS (SELECT 1 FROM member_request
               WHERE telegram_user_id = p_user_id AND status = 'PENDING') THEN
      RETURN QUERY SELECT 'ALREADY_REQUESTED'::text, NULL::text, NULL::text, NULL::jsonb;
      RETURN;
    END IF;
    PERFORM set_config('app.actor', 'telegram:' || p_user_id, true);
    INSERT INTO member_request (token, telegram_user_id, name, chat_id, expires_at)
    VALUES (v_token, p_user_id, CASE WHEN v_name = '' THEN p_user_id::text ELSE v_name END,
            p_chat_id, now() + interval '72 hours');
    PERFORM audit(current_actor(), 'member_request', 'approver', p_user_id::text,
                  jsonb_build_object('name', v_name));
    RETURN QUERY SELECT 'REQUESTED'::text, v_token, NULL::text, NULL::jsonb;
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM approver WHERE telegram_user_id = p_user_id AND active) THEN
    RETURN QUERY SELECT 'NOT_APPROVER'::text, NULL::text, NULL::text, NULL::jsonb;
    RETURN;
  END IF;
  IF p_action = 'LIST' THEN
    RETURN QUERY SELECT 'OK'::text, NULL::text, NULL::text, members_list();
    RETURN;
  END IF;
  IF p_action <> 'REVOKE' THEN
    RAISE EXCEPTION 'unknown action %', p_action;
  END IF;
  IF NOT is_owner(p_user_id) THEN
    RETURN QUERY SELECT 'NOT_OWNER'::text, NULL::text, NULL::text, NULL::jsonb;
    RETURN;
  END IF;
  IF coalesce(p_target, '') !~ '^\d{1,18}$' THEN
    RETURN QUERY SELECT 'INVALID'::text, NULL::text, 'give the user id shown by /members', NULL::jsonb;
    RETURN;
  END IF;
  IF p_target::bigint = p_user_id THEN
    RETURN QUERY SELECT 'INVALID'::text, NULL::text, 'the owner cannot be revoked', NULL::jsonb;
    RETURN;
  END IF;
  PERFORM set_config('app.actor', 'telegram:' || p_user_id, true);
  UPDATE approver SET active = false WHERE telegram_user_id = p_target::bigint AND active;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'NOT_FOUND'::text, NULL::text, p_target, NULL::jsonb;
    RETURN;
  END IF;
  PERFORM audit(current_actor(), 'member_revoke', 'approver', p_target, '{}'::jsonb);
  RETURN QUERY SELECT 'OK'::text, NULL::text, p_target, members_list();
END;
$$;

-- The owner's Approve (APPROVE) or Reject (REJECT) of a join request. Result codes: OK, NOT_OWNER,
-- NOT_FOUND, NOT_PENDING, EXPIRED, NOT_SUPPORTED.
CREATE FUNCTION member_decide(p_token text, p_user_id bigint, p_action text)
RETURNS TABLE (result text)
LANGUAGE plpgsql
AS $$
#variable_conflict use_column
DECLARE
  v_request member_request%ROWTYPE;
BEGIN
  IF NOT is_owner(p_user_id) THEN
    RETURN QUERY SELECT 'NOT_OWNER'::text;
    RETURN;
  END IF;
  IF p_action NOT IN ('APPROVE', 'REJECT') THEN
    RETURN QUERY SELECT 'NOT_SUPPORTED'::text;
    RETURN;
  END IF;
  SELECT * INTO v_request FROM member_request m WHERE m.token = p_token FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'NOT_FOUND'::text;
    RETURN;
  END IF;
  IF v_request.status <> 'PENDING' THEN
    RETURN QUERY SELECT 'NOT_PENDING'::text;
    RETURN;
  END IF;
  IF v_request.expires_at <= now() THEN
    UPDATE member_request SET status = 'EXPIRED' WHERE id = v_request.id;
    RETURN QUERY SELECT 'EXPIRED'::text;
    RETURN;
  END IF;

  PERFORM set_config('app.actor', 'telegram:' || p_user_id, true);
  UPDATE member_request
  SET status = CASE p_action WHEN 'APPROVE' THEN 'APPROVED' ELSE 'REJECTED' END,
      decided_by = p_user_id, decided_at = now()
  WHERE id = v_request.id;
  IF p_action = 'APPROVE' THEN
    INSERT INTO approver (telegram_user_id, name, active, added_by, added_at)
    VALUES (v_request.telegram_user_id, v_request.name, true, p_user_id, now())
    ON CONFLICT (telegram_user_id) DO UPDATE
      SET active = true, name = excluded.name, added_by = excluded.added_by,
          added_at = excluded.added_at;
  END IF;
  PERFORM audit(current_actor(), 'member_' || lower(p_action), 'approver',
                v_request.telegram_user_id::text, jsonb_build_object('name', v_request.name));
  RETURN QUERY SELECT 'OK'::text;
END;
$$;

-- Same as 20261102000100 plus join requests (member_decide).
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

-- migrate:down

-- Restores telegram_decide of 20261102000100.
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
DROP FUNCTION member_decide(text, bigint, text);
DROP FUNCTION telegram_members(bigint, text, text, text, text);
DROP FUNCTION members_list();
DROP FUNCTION is_owner(bigint);
DROP TABLE member_request;
DROP INDEX approver_one_owner;
ALTER TABLE approver DROP COLUMN added_at;
ALTER TABLE approver DROP COLUMN added_by;
ALTER TABLE approver DROP COLUMN is_owner;
