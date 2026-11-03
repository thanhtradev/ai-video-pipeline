-- migrate:up

-- D-092: the English kit "What if… (EN)" (whatif-en) and its cast "Chip (YOU, EN)" (chip-en),
-- mirroring remotion/catalog.json. Telegram labels stay Vietnamese-UI friendly (D-061) but name
-- the English channel. A brief always pairs a kit with a cast of the same language: the Kit
-- button or `kit=whatif-en` without `nhanvat=` would otherwise keep the Vietnamese default cast
-- (BẠN) in an English episode. Not added to idea_pair: the /ideas prompt is Vietnamese.

INSERT INTO catalog_option (kind, slug, label, sort_order, is_default, aspect_ratio, language) VALUES
  ('kit', 'whatif-en', 'What if… (EN)', 3, false, '16:9', 'en');
INSERT INTO catalog_option (kind, slug, label, sort_order, is_default, language) VALUES
  ('character_set', 'chip-en', 'Chip (YOU, EN)', 3, false, 'en');

-- The brief with a cast in its kit's language: the chosen cast when it matches, else the first
-- enabled cast of that language.
CREATE FUNCTION brief_pair_language(p_brief jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_language text := kit_language(p_brief->>'kit');
  v_cast text;
BEGIN
  IF NOT p_brief ? 'character_set' OR EXISTS (
    SELECT 1 FROM catalog_option
    WHERE kind = 'character_set' AND slug = p_brief->>'character_set' AND language = v_language
  ) THEN
    RETURN p_brief;
  END IF;
  SELECT slug INTO v_cast FROM catalog_option
  WHERE kind = 'character_set' AND enabled AND language = v_language
  ORDER BY sort_order, slug LIMIT 1;
  IF v_cast IS NULL THEN
    RAISE EXCEPTION 'invalid brief: no enabled character set in language %', v_language;
  END IF;
  RETURN jsonb_set(p_brief, '{character_set}', to_jsonb(v_cast));
END;
$$;

-- Same as 20261115000100 plus the language pairing.
CREATE OR REPLACE FUNCTION episode_brief_normalize(p_brief jsonb) RETURNS jsonb
LANGUAGE sql STABLE
AS $$
  SELECT brief_pair_language(episode_brief_normalize_base(p_brief) || episode_brief_links(p_brief));
$$;

-- migrate:down

CREATE OR REPLACE FUNCTION episode_brief_normalize(p_brief jsonb) RETURNS jsonb
LANGUAGE sql STABLE
AS $$ SELECT episode_brief_normalize_base(p_brief) || episode_brief_links(p_brief); $$;
DROP FUNCTION brief_pair_language(jsonb);
-- Fails on purpose once a video or draft used them: switch those briefs first.
DELETE FROM catalog_option WHERE slug IN ('whatif-en', 'chip-en');
