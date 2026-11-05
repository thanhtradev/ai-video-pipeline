import { describe, expect, test } from 'vitest';
import { CatalogError, loadCatalog, resolveSelection } from '../../src/episode/catalog.js';
import { channelDescription, selectionOf } from '../../src/episode/channel-prompt.js';
import { hasVietnameseLetters } from '../../src/episode/language.js';

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
    expect(sel.frame).toEqual({ width: 1920, height: 1080 });
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
    // D-080: the science kit is vertical.
    expect(sel.frame).toEqual({ width: 1080, height: 1920 });
  });

  test('a job input selects by the brief field names; the channel description follows', async () => {
    const science = selectionOf({ kit: 'science', character_set: 'chip-science' });
    expect(science).toMatchObject({ kit: 'science', characterSet: 'chip-science' });
    const text = await channelDescription(science);
    expect(text).toContain('CHÍP');
    expect(text).toContain('Chíp ơi, tại sao…?');
    expect(text).toContain('Chíp đã hiểu. Còn bạn?');
    expect(text).not.toContain('"BẠN"');
    expect(text).toMatch(/^Vertical 9:16 \(1080×1920\) episodes\./);
    expect(text).not.toContain('16:9');

    const chip = await channelDescription(selectionOf({}));
    expect(chip).toContain('Nếu bạn…?');
    expect(chip).toMatch(/^Landscape 16:9 \(1920×1080\) episodes\./);
    expect(chip).toContain('Một chữ nếu… một cuộc đời khác.');
    expect(() => selectionOf({ character_set: 'nope' })).toThrow(CatalogError);
  });

  test('asks for plain act titles in the science kit only (D-085)', async () => {
    const rule = 'Act titles are short plain labels';
    const science = await channelDescription(selectionOf({ kit: 'science' }));
    expect(science).toContain(rule);
    expect(science).toContain('"Cái giá của…"');

    const whatif = await channelDescription(selectionOf({}));
    expect(whatif).not.toContain(rule);
  });

  test('refuses an unknown kit or character set instead of falling back', () => {
    expect(() => resolveSelection({ kit: 'nope' })).toThrow(CatalogError);
    expect(() => resolveSelection({ characterSet: 'nope' })).toThrow(/character set/);
  });

  test('the English kit is its own channel: English docs only, Western sets (D-092)', async () => {
    const sel = resolveSelection({ kit: 'whatif-en', characterSet: 'chip-en' });
    expect(sel).toMatchObject({ kit: 'whatif-en', characterSet: 'chip-en', hero: 'YOU' });
    expect(sel.language).toBe('en');
    expect(sel.frame).toEqual({ width: 1920, height: 1080 });
    // The whatif code is copied, but none of its Vietnamese docs or prompts is spliced in.
    expect(sel.dirs).toEqual(
      expect.arrayContaining(['kits/whatif', 'kits/whatif-en', 'characters/chip-en']),
    );
    expect(sel.kitDocs).toEqual(['kits/whatif-en/AGENT.md']);
    expect(sel.kitPrompts).toEqual(['kits/whatif-en/prompt.md']);
    expect(sel.characterDocs).toEqual(['characters/chip-en/AGENT.md']);
    expect(sel.modules).toMatchObject({
      theme: 'kits/whatif-en/theme',
      sets: 'kits/whatif-en/sets-intl',
      'sets-home': 'kits/whatif-en/sets-home-intl',
      'sets-school': 'kits/whatif-en/sets-school-intl',
      props: 'kits/whatif-en/props-intl',
      cast: 'characters/chip-en/cast',
    });

    const text = await channelDescription(sel);
    expect(text).toContain('What if you…?');
    expect(text).toContain("One little 'if'… a whole different life.");
    expect(text).toMatch(/Western/);
    expect(hasVietnameseLetters(text)).toBe(false);
  });

  test('the horror kit is its own Vietnamese channel with night sets and the Mùn cast (D-106)', async () => {
    const sel = resolveSelection({ kit: 'horror', characterSet: 'mun' });
    expect(sel).toMatchObject({ kit: 'horror', characterSet: 'mun', hero: 'MÙN' });
    expect(sel.language).toBe('vi');
    expect(sel.frame).toEqual({ width: 1920, height: 1080 });
    // The whatif code is copied for its shared modules, but its docs ("Nothing frightening") are not.
    expect(sel.dirs).toEqual(
      expect.arrayContaining(['kits/whatif', 'kits/horror', 'characters/mun']),
    );
    expect(sel.kitDocs).toEqual(['kits/horror/AGENT.md']);
    expect(sel.kitPrompts).toEqual(['kits/horror/prompt.md']);
    expect(sel.characterDocs).toEqual(['characters/mun/AGENT.md']);
    expect(sel.modules).toMatchObject({
      theme: 'kits/horror/theme',
      sets: 'kits/horror/sets-horror',
      props: 'kits/horror/props-horror',
      'sets-home': 'kits/whatif/sets-home',
      cast: 'characters/mun/cast',
    });
    expect(sel.labels).toEqual({ kit: 'Kinh dị', characterSet: 'Mùn' });

    const text = await channelDescription(sel);
    expect(text).toMatch(/^Landscape 16:9 \(1920×1080\) episodes\./);
    expect(text).toContain('MÙN');
    expect(text).toContain('no blood');
    expect(text).toContain('NGƯỜI LẠ');
    expect(text).not.toContain('Nothing frightening');
    expect(text).not.toContain('Nếu bạn…?');
  });

  test('every kit has a language; the Vietnamese kits stay Vietnamese', () => {
    expect(resolveSelection({}).language).toBe('vi');
    expect(resolveSelection({ kit: 'science' }).language).toBe('vi');
    expect(resolveSelection({ kit: 'horror' }).language).toBe('vi');
  });
});
