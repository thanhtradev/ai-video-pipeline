-- migrate:up

-- Commands that act on many videos ask for a Confirm button first (D-098): /cancel <ids> (owner)
-- and /auto all (any approver). The preview changes nothing and stores the videos it showed. The
-- button works once, for the requester only, for 10 minutes, while they still hold the role. Each
-- video is bound to its version (a newer version is skipped, as Telegram approvals are) and
-- handled on its own, so one failing does not stop the others.
--
-- video_cancel(): the per-video body of ops/postgres/cancel-videos.sql (D-094), which now calls it.
-- Nothing is deleted. A job already running finishes on its worker, but its result is dropped.
--
-- Rollback: drops command_confirm (open confirmations are lost; decisions stay in audit_log) and
-- the functions. WF-06 and ops/postgres/cancel-videos.sql must be rolled back first: they call
-- them.

CREATE TABLE command_confirm (
  token text PRIMARY KEY,
  action text NOT NULL CHECK (action IN ('CANCEL', 'AUTO_ALL')),
  payload jsonb NOT NULL,
  requested_by bigint NOT NULL,
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'CONFIRMED', 'REJECTED', 'EXPIRED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  decided_at timestamptz
);

CREATE FUNCTION command_confirm_create(p_action text, p_payload jsonb, p_user_id bigint)
RETURNS command_confirm
LANGUAGE sql
AS $$
  INSERT INTO command_confirm (token, action, payload, requested_by, expires_at)
  VALUES (replace(gen_random_uuid()::text, '-', ''), p_action, p_payload, p_user_id,
          now() + interval '10 minutes')
  RETURNING *;
$$;

-- Cancels one version; the number of jobs cancelled, or NULL when it had already finished.
CREATE FUNCTION video_cancel(p_version_id uuid, p_actor text, p_prefix text DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_status text;
  v_job uuid;
  v_jobs integer := 0;
BEGIN
  SELECT vv.status INTO v_status FROM video_version vv WHERE vv.id = p_version_id FOR UPDATE;
  IF video_is_terminal(v_status) THEN
    RETURN NULL;
  END IF;

  UPDATE approval SET status = 'SUPERSEDED'
  WHERE video_version_id = p_version_id AND status = 'PENDING';
  FOR v_job IN
    SELECT j.id FROM job j
    WHERE j.video_version_id = p_version_id AND j.status NOT IN ('SUCCEEDED', 'CANCELLED')
  LOOP
    IF job_cancel(v_job, p_actor) THEN
      v_jobs := v_jobs + 1;
    END IF;
  END LOOP;
  UPDATE video_version
  SET status = 'CANCELLED', auto_approve_by = NULL, auto_approve_at = NULL
  WHERE id = p_version_id;
  PERFORM audit(p_actor, 'video_cancelled', 'video_version', p_version_id::text,
                jsonb_build_object('prefix', p_prefix, 'from_status', v_status,
                                   'jobs_cancelled', v_jobs));
  RETURN v_jobs;
END;
$$;

-- /cancel <ids> from Telegram (WF-06): the preview. Results: NOT_OWNER, TOO_MANY, NOTHING (items
-- say why) and OK (a token for the buttons).
CREATE FUNCTION telegram_cancel(p_user_id bigint, p_refs text)
RETURNS TABLE (result text, token text, expires_at timestamptz, items jsonb)
LANGUAGE plpgsql
AS $$
#variable_conflict use_column
DECLARE
  c_max_ids constant integer := 20;
  v_refs text[] := ARRAY(
    SELECT x FROM regexp_split_to_table(lower(btrim(coalesce(p_refs, ''))), '[\s,]+') AS x
    WHERE x <> ''
  );
  v_ref text;
  v_prefix text;
  v_count integer;
  v_row record;
  v_seen uuid[] := '{}';
  v_items jsonb := '[]'::jsonb;
  v_action jsonb := '[]'::jsonb;
  v_confirm command_confirm;
BEGIN
  IF NOT is_owner(p_user_id) THEN
    RETURN QUERY SELECT 'NOT_OWNER'::text, NULL::text, NULL::timestamptz, NULL::jsonb;
    RETURN;
  END IF;
  IF cardinality(v_refs) > c_max_ids THEN
    RETURN QUERY SELECT 'TOO_MANY'::text, NULL::text, NULL::timestamptz, NULL::jsonb;
    RETURN;
  END IF;

  FOREACH v_ref IN ARRAY v_refs LOOP
    v_prefix := video_ref(v_ref);
    v_count := 0;
    IF v_prefix ~ '^[0-9a-f-]{4,36}$' THEN
      SELECT count(*) INTO v_count FROM video v WHERE v.id::text LIKE v_prefix || '%';
    END IF;
    IF v_count <> 1 THEN
      v_items := v_items || jsonb_build_object('ref', v_ref, 'video_id', NULL, 'version', NULL,
        'result', CASE WHEN v_count = 0 THEN 'NOT_FOUND' ELSE 'AMBIGUOUS' END);
      CONTINUE;
    END IF;

    SELECT v.id, vv.id AS version_id, vv.version, vv.status,
           coalesce(script_job_output(vv.id)->'result'->>'title', vv.brief->>'topic') AS title
    INTO v_row
    FROM video v
    JOIN video_version vv ON vv.video_id = v.id AND vv.version = v.current_version
    WHERE v.id::text LIKE v_prefix || '%';
    IF v_row.id = ANY(v_seen) THEN
      CONTINUE;
    END IF;
    v_seen := v_seen || v_row.id;

    v_items := v_items || jsonb_build_object('ref', v_ref, 'video_id', v_row.id,
      'version', v_row.version, 'title', v_row.title, 'status', v_row.status,
      'result', CASE WHEN video_is_terminal(v_row.status) THEN 'ALREADY_' || v_row.status
                     ELSE 'WOULD_CANCEL' END);
    IF NOT video_is_terminal(v_row.status) THEN
      v_action := v_action || jsonb_build_object('video_id', v_row.id, 'version', v_row.version);
    END IF;
  END LOOP;

  IF jsonb_array_length(v_action) = 0 THEN
    RETURN QUERY SELECT 'NOTHING'::text, NULL::text, NULL::timestamptz, v_items;
    RETURN;
  END IF;
  v_confirm := command_confirm_create('CANCEL', jsonb_build_object('items', v_action), p_user_id);
  RETURN QUERY SELECT 'OK'::text, v_confirm.token, v_confirm.expires_at, v_items;
END;
$$;

-- /auto all from Telegram (WF-06). On: a preview of the active videos without /auto. Off: clears
-- /auto at once, since that only reduces automation. Results: NOT_APPROVER, NOTHING, OK, OFF.
-- estimates: the TTS estimates on record per currency (tts_budget), the amount A1 shows.
CREATE FUNCTION telegram_auto_all(p_user_id bigint, p_enable boolean DEFAULT true)
RETURNS TABLE (
  result text,
  token text,
  expires_at timestamptz,
  items jsonb,
  gates integer,
  estimates jsonb,
  no_estimate integer
)
LANGUAGE plpgsql
AS $$
#variable_conflict use_column
DECLARE
  v_actor text := 'telegram:' || p_user_id;
  v_items jsonb;
  v_estimates jsonb;
  v_no_estimate integer;
  v_gates integer;
  v_confirm command_confirm;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM approver WHERE telegram_user_id = p_user_id AND active) THEN
    RETURN QUERY SELECT 'NOT_APPROVER'::text, NULL::text, NULL::timestamptz, NULL::jsonb,
      NULL::integer, NULL::jsonb, NULL::integer;
    RETURN;
  END IF;

  IF NOT p_enable THEN
    PERFORM set_config('app.actor', v_actor, true);
    WITH cleared AS (
      UPDATE video_version vv
      SET auto_approve_by = NULL, auto_approve_at = NULL
      FROM video v
      WHERE v.id = vv.video_id AND v.current_version = vv.version
        AND vv.auto_approve_by IS NOT NULL
        AND NOT video_is_terminal(vv.status)
      RETURNING vv.id, vv.video_id, vv.version
    )
    SELECT coalesce(jsonb_agg(jsonb_build_object('video_id', c.video_id, 'version', c.version)),
                    '[]'::jsonb)
    INTO v_items FROM cleared c;
    PERFORM audit(v_actor, 'auto_approve_all_off', 'video_version', 'all',
                  jsonb_build_object('videos', v_items));
    RETURN QUERY SELECT 'OFF'::text, NULL::text, NULL::timestamptz, v_items,
      NULL::integer, NULL::jsonb, NULL::integer;
    RETURN;
  END IF;

  WITH active AS (
    SELECT vv.id, vv.video_id, vv.version, vv.status, vv.created_at,
           coalesce(script_job_output(vv.id)->'result'->>'title', vv.brief->>'topic') AS title,
           tts_budget(vv.id) AS budget,
           (SELECT a.type FROM approval a
            WHERE a.video_version_id = vv.id AND a.status = 'PENDING' AND a.expires_at > now()
              AND a.type IN ('SCRIPT', 'VOICE', 'STORYBOARD', 'PREVIEW', 'METADATA')
            ORDER BY a.requested_at DESC
            LIMIT 1) AS gate
    FROM video_version vv
    JOIN video v ON v.id = vv.video_id AND v.current_version = vv.version
    WHERE vv.status NOT IN ('ARCHIVING', 'ARCHIVE_VERIFIED', 'COMPLETED', 'SUPERSEDED', 'FAILED',
                            'CANCELLED')
      AND auto_approve_active_by(vv.id) IS NULL
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object('video_id', a.video_id, 'version', a.version,
                                               'title', a.title, 'status', a.status,
                                               'gate', a.gate)
                            ORDER BY a.created_at, a.id), '[]'::jsonb),
         count(a.gate)::integer,
         count(*) FILTER (WHERE a.budget IS NULL)::integer,
         coalesce((SELECT jsonb_object_agg(t.currency, t.amount) FROM (
           SELECT b.budget->>'currency' AS currency, sum((b.budget->>'amount')::numeric) AS amount
           FROM active b WHERE b.budget IS NOT NULL GROUP BY 1
         ) t), '{}'::jsonb)
  INTO v_items, v_gates, v_no_estimate, v_estimates
  FROM active a;

  IF jsonb_array_length(v_items) = 0 THEN
    RETURN QUERY SELECT 'NOTHING'::text, NULL::text, NULL::timestamptz, v_items,
      0, '{}'::jsonb, 0;
    RETURN;
  END IF;
  v_confirm := command_confirm_create('AUTO_ALL', jsonb_build_object('items', v_items), p_user_id);
  RETURN QUERY SELECT 'OK'::text, v_confirm.token, v_confirm.expires_at, v_items, v_gates,
    v_estimates, v_no_estimate;
END;
$$;

-- One video of a confirmed command. Runs in its own subtransaction: an error undoes this video only.
CREATE FUNCTION command_confirm_apply(p_action text, p_item jsonb, p_user_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_actor text := 'telegram:' || p_user_id;
  v_video_id uuid := (p_item->>'video_id')::uuid;
  v_version integer := (p_item->>'version')::integer;
  v_version_id uuid;
  v_jobs integer;
  v_auto record;
  v_out jsonb := jsonb_build_object('video_id', v_video_id, 'version', v_version);
BEGIN
  SELECT vv.id INTO v_version_id
  FROM video v
  JOIN video_version vv ON vv.video_id = v.id AND vv.version = v.current_version
  WHERE v.id = v_video_id AND v.current_version = v_version;
  IF NOT FOUND THEN
    RETURN v_out || jsonb_build_object('result', 'STALE');
  END IF;

  IF p_action = 'CANCEL' THEN
    v_jobs := video_cancel(v_version_id, v_actor);
    RETURN v_out || jsonb_build_object('result', CASE WHEN v_jobs IS NULL THEN 'ALREADY_FINISHED'
                                                      ELSE 'CANCELLED' END);
  END IF;

  SELECT * INTO v_auto FROM telegram_auto(p_user_id, v_video_id::text, true);
  RETURN v_out || jsonb_build_object('result', v_auto.result, 'decided_type', v_auto.decided_type);
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'command_confirm % of video % failed: %', p_action, v_video_id, SQLERRM;
  RETURN v_out || jsonb_build_object('result', 'ERROR');
END;
$$;

-- The buttons of a preview (WF-06). p_action: A confirm, R reject. Results: NOT_FOUND,
-- NOT_REQUESTER, NOT_ALLOWED (lost the role since), ALREADY, EXPIRED, REJECTED, OK.
CREATE FUNCTION telegram_confirm(p_token text, p_user_id bigint, p_action text)
RETURNS TABLE (result text, action text, items jsonb)
LANGUAGE plpgsql
AS $$
#variable_conflict use_column
DECLARE
  v_confirm command_confirm%ROWTYPE;
  v_allowed boolean;
  v_item jsonb;
  v_items jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO v_confirm FROM command_confirm c WHERE c.token = p_token FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'NOT_FOUND'::text, NULL::text, NULL::jsonb;
    RETURN;
  END IF;
  IF v_confirm.requested_by <> p_user_id THEN
    RETURN QUERY SELECT 'NOT_REQUESTER'::text, v_confirm.action, NULL::jsonb;
    RETURN;
  END IF;
  IF v_confirm.status <> 'PENDING' THEN
    RETURN QUERY SELECT 'ALREADY'::text, v_confirm.action, NULL::jsonb;
    RETURN;
  END IF;
  IF v_confirm.expires_at <= now() THEN
    UPDATE command_confirm c SET status = 'EXPIRED', decided_at = now() WHERE c.token = p_token;
    RETURN QUERY SELECT 'EXPIRED'::text, v_confirm.action, NULL::jsonb;
    RETURN;
  END IF;
  v_allowed := CASE v_confirm.action
    WHEN 'CANCEL' THEN is_owner(p_user_id)
    ELSE EXISTS (SELECT 1 FROM approver WHERE telegram_user_id = p_user_id AND active)
  END;
  IF NOT v_allowed THEN
    RETURN QUERY SELECT 'NOT_ALLOWED'::text, v_confirm.action, NULL::jsonb;
    RETURN;
  END IF;

  PERFORM set_config('app.actor', 'telegram:' || p_user_id, true);
  IF p_action <> 'A' THEN
    UPDATE command_confirm c SET status = 'REJECTED', decided_at = now() WHERE c.token = p_token;
    RETURN QUERY SELECT 'REJECTED'::text, v_confirm.action, NULL::jsonb;
    RETURN;
  END IF;

  UPDATE command_confirm c SET status = 'CONFIRMED', decided_at = now() WHERE c.token = p_token;
  FOR v_item IN SELECT value FROM jsonb_array_elements(v_confirm.payload->'items') LOOP
    v_items := v_items || command_confirm_apply(v_confirm.action, v_item, p_user_id);
  END LOOP;
  PERFORM audit('telegram:' || p_user_id, 'command_confirmed', 'command_confirm', p_token,
                jsonb_build_object('action', v_confirm.action, 'items', v_items));
  RETURN QUERY SELECT 'OK'::text, v_confirm.action, v_items;
END;
$$;

-- migrate:down

DROP FUNCTION telegram_confirm(text, bigint, text);
DROP FUNCTION command_confirm_apply(text, jsonb, bigint);
DROP FUNCTION telegram_auto_all(bigint, boolean);
DROP FUNCTION telegram_cancel(bigint, text);
DROP FUNCTION video_cancel(uuid, text, text);
DROP FUNCTION command_confirm_create(text, jsonb, bigint);
DROP TABLE command_confirm;
