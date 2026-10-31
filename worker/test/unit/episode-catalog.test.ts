import { describe, expect, test } from 'vitest';
import { CatalogError, loadCatalog, resolveSelection } from '../../src/episode/catalog.js';
import { channelDescription, selectionOf } from '../../src/episode/channel-prompt.js';

describe('kit / character catalog', () => {
  test('loads remotion/catalog.json with defaults that exist', () => {
    const catalog = loadCatalog();
    expect(catalog.kits[catalog.defaults.kit]).toBeDefined();
    expect(catalog.characterSets[catalog.defaults.characterSet]).toBeDefined();
  });

  test('resolves the defaults when nothing is selected', () => {
    const sel = resolveSelection({});
    expect(sel).toMatchObject({ kit: 'whatif', characterSet: 'chip', hero: 'BẠN' });
    expect(sel.dirs).toEqual(
      expect.arrayContaining(['rig', 'kits/whatif', 'characters/chip', 'episodes/ep5']),
    );
    expect(sel.referenceEpisode).toBe('episodes/ep5');
    expect(sel.modules).toMatchObject({ theme: 'kits/whatif/theme', cast: 'characters/chip/cast' });
    expect(sel.kitDocs).toEqual(['kits/whatif/AGENT.md']);
    expect(sel.characterDocs).toEqual(['characters/chip/AGENT.md']);
  });

  test('a kit that extends another copies both and splices both docs, base first', () => {
    const sel = resolveSelection({ kit: 'science', characterSet: 'chip-science' });
    expect(sel.dirs).toEqual(
      expect.arrayContaining(['rig', 'kits/whatif', 'kits/science', 'characters/chip-science']),
    );
    expect(sel.modules.theme).toBe('kits/science/theme');
    expect(sel.kitDocs).toEqual(['kits/whatif/AGENT.md', 'kits/science/AGENT.md']);
    expect(sel.kitPrompts).toEqual(['kits/whatif/prompt.md', 'kits/science/prompt.md']);
    expect(sel.characterPrompts).toEqual(['characters/chip-science/prompt.md']);
    expect(sel.labels).toEqual({ kit: 'Khoa học', characterSet: 'Chíp Khoa học' });
    expect(sel.hero).toBe('CHÍP');
  });

  test('a job input selects by the brief field names; the channel description follows', async () => {
    const science = selectionOf({ kit: 'science', character_set: 'chip-science' });
    expect(science).toMatchObject({ kit: 'science', characterSet: 'chip-science' });
    const text = await channelDescription(science);
    expect(text).toContain('CHÍP');
    expect(text).toContain('Chíp ơi, tại sao…?');
    expect(text).toContain('Chíp đã hiểu. Còn bạn?');
    expect(text).not.toContain('"BẠN"');

    const chip = await channelDescription(selectionOf({}));
    expect(chip).toContain('Nếu bạn…?');
    expect(chip).toContain('Một chữ nếu… một cuộc đời khác.');
    expect(() => selectionOf({ character_set: 'nope' })).toThrow(CatalogError);
  });

  test('refuses an unknown kit or character set instead of falling back', () => {
    expect(() => resolveSelection({ kit: 'nope' })).toThrow(CatalogError);
    expect(() => resolveSelection({ characterSet: 'nope' })).toThrow(/character set/);
  });
});
