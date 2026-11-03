-- migrate:up

-- /pending on Telegram (D-090): approval requests scroll away in the chat. telegram_pending()
-- lists the open requests of current versions and makes those with a reminder path due now
-- (last_reminded_at = -infinity), so the next poll of script/voice/storyboard/preview approvals
-- or final_due() re-posts them as a reminder with the same token and buttons. No new token is
-- issued, so the original message keeps working too. CLEANUP and DECISION requests have no
-- reminder path and are only listed. Approvers only; strangers get one row with allowed = false.
CREATE FUNCTION telegram_pending(p_user_id bigint, p_prefix text DEFAULT '')
RETURNS TABLE (
  allowed boolean,
  video_id uuid,
  version integer,
  title text,
  type text,
  expires_at timestamptz,
  reminded boolean
)
LANGUAGE plpgsql
AS $$
#variable_conflict use_column
DECLARE
  v_prefix text := lower(btrim(coalesce(p_prefix, '')));
BEGIN
  IF NOT EXISTS (SELECT 1 FROM approver WHERE telegram_user_id = p_user_id AND active) THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::integer, NULL::text, NULL::text,
      NULL::timestamptz, NULL::boolean;
    RETURN;
  END IF;

  RETURN QUERY
  WITH open AS (
    SELECT a.id, vv.video_id, vv.version, vv.id AS version_id, a.type, a.expires_at,
           a.requested_at,
           a.type IN ('SCRIPT', 'VOICE', 'STORYBOARD', 'PREVIEW', 'METADATA') AS repost
    FROM approval a
    JOIN video_version vv ON vv.id = a.video_version_id
    JOIN video v ON v.id = vv.video_id AND v.current_version = vv.version
    WHERE a.status = 'PENDING'
      AND a.expires_at > now()
      AND NOT video_is_terminal(vv.status)
      AND (v_prefix = '' OR v.id::text LIKE v_prefix || '%')
  ),
  due AS (
    UPDATE approval a SET last_reminded_at = '-infinity'
    FROM open o
    WHERE a.id = o.id AND o.repost
    RETURNING a.id
  )
  SELECT true, o.video_id, o.version,
         coalesce(script_job_output(o.version_id)->'result'->>'title', vv.brief->>'topic'),
         o.type, o.expires_at, o.repost
  FROM open o
  JOIN video_version vv ON vv.id = o.version_id
  ORDER BY o.requested_at, o.type;
END;
$$;

-- migrate:down

DROP FUNCTION telegram_pending(bigint, text);
