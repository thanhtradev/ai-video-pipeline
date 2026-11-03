-- Sets the ITERA TTS voice of one kit (D-095): writes
-- provider_model.default_params.kit_voices.<kit> = {voice_id, language_code} for one model. TTS
-- jobs of that kit's videos (created after migration 20261123000100) read with it; other kits keep
-- their language voice (voices.<lang>, else the flat voice_id). Run as the owner role, after
-- listening to a sample of the voice (a TTS call is paid):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -v model_id=eleven_v4 -v kit=science \
--     -v voice_id=<ElevenLabs voice id> -v language_code=vi -f ops/postgres/itera-tts-kit-voice.sql
-- To go back to the language voice: -v voice_id=none removes the kit's entry.
-- No secrets here.

\set ON_ERROR_STOP on

SELECT count(*) = 1 AS model_known FROM provider_model
WHERE provider_id = 'itera' AND model_id = :'model_id' \gset
\if :model_known
\else
  \echo 'Unknown ITERA model; nothing changed.'
  \quit
\endif

SELECT count(*) = 1 AS kit_known FROM catalog_option
WHERE kind = 'kit' AND slug = :'kit' \gset
\if :kit_known
\else
  \echo 'Unknown kit; nothing changed.'
  \quit
\endif

BEGIN;
SELECT set_config('app.actor', 'rollout:' || current_user, true) \g /dev/null

UPDATE provider_model
SET default_params = CASE
  WHEN :'voice_id' = 'none'
    THEN default_params #- ARRAY['kit_voices', :'kit'::text]
  ELSE jsonb_set(
    default_params || jsonb_build_object('kit_voices',
                                         coalesce(default_params->'kit_voices', '{}'::jsonb)),
    ARRAY['kit_voices', :'kit'::text],
    jsonb_build_object('voice_id', :'voice_id'::text, 'language_code', :'language_code'::text))
  END
WHERE provider_id = 'itera' AND model_id = :'model_id';

SELECT audit(current_actor(), 'provider_kit_voice_configured', 'provider', 'itera',
             jsonb_build_object('model_id', :'model_id'::text, 'kit', :'kit'::text,
                                'voice_id', :'voice_id'::text)) \g /dev/null

SELECT model_id, enabled, default_params->'kit_voices' AS kit_voices
FROM provider_model WHERE provider_id = 'itera' AND model_id = :'model_id';
COMMIT;
