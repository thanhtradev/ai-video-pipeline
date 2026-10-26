-- migrate:up

-- Intake from Telegram (D-058): an approver sends /new [minutes] <topic> (notes on the next lines),
-- with the full brief as an attached .md/.txt file when there is one. WF-06 stores a draft with
-- telegram_intake_draft() and asks to confirm; Create / Cancel are buttons answered by
-- telegram_decide(), which submits the draft through video_submit() like the WF-01 form.

CREATE TABLE intake_draft (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE CHECK (token ~ '^[0-9a-f]{32}$'),
  telegram_user_id bigint NOT NULL,
  chat_id text NOT NULL,
  brief jsonb NOT NULL,
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'SUBMITTED', 'CANCELLED', 'EXPIRED')),
  video_id uuid REFERENCES video (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  decided_by bigint,
  decided_at timestamptz
);

-- A draft from an approver's /new. Result codes: DRAFT, NOT_APPROVER, INVALID (error says why).
-- has_voice: whether a full brief has a VOICE section, whose lines the script must copy verbatim.
CREATE FUNCTION telegram_intake_draft(p_user_id bigint, p_chat_id text, p_brief jsonb)
RETURNS TABLE (result text, token text, expires_at timestamptz, brief jsonb, has_voice boolean,
               error text)
LANGUAGE plpgsql
AS $$
#variable_conflict use_column
DECLARE
  v_brief jsonb;
  v_token text := replace(gen_random_uuid()::text, '-', '');
  v_expires timestamptz := now() + interval '1 hour';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM approver WHERE telegram_user_id = p_user_id AND active) THEN
    RETURN QUERY SELECT 'NOT_APPROVER'::text, NULL::text, NULL::timestamptz, NULL::jsonb,
                        NULL::boolean, NULL::text;
    RETURN;
  END IF;
  BEGIN
    v_brief := brief_normalize(jsonb_set(coalesce(p_brief, '{}'::jsonb), '{format}', '"episode"'));
  EXCEPTION WHEN raise_exception THEN
    RETURN QUERY SELECT 'INVALID'::text, NULL::text, NULL::timestamptz, NULL::jsonb,
                        NULL::boolean, SQLERRM;
    RETURN;
  END;
  PERFORM set_config('app.actor', 'telegram:' || p_user_id, true);
  INSERT INTO intake_draft (token, telegram_user_id, chat_id, brief, expires_at)
  VALUES (v_token, p_user_id, p_chat_id, v_brief, v_expires);
  RETURN QUERY SELECT 'DRAFT'::text, v_token, v_expires, v_brief,
    CASE WHEN v_brief ? 'full_brief' THEN v_brief->>'full_brief' ~* '(^|\n)[#*\s]*VOICE' END,
    NULL::text;
END;
$$;

-- Create (APPROVE) or Cancel (REJECT) a draft. Result codes as approval_decide: OK, NOT_ALLOWED,
-- NOT_FOUND, NOT_PENDING, EXPIRED, NOT_SUPPORTED.
CREATE FUNCTION intake_decide(p_token text, p_user_id bigint, p_action text)
RETURNS TABLE (result text, video_id uuid, version integer)
LANGUAGE plpgsql
AS $$
#variable_conflict use_column
DECLARE
  v_draft intake_draft%ROWTYPE;
  v_video_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM approver WHERE telegram_user_id = p_user_id AND active) THEN
    RETURN QUERY SELECT 'NOT_ALLOWED'::text, NULL::uuid, NULL::integer;
    RETURN;
  END IF;
  IF p_action NOT IN ('APPROVE', 'REJECT') THEN
    RETURN QUERY SELECT 'NOT_SUPPORTED'::text, NULL::uuid, NULL::integer;
    RETURN;
  END IF;
  SELECT * INTO v_draft FROM intake_draft d WHERE d.token = p_token FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'NOT_FOUND'::text, NULL::uuid, NULL::integer;
    RETURN;
  END IF;
  IF v_draft.status <> 'PENDING' THEN
    RETURN QUERY SELECT 'NOT_PENDING'::text, v_draft.video_id, 1;
    RETURN;
  END IF;
  IF v_draft.expires_at <= now() THEN
    UPDATE intake_draft SET status = 'EXPIRED' WHERE id = v_draft.id;
    RETURN QUERY SELECT 'EXPIRED'::text, NULL::uuid, NULL::integer;
    RETURN;
  END IF;

  IF p_action = 'APPROVE' THEN
    SELECT s.video_id INTO v_video_id
    FROM video_submit('telegram-intake-' || v_draft.id, v_draft.brief) s;
    PERFORM set_config('app.actor', 'telegram:' || p_user_id, true);
    UPDATE intake_draft
    SET status = 'SUBMITTED', video_id = v_video_id, decided_by = p_user_id, decided_at = now()
    WHERE id = v_draft.id;
    RETURN QUERY SELECT 'OK'::text, v_video_id, 1;
  ELSE
    UPDATE intake_draft
    SET status = 'CANCELLED', decided_by = p_user_id, decided_at = now()
    WHERE id = v_draft.id;
    RETURN QUERY SELECT 'OK'::text, NULL::uuid, NULL::integer;
  END IF;
END;
$$;

-- Same as 20261101000100 plus intake drafts (intake_decide).
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

-- migrate:down

-- Restores telegram_decide of 20261101000100.
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
DROP FUNCTION intake_decide(text, bigint, text);
DROP FUNCTION telegram_intake_draft(bigint, text, jsonb);
DROP TABLE intake_draft;
