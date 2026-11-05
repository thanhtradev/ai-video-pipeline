-- migrate:up

-- D-106: the Vietnamese horror kit "Kinh dị" (horror) and its cast "Mùn" (mun, hero MÙN),
-- mirroring remotion/catalog.json. 16:9 like whatif, Vietnamese, so the Kit button pairs it with
-- any Vietnamese cast (brief_pair_language, 20261121000200); the owner picks `nhanvat=mun` or
-- presses Nhân vật. Added to idea_pair: the /ideas prompt is Vietnamese.

INSERT INTO catalog_option (kind, slug, label, sort_order, is_default, aspect_ratio, language) VALUES
  ('kit', 'horror', 'Kinh dị', 4, false, '16:9', 'vi');
INSERT INTO catalog_option (kind, slug, label, sort_order, is_default, language) VALUES
  ('character_set', 'mun', 'Mùn', 4, false, 'vi');
INSERT INTO idea_pair (kit, character_set, sort_order) VALUES ('horror', 'mun', 3);

-- migrate:down

DELETE FROM idea_pair WHERE kit = 'horror' AND character_set = 'mun';
-- Fails on purpose once a video or draft used them: switch those briefs first.
DELETE FROM catalog_option WHERE slug IN ('horror', 'mun');
