-- migrate:up

-- The finished video on Telegram (D-073, docs/episode-pipeline.md §10). The bot now talks to a
-- self-hosted Bot API server, which accepts uploads up to 2000 MB instead of 50 MB, so WF-14 sends
-- final.mp4 with the DONE message. DONE rows carry report.final: the qa_final job id and media
-- token that let WF-14 fetch final.mp4 from the worker (as the A2 preview, D-057).

-- What WF-14 needs to fetch final.mp4 from the worker, or NULL when qa_final has no media token.
CREATE FUNCTION final_video(p_version_id uuid) RETURNS jsonb
LANGUAGE sql STABLE
AS $$
  SELECT CASE WHEN q.output->'result'->>'media_token' IS NOT NULL
              THEN jsonb_build_object('job_id', q.id, 'token', q.output->'result'->>'media_token')
         END
  FROM (SELECT (final_step(p_version_id, 'qa_final')).*) q;
$$;

-- Same as 20261105000100 plus report.final on DONE rows.
CREATE OR REPLACE FUNCTION final_due(p_remind_every interval DEFAULT interval '6 hours')
RETURNS TABLE (
  kind text,
  video_id uuid,
  version integer,
  video_version_id uuid,
  token text,
  expires_at timestamptz,
  round integer,
  title text,
  metadata jsonb,
  report jsonb
)
LANGUAGE plpgsql
AS $$
#variable_conflict use_column
DECLARE
  v_row record;
  v_token text;
  v_archive job;
BEGIN
  PERFORM set_config('app.actor', 'approval-request', true);

  FOR v_row IN
    SELECT vv.id FROM video_version vv
    WHERE vv.status = 'RENDERING_FINAL'
      AND vv.brief->>'format' = 'episode'
      AND (final_render(vv.id)).status = 'SUCCEEDED'
      AND (final_step(vv.id, 'qa_final')).id IS NULL
    ORDER BY vv.created_at
    FOR UPDATE OF vv SKIP LOCKED
  LOOP
    PERFORM final_jobs_create(v_row.id);
  END LOOP;

  FOR v_row IN
    SELECT vv.id, vv.video_id, vv.version FROM video_version vv
    WHERE vv.status = 'RENDERING_FINAL'
      AND vv.brief->>'format' = 'episode'
      AND (final_step(vv.id, 'qa_final')).status = 'SUCCEEDED'
      AND metadata_payload_hash(vv.id) IS NOT NULL
    ORDER BY vv.created_at
    FOR UPDATE OF vv SKIP LOCKED
  LOOP
    UPDATE video_version SET status = 'AWAITING_METADATA_APPROVAL' WHERE id = v_row.id;
    v_token := approval_request(v_row.id, 'METADATA', metadata_payload_hash(v_row.id),
                                interval '72 hours');
    RETURN QUERY
    SELECT 'REQUEST', v_row.video_id, v_row.version, v_row.id, a.token, a.expires_at,
           metadata_round(v_row.id), script_job_output(v_row.id)->'result'->>'title',
           (SELECT jsonb_build_object(
                     'job_id', m.id,
                     'token', m.output->'result'->>'media_token',
                     'title', m.output->'result'->'metadata'->>'title',
                     'description', m.output->'result'->'metadata'->>'description',
                     'tags', m.output->'result'->'metadata'->'tags',
                     'thumbnail_shot', m.output->'result'->'metadata'->>'thumbnail_shot',
                     'qa', (final_step(v_row.id, 'qa_final')).output->'result'->'checks',
                     'qa_level', (final_step(v_row.id, 'qa_final')).output->'result'->>'level')
            FROM (SELECT (final_step(v_row.id, 'metadata')).*) m),
           NULL::jsonb
    FROM approval a WHERE a.token = v_token;
  END LOOP;

  FOR v_row IN
    SELECT vv.id, vv.video_id, vv.version FROM video_version vv
    WHERE vv.status = 'ARCHIVING'
      AND (job_latest(vv.id, 'archive')).status = 'SUCCEEDED'
      AND NOT EXISTS (SELECT 1 FROM archive_record r WHERE r.video_version_id = vv.id)
    ORDER BY vv.created_at
    FOR UPDATE OF vv SKIP LOCKED
  LOOP
    v_archive := job_latest(v_row.id, 'archive');
    INSERT INTO archive_record (video_version_id, target, path, file_count, total_bytes,
                                manifest_sha256, verified_at)
    VALUES (v_row.id, v_archive.output->'result'->>'target', v_archive.output->'result'->>'path',
            (v_archive.output->'result'->>'file_count')::integer,
            (v_archive.output->'result'->>'total_bytes')::bigint,
            v_archive.output->'result'->>'manifest_sha256',
            (v_archive.output->'result'->>'verified_at')::timestamptz);
    UPDATE video_version SET status = 'ARCHIVE_VERIFIED' WHERE id = v_row.id;
    v_token := approval_request(v_row.id, 'CLEANUP', v_archive.output->'result'->>'manifest_sha256',
                                interval '7 days');
    RETURN QUERY
    SELECT 'DONE', v_row.video_id, v_row.version, v_row.id, a.token, a.expires_at,
           NULL::integer, script_job_output(v_row.id)->'result'->>'title',
           (final_step(v_row.id, 'metadata')).output->'result'->'metadata',
           video_cost_report(v_row.id) || jsonb_build_object(
             'target', v_archive.output->'result'->>'target',
             'path', v_archive.output->'result'->>'path',
             'file_count', (v_archive.output->'result'->>'file_count')::integer,
             'total_bytes', (v_archive.output->'result'->>'total_bytes')::bigint,
             'local_bytes', (v_archive.output->'result'->>'local_bytes')::bigint,
             'final', final_video(v_row.id))
    FROM approval a WHERE a.token = v_token;
  END LOOP;

  -- The Mac copy was deleted after the owner's approval: done.
  FOR v_row IN
    SELECT vv.id, vv.video_id, vv.version FROM video_version vv
    WHERE vv.status = 'ARCHIVE_VERIFIED'
      AND (job_latest(vv.id, 'cleanup')).status = 'SUCCEEDED'
    ORDER BY vv.created_at
    FOR UPDATE OF vv SKIP LOCKED
  LOOP
    UPDATE video_version SET status = 'COMPLETED' WHERE id = v_row.id;
    RETURN QUERY
    SELECT 'CLEANED', v_row.video_id, v_row.version, v_row.id, NULL::text, NULL::timestamptz,
           NULL::integer, script_job_output(v_row.id)->'result'->>'title', NULL::jsonb,
           (job_latest(v_row.id, 'cleanup')).output->'result';
  END LOOP;

  -- Kept: the owner chose Giữ lại, or the request expired unanswered. No message.
  UPDATE video_version vv SET status = 'COMPLETED'
  WHERE vv.status = 'ARCHIVE_VERIFIED'
    AND (job_latest(vv.id, 'cleanup')).id IS NULL
    AND NOT EXISTS (SELECT 1 FROM approval a
                    WHERE a.video_version_id = vv.id AND a.type = 'CLEANUP'
                      AND a.status IN ('PENDING', 'APPROVED')
                      AND a.expires_at > now());

  RETURN QUERY
  WITH reminded AS (
    UPDATE approval a
    SET last_reminded_at = now()
    WHERE a.type = 'METADATA'
      AND a.status = 'PENDING'
      AND a.expires_at > now()
      AND coalesce(a.last_reminded_at, a.requested_at) <= now() - p_remind_every
    RETURNING a.token, a.expires_at, a.video_version_id
  )
  SELECT 'REMINDER', vv.video_id, vv.version, vv.id, r.token, r.expires_at,
         metadata_round(vv.id), script_job_output(vv.id)->'result'->>'title', NULL::jsonb,
         NULL::jsonb
  FROM reminded r JOIN video_version vv ON vv.id = r.video_version_id;
END;
$$;

-- migrate:down

-- Restores final_due of 20261105000100.
CREATE OR REPLACE FUNCTION final_due(p_remind_every interval DEFAULT interval '6 hours')
RETURNS TABLE (
  kind text,
  video_id uuid,
  version integer,
  video_version_id uuid,
  token text,
  expires_at timestamptz,
  round integer,
  title text,
  metadata jsonb,
  report jsonb
)
LANGUAGE plpgsql
AS $$
#variable_conflict use_column
DECLARE
  v_row record;
  v_token text;
  v_archive job;
BEGIN
  PERFORM set_config('app.actor', 'approval-request', true);

  FOR v_row IN
    SELECT vv.id FROM video_version vv
    WHERE vv.status = 'RENDERING_FINAL'
      AND vv.brief->>'format' = 'episode'
      AND (final_render(vv.id)).status = 'SUCCEEDED'
      AND (final_step(vv.id, 'qa_final')).id IS NULL
    ORDER BY vv.created_at
    FOR UPDATE OF vv SKIP LOCKED
  LOOP
    PERFORM final_jobs_create(v_row.id);
  END LOOP;

  FOR v_row IN
    SELECT vv.id, vv.video_id, vv.version FROM video_version vv
    WHERE vv.status = 'RENDERING_FINAL'
      AND vv.brief->>'format' = 'episode'
      AND (final_step(vv.id, 'qa_final')).status = 'SUCCEEDED'
      AND metadata_payload_hash(vv.id) IS NOT NULL
    ORDER BY vv.created_at
    FOR UPDATE OF vv SKIP LOCKED
  LOOP
    UPDATE video_version SET status = 'AWAITING_METADATA_APPROVAL' WHERE id = v_row.id;
    v_token := approval_request(v_row.id, 'METADATA', metadata_payload_hash(v_row.id),
                                interval '72 hours');
    RETURN QUERY
    SELECT 'REQUEST', v_row.video_id, v_row.version, v_row.id, a.token, a.expires_at,
           metadata_round(v_row.id), script_job_output(v_row.id)->'result'->>'title',
           (SELECT jsonb_build_object(
                     'job_id', m.id,
                     'token', m.output->'result'->>'media_token',
                     'title', m.output->'result'->'metadata'->>'title',
                     'description', m.output->'result'->'metadata'->>'description',
                     'tags', m.output->'result'->'metadata'->'tags',
                     'thumbnail_shot', m.output->'result'->'metadata'->>'thumbnail_shot',
                     'qa', (final_step(v_row.id, 'qa_final')).output->'result'->'checks',
                     'qa_level', (final_step(v_row.id, 'qa_final')).output->'result'->>'level')
            FROM (SELECT (final_step(v_row.id, 'metadata')).*) m),
           NULL::jsonb
    FROM approval a WHERE a.token = v_token;
  END LOOP;

  FOR v_row IN
    SELECT vv.id, vv.video_id, vv.version FROM video_version vv
    WHERE vv.status = 'ARCHIVING'
      AND (job_latest(vv.id, 'archive')).status = 'SUCCEEDED'
      AND NOT EXISTS (SELECT 1 FROM archive_record r WHERE r.video_version_id = vv.id)
    ORDER BY vv.created_at
    FOR UPDATE OF vv SKIP LOCKED
  LOOP
    v_archive := job_latest(v_row.id, 'archive');
    INSERT INTO archive_record (video_version_id, target, path, file_count, total_bytes,
                                manifest_sha256, verified_at)
    VALUES (v_row.id, v_archive.output->'result'->>'target', v_archive.output->'result'->>'path',
            (v_archive.output->'result'->>'file_count')::integer,
            (v_archive.output->'result'->>'total_bytes')::bigint,
            v_archive.output->'result'->>'manifest_sha256',
            (v_archive.output->'result'->>'verified_at')::timestamptz);
    UPDATE video_version SET status = 'ARCHIVE_VERIFIED' WHERE id = v_row.id;
    v_token := approval_request(v_row.id, 'CLEANUP', v_archive.output->'result'->>'manifest_sha256',
                                interval '7 days');
    RETURN QUERY
    SELECT 'DONE', v_row.video_id, v_row.version, v_row.id, a.token, a.expires_at,
           NULL::integer, script_job_output(v_row.id)->'result'->>'title',
           (final_step(v_row.id, 'metadata')).output->'result'->'metadata',
           video_cost_report(v_row.id) || jsonb_build_object(
             'target', v_archive.output->'result'->>'target',
             'path', v_archive.output->'result'->>'path',
             'file_count', (v_archive.output->'result'->>'file_count')::integer,
             'total_bytes', (v_archive.output->'result'->>'total_bytes')::bigint,
             'local_bytes', (v_archive.output->'result'->>'local_bytes')::bigint)
    FROM approval a WHERE a.token = v_token;
  END LOOP;

  -- The Mac copy was deleted after the owner's approval: done.
  FOR v_row IN
    SELECT vv.id, vv.video_id, vv.version FROM video_version vv
    WHERE vv.status = 'ARCHIVE_VERIFIED'
      AND (job_latest(vv.id, 'cleanup')).status = 'SUCCEEDED'
    ORDER BY vv.created_at
    FOR UPDATE OF vv SKIP LOCKED
  LOOP
    UPDATE video_version SET status = 'COMPLETED' WHERE id = v_row.id;
    RETURN QUERY
    SELECT 'CLEANED', v_row.video_id, v_row.version, v_row.id, NULL::text, NULL::timestamptz,
           NULL::integer, script_job_output(v_row.id)->'result'->>'title', NULL::jsonb,
           (job_latest(v_row.id, 'cleanup')).output->'result';
  END LOOP;

  -- Kept: the owner chose Giữ lại, or the request expired unanswered. No message.
  UPDATE video_version vv SET status = 'COMPLETED'
  WHERE vv.status = 'ARCHIVE_VERIFIED'
    AND (job_latest(vv.id, 'cleanup')).id IS NULL
    AND NOT EXISTS (SELECT 1 FROM approval a
                    WHERE a.video_version_id = vv.id AND a.type = 'CLEANUP'
                      AND a.status IN ('PENDING', 'APPROVED')
                      AND a.expires_at > now());

  RETURN QUERY
  WITH reminded AS (
    UPDATE approval a
    SET last_reminded_at = now()
    WHERE a.type = 'METADATA'
      AND a.status = 'PENDING'
      AND a.expires_at > now()
      AND coalesce(a.last_reminded_at, a.requested_at) <= now() - p_remind_every
    RETURNING a.token, a.expires_at, a.video_version_id
  )
  SELECT 'REMINDER', vv.video_id, vv.version, vv.id, r.token, r.expires_at,
         metadata_round(vv.id), script_job_output(vv.id)->'result'->>'title', NULL::jsonb,
         NULL::jsonb
  FROM reminded r JOIN video_version vv ON vv.id = r.video_version_id;
END;
$$;

DROP FUNCTION final_video(uuid);
