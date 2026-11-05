-- migrate:up

-- D-111: the horror kit's cast is "Bóng" (bong, hero TÔI): silhouettes and a first-person witness
-- script. The Mùn cast (D-106) is switched off, not removed: videos and drafts that used it keep
-- resolving, and remotion/catalog.json still lists it. /ideas pairs the kit with the new cast.

INSERT INTO catalog_option (kind, slug, label, sort_order, is_default, language) VALUES
  ('character_set', 'bong', 'Bóng', 5, false, 'vi');
UPDATE catalog_option SET enabled = false WHERE kind = 'character_set' AND slug = 'mun';
UPDATE idea_pair SET enabled = false WHERE kit = 'horror' AND character_set = 'mun';
INSERT INTO idea_pair (kit, character_set, sort_order) VALUES ('horror', 'bong', 4);

-- migrate:down

DELETE FROM idea_pair WHERE kit = 'horror' AND character_set = 'bong';
UPDATE idea_pair SET enabled = true WHERE kit = 'horror' AND character_set = 'mun';
UPDATE catalog_option SET enabled = true WHERE kind = 'character_set' AND slug = 'mun';
-- Fails on purpose once a video or draft used it: switch those briefs first.
DELETE FROM catalog_option WHERE kind = 'character_set' AND slug = 'bong';
