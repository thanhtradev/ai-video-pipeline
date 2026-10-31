-- migrate:up

-- The science host is called Chíp (D-078): character set `bip` becomes `chip-science`, shown on
-- Telegram as "Chíp Khoa học" (the "Nếu bạn…" set keeps `chip` / "Chíp (BẠN)"). Briefs, drafts
-- and job inputs that already carry the old slug are rewritten, so running clips keep their cast.

UPDATE catalog_option SET slug = 'chip-science', label = 'Chíp Khoa học'
WHERE kind = 'character_set' AND slug = 'bip';

UPDATE video_version SET brief = jsonb_set(brief, '{character_set}', '"chip-science"')
WHERE brief->>'character_set' = 'bip';

UPDATE intake_draft SET brief = jsonb_set(brief, '{character_set}', '"chip-science"')
WHERE brief->>'character_set' = 'bip';

UPDATE job SET input = jsonb_set(input, '{character_set}', '"chip-science"')
WHERE input->>'character_set' = 'bip';

-- script and script-revision jobs carry the whole brief.
UPDATE job SET input = jsonb_set(input, '{brief,character_set}', '"chip-science"')
WHERE input->'brief'->>'character_set' = 'bip';

-- migrate:down

UPDATE job SET input = jsonb_set(input, '{brief,character_set}', '"bip"')
WHERE input->'brief'->>'character_set' = 'chip-science';

UPDATE job SET input = jsonb_set(input, '{character_set}', '"bip"')
WHERE input->>'character_set' = 'chip-science';

UPDATE intake_draft SET brief = jsonb_set(brief, '{character_set}', '"bip"')
WHERE brief->>'character_set' = 'chip-science';

UPDATE video_version SET brief = jsonb_set(brief, '{character_set}', '"bip"')
WHERE brief->>'character_set' = 'chip-science';

UPDATE catalog_option SET slug = 'bip', label = 'Bíp'
WHERE kind = 'character_set' AND slug = 'chip-science';
