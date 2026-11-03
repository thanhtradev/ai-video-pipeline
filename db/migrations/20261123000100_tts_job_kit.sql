-- migrate:up

-- Voice per kit (D-095): every new tts job input carries the video's kit (the brief's kit, else the
-- default kit), so the TTS step can use provider_model.default_params.kit_voices.<kit> before the
-- language voice (voices.<lang>, D-092) and the flat voice. Set a kit's voice with
-- ops/postgres/itera-tts-kit-voice.sql. The idempotency key is computed before this trigger, so
-- existing jobs and retries are unchanged; jobs created before this migration have no kit and keep
-- the language voice.
--
-- Rollback: drops the trigger; kit voices stay in default_params but are no longer used.

CREATE FUNCTION job_input_kit() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.step = 'tts' THEN
    NEW.input := NEW.input || jsonb_build_object('kit', (
      SELECT coalesce(vv.brief->>'kit', catalog_default('kit'))
      FROM video_version vv WHERE vv.id = NEW.video_version_id));
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER job_input_kit BEFORE INSERT ON job
FOR EACH ROW EXECUTE FUNCTION job_input_kit();

-- migrate:down

DROP TRIGGER job_input_kit ON job;
DROP FUNCTION job_input_kit();
