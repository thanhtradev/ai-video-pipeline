-- migrate:up

-- ITERA's eleven_multilingual_v2 does not support Vietnamese (GET /v1/models, rollout 2026-10-25),
-- so the narration model becomes eleven_v3 (D-043). The registry row is renamed in place: its id,
-- voice and price rows stay, and both models bill 1 credit per character.
UPDATE provider_model SET model_id = 'eleven_v3'
WHERE provider_id = 'itera' AND model_id = 'eleven_multilingual_v2';

-- migrate:down

UPDATE provider_model SET model_id = 'eleven_multilingual_v2'
WHERE provider_id = 'itera' AND model_id = 'eleven_v3';
