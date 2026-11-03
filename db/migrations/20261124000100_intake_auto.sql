-- migrate:up

-- /new … auto=on (D-096): the draft remembers the choice (intake_draft.auto_approve), shows it in
-- selection.auto (kept by the Kit / Nhân vật / Worker / Thời lượng buttons), and Tạo turns /auto
-- (D-093) on for the new video in the name of the approver who pressed Tạo. Everything else about
-- /auto is unchanged: every gate but CLEANUP, QA WARN approved, FAIL stops; /auto <id> off works.
--
-- Rollback: drops the column (open drafts lose the choice; videos already created keep /auto) and
-- restores the previous functions.

ALTER TABLE intake_draft ADD COLUMN auto_approve boolean NOT NULL DEFAULT false;

DROP FUNCTION telegram_intake_draft(bigint, text, jsonb, text);
-- Same as 20261117000100 plus p_auto.
CREATE FUNCTION telegram_intake_draft(p_user_id bigint, p_chat_id text, p_brief jsonb,
                                      p_worker_id text DEFAULT NULL,
                                      p_auto boolean DEFAULT false)
RETURNS TABLE (result text, token text, expires_at timestamptz, brief jsonb, has_voice boolean,
               selection jsonb, error text)
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
                        NULL::boolean, NULL::jsonb, NULL::text;
    RETURN;
  END IF;
  IF p_worker_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM worker w WHERE w.id = p_worker_id AND w.api_url IS NOT NULL) THEN
    RETURN QUERY SELECT 'INVALID'::text, NULL::text, NULL::timestamptz, NULL::jsonb,
                        NULL::boolean, NULL::jsonb, format('unknown worker "%s"', p_worker_id);
    RETURN;
  END IF;
  BEGIN
    v_brief := brief_normalize(jsonb_set(coalesce(p_brief, '{}'::jsonb), '{format}', '"episode"'));
  EXCEPTION WHEN raise_exception THEN
    RETURN QUERY SELECT 'INVALID'::text, NULL::text, NULL::timestamptz, NULL::jsonb,
                        NULL::boolean, NULL::jsonb, SQLERRM;
    RETURN;
  END;
  PERFORM set_config('app.actor', 'telegram:' || p_user_id, true);
  INSERT INTO intake_draft (token, telegram_user_id, chat_id, brief, expires_at, worker_id,
                            auto_approve)
  VALUES (v_token, p_user_id, p_chat_id, v_brief, v_expires, p_worker_id, coalesce(p_auto, false));
  RETURN QUERY SELECT 'DRAFT'::text, v_token, v_expires, v_brief,
    CASE WHEN v_brief ? 'full_brief' THEN v_brief->>'full_brief' ~* '(^|\n)[#*\s]*VOICE' END,
    intake_selection(v_brief, p_worker_id)
      || jsonb_build_object('auto', coalesce(p_auto, false)), NULL::text;
END;
$$;

-- Same as 20261121000300 plus selection.auto.
CREATE OR REPLACE FUNCTION telegram_intake_cycle(p_token text, p_user_id bigint, p_kind text)
RETURNS TABLE (result text, token text, expires_at timestamptz, brief jsonb, has_voice boolean,
               selection jsonb, error text)
LANGUAGE plpgsql
AS $$
#variable_conflict use_column
DECLARE
  v_draft intake_draft%ROWTYPE;
  v_next text;
  v_brief jsonb;
  v_worker text;
  v_minutes jsonb;
BEGIN
  IF p_kind NOT IN ('kit', 'character_set', 'worker', 'duration') THEN
    RAISE EXCEPTION 'invalid kind %', p_kind;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM approver WHERE telegram_user_id = p_user_id AND active) THEN
    RETURN QUERY SELECT 'NOT_APPROVER'::text, NULL::text, NULL::timestamptz, NULL::jsonb,
                        NULL::boolean, NULL::jsonb, NULL::text;
    RETURN;
  END IF;
  SELECT * INTO v_draft FROM intake_draft d WHERE d.token = p_token FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'NOT_FOUND'::text, NULL::text, NULL::timestamptz, NULL::jsonb,
                        NULL::boolean, NULL::jsonb, NULL::text;
    RETURN;
  END IF;
  IF v_draft.status <> 'PENDING' THEN
    RETURN QUERY SELECT 'NOT_PENDING'::text, NULL::text, NULL::timestamptz, NULL::jsonb,
                        NULL::boolean, NULL::jsonb, NULL::text;
    RETURN;
  END IF;
  IF v_draft.expires_at <= now() THEN
    UPDATE intake_draft SET status = 'EXPIRED' WHERE id = v_draft.id;
    RETURN QUERY SELECT 'EXPIRED'::text, NULL::text, NULL::timestamptz, NULL::jsonb,
                        NULL::boolean, NULL::jsonb, NULL::text;
    RETURN;
  END IF;
  IF p_kind = 'duration' AND v_draft.brief ? 'full_brief' THEN
    RETURN QUERY SELECT 'FULL_BRIEF'::text, NULL::text, NULL::timestamptz, NULL::jsonb,
                        NULL::boolean, NULL::jsonb, NULL::text;
    RETURN;
  END IF;
  v_brief := v_draft.brief;
  v_worker := v_draft.worker_id;
  IF p_kind = 'worker' THEN
    v_worker := worker_selection(v_draft.worker_id)->>'next_slug';
  ELSIF p_kind = 'duration' THEN
    v_minutes := duration_selection(v_draft.brief)->'next_minutes';
    v_brief := brief_normalize(CASE WHEN jsonb_typeof(v_minutes) = 'number'
                                    THEN v_draft.brief || jsonb_build_object('duration_minutes', v_minutes)
                                    ELSE v_draft.brief - 'duration_minutes' END);
  ELSE
    v_next := catalog_selection(v_draft.brief)->p_kind->>'next_slug';
    v_brief := brief_normalize(jsonb_set(v_draft.brief, ARRAY[p_kind], to_jsonb(v_next)));
  END IF;
  -- Nothing to change (a single option, e.g. the one English cast): Telegram would refuse to
  -- edit the message into the same content ("message is not modified").
  IF v_brief = v_draft.brief AND v_worker IS NOT DISTINCT FROM v_draft.worker_id THEN
    RETURN QUERY SELECT 'UNCHANGED'::text, v_draft.token, v_draft.expires_at, v_brief, NULL::boolean,
      intake_selection(v_brief, v_worker)
      || jsonb_build_object('auto', v_draft.auto_approve), NULL::text;
    RETURN;
  END IF;
  PERFORM set_config('app.actor', 'telegram:' || p_user_id, true);
  UPDATE intake_draft SET brief = v_brief, worker_id = v_worker WHERE id = v_draft.id;
  RETURN QUERY SELECT 'DRAFT'::text, v_draft.token, v_draft.expires_at, v_brief,
    CASE WHEN v_brief ? 'full_brief' THEN v_brief->>'full_brief' ~* '(^|\n)[#*\s]*VOICE' END,
    intake_selection(v_brief, v_worker)
      || jsonb_build_object('auto', v_draft.auto_approve), NULL::text;
END;
$$;

-- Same as 20261117000100 plus auto=on.
CREATE OR REPLACE FUNCTION intake_decide(p_token text, p_user_id bigint, p_action text)
RETURNS TABLE (result text, video_id uuid, version integer)
LANGUAGE plpgsql
AS $$
#variable_conflict use_column
DECLARE
  v_draft intake_draft%ROWTYPE;
  v_video_id uuid;
  v_version_id uuid;
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
    IF v_draft.worker_id IS NOT NULL THEN
      UPDATE video SET worker_id = v_draft.worker_id WHERE id = v_video_id AND worker_id IS NULL;
    END IF;
    -- auto=on (D-096): /auto (D-093) from the start, in the name of who pressed Tạo.
    IF v_draft.auto_approve THEN
      UPDATE video_version vv SET auto_approve_by = p_user_id, auto_approve_at = now()
      FROM video v
      WHERE v.id = v_video_id AND vv.video_id = v.id AND vv.version = v.current_version
      RETURNING vv.id INTO v_version_id;
      PERFORM audit('telegram:' || p_user_id, 'auto_approve_on', 'video_version',
                    v_version_id::text, jsonb_build_object('source', 'intake'));
    END IF;
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

-- migrate:down

-- Restores 20261117000100.
CREATE OR REPLACE FUNCTION intake_decide(p_token text, p_user_id bigint, p_action text)
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
    IF v_draft.worker_id IS NOT NULL THEN
      UPDATE video SET worker_id = v_draft.worker_id WHERE id = v_video_id AND worker_id IS NULL;
    END IF;
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

-- Restores 20261121000300.
CREATE OR REPLACE FUNCTION telegram_intake_cycle(p_token text, p_user_id bigint, p_kind text)
RETURNS TABLE (result text, token text, expires_at timestamptz, brief jsonb, has_voice boolean,
               selection jsonb, error text)
LANGUAGE plpgsql
AS $$
#variable_conflict use_column
DECLARE
  v_draft intake_draft%ROWTYPE;
  v_next text;
  v_brief jsonb;
  v_worker text;
  v_minutes jsonb;
BEGIN
  IF p_kind NOT IN ('kit', 'character_set', 'worker', 'duration') THEN
    RAISE EXCEPTION 'invalid kind %', p_kind;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM approver WHERE telegram_user_id = p_user_id AND active) THEN
    RETURN QUERY SELECT 'NOT_APPROVER'::text, NULL::text, NULL::timestamptz, NULL::jsonb,
                        NULL::boolean, NULL::jsonb, NULL::text;
    RETURN;
  END IF;
  SELECT * INTO v_draft FROM intake_draft d WHERE d.token = p_token FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'NOT_FOUND'::text, NULL::text, NULL::timestamptz, NULL::jsonb,
                        NULL::boolean, NULL::jsonb, NULL::text;
    RETURN;
  END IF;
  IF v_draft.status <> 'PENDING' THEN
    RETURN QUERY SELECT 'NOT_PENDING'::text, NULL::text, NULL::timestamptz, NULL::jsonb,
                        NULL::boolean, NULL::jsonb, NULL::text;
    RETURN;
  END IF;
  IF v_draft.expires_at <= now() THEN
    UPDATE intake_draft SET status = 'EXPIRED' WHERE id = v_draft.id;
    RETURN QUERY SELECT 'EXPIRED'::text, NULL::text, NULL::timestamptz, NULL::jsonb,
                        NULL::boolean, NULL::jsonb, NULL::text;
    RETURN;
  END IF;
  IF p_kind = 'duration' AND v_draft.brief ? 'full_brief' THEN
    RETURN QUERY SELECT 'FULL_BRIEF'::text, NULL::text, NULL::timestamptz, NULL::jsonb,
                        NULL::boolean, NULL::jsonb, NULL::text;
    RETURN;
  END IF;
  v_brief := v_draft.brief;
  v_worker := v_draft.worker_id;
  IF p_kind = 'worker' THEN
    v_worker := worker_selection(v_draft.worker_id)->>'next_slug';
  ELSIF p_kind = 'duration' THEN
    v_minutes := duration_selection(v_draft.brief)->'next_minutes';
    v_brief := brief_normalize(CASE WHEN jsonb_typeof(v_minutes) = 'number'
                                    THEN v_draft.brief || jsonb_build_object('duration_minutes', v_minutes)
                                    ELSE v_draft.brief - 'duration_minutes' END);
  ELSE
    v_next := catalog_selection(v_draft.brief)->p_kind->>'next_slug';
    v_brief := brief_normalize(jsonb_set(v_draft.brief, ARRAY[p_kind], to_jsonb(v_next)));
  END IF;
  -- Nothing to change (a single option, e.g. the one English cast): Telegram would refuse to
  -- edit the message into the same content ("message is not modified").
  IF v_brief = v_draft.brief AND v_worker IS NOT DISTINCT FROM v_draft.worker_id THEN
    RETURN QUERY SELECT 'UNCHANGED'::text, v_draft.token, v_draft.expires_at, v_brief, NULL::boolean,
      intake_selection(v_brief, v_worker), NULL::text;
    RETURN;
  END IF;
  PERFORM set_config('app.actor', 'telegram:' || p_user_id, true);
  UPDATE intake_draft SET brief = v_brief, worker_id = v_worker WHERE id = v_draft.id;
  RETURN QUERY SELECT 'DRAFT'::text, v_draft.token, v_draft.expires_at, v_brief,
    CASE WHEN v_brief ? 'full_brief' THEN v_brief->>'full_brief' ~* '(^|\n)[#*\s]*VOICE' END,
    intake_selection(v_brief, v_worker), NULL::text;
END;
$$;

DROP FUNCTION telegram_intake_draft(bigint, text, jsonb, text, boolean);
-- Restores 20261117000100.
CREATE FUNCTION telegram_intake_draft(p_user_id bigint, p_chat_id text, p_brief jsonb,
                                      p_worker_id text DEFAULT NULL)
RETURNS TABLE (result text, token text, expires_at timestamptz, brief jsonb, has_voice boolean,
               selection jsonb, error text)
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
                        NULL::boolean, NULL::jsonb, NULL::text;
    RETURN;
  END IF;
  IF p_worker_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM worker w WHERE w.id = p_worker_id AND w.api_url IS NOT NULL) THEN
    RETURN QUERY SELECT 'INVALID'::text, NULL::text, NULL::timestamptz, NULL::jsonb,
                        NULL::boolean, NULL::jsonb, format('unknown worker "%s"', p_worker_id);
    RETURN;
  END IF;
  BEGIN
    v_brief := brief_normalize(jsonb_set(coalesce(p_brief, '{}'::jsonb), '{format}', '"episode"'));
  EXCEPTION WHEN raise_exception THEN
    RETURN QUERY SELECT 'INVALID'::text, NULL::text, NULL::timestamptz, NULL::jsonb,
                        NULL::boolean, NULL::jsonb, SQLERRM;
    RETURN;
  END;
  PERFORM set_config('app.actor', 'telegram:' || p_user_id, true);
  INSERT INTO intake_draft (token, telegram_user_id, chat_id, brief, expires_at, worker_id)
  VALUES (v_token, p_user_id, p_chat_id, v_brief, v_expires, p_worker_id);
  RETURN QUERY SELECT 'DRAFT'::text, v_token, v_expires, v_brief,
    CASE WHEN v_brief ? 'full_brief' THEN v_brief->>'full_brief' ~* '(^|\n)[#*\s]*VOICE' END,
    intake_selection(v_brief, p_worker_id), NULL::text;
END;
$$;

ALTER TABLE intake_draft DROP COLUMN auto_approve;
