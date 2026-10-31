import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, test } from 'vitest';
import { CatalogError } from '../../src/episode/catalog.js';
import { LEGACY_SHIMS } from '../../src/episode/legacy-kit.js';
import { prepareWorkspace, type WorkspaceSources } from '../../src/episode/workspace.js';

let root: string;
let sources: WorkspaceSources;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'ws-'));
  const timingDir = join(root, 'timing');
  await mkdir(timingDir);
  await writeFile(join(timingDir, 'timing.json'), '{"shots":[]}');
  await writeFile(join(timingDir, 'captions.json'), '[]');
  await writeFile(join(timingDir, 'voice.wav'), 'RIFF');
  sources = { scriptMarkdown: '# brief\n', rulesMarkdown: '# rules\n', timingDir };
});

describe('prepareWorkspace', () => {
  test('copies the rig, the default kit, cast and reference episode, and writes kit/active', async () => {
    const ws = join(root, 'ws');
    const sel = await prepareWorkspace(ws, sources);
    expect(sel.kit).toBe('whatif');
    for (const path of [
      'kit/rig/Character.tsx',
      'kit/kits/whatif/theme.ts',
      'kit/kits/whatif/qa/TextBoundsQA.tsx',
      'kit/kits/whatif/sfx/sfx-lib.mjs',
      'kit/characters/chip/cast.tsx',
      'kit/episodes/ep5/Episode.tsx',
      'kit/active/theme.ts',
      'kit/active/cast.ts',
      'kit/active/rig.ts',
      'kit/active/qa.ts',
    ]) {
      expect(existsSync(join(ws, path)), path).toBe(true);
    }
    expect(await readFile(join(ws, 'kit/active/theme.ts'), 'utf8')).toContain(
      "export * from '../kits/whatif/theme';",
    );
    expect(existsSync(join(ws, 'kit/episodes/ep1'))).toBe(false);
    expect(existsSync(join(ws, 'kit/characters/chip-science'))).toBe(false);
  });

  test('assembles CLAUDE.md from the base, the kit and the character docs', async () => {
    const ws = join(root, 'ws');
    await prepareWorkspace(ws, sources);
    const claude = await readFile(join(ws, 'CLAUDE.md'), 'utf8');
    expect(claude).toMatch(/Episode workspace/);
    expect(claude).toContain('## Channel style');
    expect(claude).toContain('BẠN');
    expect(claude).toContain('kit/episodes/ep5/');
    expect(claude).not.toMatch(/<!-- (KIT|CHARACTERS|REFERENCE) -->/);
    expect(existsSync(join(ws, 'AGENT.md'))).toBe(false);
  });

  test('a selection copies that kit chain and cast, never test files', async () => {
    const ws = join(root, 'ws');
    const sel = await prepareWorkspace(ws, {
      ...sources,
      selection: { kit: 'science', characterSet: 'chip-science' },
    });
    expect(sel.characterSet).toBe('chip-science');
    expect(existsSync(join(ws, 'kit/kits/science/theme.ts'))).toBe(true);
    expect(existsSync(join(ws, 'kit/kits/whatif/ui.tsx'))).toBe(true);
    expect(existsSync(join(ws, 'kit/characters/chip-science/hosts.tsx'))).toBe(true);
    expect(existsSync(join(ws, 'kit/characters/chip-science/hosts.test.tsx'))).toBe(false);
    // the reference episode's own cast comes along (episodeDeps), but the active cast is Chíp's
    expect(existsSync(join(ws, 'kit/characters/chip/cast.tsx'))).toBe(true);
    expect(await readFile(join(ws, 'kit/active/cast.ts'), 'utf8')).toContain(
      'characters/chip-science/cast',
    );
    expect(await readFile(join(ws, 'kit/active/theme.ts'), 'utf8')).toContain('kits/science/theme');
    const claude = await readFile(join(ws, 'CLAUDE.md'), 'utf8');
    expect(claude).toContain('CHÍP');
    expect(claude).not.toContain('"BẠN" ALWAYS');
  });

  test('a revision of a pre-catalog workspace gets kit/ep*/ shims for its old imports', async () => {
    // Episodes coded before the kit split import ../../kit/ep1/theme, ../../kit/ep2/kit, ...
    const previous = join(root, 'previous');
    await mkdir(join(previous, 'kit', 'ep1'), { recursive: true });
    await mkdir(join(previous, 'src', 'episode'), { recursive: true });
    await mkdir(join(previous, 'sfx'), { recursive: true });
    await writeFile(
      join(previous, 'src/episode/Episode.tsx'),
      "import { C } from '../../kit/ep1/theme';\n",
    );
    await writeFile(join(previous, 'sfx/generate-sfx.mjs'), '// sfx\n');
    const ws = join(root, 'ws');
    await prepareWorkspace(ws, {
      ...sources,
      revision: { previousWorkspace: previous, feedback: 'again' },
    });
    expect(await readFile(join(ws, 'kit/ep1/theme.ts'), 'utf8')).toBe(
      "export * from '../kits/whatif/theme';\n",
    );
    expect(await readFile(join(ws, 'kit/ep1/Character.ts'), 'utf8')).toBe(
      "export * from '../rig/Character';\n",
    );
    expect(await readFile(join(ws, 'kit/ep2/kit.ts'), 'utf8')).toBe(
      "export * from '../episodes/ep2/kit';\n",
    );
    // the modules the shims point at are in the workspace
    for (const target of Object.values(LEGACY_SHIMS)) {
      const base = join(ws, 'kit', target);
      expect(existsSync(`${base}.ts`) || existsSync(`${base}.tsx`), target).toBe(true);
    }
    expect(await readFile(join(ws, 'FILES.md'), 'utf8')).toContain('kit/ep1/theme.ts');
  });

  test('a revision of a catalog workspace gets no legacy shims', async () => {
    const previous = join(root, 'previous');
    await mkdir(join(previous, 'kit', 'active'), { recursive: true });
    await mkdir(join(previous, 'src', 'episode'), { recursive: true });
    await mkdir(join(previous, 'sfx'), { recursive: true });
    const ws = join(root, 'ws');
    await prepareWorkspace(ws, {
      ...sources,
      revision: { previousWorkspace: previous, feedback: 'again' },
    });
    expect(existsSync(join(ws, 'kit/ep1'))).toBe(false);
    expect(existsSync(join(ws, 'kit/episodes/ep2'))).toBe(false);
  });

  test('an unknown selection fails before anything is copied', async () => {
    const ws = join(root, 'ws');
    await expect(
      prepareWorkspace(ws, { ...sources, selection: { kit: 'nope', characterSet: 'chip' } }),
    ).rejects.toThrow(CatalogError);
    expect(existsSync(join(ws, 'kit'))).toBe(false);
  });
});
