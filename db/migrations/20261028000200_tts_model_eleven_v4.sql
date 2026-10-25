-- migrate:up

-- Episodes narrate with ITERA eleven_v4 (D-050): 1 credit per character and up to 10000 characters
-- per request, Vietnamese supported (GET /v1/models, 2026-10-25). Registered disabled and without
-- a price; ops/postgres/itera-tts.sql sets voice and price and makes it the one enabled TTS model.
-- eleven_v3 keeps its row, so past jobs and costs still name the model they used.
INSERT INTO provider_model (provider_id, model_id, default_params, max_concurrency, enabled)
VALUES ('itera', 'eleven_v4', '{"provider": "elevenlabs", "language_code": "vi"}'::jsonb, 1, false);

-- migrate:down

-- Fails on purpose once eleven_v4 has a price, jobs or costs: restore from a backup instead.
DELETE FROM provider_model WHERE provider_id = 'itera' AND model_id = 'eleven_v4';
