-- migrate:up

-- Video ideas (D-083, docs/episode-pipeline.md §12). /ideas on Telegram and a daily WF-16 run
-- queue one idea_request per kit + character pair. The request carries the pair's video history
-- (ideas_history), so Claude can continue a series, follow up on a past video or propose a new
-- topic. Ideas are not video jobs: the job table belongs to videos (dispatch, pinning, failures),
-- so requests have their own small lease (idea_claim / idea_complete / idea_fail / idea_block),
-- claimed by a worker that serves q:light when its queues are empty. ideas_due() hands finished
-- requests to WF-16 once; an idea's button turns it into the usual /new draft (idea_to_draft).

-- The pairs /ideas without arguments and the daily run write ideas for.
CREATE TABLE idea_pair (
  kit text NOT NULL,
  character_set text NOT NULL,
  sort_order integer NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  PRIMARY KEY (kit, character_set)
);

INSERT INTO idea_pair (kit, character_set, sort_order) VALUES
  ('whatif', 'chip', 1),
  ('science', 'chip-science', 2);

CREATE TABLE idea_request (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kit text NOT NULL,
  character_set text NOT NULL,
  idea_count integer NOT NULL CHECK (idea_count BETWEEN 1 AND 10),
  source text NOT NULL CHECK (source IN ('command', 'daily')),
  run_date date NOT NULL,
  requested_by bigint,
  -- Where /ideas was typed; NULL for the daily run (WF-16 uses the approval chat).
  chat_id text,
  history jsonb NOT NULL,
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED')),
  attempt_count integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3 CHECK (max_attempts > 0),
  claimed_by text,
  lease_expires_at timestamptz,
  next_attempt_at timestamptz,
  blocked_until timestamptz,
  blocked_notified_at timestamptz,
  last_error text,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One daily request per pair and day, however often the schedule fires.
CREATE UNIQUE INDEX idea_request_daily_idx ON idea_request (kit, character_set, run_date)
  WHERE source = 'daily';
CREATE INDEX idea_request_status_idx ON idea_request (status, created_at);

CREATE TABLE idea (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES idea_request (id),
  position integer NOT NULL CHECK (position BETWEEN 1 AND 10),
  kind text NOT NULL CHECK (kind IN ('series', 'related', 'new')),
  topic text NOT NULL CHECK (length(topic) BETWEEN 3 AND 500),
  hook text NOT NULL CHECK (length(hook) <= 300),
  angle text NOT NULL CHECK (length(angle) <= 500),
  related_video_id uuid REFERENCES video (id),
  related_title text,
  series_id uuid,
  series_title text CHECK (length(series_title) <= 100),
  episode_no integer CHECK (episode_no BETWEEN 2 AND 99),
  token text NOT NULL UNIQUE CHECK (token ~ '^[0-9a-f]{32}$'),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  used_by bigint,
  draft_token text,
  UNIQUE (request_id, position),
  CHECK ((kind = 'series') = (series_id IS NOT NULL AND episode_no IS NOT NULL)),
  CHECK (kind <> 'related' OR related_video_id IS NOT NULL)
);

-- How many ideas one request asks for, and how long an idea's button works.
CREATE FUNCTION ideas_per_request() RETURNS integer
LANGUAGE sql IMMUTABLE AS $$ SELECT 5; $$;

CREATE FUNCTION idea_lifetime() RETURNS interval
LANGUAGE sql IMMUTABLE AS $$ SELECT interval '7 days'; $$;

-- The history ideas are based on: the pair's latest videos (newest first, latest version each)
-- with title, short summary, status and series link, plus earlier ideas nobody picked.
CREATE FUNCTION ideas_history(p_kit text, p_character_set text, p_limit integer DEFAULT 40)
RETURNS jsonb
LANGUAGE sql STABLE
AS $$
  WITH videos AS (
    SELECT v.id, vv.created_at,
           jsonb_strip_nulls(jsonb_build_object(
             'video_id', v.id,
             'title', coalesce(m.output->'result'->'metadata'->>'title',
                               script_job_output(vv.id)->'result'->>'title',
                               vv.brief->>'topic'),
             'topic', vv.brief->>'topic',
             'summary', left(coalesce(m.output->'result'->'metadata'->>'description',
                                      script_job_output(vv.id)->'result'->>'hook'), 300),
             'status', vv.status,
             'date', to_char(vv.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD'),
             'series', vv.brief->'series',
             'related_to', vv.brief->'related_to'->'video_id')) AS entry
    FROM video v
    JOIN video_version vv ON vv.video_id = v.id AND vv.version = v.current_version
    LEFT JOIN LATERAL (SELECT (final_step(vv.id, 'metadata')).*) m ON true
    WHERE vv.brief->>'format' = 'episode'
      AND vv.brief->>'kit' = p_kit
      AND vv.brief->>'character_set' = p_character_set
    ORDER BY vv.created_at DESC
    LIMIT p_limit
  ),
  unused AS (
    SELECT i.topic, r.created_at, i.position
    FROM idea i
    JOIN idea_request r ON r.id = i.request_id
    WHERE r.kit = p_kit AND r.character_set = p_character_set AND i.used_at IS NULL
    ORDER BY r.created_at DESC, i.position
    LIMIT p_limit
  )
  SELECT jsonb_build_object(
    'videos', coalesce((SELECT jsonb_agg(entry ORDER BY created_at DESC, id) FROM videos),
                       '[]'::jsonb),
    'unused_ideas', coalesce((SELECT jsonb_agg(topic ORDER BY created_at DESC, position)
                              FROM unused), '[]'::jsonb));
$$;

-- Queues one request with the pair's history; NULL when the daily one already exists.
CREATE FUNCTION idea_request_create(p_kit text, p_character_set text, p_source text,
                                    p_run_date date, p_user_id bigint, p_chat_id text)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO idea_request (kit, character_set, idea_count, source, run_date, requested_by,
                            chat_id, history)
  VALUES (p_kit, p_character_set, ideas_per_request(), p_source, p_run_date, p_user_id,
          p_chat_id, ideas_history(p_kit, p_character_set))
  ON CONFLICT (kit, character_set, run_date) WHERE source = 'daily' DO NOTHING
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- /ideas [kit=<slug>] [nhanvat=<slug>]: one row per pair. Results: QUEUED, BUSY (that pair's
-- ideas are still being written), NOT_APPROVER, UNKNOWN_KIT, UNKNOWN_CHARACTER, NO_PAIR.
CREATE FUNCTION telegram_ideas(p_user_id bigint, p_chat_id text, p_kit text, p_character_set text)
RETURNS TABLE (result text, kit text, character_set text)
LANGUAGE plpgsql
AS $$
#variable_conflict use_column
DECLARE
  v_pair record;
  v_found boolean := false;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM approver WHERE telegram_user_id = p_user_id AND active) THEN
    RETURN QUERY SELECT 'NOT_APPROVER'::text, NULL::text, NULL::text;
    RETURN;
  END IF;
  IF p_kit IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM catalog_option o WHERE o.kind = 'kit' AND o.slug = p_kit AND o.enabled
  ) THEN
    RETURN QUERY SELECT 'UNKNOWN_KIT'::text, p_kit, p_character_set;
    RETURN;
  END IF;
  IF p_character_set IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM catalog_option o
    WHERE o.kind = 'character_set' AND o.slug = p_character_set AND o.enabled
  ) THEN
    RETURN QUERY SELECT 'UNKNOWN_CHARACTER'::text, p_kit, p_character_set;
    RETURN;
  END IF;

  PERFORM set_config('app.actor', 'telegram:' || p_user_id, true);
  FOR v_pair IN
    SELECT p_kit AS kit, p_character_set AS character_set, 0 AS sort_order
    WHERE p_kit IS NOT NULL AND p_character_set IS NOT NULL
    UNION ALL
    SELECT p.kit, p.character_set, p.sort_order FROM idea_pair p
    WHERE p.enabled AND NOT (p_kit IS NOT NULL AND p_character_set IS NOT NULL)
      AND (p_kit IS NULL OR p.kit = p_kit)
      AND (p_character_set IS NULL OR p.character_set = p_character_set)
    ORDER BY sort_order
  LOOP
    v_found := true;
    IF EXISTS (
      SELECT 1 FROM idea_request r
      WHERE r.kit = v_pair.kit AND r.character_set = v_pair.character_set
        AND r.source = 'command' AND r.status IN ('PENDING', 'RUNNING')
    ) THEN
      RETURN QUERY SELECT 'BUSY'::text, v_pair.kit, v_pair.character_set;
    ELSE
      PERFORM idea_request_create(v_pair.kit, v_pair.character_set, 'command', current_date,
                                  p_user_id, p_chat_id);
      RETURN QUERY SELECT 'QUEUED'::text, v_pair.kit, v_pair.character_set;
    END IF;
  END LOOP;
  IF NOT v_found THEN
    RETURN QUERY SELECT 'NO_PAIR'::text, p_kit, p_character_set;
  END IF;
END;
$$;

-- WF-16's morning run: one request per enabled pair for the day; returns how many were added.
CREATE FUNCTION ideas_daily(p_run_date date) RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_pair record;
  v_count integer := 0;
BEGIN
  PERFORM set_config('app.actor', 'ideas-daily', true);
  FOR v_pair IN SELECT kit, character_set FROM idea_pair WHERE enabled ORDER BY sort_order LOOP
    IF idea_request_create(v_pair.kit, v_pair.character_set, 'daily', p_run_date,
                           NULL, NULL) IS NOT NULL THEN
      v_count := v_count + 1;
    END IF;
  END LOOP;
  RETURN v_count;
END;
$$;

-- Worker side. SECURITY DEFINER like the job functions: the worker role touches no table.
-- Claims the oldest due request (after returning expired leases); no row when none is due.
CREATE FUNCTION idea_claim(p_worker_id text, p_lease_seconds integer)
RETURNS TABLE (request_id uuid, attempt_no integer, kit text, character_set text,
               idea_count integer, history jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
BEGIN
  PERFORM assert_worker_identity(p_worker_id);
  PERFORM set_config('app.actor', p_worker_id, true);

  UPDATE idea_request
  SET status = CASE WHEN attempt_count >= max_attempts THEN 'FAILED' ELSE 'PENDING' END,
      last_error = 'lease expired', claimed_by = NULL, lease_expires_at = NULL,
      updated_at = now()
  WHERE status = 'RUNNING' AND lease_expires_at < now();

  RETURN QUERY
  WITH next AS (
    SELECT r.id FROM idea_request r
    WHERE r.status = 'PENDING' AND (r.next_attempt_at IS NULL OR r.next_attempt_at <= now())
    ORDER BY r.created_at
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  UPDATE idea_request r
  SET status = 'RUNNING', claimed_by = p_worker_id, attempt_count = r.attempt_count + 1,
      lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      next_attempt_at = NULL, blocked_until = NULL, last_error = NULL, updated_at = now()
  FROM next
  WHERE r.id = next.id
  RETURNING r.id, r.attempt_count, r.kit, r.character_set, r.idea_count, r.history;
END;
$$;

-- Stores the worker's ideas (the first idea_count) and finishes the request; false when it is not
-- running for this worker. Links are checked against the history the request was given, never trusted: a
-- related_video_id or series_id outside it turns the idea into a plain new one. A series started
-- from a past video uses that video's id as series id; episode numbers are computed here.
CREATE FUNCTION idea_complete(p_request_id uuid, p_worker_id text, p_ideas jsonb)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_request idea_request%ROWTYPE;
  v_item jsonb;
  v_position integer := 0;
  v_kind text;
  v_related uuid;
  v_related_title text;
  v_series uuid;
  v_series_title text;
  v_episode integer;
BEGIN
  PERFORM assert_worker_identity(p_worker_id);
  PERFORM set_config('app.actor', p_worker_id, true);
  SELECT * INTO v_request FROM idea_request
  WHERE id = p_request_id AND status = 'RUNNING' AND claimed_by = p_worker_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  -- WF-16 shows one button per idea, so a request always has exactly idea_count ideas.
  IF jsonb_typeof(p_ideas) <> 'array' OR jsonb_array_length(p_ideas) < v_request.idea_count THEN
    RAISE EXCEPTION 'ideas must be an array of at least % ideas', v_request.idea_count;
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_ideas) LIMIT v_request.idea_count LOOP
    v_position := v_position + 1;
    v_kind := coalesce(v_item->>'kind', 'new');

    SELECT (h->>'video_id')::uuid, h->>'title' INTO v_related, v_related_title
    FROM jsonb_array_elements(v_request.history->'videos') h
    WHERE h->>'video_id' = v_item->>'related_video_id';

    SELECT (h->'series'->>'id')::uuid, h->'series'->>'title' INTO v_series, v_series_title
    FROM jsonb_array_elements(v_request.history->'videos') h
    WHERE h->'series'->>'id' = v_item->>'series_id'
    ORDER BY (h->'series'->>'episode')::integer DESC
    LIMIT 1;

    IF v_kind = 'series' AND v_series IS NULL AND v_related IS NOT NULL THEN
      v_series := v_related;
      v_series_title := left(coalesce(nullif(btrim(v_item->>'series_title'), ''),
                                      v_related_title), 100);
    END IF;
    IF v_kind = 'series' AND v_series IS NULL THEN
      v_kind := 'new';
    ELSIF v_kind = 'related' AND v_related IS NULL THEN
      v_kind := 'new';
    END IF;
    IF v_kind <> 'series' THEN
      v_series := NULL;
      v_series_title := NULL;
    END IF;
    IF v_kind = 'new' THEN
      v_related := NULL;
      v_related_title := NULL;
    END IF;

    v_episode := NULL;
    IF v_series IS NOT NULL THEN
      SELECT 1 + greatest(
               coalesce(max((h->'series'->>'episode')::integer), 0),
               CASE WHEN bool_or(h->>'video_id' = v_series::text) THEN 1 ELSE 0 END)
      INTO v_episode
      FROM jsonb_array_elements(v_request.history->'videos') h
      WHERE h->'series'->>'id' = v_series::text OR h->>'video_id' = v_series::text;
    END IF;

    INSERT INTO idea (request_id, position, kind, topic, hook, angle, related_video_id,
                      related_title, series_id, series_title, episode_no, token, expires_at)
    VALUES (p_request_id, v_position, v_kind, btrim(v_item->>'topic'),
            btrim(coalesce(v_item->>'hook', '')), btrim(coalesce(v_item->>'angle', '')),
            v_related, v_related_title, v_series, v_series_title, v_episode,
            replace(gen_random_uuid()::text, '-', ''), now() + idea_lifetime());
  END LOOP;

  UPDATE idea_request
  SET status = 'SUCCEEDED', lease_expires_at = NULL, last_error = NULL, updated_at = now()
  WHERE id = p_request_id;
  RETURN true;
END;
$$;

-- A failed attempt: PENDING again after a backoff while attempts remain, else FAILED. Returns the
-- new status, or LOST when the request is not running for this worker.
CREATE FUNCTION idea_fail(p_request_id uuid, p_worker_id text, p_error text, p_retryable boolean)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_request idea_request%ROWTYPE;
  v_status text;
BEGIN
  PERFORM assert_worker_identity(p_worker_id);
  PERFORM set_config('app.actor', p_worker_id, true);
  SELECT * INTO v_request FROM idea_request
  WHERE id = p_request_id AND status = 'RUNNING' AND claimed_by = p_worker_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 'LOST';
  END IF;
  v_status := CASE
    WHEN p_retryable AND v_request.attempt_count < v_request.max_attempts THEN 'PENDING'
    ELSE 'FAILED'
  END;
  UPDATE idea_request
  SET status = v_status, last_error = left(p_error, 2000), claimed_by = NULL,
      lease_expires_at = NULL, updated_at = now(),
      next_attempt_at = CASE WHEN v_status = 'PENDING'
        THEN now() + make_interval(secs => 30 * power(2, v_request.attempt_count - 1)) END
  WHERE id = p_request_id;
  RETURN v_status;
END;
$$;

-- Claude's usage limit: back to PENDING after p_retry_after_seconds without using an attempt
-- (no provider switch). ideas_due() tells the requester once. Returns BLOCKED or LOST.
CREATE FUNCTION idea_block(p_request_id uuid, p_worker_id text, p_reason text,
                           p_retry_after_seconds integer)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM assert_worker_identity(p_worker_id);
  PERFORM set_config('app.actor', p_worker_id, true);
  UPDATE idea_request
  SET status = 'PENDING', attempt_count = greatest(attempt_count - 1, 0),
      last_error = left(p_reason, 2000), claimed_by = NULL, lease_expires_at = NULL,
      next_attempt_at = now() + make_interval(secs => p_retry_after_seconds),
      blocked_until = now() + make_interval(secs => p_retry_after_seconds),
      updated_at = now()
  WHERE id = p_request_id AND status = 'RUNNING' AND claimed_by = p_worker_id;
  RETURN CASE WHEN FOUND THEN 'BLOCKED' ELSE 'LOST' END;
END;
$$;

-- WF-16, every 30 s: finished requests (IDEAS), failed ones (FAILED) and the first notice of a
-- usage-limit wait (BLOCKED), each returned once. chat_id NULL = the approval chat.
CREATE FUNCTION ideas_due()
RETURNS TABLE (kind text, request_id uuid, source text, chat_id text, kit text,
               character_set text, kit_label text, character_label text, ideas jsonb,
               error text, blocked_until timestamptz)
LANGUAGE plpgsql
AS $$
#variable_conflict use_column
DECLARE
  v_request idea_request%ROWTYPE;
  v_kind text;
BEGIN
  PERFORM set_config('app.actor', 'ideas-due', true);
  FOR v_request IN
    SELECT * FROM idea_request r
    WHERE (r.status IN ('SUCCEEDED', 'FAILED') AND r.delivered_at IS NULL)
       OR (r.status = 'PENDING' AND r.blocked_until > now() AND r.blocked_notified_at IS NULL)
    ORDER BY r.created_at
    FOR UPDATE SKIP LOCKED
  LOOP
    IF v_request.status = 'PENDING' THEN
      v_kind := 'BLOCKED';
      UPDATE idea_request SET blocked_notified_at = now() WHERE id = v_request.id;
    ELSE
      v_kind := CASE WHEN v_request.status = 'SUCCEEDED' THEN 'IDEAS' ELSE 'FAILED' END;
      UPDATE idea_request SET delivered_at = now() WHERE id = v_request.id;
    END IF;
    RETURN QUERY
    SELECT v_kind, v_request.id, v_request.source, v_request.chat_id, v_request.kit,
           v_request.character_set,
           (SELECT o.label FROM catalog_option o WHERE o.kind = 'kit' AND o.slug = v_request.kit),
           (SELECT o.label FROM catalog_option o
            WHERE o.kind = 'character_set' AND o.slug = v_request.character_set),
           CASE WHEN v_kind = 'IDEAS' THEN (
             SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                      'position', i.position, 'kind', i.kind, 'topic', i.topic,
                      'hook', i.hook, 'angle', i.angle, 'token', i.token,
                      'related_title', i.related_title, 'series_title', i.series_title,
                      'episode_no', i.episode_no)) ORDER BY i.position)
             FROM idea i WHERE i.request_id = v_request.id) END,
           CASE WHEN v_kind <> 'IDEAS' THEN v_request.last_error END,
           v_request.blocked_until;
  END LOOP;
END;
$$;

-- An idea's button: the /new draft of telegram_intake_draft() with the idea's topic, pair, hook
-- and angle as notes, and its series / related link. Same columns as telegram_intake_draft, plus
-- results IDEA_NOT_FOUND, IDEA_EXPIRED and IDEA_USED (its draft is still open or was submitted;
-- a cancelled or expired draft frees the idea again).
CREATE FUNCTION idea_to_draft(p_token text, p_user_id bigint, p_chat_id text)
RETURNS TABLE (result text, token text, expires_at timestamptz, brief jsonb, has_voice boolean,
               selection jsonb, error text)
LANGUAGE plpgsql
AS $$
#variable_conflict use_column
DECLARE
  v_idea idea%ROWTYPE;
  v_request idea_request%ROWTYPE;
  v_brief jsonb;
  v_draft record;
BEGIN
  SELECT * INTO v_idea FROM idea i WHERE i.token = p_token FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'IDEA_NOT_FOUND'::text, NULL::text, NULL::timestamptz, NULL::jsonb,
                        NULL::boolean, NULL::jsonb, NULL::text;
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM approver WHERE telegram_user_id = p_user_id AND active) THEN
    RETURN QUERY SELECT 'NOT_APPROVER'::text, NULL::text, NULL::timestamptz, NULL::jsonb,
                        NULL::boolean, NULL::jsonb, NULL::text;
    RETURN;
  END IF;
  IF v_idea.expires_at <= now() THEN
    RETURN QUERY SELECT 'IDEA_EXPIRED'::text, NULL::text, NULL::timestamptz, NULL::jsonb,
                        NULL::boolean, NULL::jsonb, NULL::text;
    RETURN;
  END IF;
  IF EXISTS (
    SELECT 1 FROM intake_draft d
    WHERE d.token = v_idea.draft_token
      AND (d.status = 'SUBMITTED' OR (d.status = 'PENDING' AND d.expires_at > now()))
  ) THEN
    RETURN QUERY SELECT 'IDEA_USED'::text, NULL::text, NULL::timestamptz, NULL::jsonb,
                        NULL::boolean, NULL::jsonb, NULL::text;
    RETURN;
  END IF;

  SELECT * INTO v_request FROM idea_request r WHERE r.id = v_idea.request_id;
  -- Notes are part of the brief the script step reads (Vietnamese video content).
  v_brief := jsonb_strip_nulls(jsonb_build_object(
    'topic', v_idea.topic,
    'kit', v_request.kit,
    'character_set', v_request.character_set,
    'notes', left(concat_ws(E'\n',
                            nullif('Hook gợi ý: ' || nullif(v_idea.hook, ''), ''),
                            nullif('Góc nhìn: ' || nullif(v_idea.angle, ''), '')), 2000),
    'series', CASE WHEN v_idea.series_id IS NOT NULL THEN jsonb_build_object(
      'id', v_idea.series_id, 'title', v_idea.series_title, 'episode', v_idea.episode_no) END,
    'related_to', CASE WHEN v_idea.related_video_id IS NOT NULL THEN jsonb_strip_nulls(
      jsonb_build_object('video_id', v_idea.related_video_id,
                         'title', left(v_idea.related_title, 200))) END));

  SELECT * INTO v_draft FROM telegram_intake_draft(p_user_id, p_chat_id, v_brief) d;
  IF v_draft.result = 'DRAFT' THEN
    UPDATE idea SET used_at = now(), used_by = p_user_id, draft_token = v_draft.token
    WHERE id = v_idea.id;
  END IF;
  RETURN QUERY SELECT v_draft.result, v_draft.token, v_draft.expires_at, v_draft.brief,
                      v_draft.has_voice, v_draft.selection, v_draft.error;
END;
$$;

-- Episode briefs keep an optional series link {id, title, episode} and related_to
-- {video_id, title}, so the script step can refer to the earlier episode and ideas_history can
-- group a series. The previous normalizer runs first, unchanged.
ALTER FUNCTION episode_brief_normalize(jsonb) RENAME TO episode_brief_normalize_base;

CREATE FUNCTION episode_brief_links(p_brief jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  v_uuid text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  v_series jsonb := p_brief->'series';
  v_related jsonb := p_brief->'related_to';
  v_links jsonb := '{}'::jsonb;
BEGIN
  IF v_series IS NOT NULL AND jsonb_typeof(v_series) <> 'null' THEN
    IF jsonb_typeof(v_series) <> 'object'
       OR coalesce(v_series->>'id', '') !~ v_uuid
       OR length(btrim(coalesce(v_series->>'title', ''))) NOT BETWEEN 1 AND 100
       OR jsonb_typeof(v_series->'episode') IS DISTINCT FROM 'number'
       OR (v_series->>'episode')::numeric NOT BETWEEN 2 AND 99
       OR (v_series->>'episode')::numeric <> trunc((v_series->>'episode')::numeric) THEN
      RAISE EXCEPTION 'invalid brief: series needs id (uuid), title (1-100) and episode (2-99)';
    END IF;
    v_links := v_links || jsonb_build_object('series', jsonb_build_object(
      'id', v_series->>'id', 'title', btrim(v_series->>'title'),
      'episode', (v_series->>'episode')::integer));
  END IF;
  IF v_related IS NOT NULL AND jsonb_typeof(v_related) <> 'null' THEN
    IF jsonb_typeof(v_related) <> 'object'
       OR coalesce(v_related->>'video_id', '') !~ v_uuid
       OR length(coalesce(v_related->>'title', '')) > 200 THEN
      RAISE EXCEPTION 'invalid brief: related_to needs video_id (uuid) and a title up to 200';
    END IF;
    v_links := v_links || jsonb_build_object('related_to', jsonb_strip_nulls(jsonb_build_object(
      'video_id', v_related->>'video_id', 'title', nullif(btrim(v_related->>'title'), ''))));
  END IF;
  RETURN v_links;
END;
$$;

CREATE FUNCTION episode_brief_normalize(p_brief jsonb) RETURNS jsonb
LANGUAGE sql STABLE
AS $$ SELECT episode_brief_normalize_base(p_brief) || episode_brief_links(p_brief); $$;

-- migrate:down

DROP FUNCTION episode_brief_normalize(jsonb);
DROP FUNCTION episode_brief_links(jsonb);
ALTER FUNCTION episode_brief_normalize_base(jsonb) RENAME TO episode_brief_normalize;
DROP FUNCTION idea_to_draft(text, bigint, text);
DROP FUNCTION ideas_due();
DROP FUNCTION idea_block(uuid, text, text, integer);
DROP FUNCTION idea_fail(uuid, text, text, boolean);
DROP FUNCTION idea_complete(uuid, text, jsonb);
DROP FUNCTION idea_claim(text, integer);
DROP FUNCTION ideas_daily(date);
DROP FUNCTION telegram_ideas(bigint, text, text, text);
DROP FUNCTION idea_request_create(text, text, text, date, bigint, text);
DROP FUNCTION ideas_history(text, text, integer);
DROP FUNCTION idea_lifetime();
DROP FUNCTION ideas_per_request();
-- Rolling back drops the ideas written so far (they are suggestions, not video state).
DROP TABLE idea;
DROP TABLE idea_request;
DROP TABLE idea_pair;
