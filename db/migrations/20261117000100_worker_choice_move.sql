-- migrate:up

-- D-087: choose the worker of a video on the /new draft, and move a video to another worker.
-- (1) The draft keeps an optional worker (intake_draft.worker_id; NULL = "Tự động", the D-074
--     behaviour where the first worker to start a job pins the video). Create pins the video at
--     once, so even its first job goes to that worker's own queue.
-- (2) /move <video> <worker> (owner only) opens a video_move. While it is open nothing of the video
--     is dispatched; once the video has no job queued or running, the target worker claims it,
--     copies WORK_ROOT/videos/<id> from the source worker's API with a one-attempt token, checks
--     every checkpoint and completes the move, which re-pins the video. Three failed copies give
--     up and leave the video on its old worker. The source copy is never deleted here.

ALTER TABLE intake_draft ADD COLUMN worker_id text;

-- The choices of the draft's Worker button: "Tự động", then every worker n8n can reach (api_url)
-- seen in the last day, by id. A worker without a heartbeat for 2 minutes (the watchdog's
-- threshold) is labelled offline. The current choice plus the next one, as catalog_selection().
CREATE FUNCTION worker_selection(p_worker_id text) RETURNS jsonb
LANGUAGE sql STABLE
AS $$
  WITH choices AS (
    SELECT 0::bigint AS pos, NULL::text AS id, 'Tự động'::text AS label
    UNION ALL
    SELECT row_number() OVER (ORDER BY w.id), w.id,
           w.id || CASE WHEN w.last_seen_at > now() - interval '2 minutes' THEN '' ELSE ' (offline)' END
    FROM worker w
    WHERE w.api_url IS NOT NULL AND w.last_seen_at > now() - interval '1 day'
  ),
  current AS (
    SELECT c.pos, c.label FROM choices c WHERE c.id IS NOT DISTINCT FROM p_worker_id
  ),
  next AS (
    SELECT c.id, c.label FROM choices c
    WHERE c.pos = (coalesce((SELECT pos FROM current), -1) + 1) % (SELECT count(*) FROM choices)
  )
  SELECT jsonb_build_object(
    'slug', p_worker_id,
    'label', coalesce((SELECT label FROM current), p_worker_id || ' (offline)'),
    'next_slug', (SELECT id FROM next),
    'next_label', (SELECT label FROM next));
$$;

-- What a draft shows: the kit and character set (catalog_selection) plus the worker.
CREATE FUNCTION intake_selection(p_brief jsonb, p_worker_id text) RETURNS jsonb
LANGUAGE sql STABLE
AS $$
  SELECT catalog_selection(p_brief) || jsonb_build_object('worker', worker_selection(p_worker_id));
$$;

-- Same as 20261106000100 plus the worker (worker=<id> on /new): a known worker with an API URL,
-- or NULL. An unknown worker is INVALID, never a fallback.
DROP FUNCTION telegram_intake_draft(bigint, text, jsonb);
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

-- Same as 20261106000100 plus kind 'worker' (the Worker button) and the worker in selection.
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
BEGIN
  IF p_kind NOT IN ('kit', 'character_set', 'worker') THEN
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
  v_brief := v_draft.brief;
  v_worker := v_draft.worker_id;
  IF p_kind = 'worker' THEN
    v_worker := worker_selection(v_draft.worker_id)->>'next_slug';
  ELSE
    v_next := catalog_selection(v_draft.brief)->p_kind->>'next_slug';
    v_brief := brief_normalize(jsonb_set(v_draft.brief, ARRAY[p_kind], to_jsonb(v_next)));
  END IF;
  PERFORM set_config('app.actor', 'telegram:' || p_user_id, true);
  UPDATE intake_draft SET brief = v_brief, worker_id = v_worker WHERE id = v_draft.id;
  RETURN QUERY SELECT 'DRAFT'::text, v_draft.token, v_draft.expires_at, v_brief,
    CASE WHEN v_brief ? 'full_brief' THEN v_brief->>'full_brief' ~* '(^|\n)[#*\s]*VOICE' END,
    intake_selection(v_brief, v_worker), NULL::text;
END;
$$;

-- Same as 20261102000100 plus the pin: a draft with a worker pins the new video to it.
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

CREATE TABLE video_move (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid NOT NULL REFERENCES video (id),
  from_worker text NOT NULL,
  to_worker text NOT NULL CHECK (to_worker <> from_worker),
  status text NOT NULL DEFAULT 'WAITING'
    CHECK (status IN ('WAITING', 'COPYING', 'DONE', 'FAILED', 'CANCELLED')),
  -- Proves a copy request to the source worker; new for every attempt, cleared when it ends.
  token text CHECK (token ~ '^[0-9a-f]{32}$'),
  attempt_count integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3 CHECK (max_attempts > 0),
  lease_expires_at timestamptz,
  last_error text,
  requested_by bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  -- Set when WF-08 has announced a DONE or FAILED move.
  notified_at timestamptz
);
CREATE UNIQUE INDEX video_move_one_open ON video_move (video_id)
  WHERE status IN ('WAITING', 'COPYING');
CREATE INDEX video_move_unnotified ON video_move (finished_at)
  WHERE status IN ('DONE', 'FAILED') AND notified_at IS NULL;

CREATE FUNCTION video_move_is_open(p_video_id uuid) RETURNS boolean
LANGUAGE sql STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM video_move m WHERE m.video_id = p_video_id AND m.status IN ('WAITING', 'COPYING')
  );
$$;

CREATE FUNCTION video_has_active_job(p_video_id uuid) RETURNS boolean
LANGUAGE sql STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM job j JOIN video_version vv ON vv.id = j.video_version_id
    WHERE vv.video_id = p_video_id AND j.status IN ('QUEUED', 'RUNNING')
  );
$$;

-- Same as 20261110000100 plus: no job of a video with an open move is dispatched.
CREATE OR REPLACE FUNCTION dispatch_claim(p_stream text, p_max_in_flight integer)
RETURNS TABLE (job_id uuid, step text, video_version_id uuid, queue text)
LANGUAGE plpgsql
AS $$
#variable_conflict use_column
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('dispatch:' || p_stream));

  RETURN QUERY
  WITH in_flight AS (
    SELECT v.worker_id, count(*)::integer AS n
    FROM job j
    JOIN video_version vv ON vv.id = j.video_version_id
    JOIN video v ON v.id = vv.video_id
    WHERE j.stream = p_stream AND j.status IN ('QUEUED', 'RUNNING')
    GROUP BY v.worker_id
  ),
  locked AS (
    SELECT j.id, v.worker_id, b.created_at AS batch_created_at, v.sequence,
           j.created_at AS job_created_at
    FROM job j
    JOIN video_version vv ON vv.id = j.video_version_id
    JOIN video v ON v.id = vv.video_id
    JOIN batch b ON b.id = v.batch_id
    WHERE j.stream = p_stream
      AND j.status = 'READY'
      AND NOT video_is_blocked(vv.status)
      AND NOT video_is_terminal(vv.status)
      AND NOT video_move_is_open(v.id)
    FOR UPDATE OF j SKIP LOCKED
  ),
  ranked AS (
    SELECT l.*, row_number() OVER (
      PARTITION BY l.worker_id ORDER BY l.batch_created_at, l.sequence, l.job_created_at
    ) AS rn
    FROM locked l
  ),
  candidates AS (
    SELECT r.*
    FROM ranked r
    LEFT JOIN in_flight f ON f.worker_id IS NOT DISTINCT FROM r.worker_id
    WHERE r.rn <= p_max_in_flight - coalesce(f.n, 0)
  ),
  claimed AS (
    UPDATE job j
    SET status = 'QUEUED', queued_at = now()
    FROM candidates c
    WHERE j.id = c.id
    RETURNING j.id, j.step, j.video_version_id
  )
  SELECT claimed.id, claimed.step, claimed.video_version_id, job_queue_key(p_stream, c.worker_id)
  FROM claimed
  JOIN candidates c ON c.id = claimed.id
  ORDER BY c.batch_created_at, c.sequence, c.job_created_at;
END;
$$;

-- /move <video id prefix> <worker id> (owner only); p_target NULL cancels a move still waiting.
-- Result codes: REQUESTED (busy: a step is still running, the copy starts after it), PINNED (the
-- video had no worker yet: pinned at once, nothing to copy), CANCELLED, NOT_OWNER, NOT_FOUND,
-- AMBIGUOUS, FINISHED, ALREADY_MOVING, NOT_MOVING, COPYING (too late to cancel), UNKNOWN_WORKER,
-- SAME_WORKER, TARGET_OFFLINE, SOURCE_OFFLINE.
CREATE FUNCTION telegram_move(p_user_id bigint, p_prefix text, p_target text)
RETURNS TABLE (result text, video_id uuid, from_worker text, to_worker text, busy boolean)
LANGUAGE plpgsql
AS $$
#variable_conflict use_column
DECLARE
  c_online constant interval := interval '2 minutes';
  v_prefix text := lower(btrim(coalesce(p_prefix, '')));
  v_count integer;
  v_video video%ROWTYPE;
  v_status text;
  v_move video_move%ROWTYPE;
  v_target worker%ROWTYPE;
  v_actor text := 'telegram:' || p_user_id;
BEGIN
  IF NOT is_owner(p_user_id) THEN
    RETURN QUERY SELECT 'NOT_OWNER'::text, NULL::uuid, NULL::text, NULL::text, NULL::boolean;
    RETURN;
  END IF;
  IF v_prefix ~ '^[0-9a-f-]{4,36}$' THEN
    SELECT count(*) INTO v_count FROM video v WHERE v.id::text LIKE v_prefix || '%';
  ELSE
    v_count := 0;
  END IF;
  IF v_count <> 1 THEN
    RETURN QUERY SELECT CASE WHEN v_count = 0 THEN 'NOT_FOUND' ELSE 'AMBIGUOUS' END,
      NULL::uuid, NULL::text, NULL::text, NULL::boolean;
    RETURN;
  END IF;

  SELECT v.* INTO v_video FROM video v WHERE v.id::text LIKE v_prefix || '%' FOR UPDATE;
  SELECT vv.status INTO v_status
  FROM video_version vv WHERE vv.video_id = v_video.id AND vv.version = v_video.current_version;
  SELECT m.* INTO v_move FROM video_move m
  WHERE m.video_id = v_video.id AND m.status IN ('WAITING', 'COPYING')
  FOR UPDATE;
  PERFORM set_config('app.actor', v_actor, true);

  IF p_target IS NULL THEN
    IF v_move.id IS NULL THEN
      RETURN QUERY SELECT 'NOT_MOVING'::text, v_video.id, v_video.worker_id, NULL::text, NULL::boolean;
    ELSIF v_move.status = 'COPYING' THEN
      RETURN QUERY SELECT 'COPYING'::text, v_video.id, v_move.from_worker, v_move.to_worker, NULL::boolean;
    ELSE
      UPDATE video_move
      SET status = 'CANCELLED', finished_at = now(), updated_at = now()
      WHERE id = v_move.id;
      PERFORM audit(v_actor, 'video_move_cancelled', 'video', v_video.id::text,
                    jsonb_build_object('move_id', v_move.id));
      RETURN QUERY SELECT 'CANCELLED'::text, v_video.id, v_move.from_worker, v_move.to_worker,
                          NULL::boolean;
    END IF;
    RETURN;
  END IF;

  IF video_is_terminal(v_status) THEN
    RETURN QUERY SELECT 'FINISHED'::text, v_video.id, v_video.worker_id, NULL::text, NULL::boolean;
    RETURN;
  END IF;
  IF v_move.id IS NOT NULL THEN
    RETURN QUERY SELECT 'ALREADY_MOVING'::text, v_video.id, v_move.from_worker, v_move.to_worker,
                        NULL::boolean;
    RETURN;
  END IF;
  SELECT w.* INTO v_target FROM worker w WHERE w.id = p_target AND w.api_url IS NOT NULL;
  IF v_target.id IS NULL THEN
    RETURN QUERY SELECT 'UNKNOWN_WORKER'::text, v_video.id, v_video.worker_id, p_target, NULL::boolean;
    RETURN;
  END IF;
  IF v_video.worker_id = p_target THEN
    RETURN QUERY SELECT 'SAME_WORKER'::text, v_video.id, v_video.worker_id, p_target, NULL::boolean;
    RETURN;
  END IF;
  IF v_target.last_seen_at IS NULL OR v_target.last_seen_at < now() - c_online THEN
    RETURN QUERY SELECT 'TARGET_OFFLINE'::text, v_video.id, v_video.worker_id, p_target, NULL::boolean;
    RETURN;
  END IF;
  IF v_video.worker_id IS NULL THEN
    UPDATE video SET worker_id = p_target WHERE id = v_video.id;
    PERFORM audit(v_actor, 'video_pinned', 'video', v_video.id::text,
                  jsonb_build_object('worker_id', p_target));
    RETURN QUERY SELECT 'PINNED'::text, v_video.id, NULL::text, p_target, NULL::boolean;
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM worker w
    WHERE w.id = v_video.worker_id AND w.api_url IS NOT NULL AND w.last_seen_at >= now() - c_online
  ) THEN
    RETURN QUERY SELECT 'SOURCE_OFFLINE'::text, v_video.id, v_video.worker_id, p_target, NULL::boolean;
    RETURN;
  END IF;

  INSERT INTO video_move (video_id, from_worker, to_worker, requested_by)
  VALUES (v_video.id, v_video.worker_id, p_target, p_user_id)
  RETURNING * INTO v_move;
  PERFORM audit(v_actor, 'video_move_requested', 'video', v_video.id::text,
                jsonb_build_object('move_id', v_move.id, 'from', v_move.from_worker,
                                   'to', v_move.to_worker));
  RETURN QUERY SELECT 'REQUESTED'::text, v_video.id, v_move.from_worker, v_move.to_worker,
                      video_has_active_job(v_video.id);
END;
$$;

-- An attempt that ends without completing: back to WAITING, or FAILED after the last attempt.
CREATE FUNCTION video_move_end_attempt(p_move_id uuid, p_error text) RETURNS text
LANGUAGE sql
AS $$
  UPDATE video_move
  SET status = CASE WHEN attempt_count >= max_attempts THEN 'FAILED' ELSE 'WAITING' END,
      finished_at = CASE WHEN attempt_count >= max_attempts THEN now() END,
      last_error = left(p_error, 2000), token = NULL, lease_expires_at = NULL, updated_at = now()
  WHERE id = p_move_id
  RETURNING status;
$$;

-- Ends copies whose lease expired (each counts as a failed attempt) and, with
-- p_offline_after, fails waiting moves whose target worker has gone offline.
CREATE FUNCTION video_move_expire(p_offline_after interval DEFAULT NULL) RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_count integer := 0;
  v_id uuid;
BEGIN
  FOR v_id IN
    SELECT m.id FROM video_move m
    WHERE m.status = 'COPYING' AND m.lease_expires_at < now()
    FOR UPDATE SKIP LOCKED
  LOOP
    PERFORM video_move_end_attempt(v_id, 'lease expired');
    v_count := v_count + 1;
  END LOOP;
  IF p_offline_after IS NOT NULL THEN
    UPDATE video_move m
    SET status = 'FAILED', finished_at = now(), updated_at = now(),
        last_error = 'target worker offline'
    WHERE m.status = 'WAITING'
      AND m.to_worker IN (SELECT o.worker_id FROM worker_offline(p_offline_after) o);
  END IF;
  RETURN v_count;
END;
$$;

-- Worker side, SECURITY DEFINER like the job functions (the worker role touches no table).
-- The target worker claims its oldest waiting move whose video has no job queued or running.
CREATE FUNCTION video_move_claim(p_worker_id text, p_lease_seconds integer)
RETURNS TABLE (move_id uuid, video_id uuid, from_worker text, source_url text, token text,
               attempt_no integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
BEGIN
  PERFORM assert_worker_identity(p_worker_id);
  PERFORM set_config('app.actor', p_worker_id, true);
  PERFORM video_move_expire();

  RETURN QUERY
  WITH next AS (
    SELECT m.id FROM video_move m
    WHERE m.status = 'WAITING'
      AND m.to_worker = p_worker_id
      AND NOT video_has_active_job(m.video_id)
    ORDER BY m.created_at
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  ),
  claimed AS (
    UPDATE video_move m
    SET status = 'COPYING', attempt_count = m.attempt_count + 1,
        token = replace(gen_random_uuid()::text, '-', ''),
        lease_expires_at = now() + make_interval(secs => p_lease_seconds),
        last_error = NULL, updated_at = now()
    FROM next
    WHERE m.id = next.id
    RETURNING m.id, m.video_id, m.from_worker, m.token, m.attempt_count
  )
  SELECT c.id, c.video_id, c.from_worker, w.api_url, c.token, c.attempt_count
  FROM claimed c
  LEFT JOIN worker w ON w.id = c.from_worker;
END;
$$;

-- The source worker's check of a copy request: its own video, the current attempt's token.
CREATE FUNCTION video_move_token_valid(p_worker_id text, p_video_id uuid, p_token text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM assert_worker_identity(p_worker_id);
  RETURN EXISTS (
    SELECT 1 FROM video_move m
    WHERE m.video_id = p_video_id
      AND m.from_worker = p_worker_id
      AND m.status = 'COPYING'
      AND m.lease_expires_at > now()
      AND m.token = p_token
  );
END;
$$;

-- The copy is in place and verified: re-pin the video. LOST when the move is no longer this
-- worker's copy, or the video was re-pinned meanwhile (the move then fails).
CREATE FUNCTION video_move_complete(p_move_id uuid, p_worker_id text) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_move video_move%ROWTYPE;
  v_pinned text;
BEGIN
  PERFORM assert_worker_identity(p_worker_id);
  PERFORM set_config('app.actor', p_worker_id, true);
  SELECT * INTO v_move FROM video_move
  WHERE id = p_move_id AND status = 'COPYING' AND to_worker = p_worker_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 'LOST';
  END IF;
  SELECT worker_id INTO v_pinned FROM video WHERE id = v_move.video_id FOR UPDATE;
  IF v_pinned IS DISTINCT FROM v_move.from_worker THEN
    UPDATE video_move
    SET status = 'FAILED', finished_at = now(), updated_at = now(), token = NULL,
        lease_expires_at = NULL, last_error = 'video was re-pinned during the copy'
    WHERE id = p_move_id;
    RETURN 'LOST';
  END IF;
  UPDATE video SET worker_id = v_move.to_worker WHERE id = v_move.video_id;
  UPDATE video_move
  SET status = 'DONE', finished_at = now(), updated_at = now(), token = NULL, lease_expires_at = NULL
  WHERE id = p_move_id;
  PERFORM audit(p_worker_id, 'video_moved', 'video', v_move.video_id::text,
                jsonb_build_object('move_id', p_move_id, 'from', v_move.from_worker,
                                   'to', v_move.to_worker, 'attempt', v_move.attempt_count));
  RETURN 'DONE';
END;
$$;

-- A failed copy: WAITING (tried again) or FAILED; LOST when it is no longer this worker's copy.
CREATE FUNCTION video_move_fail(p_move_id uuid, p_worker_id text, p_error text) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM assert_worker_identity(p_worker_id);
  PERFORM set_config('app.actor', p_worker_id, true);
  PERFORM 1 FROM video_move
  WHERE id = p_move_id AND status = 'COPYING' AND to_worker = p_worker_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 'LOST';
  END IF;
  RETURN video_move_end_attempt(p_move_id, p_error);
END;
$$;

-- Same as 20261110000100 plus moves: expired copies and moves whose target went offline end
-- here, and each DONE / FAILED move is handed to WF-08 once ('moves').
CREATE OR REPLACE FUNCTION watchdog_run(
  p_stale_after interval DEFAULT interval '10 minutes',
  p_worker_offline_after interval DEFAULT interval '2 minutes'
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_expired integer;
  v_requeued integer;
  v_approvals integer;
  v_offline jsonb;
  v_blocked jsonb;
  v_needs_decision jsonb;
  v_stalled jsonb;
  v_moves jsonb;
BEGIN
  v_expired := job_expire_leases();
  v_requeued := job_requeue_stale(p_stale_after);
  v_approvals := approval_expire();
  PERFORM video_move_expire(p_worker_offline_after);
  SELECT coalesce(jsonb_agg(worker_id ORDER BY worker_id), '[]'::jsonb) INTO v_offline
  FROM worker_offline(p_worker_offline_after);
  SELECT coalesce(jsonb_agg(DISTINCT video_id), '[]'::jsonb) INTO v_blocked
  FROM video_version WHERE status = 'BLOCKED_PROVIDER';
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'video_id', vv.video_id, 'version', vv.version, 'step', f.step, 'error', f.last_error
         ) ORDER BY vv.updated_at), '[]'::jsonb)
  INTO v_needs_decision
  FROM video_version vv
  LEFT JOIN LATERAL (
    SELECT j.step, left(j.last_error, 200) AS last_error
    FROM job j
    WHERE j.video_version_id = vv.id AND j.status = 'FAILED_PERMANENT'
    ORDER BY j.updated_at DESC
    LIMIT 1
  ) f ON true
  WHERE vv.status = 'NEEDS_DECISION';
  SELECT coalesce(jsonb_agg(jsonb_build_object('video_id', s.id, 'worker_id', s.worker_id)
           ORDER BY s.worker_id, s.id), '[]'::jsonb)
  INTO v_stalled
  FROM (
    SELECT DISTINCT v.id, v.worker_id
    FROM video v
    JOIN video_version vv ON vv.video_id = v.id
    JOIN job j ON j.video_version_id = vv.id
    JOIN worker_offline(p_worker_offline_after) o ON o.worker_id = v.worker_id
    WHERE j.status IN ('READY', 'QUEUED')
  ) s;
  WITH announced AS (
    UPDATE video_move m SET notified_at = now()
    WHERE m.status IN ('DONE', 'FAILED') AND m.notified_at IS NULL
    RETURNING m.video_id, m.status, m.from_worker, m.to_worker, m.attempt_count, m.last_error,
              m.finished_at
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'video_id', a.video_id, 'status', a.status, 'from_worker', a.from_worker,
           'to_worker', a.to_worker, 'attempts', a.attempt_count,
           'error', CASE WHEN a.status = 'FAILED' THEN left(a.last_error, 200) END
         ) ORDER BY a.finished_at), '[]'::jsonb)
  INTO v_moves
  FROM announced a;

  RETURN jsonb_build_object(
    'expired_leases', v_expired,
    'requeued', v_requeued,
    'approvals_expired', v_approvals,
    'offline_workers', v_offline,
    'blocked_videos', v_blocked,
    'needs_decision', v_needs_decision,
    'stalled_pinned', v_stalled,
    'moves', v_moves
  );
END;
$$;

-- Same as 20261114000100 plus the open moves from or to each worker.
DROP FUNCTION telegram_workers(bigint);
CREATE FUNCTION telegram_workers(p_user_id bigint)
RETURNS TABLE (
  allowed boolean,
  worker_id text,
  online boolean,
  last_seen_at timestamptz,
  jobs jsonb,
  waiting integer,
  moves jsonb
)
LANGUAGE plpgsql
STABLE
AS $$
#variable_conflict use_column
BEGIN
  IF NOT EXISTS (SELECT 1 FROM approver WHERE telegram_user_id = p_user_id AND active) THEN
    RETURN QUERY SELECT false, NULL::text, NULL::boolean, NULL::timestamptz, NULL::jsonb,
      NULL::integer, NULL::jsonb;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT true, w.id,
         coalesce(w.last_seen_at > now() - interval '2 minutes', false),
         w.last_seen_at,
         (SELECT coalesce(jsonb_agg(jsonb_build_object(
                    'video_id', vv.video_id,
                    'version', vv.version,
                    'title', coalesce(script_job_output(vv.id)->'result'->>'title', vv.brief->>'topic'),
                    'video_status', vv.status,
                    'step', j.step,
                    'attempts', j.attempt_count,
                    'started', (SELECT max(a.started_at) FROM job_attempt a WHERE a.job_id = j.id),
                    'progress', j.progress)
                  ORDER BY j.updated_at), '[]'::jsonb)
          FROM job j
          JOIN video_version vv ON vv.id = j.video_version_id
          WHERE j.status = 'RUNNING' AND j.claimed_by = w.id),
         (SELECT count(*)::integer
          FROM job j
          JOIN video_version vv ON vv.id = j.video_version_id
          JOIN video v ON v.id = vv.video_id
          WHERE v.worker_id = w.id
            AND j.status IN ('READY', 'QUEUED')
            AND NOT video_is_terminal(vv.status)),
         (SELECT coalesce(jsonb_agg(jsonb_build_object(
                    'video_id', m.video_id,
                    'from_worker', m.from_worker,
                    'to_worker', m.to_worker,
                    'status', m.status,
                    'attempts', m.attempt_count)
                  ORDER BY m.created_at), '[]'::jsonb)
          FROM video_move m
          WHERE m.status IN ('WAITING', 'COPYING') AND w.id IN (m.from_worker, m.to_worker))
  FROM worker w
  ORDER BY w.id;
END;
$$;

-- migrate:down

-- Restores telegram_workers of 20261114000100.
DROP FUNCTION telegram_workers(bigint);
CREATE FUNCTION telegram_workers(p_user_id bigint)
RETURNS TABLE (
  allowed boolean,
  worker_id text,
  online boolean,
  last_seen_at timestamptz,
  jobs jsonb,
  waiting integer
)
LANGUAGE plpgsql
STABLE
AS $$
#variable_conflict use_column
BEGIN
  IF NOT EXISTS (SELECT 1 FROM approver WHERE telegram_user_id = p_user_id AND active) THEN
    RETURN QUERY SELECT false, NULL::text, NULL::boolean, NULL::timestamptz, NULL::jsonb,
      NULL::integer;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT true, w.id,
         coalesce(w.last_seen_at > now() - interval '2 minutes', false),
         w.last_seen_at,
         (SELECT coalesce(jsonb_agg(jsonb_build_object(
                    'video_id', vv.video_id,
                    'version', vv.version,
                    'title', coalesce(script_job_output(vv.id)->'result'->>'title', vv.brief->>'topic'),
                    'video_status', vv.status,
                    'step', j.step,
                    'attempts', j.attempt_count,
                    'started', (SELECT max(a.started_at) FROM job_attempt a WHERE a.job_id = j.id),
                    'progress', j.progress)
                  ORDER BY j.updated_at), '[]'::jsonb)
          FROM job j
          JOIN video_version vv ON vv.id = j.video_version_id
          WHERE j.status = 'RUNNING' AND j.claimed_by = w.id),
         (SELECT count(*)::integer
          FROM job j
          JOIN video_version vv ON vv.id = j.video_version_id
          JOIN video v ON v.id = vv.video_id
          WHERE v.worker_id = w.id
            AND j.status IN ('READY', 'QUEUED')
            AND NOT video_is_terminal(vv.status))
  FROM worker w
  ORDER BY w.id;
END;
$$;

-- Restores watchdog_run of 20261110000100.
CREATE OR REPLACE FUNCTION watchdog_run(
  p_stale_after interval DEFAULT interval '10 minutes',
  p_worker_offline_after interval DEFAULT interval '2 minutes'
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_expired integer;
  v_requeued integer;
  v_approvals integer;
  v_offline jsonb;
  v_blocked jsonb;
  v_needs_decision jsonb;
  v_stalled jsonb;
BEGIN
  v_expired := job_expire_leases();
  v_requeued := job_requeue_stale(p_stale_after);
  v_approvals := approval_expire();
  SELECT coalesce(jsonb_agg(worker_id ORDER BY worker_id), '[]'::jsonb) INTO v_offline
  FROM worker_offline(p_worker_offline_after);
  SELECT coalesce(jsonb_agg(DISTINCT video_id), '[]'::jsonb) INTO v_blocked
  FROM video_version WHERE status = 'BLOCKED_PROVIDER';
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'video_id', vv.video_id, 'version', vv.version, 'step', f.step, 'error', f.last_error
         ) ORDER BY vv.updated_at), '[]'::jsonb)
  INTO v_needs_decision
  FROM video_version vv
  LEFT JOIN LATERAL (
    SELECT j.step, left(j.last_error, 200) AS last_error
    FROM job j
    WHERE j.video_version_id = vv.id AND j.status = 'FAILED_PERMANENT'
    ORDER BY j.updated_at DESC
    LIMIT 1
  ) f ON true
  WHERE vv.status = 'NEEDS_DECISION';
  SELECT coalesce(jsonb_agg(jsonb_build_object('video_id', s.id, 'worker_id', s.worker_id)
           ORDER BY s.worker_id, s.id), '[]'::jsonb)
  INTO v_stalled
  FROM (
    SELECT DISTINCT v.id, v.worker_id
    FROM video v
    JOIN video_version vv ON vv.video_id = v.id
    JOIN job j ON j.video_version_id = vv.id
    JOIN worker_offline(p_worker_offline_after) o ON o.worker_id = v.worker_id
    WHERE j.status IN ('READY', 'QUEUED')
  ) s;

  RETURN jsonb_build_object(
    'expired_leases', v_expired,
    'requeued', v_requeued,
    'approvals_expired', v_approvals,
    'offline_workers', v_offline,
    'blocked_videos', v_blocked,
    'needs_decision', v_needs_decision,
    'stalled_pinned', v_stalled
  );
END;
$$;

-- Restores dispatch_claim of 20261110000100.
DROP FUNCTION dispatch_claim(text, integer);
CREATE FUNCTION dispatch_claim(p_stream text, p_max_in_flight integer)
RETURNS TABLE (job_id uuid, step text, video_version_id uuid, queue text)
LANGUAGE plpgsql
AS $$
#variable_conflict use_column
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('dispatch:' || p_stream));

  RETURN QUERY
  WITH in_flight AS (
    SELECT v.worker_id, count(*)::integer AS n
    FROM job j
    JOIN video_version vv ON vv.id = j.video_version_id
    JOIN video v ON v.id = vv.video_id
    WHERE j.stream = p_stream AND j.status IN ('QUEUED', 'RUNNING')
    GROUP BY v.worker_id
  ),
  locked AS (
    SELECT j.id, v.worker_id, b.created_at AS batch_created_at, v.sequence,
           j.created_at AS job_created_at
    FROM job j
    JOIN video_version vv ON vv.id = j.video_version_id
    JOIN video v ON v.id = vv.video_id
    JOIN batch b ON b.id = v.batch_id
    WHERE j.stream = p_stream
      AND j.status = 'READY'
      AND NOT video_is_blocked(vv.status)
      AND NOT video_is_terminal(vv.status)
    FOR UPDATE OF j SKIP LOCKED
  ),
  ranked AS (
    SELECT l.*, row_number() OVER (
      PARTITION BY l.worker_id ORDER BY l.batch_created_at, l.sequence, l.job_created_at
    ) AS rn
    FROM locked l
  ),
  candidates AS (
    SELECT r.*
    FROM ranked r
    LEFT JOIN in_flight f ON f.worker_id IS NOT DISTINCT FROM r.worker_id
    WHERE r.rn <= p_max_in_flight - coalesce(f.n, 0)
  ),
  claimed AS (
    UPDATE job j
    SET status = 'QUEUED', queued_at = now()
    FROM candidates c
    WHERE j.id = c.id
    RETURNING j.id, j.step, j.video_version_id
  )
  SELECT claimed.id, claimed.step, claimed.video_version_id, job_queue_key(p_stream, c.worker_id)
  FROM claimed
  JOIN candidates c ON c.id = claimed.id
  ORDER BY c.batch_created_at, c.sequence, c.job_created_at;
END;
$$;

DROP FUNCTION video_move_fail(uuid, text, text);
DROP FUNCTION video_move_complete(uuid, text);
DROP FUNCTION video_move_token_valid(text, uuid, text);
DROP FUNCTION video_move_claim(text, integer);
DROP FUNCTION video_move_expire(interval);
DROP FUNCTION video_move_end_attempt(uuid, text);
DROP FUNCTION telegram_move(bigint, text, text);
DROP FUNCTION video_has_active_job(uuid);
DROP FUNCTION video_move_is_open(uuid);
-- Move history is dropped with the table; video.worker_id keeps the last pin.
DROP TABLE video_move;

-- Restores intake_decide of 20261102000100.
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

-- Restores telegram_intake_cycle of 20261106000100.
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
  v_next := catalog_selection(v_draft.brief)->p_kind->>'next_slug';
  v_brief := brief_normalize(jsonb_set(v_draft.brief, ARRAY[p_kind], to_jsonb(v_next)));
  PERFORM set_config('app.actor', 'telegram:' || p_user_id, true);
  UPDATE intake_draft SET brief = v_brief WHERE id = v_draft.id;
  RETURN QUERY SELECT 'DRAFT'::text, v_draft.token, v_draft.expires_at, v_brief,
    CASE WHEN v_brief ? 'full_brief' THEN v_brief->>'full_brief' ~* '(^|\n)[#*\s]*VOICE' END,
    catalog_selection(v_brief), NULL::text;
END;
$$;

-- Restores telegram_intake_draft of 20261106000100.
DROP FUNCTION telegram_intake_draft(bigint, text, jsonb, text);
CREATE FUNCTION telegram_intake_draft(p_user_id bigint, p_chat_id text, p_brief jsonb)
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
  BEGIN
    v_brief := brief_normalize(jsonb_set(coalesce(p_brief, '{}'::jsonb), '{format}', '"episode"'));
  EXCEPTION WHEN raise_exception THEN
    RETURN QUERY SELECT 'INVALID'::text, NULL::text, NULL::timestamptz, NULL::jsonb,
                        NULL::boolean, NULL::jsonb, SQLERRM;
    RETURN;
  END;
  PERFORM set_config('app.actor', 'telegram:' || p_user_id, true);
  INSERT INTO intake_draft (token, telegram_user_id, chat_id, brief, expires_at)
  VALUES (v_token, p_user_id, p_chat_id, v_brief, v_expires);
  RETURN QUERY SELECT 'DRAFT'::text, v_token, v_expires, v_brief,
    CASE WHEN v_brief ? 'full_brief' THEN v_brief->>'full_brief' ~* '(^|\n)[#*\s]*VOICE' END,
    catalog_selection(v_brief), NULL::text;
END;
$$;

DROP FUNCTION intake_selection(jsonb, text);
DROP FUNCTION worker_selection(text);
ALTER TABLE intake_draft DROP COLUMN worker_id;
