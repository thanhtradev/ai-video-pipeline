// Node APIs: this file is excluded from tsc (remotion/tsconfig.json has no node types); vitest runs it.
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { CATALOG, CHARACTER_SET_IDS, KIT_IDS } from '../src/catalog';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const SLUG = /^[a-z0-9-]{2,40}$/;
const moduleExists = (mod: string) =>
  ['.ts', '.tsx'].some((ext) => existsSync(join(SRC, `${mod}${ext}`)));

describe('kit / character catalog', () => {
  test('defaults name an existing kit and character set', () => {
    expect(KIT_IDS).toContain(CATALOG.defaults.kit);
    expect(CHARACTER_SET_IDS).toContain(CATALOG.defaults.characterSet);
  });

  test('every slug is a lowercase slug and every dir exists', () => {
    for (const id of [...KIT_IDS, ...CHARACTER_SET_IDS]) expect(id).toMatch(SLUG);
    for (const kit of Object.values(CATALOG.kits)) {
      expect(existsSync(join(SRC, kit.dir)), kit.dir).toBe(true);
      expect(existsSync(join(SRC, kit.referenceEpisode)), kit.referenceEpisode).toBe(true);
      for (const dep of kit.episodeDeps) expect(existsSync(join(SRC, dep)), dep).toBe(true);
      if (kit.extends) expect(KIT_IDS).toContain(kit.extends);
    }
    for (const set of Object.values(CATALOG.characterSets)) {
      expect(existsSync(join(SRC, set.dir)), set.dir).toBe(true);
      expect(set.hero.length).toBeGreaterThan(0);
    }
    expect(existsSync(join(SRC, CATALOG.rig.dir))).toBe(true);
  });

  test('every module of every entry points at a source file', () => {
    const maps = [
      CATALOG.rig.modules,
      ...Object.values(CATALOG.kits).map((k) => k.modules),
      ...Object.values(CATALOG.characterSets).map((c) => c.modules),
    ];
    for (const map of maps) {
      for (const [name, mod] of Object.entries(map)) {
        expect(name).toMatch(/^[a-z][a-z0-9-]*$/);
        expect(moduleExists(mod), `${name} -> ${mod}`).toBe(true);
      }
    }
  });

  test('every kit provides the same module names, so kit/active/* is kit-agnostic', () => {
    const names = Object.values(CATALOG.kits).map((k) => Object.keys(k.modules).sort().join(','));
    expect(new Set(names).size).toBe(1);
  });
});
