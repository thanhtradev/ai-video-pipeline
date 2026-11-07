-- migrate:up

-- D-116: the Vietnamese kit "Nếu bạn… (Điện ảnh)" (whatif-vi-cinematic), mirroring
-- remotion/catalog.json. It uses the shared Vietnamese voice and the default cast. Not added to
-- idea_pair: /ideas keeps offering the plain whatif kit until the owner has judged a real episode.

INSERT INTO catalog_option (kind, slug, label, sort_order, is_default, aspect_ratio, language) VALUES
  ('kit', 'whatif-vi-cinematic', 'Nếu bạn… (Điện ảnh)', 5, false, '16:9', 'vi');

-- migrate:down

-- Fails on purpose once a video or draft used it: switch or cancel those briefs first.
DELETE FROM catalog_option WHERE slug = 'whatif-vi-cinematic';
