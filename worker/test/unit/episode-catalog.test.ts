import { describe, expect, test } from 'vitest';
import { CatalogError, loadCatalog, resolveSelection } from '../../src/episode/catalog.js';

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
    const sel = resolveSelection({ kit: 'science', characterSet: 'bip' });
    expect(sel.dirs).toEqual(
      expect.arrayContaining(['rig', 'kits/whatif', 'kits/science', 'characters/bip']),
    );
    expect(sel.modules.theme).toBe('kits/science/theme');
    expect(sel.kitDocs).toEqual(['kits/whatif/AGENT.md', 'kits/science/AGENT.md']);
    expect(sel.hero).toBe('BÍP');
  });

  test('refuses an unknown kit or character set instead of falling back', () => {
    expect(() => resolveSelection({ kit: 'nope' })).toThrow(CatalogError);
    expect(() => resolveSelection({ characterSet: 'nope' })).toThrow(/character set/);
  });
});
