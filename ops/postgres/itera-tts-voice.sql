-- Sets the ITERA TTS voice of one video language (D-092): writes
-- provider_model.default_params.voices.<language> = {voice_id, language_code} for one model. The
-- flat voice_id / language_code (itera-tts.sql) stay the Vietnamese voice. An English job with no
-- voices.en waits as BLOCKED ("no TTS voice configured for language en"); it never borrows the
-- Vietnamese voice. Run as the owner role, after checking the voice exists on ITERA and reads
-- English well (listen to a sample first: a TTS call is paid):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -v model_id=eleven_v4 -v language=en \
--     -v voice_id=<ElevenLabs voice id> -v language_code=en -f ops/postgres/itera-tts-voice.sql
-- No secrets here.

\set ON_ERROR_STOP on

SELECT count(*) = 1 AS model_known FROM provider_model
WHERE provider_id = 'itera' AND model_id = :'model_id' \gset
\if :model_known
\else
  \echo 'Unknown ITERA model; nothing changed.'
  \quit
\endif

BEGIN;
SELECT set_config('app.actor', 'rollout:' || current_user, true) \g /dev/null

UPDATE provider_model
SET default_params = jsonb_set(
  default_params || jsonb_build_object('voices', coalesce(default_params->'voices', '{}'::jsonb)),
  ARRAY['voices', :'language'::text],
  jsonb_build_object('voice_id', :'voice_id'::text, 'language_code', :'language_code'::text))
WHERE provider_id = 'itera' AND model_id = :'model_id';

SELECT audit(current_actor(), 'provider_voice_configured', 'provider', 'itera',
             jsonb_build_object('model_id', :'model_id'::text, 'language', :'language'::text,
                                'voice_id', :'voice_id'::text)) \g /dev/null

SELECT model_id, enabled, default_params->'voices' AS voices
FROM provider_model WHERE provider_id = 'itera' AND model_id = :'model_id';
COMMIT;
