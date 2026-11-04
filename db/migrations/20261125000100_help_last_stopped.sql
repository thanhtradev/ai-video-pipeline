-- migrate:up

-- Simpler Telegram management (D-097).
-- video_ref(): `last` as a video id. It resolves to the newest video that has not finished, for
-- every approver (a video records no creator); anything else passes through, so the telegram_*
-- functions keep checking the user and the prefix.
-- telegram_can_help(): /help and usage replies answer approvers anywhere (the approval chat is
-- checked in WF-06, which knows the chat id).
-- telegram_pending(): also lists current versions that are stopped (NEEDS_DECISION,
-- BLOCKED_PROVIDER) with no open request, after the requests. Those rows have no deadline and
-- nothing to re-post.
--
-- Rollback: drops the two functions and restores telegram_pending of 20261119000100. WF-06 must be
-- rolled back first: its queries call video_ref() and telegram_can_help().

CREATE FUNCTION video_ref(p_ref text) RETURNS text
LANGUAGE sql STABLE
AS $$
  SELECT CASE
    WHEN p_ref = 'last' THEN coalesce((
      SELECT v.id::text
      FROM video v
      JOIN video_version vv ON vv.video_id = v.id AND vv.version = v.current_version
      WHERE NOT video_is_terminal(vv.status)
      ORDER BY vv.created_at DESC, v.id
      LIMIT 1
    ), p_ref)
    ELSE p_ref
  END;
$$;

CREATE FUNCTION telegram_can_help(p_user_id bigint) RETURNS boolean
LANGUAGE sql STABLE
AS $$
  SELECT EXISTS (SELECT 1 FROM approver WHERE telegram_user_id = p_user_id AND active);
$$;

CREATE OR REPLACE FUNCTION telegram_pending(p_user_id bigint, p_prefix text DEFAULT '')
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
  ),
  stopped AS (
    SELECT vv.video_id, vv.version, vv.id AS version_id, vv.status, vv.created_at
    FROM video_version vv
    JOIN video v ON v.id = vv.video_id AND v.current_version = vv.version
    WHERE video_is_blocked(vv.status)
      AND (v_prefix = '' OR v.id::text LIKE v_prefix || '%')
      AND NOT EXISTS (SELECT 1 FROM open o WHERE o.version_id = vv.id)
  )
  SELECT true, r.video_id, r.version,
         coalesce(script_job_output(r.version_id)->'result'->>'title', vv.brief->>'topic'),
         r.type, r.expires_at, r.reminded
  FROM (
    SELECT o.video_id, o.version, o.version_id, o.type, o.expires_at, o.repost AS reminded,
           0 AS section, o.requested_at AS at
    FROM open o
    UNION ALL
    SELECT s.video_id, s.version, s.version_id, s.status, NULL::timestamptz, false,
           1, s.created_at
    FROM stopped s
  ) r
  JOIN video_version vv ON vv.id = r.version_id
  ORDER BY r.section, r.at, r.type;
END;
$$;

-- migrate:down

CREATE OR REPLACE FUNCTION telegram_pending(p_user_id bigint, p_prefix text DEFAULT '')
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

DROP FUNCTION telegram_can_help(bigint);
DROP FUNCTION video_ref(text);
