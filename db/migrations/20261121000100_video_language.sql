-- migrate:up

-- D-092: the language of a video comes from its kit. catalog_option gets a language (mirroring
-- remotion/catalog.json `language`; every existing option is Vietnamese), video_create gives a
-- video the language of its brief's kit (Shorts and briefs without a kit stay 'vi'), and a job
-- trigger replaces the 'language' of any job input with the video's language. The job builders
-- (script_job_create, tts_job_create, tts_take_create, timing_job_create, render_preview_job_create,
-- script_revision_create) keep writing 'language': 'vi'; the trigger is the one place that rule
-- lives, so a new builder cannot forget it. The idempotency key is computed before the trigger,
-- which is fine: it only has to be stable for the same inputs of one version.

ALTER TABLE catalog_option ADD COLUMN language text NOT NULL DEFAULT 'vi'
  CONSTRAINT catalog_option_language CHECK (language IN ('vi', 'en'));

-- The language of a kit; 'vi' for a brief without one (Shorts) or an unknown slug.
CREATE FUNCTION kit_language(p_kit text) RETURNS text
LANGUAGE sql STABLE
AS $$
  SELECT coalesce(
    (SELECT language FROM catalog_option WHERE kind = 'kit' AND slug = p_kit), 'vi');
$$;

-- Same as 20261024000300 plus the language of the brief's kit.
CREATE OR REPLACE FUNCTION video_create(p_batch_id uuid, p_sequence integer, p_aspect_ratio text, p_brief jsonb)
RETURNS TABLE (video_id uuid, version_id uuid)
LANGUAGE plpgsql
AS $$
#variable_conflict use_column
DECLARE
  v_video_id uuid;
  v_version_id uuid;
BEGIN
  INSERT INTO video (batch_id, sequence, aspect_ratio, language)
  VALUES (p_batch_id, p_sequence, p_aspect_ratio, kit_language(p_brief->>'kit'))
  RETURNING id INTO v_video_id;

  INSERT INTO video_version (video_id, version, brief)
  VALUES (v_video_id, 1, p_brief)
  RETURNING id INTO v_version_id;

  RETURN QUERY SELECT v_video_id, v_version_id;
END;
$$;

CREATE FUNCTION job_input_language() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.input ? 'language' THEN
    NEW.input := jsonb_set(NEW.input, '{language}', to_jsonb(
      (SELECT v.language FROM video_version vv JOIN video v ON v.id = vv.video_id
       WHERE vv.id = NEW.video_version_id)));
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER job_input_language BEFORE INSERT ON job
FOR EACH ROW EXECUTE FUNCTION job_input_language();

-- Same as 20261120000100 except the speaking rate follows the kit's language (the script step's
-- WORDS_PER_SECOND: Vietnamese 3.2, English 2.5). STABLE now (reads catalog_option).
CREATE OR REPLACE FUNCTION duration_selection(p_brief jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  c_choices constant integer[] := ARRAY[3, 4, 5, 6, 8, 10, 12];
  c_auto_label constant text := 'Tự động (~6 phút)';
  v_words_per_minute numeric := CASE kit_language(coalesce(p_brief->>'kit', catalog_default('kit')))
                                  WHEN 'en' THEN 2.5 ELSE 3.2 END * 60;
  v_minutes integer := (p_brief->>'duration_minutes')::integer;
  v_words integer;
  v_next integer;
BEGIN
  IF p_brief ? 'full_brief' THEN
    v_words := brief_voice_words(p_brief->>'full_brief');
    RETURN jsonb_build_object(
      'follows_voice', true,
      'voice_words', v_words,
      'voice_minutes', round(v_words / v_words_per_minute, 1));
  END IF;
  SELECT min(c) INTO v_next FROM unnest(c_choices) AS c WHERE c > coalesce(v_minutes, 0);
  RETURN jsonb_build_object(
    'follows_voice', false,
    'minutes', v_minutes,
    'label', CASE WHEN v_minutes IS NULL THEN c_auto_label ELSE v_minutes || ' phút' END,
    'next_minutes', v_next,
    'next_label', CASE WHEN v_next IS NULL THEN 'Tự động' ELSE v_next || ' phút' END);
END;
$$;

-- migrate:down

-- Rollback: English videos keep video.language = 'en'; their later jobs would then be created
-- with 'vi' again, so roll back only when no English video is in progress.

CREATE OR REPLACE FUNCTION duration_selection(p_brief jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  c_choices constant integer[] := ARRAY[3, 4, 5, 6, 8, 10, 12];
  c_words_per_minute constant numeric := 3.2 * 60;
  c_auto_label constant text := 'Tự động (~6 phút)';
  v_minutes integer := (p_brief->>'duration_minutes')::integer;
  v_words integer;
  v_next integer;
BEGIN
  IF p_brief ? 'full_brief' THEN
    v_words := brief_voice_words(p_brief->>'full_brief');
    RETURN jsonb_build_object(
      'follows_voice', true,
      'voice_words', v_words,
      'voice_minutes', round(v_words / c_words_per_minute, 1));
  END IF;
  SELECT min(c) INTO v_next FROM unnest(c_choices) AS c WHERE c > coalesce(v_minutes, 0);
  RETURN jsonb_build_object(
    'follows_voice', false,
    'minutes', v_minutes,
    'label', CASE WHEN v_minutes IS NULL THEN c_auto_label ELSE v_minutes || ' phút' END,
    'next_minutes', v_next,
    'next_label', CASE WHEN v_next IS NULL THEN 'Tự động' ELSE v_next || ' phút' END);
END;
$$;

DROP TRIGGER job_input_language ON job;
DROP FUNCTION job_input_language();

CREATE OR REPLACE FUNCTION video_create(p_batch_id uuid, p_sequence integer, p_aspect_ratio text, p_brief jsonb)
RETURNS TABLE (video_id uuid, version_id uuid)
LANGUAGE plpgsql
AS $$
#variable_conflict use_column
DECLARE
  v_video_id uuid;
  v_version_id uuid;
BEGIN
  INSERT INTO video (batch_id, sequence, aspect_ratio)
  VALUES (p_batch_id, p_sequence, p_aspect_ratio)
  RETURNING id INTO v_video_id;

  INSERT INTO video_version (video_id, version, brief)
  VALUES (v_video_id, 1, p_brief)
  RETURNING id INTO v_version_id;

  RETURN QUERY SELECT v_video_id, v_version_id;
END;
$$;

DROP FUNCTION kit_language(text);
ALTER TABLE catalog_option DROP COLUMN language;
