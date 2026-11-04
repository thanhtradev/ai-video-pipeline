-- migrate:up

-- Web console, creating a video (D-103). A draft and then a confirmation, as /new does on Telegram:
-- a double press or a retry after a dropped connection confirms the same draft, which makes one
-- video. intake_draft.chat_id is required but nothing reads it after a draft is made, so a web draft
-- stores 'web'.
--
-- Rollback: drops these functions. Drafts made from the web stay as rows and expire by themselves.

-- minutes: the lengths WF-06's Thoi luong button cycles through (duration_selection).
CREATE FUNCTION web_catalog(p_session text) RETURNS jsonb
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM web_session_user(p_session);
  SELECT jsonb_build_object(
    'kits', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                     'slug', o.slug, 'label', o.label, 'language', o.language,
                     'is_default', o.is_default) ORDER BY o.sort_order, o.slug), '[]'::jsonb)
             FROM catalog_option o WHERE o.kind = 'kit' AND o.enabled),
    'characters', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                           'slug', o.slug, 'label', o.label, 'language', o.language,
                           'is_default', o.is_default) ORDER BY o.sort_order, o.slug), '[]'::jsonb)
                   FROM catalog_option o WHERE o.kind = 'character_set' AND o.enabled),
    'workers', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                        'id', w.id,
                        'online', w.last_seen_at > now() - interval '2 minutes') ORDER BY w.id),
                        '[]'::jsonb)
                FROM worker w
                WHERE w.api_url IS NOT NULL AND w.last_seen_at > now() - interval '1 day'),
    'minutes', '[3, 4, 5, 6, 8, 10, 12]'::jsonb
  ) INTO v_result;
  RETURN v_result;
END;
$$;

-- Results: those of telegram_intake_draft: DRAFT, NOT_APPROVER, INVALID (error says why).
CREATE FUNCTION web_create_draft(p_session text, p_brief jsonb, p_worker_id text, p_auto boolean)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object('result', d.result, 'token', d.token, 'expires_at', d.expires_at,
                            'brief', d.brief, 'selection', d.selection, 'error', d.error)
  FROM telegram_intake_draft(web_session_user(p_session), 'web', p_brief, p_worker_id,
                             coalesce(p_auto, false)) d;
$$;

-- Results: those of intake_decide, with NOT_FOUND also for a draft of someone else, and INVALID when
-- the brief no longer passes (say a kit was disabled since the draft; error says why). NOT_PENDING
-- carries the video an earlier confirmation made. The audit row records the settings that spend
-- money, because intake_decide's own row says only source 'intake'.
CREATE FUNCTION web_create_decide(p_session text, p_token text, p_confirm boolean) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user bigint := web_session_user(p_session);
  v_draft intake_draft%ROWTYPE;
  v_row record;
BEGIN
  SELECT * INTO v_draft FROM intake_draft d
  WHERE d.token = p_token AND d.telegram_user_id = v_user;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('result', 'NOT_FOUND');
  END IF;
  BEGIN
    SELECT * INTO v_row
    FROM intake_decide(p_token, v_user, CASE WHEN p_confirm THEN 'APPROVE' ELSE 'REJECT' END);
  EXCEPTION WHEN raise_exception THEN
    RETURN jsonb_build_object('result', 'INVALID', 'error', SQLERRM);
  END;
  IF v_row.result = 'OK' AND v_row.video_id IS NOT NULL THEN
    PERFORM web_audit(v_user, 'web_create', 'video', v_row.video_id::text,
                      jsonb_build_object('auto', v_draft.auto_approve,
                                         'worker_id', v_draft.worker_id));
  END IF;
  RETURN jsonb_build_object('result', v_row.result, 'video_id', v_row.video_id);
END;
$$;

-- migrate:down

DROP FUNCTION web_create_decide(text, text, boolean);
DROP FUNCTION web_create_draft(text, jsonb, text, boolean);
DROP FUNCTION web_catalog(text);
