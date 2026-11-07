-- migrate:up

-- /new … api=on (D-119): per video, the Claude API takes over by itself when Max is out. An owner
-- sets it on the draft (intake_draft.claude_api, shown as selection.api and kept by the buttons);
-- Tạo stores it on the video (video.claude_api_auto_by, so later versions keep it). When a Claude
-- step of that video is blocked by the Max usage limit, claude_api_offers_due() grants the job its
-- step cap itself (claude_api_grant.mode AUTO, no button) and wakes it, while the month has room;
-- WF-08 reports it. Everything else of D-118 holds: steps without a cap are never granted, the
-- guard reserves before every run, the month limit and the Console limit stop spending, and a
-- block, success or permanent failure ends the grant. If the owner who set it is no longer an
-- owner, the video falls back to the button.
--
-- Rollback: restores the previous functions and drops the new columns (open drafts and videos
-- lose api=on; automatic grants already made keep their history with a NULL token).

ALTER TABLE intake_draft ADD COLUMN claude_api boolean NOT NULL DEFAULT false;
ALTER TABLE video ADD COLUMN claude_api_auto_by bigint, ADD COLUMN claude_api_auto_at timestamptz;
ALTER TABLE claude_api_grant ALTER COLUMN confirm_token DROP NOT NULL;
ALTER TABLE claude_api_grant ADD COLUMN mode text NOT NULL DEFAULT 'TAP'
  CHECK (mode IN ('TAP', 'AUTO'));
ALTER TABLE claude_api_grant ADD CONSTRAINT claude_api_grant_tap_token
  CHECK (mode = 'AUTO' OR confirm_token IS NOT NULL);

DROP FUNCTION telegram_intake_draft(bigint, text, jsonb, text, boolean);
-- Same as 20261124000100 plus p_api (owners only).
CREATE FUNCTION telegram_intake_draft(p_user_id bigint, p_chat_id text, p_brief jsonb,
                                      p_worker_id text DEFAULT NULL,
                                      p_auto boolean DEFAULT false,
                                      p_api boolean DEFAULT false)
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
  -- api=on spends money: owners only (D-119).
  IF coalesce(p_api, false) AND NOT is_owner(p_user_id) THEN
    RETURN QUERY SELECT 'API_NOT_OWNER'::text, NULL::text, NULL::timestamptz, NULL::jsonb,
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
                            auto_approve, claude_api)
  VALUES (v_token, p_user_id, p_chat_id, v_brief, v_expires, p_worker_id, coalesce(p_auto, false),
          coalesce(p_api, false));
  RETURN QUERY SELECT 'DRAFT'::text, v_token, v_expires, v_brief,
    CASE WHEN v_brief ? 'full_brief' THEN v_brief->>'full_brief' ~* '(^|\n)[#*\s]*VOICE' END,
    intake_selection(v_brief, p_worker_id)
      || jsonb_build_object('auto', coalesce(p_auto, false), 'api', coalesce(p_api, false)),
    NULL::text;
END;
$$;

-- Same as 20261124000100 plus selection.api.
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
      || jsonb_build_object('auto', v_draft.auto_approve, 'api', v_draft.claude_api), NULL::text;
    RETURN;
  END IF;
  PERFORM set_config('app.actor', 'telegram:' || p_user_id, true);
  UPDATE intake_draft SET brief = v_brief, worker_id = v_worker WHERE id = v_draft.id;
  RETURN QUERY SELECT 'DRAFT'::text, v_draft.token, v_draft.expires_at, v_brief,
    CASE WHEN v_brief ? 'full_brief' THEN v_brief->>'full_brief' ~* '(^|\n)[#*\s]*VOICE' END,
    intake_selection(v_brief, v_worker)
      || jsonb_build_object('auto', v_draft.auto_approve, 'api', v_draft.claude_api), NULL::text;
END;
$$;

-- Same as 20261201000100 plus selection.api.
CREATE OR REPLACE FUNCTION telegram_intake_pick(p_token text, p_user_id bigint, p_kind text, p_slug text)
RETURNS TABLE (result text, token text, expires_at timestamptz, brief jsonb, has_voice boolean,
               selection jsonb, error text)
LANGUAGE plpgsql
AS $$
#variable_conflict use_column
DECLARE
  v_draft intake_draft%ROWTYPE;
  v_brief jsonb;
BEGIN
  IF p_kind NOT IN ('kit', 'character_set') THEN
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
  BEGIN
    v_brief := brief_normalize(jsonb_set(v_draft.brief, ARRAY[p_kind], to_jsonb(p_slug)));
  EXCEPTION WHEN raise_exception THEN
    RETURN QUERY SELECT 'INVALID'::text, NULL::text, NULL::timestamptz, NULL::jsonb,
                        NULL::boolean, NULL::jsonb, SQLERRM;
    RETURN;
  END;
  IF v_brief = v_draft.brief THEN
    RETURN QUERY SELECT 'UNCHANGED'::text, v_draft.token, v_draft.expires_at, v_brief, NULL::boolean,
      intake_selection(v_brief, v_draft.worker_id)
      || jsonb_build_object('auto', v_draft.auto_approve, 'api', v_draft.claude_api), NULL::text;
    RETURN;
  END IF;
  PERFORM set_config('app.actor', 'telegram:' || p_user_id, true);
  UPDATE intake_draft SET brief = v_brief WHERE id = v_draft.id;
  RETURN QUERY SELECT 'DRAFT'::text, v_draft.token, v_draft.expires_at, v_brief,
    CASE WHEN v_brief ? 'full_brief' THEN v_brief->>'full_brief' ~* '(^|\n)[#*\s]*VOICE' END,
    intake_selection(v_brief, v_draft.worker_id)
      || jsonb_build_object('auto', v_draft.auto_approve, 'api', v_draft.claude_api), NULL::text;
END;
$$;

-- Same as 20261124000100 plus api=on.
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
    -- api=on (D-119): the Claude API takes over when Max is out, in the name of the owner who set it.
    IF v_draft.claude_api THEN
      UPDATE video SET claude_api_auto_by = v_draft.telegram_user_id, claude_api_auto_at = now()
      WHERE id = v_video_id;
      PERFORM audit('telegram:' || p_user_id, 'claude_api_auto_on', 'video', v_video_id::text,
                    jsonb_build_object('source', 'intake', 'set_by', v_draft.telegram_user_id));
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

DROP FUNCTION claude_api_offers_due();
-- Same as 20261203000100 plus the automatic grants of api=on videos and the kind column.
CREATE FUNCTION claude_api_offers_due()
RETURNS TABLE (
  kind text,
  token text,
  job_id uuid,
  video_id uuid,
  version integer,
  step text,
  cap_usd numeric,
  month_spent_usd numeric,
  month_limit_usd numeric
)
LANGUAGE plpgsql
AS $$
#variable_conflict use_column
DECLARE
  v_limit numeric := claude_api_month_limit();
  v_spent numeric := claude_api_month_spent();
  v_granted numeric := 0;
  v_job record;
  v_cap numeric;
BEGIN
  UPDATE command_confirm c SET status = 'EXPIRED', decided_at = now()
  WHERE c.action = 'CLAUDE_API' AND c.status = 'PENDING'
    AND (c.expires_at <= now()
         OR NOT EXISTS (SELECT 1 FROM job j
                        WHERE j.id = (c.payload->>'job_id')::uuid AND j.status = 'BLOCKED'));

  IF v_limit IS NULL OR v_limit - v_spent < claude_api_min_offer_usd() THEN
    RETURN;
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS claude_api_due (job_id uuid, video_version_id uuid, cap numeric,
                                                  auto_by bigint) ON COMMIT DROP;
  TRUNCATE claude_api_due;
  -- A Claude step blocked by the Max limit, not offered or granted since its latest attempt began.
  INSERT INTO claude_api_due
  SELECT j.id, j.video_version_id, s.cap_usd,
         CASE WHEN is_owner(v.claude_api_auto_by) THEN v.claude_api_auto_by END
  FROM job j
  JOIN claude_api_step s ON s.step = j.step
  JOIN video_version vv ON vv.id = j.video_version_id
  JOIN video v ON v.id = vv.video_id
  CROSS JOIN LATERAL (SELECT coalesce(max(a.started_at), j.created_at) AS since
                      FROM job_attempt a WHERE a.job_id = j.id) last
  WHERE j.status = 'BLOCKED'
    AND j.last_error LIKE 'claude-code usage limit:%'
    AND NOT EXISTS (SELECT 1 FROM command_confirm c
                    WHERE c.action = 'CLAUDE_API' AND c.payload->>'job_id' = j.id::text
                      AND c.created_at >= last.since)
    AND NOT EXISTS (SELECT 1 FROM claude_api_grant g
                    WHERE g.job_id = j.id AND g.granted_at >= last.since);

  -- api=on videos (D-119): granted by themselves, one at a time while the month has room.
  PERFORM pg_advisory_xact_lock(hashtext('claude_api_budget'));
  FOR v_job IN SELECT d.* FROM claude_api_due d JOIN job j ON j.id = d.job_id
               WHERE d.auto_by IS NOT NULL ORDER BY j.created_at LOOP
    v_cap := least(v_job.cap, v_limit - v_spent - v_granted);
    EXIT WHEN v_cap < claude_api_min_offer_usd();
    INSERT INTO claude_api_grant (job_id, video_version_id, cap_usd, granted_by, mode)
    VALUES (v_job.job_id, v_job.video_version_id, v_cap, v_job.auto_by, 'AUTO');
    UPDATE job SET next_attempt_at = now() WHERE id = v_job.job_id;
    PERFORM audit('watchdog', 'claude_api_grant', 'job', v_job.job_id::text,
                  jsonb_build_object('result', 'OK', 'mode', 'AUTO', 'cap_usd', v_cap,
                                     'set_by', v_job.auto_by));
    v_granted := v_granted + v_cap;
    RETURN QUERY
    SELECT 'AUTO'::text, NULL::text, v_job.job_id, vv.video_id, vv.version, j.step,
           round(v_cap, 2), round(v_spent, 2), round(v_limit, 2)
    FROM job j JOIN video_version vv ON vv.id = j.video_version_id
    WHERE j.id = v_job.job_id;
  END LOOP;

  -- Everything else gets the owner's button.
  RETURN QUERY
  WITH offered AS (
    INSERT INTO command_confirm (token, action, payload, requested_by, expires_at)
    SELECT replace(gen_random_uuid()::text, '-', ''), 'CLAUDE_API',
           jsonb_build_object('job_id', d.job_id, 'video_version_id', d.video_version_id,
                              'cap_usd', least(d.cap, v_limit - v_spent)),
           0, now() + interval '12 hours'
    FROM claude_api_due d
    WHERE d.auto_by IS NULL
    RETURNING command_confirm.token, command_confirm.payload
  )
  SELECT 'OFFER'::text, o.token, j.id, vv.video_id, vv.version, j.step,
         round((o.payload->>'cap_usd')::numeric, 2), round(v_spent, 2), round(v_limit, 2)
  FROM offered o
  JOIN job j ON j.id = (o.payload->>'job_id')::uuid
  JOIN video_version vv ON vv.id = j.video_version_id
  ORDER BY j.created_at;
END;
$$;

-- migrate:down

DROP FUNCTION claude_api_offers_due();
CREATE FUNCTION claude_api_offers_due()
RETURNS TABLE (
  token text,
  job_id uuid,
  video_id uuid,
  version integer,
  step text,
  cap_usd numeric,
  month_spent_usd numeric,
  month_limit_usd numeric
)
LANGUAGE plpgsql
AS $$
#variable_conflict use_column
DECLARE
  v_limit numeric := claude_api_month_limit();
  v_spent numeric := claude_api_month_spent();
BEGIN
  UPDATE command_confirm c SET status = 'EXPIRED', decided_at = now()
  WHERE c.action = 'CLAUDE_API' AND c.status = 'PENDING'
    AND (c.expires_at <= now()
         OR NOT EXISTS (SELECT 1 FROM job j
                        WHERE j.id = (c.payload->>'job_id')::uuid AND j.status = 'BLOCKED'));

  IF v_limit IS NULL OR v_limit - v_spent < claude_api_min_offer_usd() THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH due AS (
    SELECT j.id, j.video_version_id, least(s.cap_usd, v_limit - v_spent) AS cap
    FROM job j
    JOIN claude_api_step s ON s.step = j.step
    WHERE j.status = 'BLOCKED'
      AND j.last_error LIKE 'claude-code usage limit:%'
      AND NOT EXISTS (
        SELECT 1 FROM command_confirm c
        WHERE c.action = 'CLAUDE_API' AND c.payload->>'job_id' = j.id::text
          AND c.created_at >= coalesce((SELECT max(a.started_at) FROM job_attempt a
                                        WHERE a.job_id = j.id), j.created_at))
  ), offered AS (
    INSERT INTO command_confirm (token, action, payload, requested_by, expires_at)
    SELECT replace(gen_random_uuid()::text, '-', ''), 'CLAUDE_API',
           jsonb_build_object('job_id', d.id, 'video_version_id', d.video_version_id,
                              'cap_usd', d.cap),
           0, now() + interval '12 hours'
    FROM due d
    RETURNING command_confirm.token, command_confirm.payload
  )
  SELECT o.token, j.id, vv.video_id, vv.version, j.step,
         round((o.payload->>'cap_usd')::numeric, 2), round(v_spent, 2), round(v_limit, 2)
  FROM offered o
  JOIN job j ON j.id = (o.payload->>'job_id')::uuid
  JOIN video_version vv ON vv.id = j.video_version_id
  ORDER BY j.created_at;
END;
$$;

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

CREATE OR REPLACE FUNCTION telegram_intake_pick(p_token text, p_user_id bigint, p_kind text, p_slug text)
RETURNS TABLE (result text, token text, expires_at timestamptz, brief jsonb, has_voice boolean,
               selection jsonb, error text)
LANGUAGE plpgsql
AS $$
#variable_conflict use_column
DECLARE
  v_draft intake_draft%ROWTYPE;
  v_brief jsonb;
BEGIN
  IF p_kind NOT IN ('kit', 'character_set') THEN
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
  BEGIN
    v_brief := brief_normalize(jsonb_set(v_draft.brief, ARRAY[p_kind], to_jsonb(p_slug)));
  EXCEPTION WHEN raise_exception THEN
    RETURN QUERY SELECT 'INVALID'::text, NULL::text, NULL::timestamptz, NULL::jsonb,
                        NULL::boolean, NULL::jsonb, SQLERRM;
    RETURN;
  END;
  IF v_brief = v_draft.brief THEN
    RETURN QUERY SELECT 'UNCHANGED'::text, v_draft.token, v_draft.expires_at, v_brief, NULL::boolean,
      intake_selection(v_brief, v_draft.worker_id)
      || jsonb_build_object('auto', v_draft.auto_approve), NULL::text;
    RETURN;
  END IF;
  PERFORM set_config('app.actor', 'telegram:' || p_user_id, true);
  UPDATE intake_draft SET brief = v_brief WHERE id = v_draft.id;
  RETURN QUERY SELECT 'DRAFT'::text, v_draft.token, v_draft.expires_at, v_brief,
    CASE WHEN v_brief ? 'full_brief' THEN v_brief->>'full_brief' ~* '(^|\n)[#*\s]*VOICE' END,
    intake_selection(v_brief, v_draft.worker_id)
      || jsonb_build_object('auto', v_draft.auto_approve), NULL::text;
END;
$$;

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

DROP FUNCTION telegram_intake_draft(bigint, text, jsonb, text, boolean, boolean);
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

DELETE FROM claude_api_grant WHERE mode = 'AUTO' AND confirm_token IS NULL
  AND NOT EXISTS (SELECT 1 FROM claude_api_spend s WHERE s.grant_id = claude_api_grant.id);
UPDATE claude_api_grant SET status = 'CLOSED', closed_at = coalesce(closed_at, now()),
                            close_reason = coalesce(close_reason, 'rollback')
WHERE mode = 'AUTO' AND status = 'GRANTED';
ALTER TABLE claude_api_grant DROP CONSTRAINT claude_api_grant_tap_token;
ALTER TABLE claude_api_grant DROP COLUMN mode;
ALTER TABLE video DROP COLUMN claude_api_auto_at, DROP COLUMN claude_api_auto_by;
ALTER TABLE intake_draft DROP COLUMN claude_api;
