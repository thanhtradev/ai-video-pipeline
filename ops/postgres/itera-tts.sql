-- Configures ITERA TTS (D-040) and makes model_id the one enabled TTS model (eleven_v3, or
-- eleven_v4 for episodes after migration 20261028000200, D-050). Run as the owner role:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -v model_id=<eleven_v3|eleven_v4> \
--     -v voice_id=<ElevenLabs voice id> -v credits_per_char=<number> -v source='<where from>' \
--     -f ops/postgres/itera-tts.sql
-- credits_per_char: ITERA credits billed per narration character for that model
-- (GET /v1/models: model_rates.character_cost_multiplier; ops/phase-2b.md §2). Re-running with a new
-- price closes the old price row and adds a new one (prices are versioned, never overwritten).
-- Other ITERA models are disabled: TTS jobs already created for them wait (cost guard) until
-- their model is enabled again, so switch when no TTS job is pending.
-- No secrets here: the API key lives only in the Mac's Keychain.

\set ON_ERROR_STOP on

-- A mistyped model would otherwise disable every ITERA model below.
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
SET default_params = default_params || jsonb_build_object('voice_id', :'voice_id'::text)
WHERE provider_id = 'itera' AND model_id = :'model_id';

UPDATE provider_price SET valid_to = now()
WHERE valid_to IS NULL
  AND provider_model_id = (SELECT id FROM provider_model
                           WHERE provider_id = 'itera' AND model_id = :'model_id');

INSERT INTO provider_price (provider_model_id, unit, unit_price, currency, valid_from, source_note)
SELECT id, 'per_char', :'credits_per_char'::numeric, 'CRD', now(), :'source'
FROM provider_model WHERE provider_id = 'itera' AND model_id = :'model_id';

UPDATE provider SET enabled = true WHERE id = 'itera';
UPDATE provider_model SET enabled = (model_id = :'model_id')
WHERE provider_id = 'itera';

SELECT audit(current_actor(), 'provider_configured', 'provider', 'itera',
             jsonb_build_object('model_id', :'model_id'::text,
                                'voice_id', :'voice_id'::text,
                                'credits_per_char', :'credits_per_char'::numeric)) \g /dev/null

SELECT p.id, p.enabled AS provider_on, pm.model_id, pm.enabled AS model_on, pm.default_params,
       pr.unit, pr.unit_price, pr.currency, pr.valid_from
FROM provider p
JOIN provider_model pm ON pm.provider_id = p.id
LEFT JOIN provider_price pr ON pr.provider_model_id = pm.id AND pr.valid_to IS NULL
WHERE p.id = 'itera';
COMMIT;
