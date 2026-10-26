-- migrate:up

-- A2 (PREVIEW approval) of an episode (D-057, docs/episode-pipeline.md §9). When the newest
-- render_episode job succeeds, WF-13 creates its QA job (qa_preview, video QA_RUNNING); when QA
-- passes, it requests A2 and sends the 720p preview with the QA report to Telegram. WF-06 decides
-- through telegram_decide(): Approve creates the 1080p render_final job, Reject cancels, a reply
-- with notes revises the episode code (same rounds as the storyboard). A failed QA is a failed job:
-- the version needs a decision (docs/quality-and-approval.md §3).

INSERT INTO video_status_transition (from_status, to_status) VALUES
  ('AWAITING_PREVIEW_APPROVAL', 'GENERATING_ASSETS');

-- The newest job of a step for a version (any status but CANCELLED), or NULL.
CREATE FUNCTION job_latest(p_version_id uuid, p_step text) RETURNS job
LANGUAGE sql STABLE
AS $$
  SELECT * FROM job
  WHERE video_version_id = p_version_id AND step = p_step AND status <> 'CANCELLED'
  ORDER BY created_at DESC
  LIMIT 1;
$$;

-- The preview of the current episode code: the newest render_episode job, when it renders the
-- newest episode_code job (a revision makes older renders stale).
CREATE FUNCTION preview_render(p_version_id uuid) RETURNS job
LANGUAGE sql STABLE
AS $$
  SELECT r.* FROM (SELECT (job_latest(p_version_id, 'render_episode')).*) r
  WHERE r.id IS NOT NULL
    AND r.input->>'episode_code_job_id' = (episode_code_latest(p_version_id)).id::text;
$$;

-- The QA job of the current preview, or NULL.
CREATE FUNCTION preview_qa(p_version_id uuid) RETURNS job
LANGUAGE sql STABLE
AS $$
  SELECT q.* FROM (SELECT (job_latest(p_version_id, 'qa_preview')).*) q
  WHERE q.id IS NOT NULL
    AND q.input->>'render_job_id' = (preview_render(p_version_id)).id::text;
$$;

-- The approved content is the rendered preview (video and subtitles): SHA-256 over every output's
-- path and digest of the succeeded render.
CREATE FUNCTION preview_payload_hash(p_version_id uuid) RETURNS text
LANGUAGE sql STABLE
AS $$
  SELECT encode(sha256(convert_to(
           string_agg(o->>'path' || ':' || (o->>'sha256'), ',' ORDER BY o->>'path'), 'UTF8')), 'hex')
  FROM jsonb_array_elements(coalesce((preview_render(p_version_id)).output->'outputs', '[]'::jsonb)) o
  WHERE (preview_render(p_version_id)).status = 'SUCCEEDED';
$$;

-- What WF-13 needs to send the preview: the QA job (its media token serves the files, D-055) and
-- its report.
CREATE FUNCTION preview_media(p_version_id uuid) RETURNS jsonb
LANGUAGE sql STABLE
AS $$
  SELECT jsonb_build_object(
           'job_id', q.id,
           'token', q.output->'result'->>'media_token',
           'level', q.output->'result'->>'level',
           'checks', coalesce(q.output->'result'->'checks', '[]'::jsonb),
           'duration_seconds', q.output->'result'->'duration_seconds',
           'loudness', q.output->'result'->'loudness')
  FROM (SELECT (preview_qa(p_version_id)).*) q;
$$;

-- QA of the newest preview (q:light, free).
CREATE FUNCTION preview_qa_job_create(p_version_id uuid) RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_render job := preview_render(p_version_id);
  v_input jsonb;
BEGIN
  IF v_render.id IS NULL OR v_render.status <> 'SUCCEEDED' THEN
    RAISE EXCEPTION 'version % has no finished preview to check', p_version_id;
  END IF;
  v_input := jsonb_build_object('render_job_id', v_render.id,
                                'timing_job_id', v_render.input->'timing_job_id');
  RETURN job_create(p_version_id, 'qa_preview', 'q:light', v_input, md5(v_input::text),
                    '{}'::uuid[], 2);
END;
$$;

-- The final 1080p render of the approved preview's code (q:render, free).
CREATE FUNCTION episode_final_job_create(p_version_id uuid) RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_render job := preview_render(p_version_id);
  v_input jsonb;
BEGIN
  IF v_render.id IS NULL OR v_render.status <> 'SUCCEEDED' THEN
    RAISE EXCEPTION 'version % has no approved preview', p_version_id;
  END IF;
  v_input := jsonb_build_object('episode_code_job_id', v_render.input->'episode_code_job_id',
                                'timing_job_id', v_render.input->'timing_job_id',
                                'quality', 'final');
  RETURN job_create(p_version_id, 'render_final', 'q:render', v_input, md5(v_input::text),
                    '{}'::uuid[], 2);
END;
$$;

-- WF-13: moves episode previews on and returns A2 requests and reminders. A new preview gets its QA
-- job (no row); a passed QA becomes a REQUEST row, returned once.
CREATE FUNCTION preview_approvals_due(p_remind_every interval DEFAULT interval '6 hours')
RETURNS TABLE (
  kind text,
  video_id uuid,
  version integer,
  video_version_id uuid,
  token text,
  expires_at timestamptz,
  round integer,
  title text,
  cost jsonb,
  media jsonb
)
LANGUAGE plpgsql
AS $$
#variable_conflict use_column
DECLARE
  v_row record;
  v_token text;
BEGIN
  PERFORM set_config('app.actor', 'approval-request', true);

  FOR v_row IN
    SELECT vv.id FROM video_version vv
    WHERE vv.status = 'RENDERING_PREVIEW'
      AND vv.brief->>'format' = 'episode'
      AND preview_payload_hash(vv.id) IS NOT NULL
      AND (preview_qa(vv.id)).id IS NULL
    ORDER BY vv.created_at
    FOR UPDATE OF vv SKIP LOCKED
  LOOP
    UPDATE video_version SET status = 'QA_RUNNING' WHERE id = v_row.id;
    PERFORM preview_qa_job_create(v_row.id);
  END LOOP;

  FOR v_row IN
    SELECT vv.id, vv.video_id, vv.version FROM video_version vv
    WHERE vv.status = 'QA_RUNNING'
      AND vv.brief->>'format' = 'episode'
      AND (preview_qa(vv.id)).status = 'SUCCEEDED'
    ORDER BY vv.created_at
    FOR UPDATE OF vv SKIP LOCKED
  LOOP
    UPDATE video_version SET status = 'AWAITING_PREVIEW_APPROVAL' WHERE id = v_row.id;
    v_token := approval_request(v_row.id, 'PREVIEW', preview_payload_hash(v_row.id),
                                interval '72 hours');
    RETURN QUERY
    SELECT 'REQUEST', v_row.video_id, v_row.version, v_row.id, a.token, a.expires_at,
           storyboard_round(v_row.id), script_job_output(v_row.id)->'result'->>'title',
           (SELECT coalesce(jsonb_object_agg(c.currency, c.total), '{}'::jsonb)
            FROM (SELECT trim(currency) AS currency, sum(amount)::float8 AS total
                  FROM cost_entry
                  WHERE video_version_id = v_row.id AND kind = 'ACTUAL'
                  GROUP BY currency) c),
           preview_media(v_row.id)
    FROM approval a WHERE a.token = v_token;
  END LOOP;

  RETURN QUERY
  WITH reminded AS (
    UPDATE approval a
    SET last_reminded_at = now()
    WHERE a.type = 'PREVIEW'
      AND a.status = 'PENDING'
      AND a.expires_at > now()
      AND coalesce(a.last_reminded_at, a.requested_at) <= now() - p_remind_every
    RETURNING a.token, a.expires_at, a.video_version_id
  )
  SELECT 'REMINDER', vv.video_id, vv.version, vv.id, r.token, r.expires_at,
         storyboard_round(vv.id), script_job_output(vv.id)->'result'->>'title', NULL::jsonb,
         NULL::jsonb
  FROM reminded r JOIN video_version vv ON vv.id = r.video_version_id;
END;
$$;

-- An A2 button or reply. Result codes as storyboard_decide.
CREATE FUNCTION preview_decide(p_approval approval, p_user_id bigint, p_action text, p_note text)
RETURNS TABLE (result text, round integer)
LANGUAGE plpgsql
AS $$
#variable_conflict use_column
DECLARE
  v_version_id uuid := p_approval.video_version_id;
  v_result text;
  v_round integer;
BEGIN
  IF p_action = 'REGENERATE' THEN
    RETURN QUERY SELECT 'NOT_SUPPORTED'::text, NULL::integer;
    RETURN;
  END IF;
  IF p_action = 'FEEDBACK' AND btrim(coalesce(p_note, '')) = ''
     AND EXISTS (SELECT 1 FROM approver WHERE telegram_user_id = p_user_id AND active) THEN
    RETURN QUERY SELECT 'EMPTY_NOTE'::text, NULL::integer;
    RETURN;
  END IF;

  v_result := approval_decide(
    p_approval.token, p_user_id,
    CASE p_action WHEN 'APPROVE' THEN 'APPROVED' ELSE 'REJECTED' END,
    coalesce(preview_payload_hash(v_version_id), '')
  );
  IF v_result <> 'OK' THEN
    RETURN QUERY SELECT v_result, NULL::integer;
    RETURN;
  END IF;

  IF p_action = 'APPROVE' THEN
    UPDATE video_version SET status = 'RENDERING_FINAL' WHERE id = v_version_id;
    PERFORM episode_final_job_create(v_version_id);
    RETURN QUERY SELECT 'OK'::text, storyboard_round(v_version_id);
  ELSIF p_action = 'REJECT' THEN
    UPDATE video_version SET status = 'CANCELLED' WHERE id = v_version_id;
    RETURN QUERY SELECT 'OK'::text, storyboard_round(v_version_id);
  ELSE
    -- Notes on the preview revise the code like notes on the storyboard, sharing its rounds.
    UPDATE approval SET decision_note = left(btrim(p_note), 4000) WHERE id = p_approval.id;
    v_round := storyboard_round(v_version_id) + 1;
    IF v_round > storyboard_max_rounds() THEN
      UPDATE video_version SET status = 'NEEDS_DECISION' WHERE id = v_version_id;
      RETURN QUERY SELECT 'NEEDS_DECISION'::text, v_round - 1;
    ELSE
      UPDATE video_version SET status = 'GENERATING_ASSETS' WHERE id = v_version_id;
      PERFORM episode_code_revision_create(v_version_id, left(btrim(p_note), 4000));
      RETURN QUERY SELECT 'OK'::text, v_round;
    END IF;
  END IF;
END;
$$;

-- Same as 20261029000100 plus PREVIEW approvals (preview_decide).
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

-- migrate:down

-- Restores telegram_decide of 20261029000100 (PREVIEW approvals are then left undecided).
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

  IF NOT FOUND OR v_approval.type <> 'STORYBOARD' THEN
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

  SELECT d.result, d.round INTO v_result, v_round
  FROM storyboard_decide(v_approval, p_user_id, p_action, p_note) d;
  IF v_result = 'NOT_ALLOWED' THEN
    RETURN QUERY SELECT v_result, NULL::uuid, NULL::integer, NULL::integer;
    RETURN;
  END IF;
  RETURN QUERY
  SELECT v_result, vv.video_id, vv.version, v_round
  FROM video_version vv WHERE vv.id = v_approval.video_version_id;
END;
$$;
DROP FUNCTION preview_decide(approval, bigint, text, text);
DROP FUNCTION preview_approvals_due(interval);
DROP FUNCTION episode_final_job_create(uuid);
DROP FUNCTION preview_qa_job_create(uuid);
DROP FUNCTION preview_media(uuid);
DROP FUNCTION preview_payload_hash(uuid);
DROP FUNCTION preview_qa(uuid);
DROP FUNCTION preview_render(uuid);
DROP FUNCTION job_latest(uuid, text);
DELETE FROM video_status_transition
WHERE (from_status, to_status) = ('AWAITING_PREVIEW_APPROVAL', 'GENERATING_ASSETS');
