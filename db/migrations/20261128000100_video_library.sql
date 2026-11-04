-- migrate:up

-- The video library (D-104): every archived video with its publishing title and Drive link, by kit
-- or by character, on the web console and /library.
-- The archive job records the Drive ids of the final video and its folder, read with rclone lsjson,
-- which changes no sharing: a link opens only for accounts with access. A trigger copies them to
-- archive_record, so the two inserts in the long functions of 20261122000100 stay as they are. A
-- malformed id is dropped there: it must not stop a verified archive completing.
-- Older videos get their ids from worker/src/tools/backfill-drive-ids.ts. A video with no id is listed
-- without a link.
--
-- Rollback: drops the functions, trigger and columns. The ids stay in the archive jobs' results, but
-- those from the backfill are lost and it must run again. Roll WF-06 and the console back first.

ALTER TABLE archive_record
  ADD COLUMN drive_file_id text CHECK (drive_file_id ~ '^[A-Za-z0-9_-]{1,200}$'),
  ADD COLUMN drive_folder_id text CHECK (drive_folder_id ~ '^[A-Za-z0-9_-]{1,200}$');

CREATE FUNCTION drive_id_or_null(p_id text) RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE WHEN p_id ~ '^[A-Za-z0-9_-]{1,200}$' THEN p_id END;
$$;

CREATE FUNCTION archive_record_take_drive_ids() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_result jsonb := (job_latest(NEW.video_version_id, 'archive')).output->'result';
BEGIN
  NEW.drive_file_id := coalesce(NEW.drive_file_id, drive_id_or_null(v_result->>'drive_file_id'));
  NEW.drive_folder_id := coalesce(NEW.drive_folder_id,
                                  drive_id_or_null(v_result->>'drive_folder_id'));
  RETURN NEW;
END;
$$;

CREATE TRIGGER archive_record_drive_ids
BEFORE INSERT ON archive_record
FOR EACH ROW EXECUTE FUNCTION archive_record_take_drive_ids();

-- One row per video: its newest archived version, whatever became of the video since, because the
-- copy is still on Drive. A brief with no kit or cast counts as the default, which is what it was
-- made with (catalog_selection). A kit or cast no longer in the catalog has a NULL slug, a group of
-- its own. A disabled option keeps its label. Holds only what is cheap: title and duration take
-- several job lookups, so callers read them for the rows they keep. Not granted to any role:
-- web_library and telegram_library are the ways in.
CREATE FUNCTION library_rows()
RETURNS TABLE (
  video_id uuid,
  version integer,
  version_id uuid,
  brief jsonb,
  status text,
  kit text,
  kit_label text,
  kit_sort integer,
  character_set text,
  character_label text,
  character_sort integer,
  language text,
  archived_at timestamptz,
  file_url text,
  folder_url text
)
LANGUAGE sql STABLE
AS $$
  SELECT DISTINCT ON (v.id)
         v.id, vv.version, vv.id, vv.brief, vv.status,
         kit.slug, kit.label, kit.sort_order,
         cast_option.slug, cast_option.label, cast_option.sort_order,
         v.language,
         r.verified_at,
         'https://drive.google.com/file/d/' || r.drive_file_id || '/view',
         'https://drive.google.com/drive/folders/' || r.drive_folder_id
  FROM archive_record r
  JOIN video_version vv ON vv.id = r.video_version_id
  JOIN video v ON v.id = vv.video_id
  LEFT JOIN catalog_option kit
    ON kit.kind = 'kit' AND kit.slug = coalesce(vv.brief->>'kit', catalog_default('kit'))
  LEFT JOIN catalog_option cast_option
    ON cast_option.kind = 'character_set'
   AND cast_option.slug = coalesce(vv.brief->>'character_set', catalog_default('character_set'))
  ORDER BY v.id, vv.version DESC;
$$;

-- The publishing title, the same text as the archived metadata.json, else the script's or the topic.
CREATE FUNCTION library_title(p_version_id uuid, p_brief jsonb) RETURNS text
LANGUAGE sql STABLE
AS $$
  SELECT coalesce((final_step(p_version_id, 'metadata')).output->'result'->'metadata'->>'title',
                  web_video_title(p_version_id, p_brief));
$$;

-- p_group: kit or character. Items are ordered by group and then newest first, so a page can be cut
-- anywhere; groups count every match, not just this page.
CREATE FUNCTION web_library(p_session text, p_group text, p_search text, p_limit integer,
                            p_offset integer) RETURNS jsonb
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  c_max_limit constant integer := 500;
  v_search text := lower(btrim(coalesce(p_search, '')));
  v_limit integer := least(greatest(coalesce(p_limit, c_max_limit), 1), c_max_limit);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_result jsonb;
BEGIN
  PERFORM web_session_user(p_session);
  IF p_group NOT IN ('kit', 'character') THEN
    RAISE EXCEPTION 'invalid group %', p_group;
  END IF;

  WITH matched AS (
    SELECT r.*,
           CASE p_group WHEN 'kit' THEN r.kit ELSE r.character_set END AS group_slug,
           CASE p_group WHEN 'kit' THEN r.kit_label ELSE r.character_label END AS group_label,
           CASE p_group WHEN 'kit' THEN r.kit_sort ELSE r.character_sort END AS group_sort
    FROM library_rows() r
    WHERE v_search = ''
       OR starts_with(r.video_id::text, v_search)
       OR strpos(lower(library_title(r.version_id, r.brief)), v_search) > 0
  ),
  page AS (
    SELECT m.*,
           row_number() OVER (ORDER BY m.group_sort NULLS LAST, m.archived_at DESC, m.video_id) AS pos
    FROM matched m
    ORDER BY pos
    LIMIT v_limit OFFSET v_offset
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM matched),
    'groups', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('slug', g.group_slug, 'label', g.group_label,
                                                   'count', g.n)
                                ORDER BY g.group_sort NULLS LAST), '[]'::jsonb)
      FROM (SELECT m.group_slug, m.group_label, m.group_sort, count(*) AS n
            FROM matched m GROUP BY 1, 2, 3) g
    ),
    'items', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
               'video_id', p.video_id,
               'version', p.version,
               'status', p.status,
               'title', library_title(p.version_id, p.brief),
               'group_slug', p.group_slug,
               'kit', p.kit,
               'kit_label', p.kit_label,
               'character_set', p.character_set,
               'character_label', p.character_label,
               'language', p.language,
               'duration_seconds',
                 ((final_step(p.version_id, 'qa_final')).output->'result'->>'duration_seconds')::float8,
               'archived_at', p.archived_at,
               'file_url', p.file_url,
               'folder_url', p.folder_url) ORDER BY p.pos), '[]'::jsonb)
      FROM page p
    )
  ) INTO v_result;
  RETURN v_result;
END;
$$;

-- /library from Telegram (WF-06). No filter: each kit's count and 5 newest. A filter: the 20 newest
-- that match. Non-approver: one row with allowed false. Nothing found: one row with no video.
CREATE FUNCTION telegram_library(p_user_id bigint, p_kit text DEFAULT NULL,
                                 p_character_set text DEFAULT NULL)
RETURNS TABLE (
  allowed boolean,
  group_slug text,
  group_label text,
  group_total integer,
  video_id uuid,
  title text,
  file_url text
)
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  c_per_kit constant integer := 5;
  c_filtered constant integer := 20;
  v_is_filtered boolean := p_kit IS NOT NULL OR p_character_set IS NOT NULL;
  v_found boolean := false;
  v_row record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM approver a WHERE a.telegram_user_id = p_user_id AND a.active) THEN
    RETURN QUERY SELECT false, NULL::text, NULL::text, NULL::integer, NULL::uuid, NULL::text,
                        NULL::text;
    RETURN;
  END IF;

  FOR v_row IN
    WITH matched AS (
      SELECT r.*,
             CASE WHEN p_kit IS NULL AND p_character_set IS NOT NULL THEN r.character_set
                  ELSE r.kit END AS slug,
             CASE WHEN p_kit IS NULL AND p_character_set IS NOT NULL THEN r.character_label
                  ELSE r.kit_label END AS label,
             CASE WHEN p_kit IS NULL AND p_character_set IS NOT NULL THEN r.character_sort
                  ELSE r.kit_sort END AS sort
      FROM library_rows() r
      WHERE (p_kit IS NULL OR r.kit = p_kit)
        AND (p_character_set IS NULL OR r.character_set = p_character_set)
    ),
    ranked AS (
      SELECT m.*,
             count(*) OVER (PARTITION BY m.slug) AS total,
             row_number() OVER (PARTITION BY m.slug
                                ORDER BY m.archived_at DESC, m.video_id) AS pos
      FROM matched m
    )
    SELECT * FROM ranked x
    WHERE x.pos <= CASE WHEN v_is_filtered THEN c_filtered ELSE c_per_kit END
    ORDER BY x.sort NULLS LAST, x.pos
  LOOP
    v_found := true;
    allowed := true;
    group_slug := v_row.slug;
    group_label := v_row.label;
    group_total := v_row.total;
    video_id := v_row.video_id;
    title := library_title(v_row.version_id, v_row.brief);
    file_url := v_row.file_url;
    RETURN NEXT;
  END LOOP;
  IF NOT v_found THEN
    RETURN QUERY SELECT true, NULL::text, NULL::text, 0, NULL::uuid, NULL::text, NULL::text;
  END IF;
END;
$$;

-- The backfill tool, for videos archived before this migration.
CREATE FUNCTION archive_records_missing_drive_ids()
RETURNS TABLE (video_version_id uuid, path text)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT r.video_version_id, r.path
  FROM archive_record r
  WHERE r.target = 'gdrive' AND (r.drive_file_id IS NULL OR r.drive_folder_id IS NULL)
  ORDER BY r.verified_at;
$$;

-- Fills only what is empty, so a rerun never replaces an id already recorded.
CREATE FUNCTION archive_record_set_drive_ids(p_worker_id text, p_version_id uuid, p_file_id text,
                                             p_folder_id text) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM assert_worker_identity(p_worker_id);
  UPDATE archive_record
  SET drive_file_id = coalesce(drive_file_id, drive_id_or_null(p_file_id)),
      drive_folder_id = coalesce(drive_folder_id, drive_id_or_null(p_folder_id))
  WHERE video_version_id = p_version_id AND target = 'gdrive';
  IF FOUND THEN
    PERFORM audit(p_worker_id, 'archive_drive_ids', 'video_version', p_version_id::text,
                  jsonb_build_object('source', 'backfill'));
  END IF;
END;
$$;

-- migrate:down

DROP FUNCTION archive_record_set_drive_ids(text, uuid, text, text);
DROP FUNCTION archive_records_missing_drive_ids();
DROP FUNCTION telegram_library(bigint, text, text);
DROP FUNCTION web_library(text, text, text, integer, integer);
DROP FUNCTION library_title(uuid, jsonb);
DROP FUNCTION library_rows();
DROP TRIGGER archive_record_drive_ids ON archive_record;
DROP FUNCTION archive_record_take_drive_ids();
DROP FUNCTION drive_id_or_null(text);
ALTER TABLE archive_record DROP COLUMN drive_folder_id, DROP COLUMN drive_file_id;
