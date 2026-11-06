import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { loadCatalog } from '../../src/episode/catalog.js';
import { checkKit } from '../../src/episode/gates.js';
import { prepareWorkspace, type WorkspaceSources } from '../../src/episode/workspace.js';

// Video f401f3bf: a kit's review still imported a cast this pairing does not copy, so the workspace
// could not compile, and only the gates after a 24-minute agent turn found out. remotion's own
// typecheck cannot see this: it compiles every kit and cast together, where any import resolves.
// So every pairing in the catalog is compiled here as the worker assembles it. Pairings the database
// keeps apart today are included, since enabling one is a data change that runs no tests.

const TSC_TIMEOUT_MS = 120_000;
const { kits, characterSets } = loadCatalog();
const PAIRINGS = Object.keys(kits).flatMap((kit) =>
  Object.keys(characterSets).map((characterSet) => ({ kit, characterSet })),
);

let root: string;
let sources: WorkspaceSources;

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'kit-matrix-')));
  const timingDir = join(root, 'timing');
  await mkdir(timingDir);
  await writeFile(join(timingDir, 'timing.json'), '{"shots":[]}');
  await writeFile(join(timingDir, 'captions.json'), '[]');
  await writeFile(join(timingDir, 'voice.wav'), 'RIFF');
  sources = { scriptMarkdown: '# brief\n', rulesMarkdown: '# rules\n', timingDir };
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('every kit and cast pairing', () => {
  test.each(PAIRINGS)(
    '$kit + $characterSet compiles as a workspace',
    async (selection) => {
      // Arrange
      const ws = join(root, 'ws');
      await prepareWorkspace(ws, { ...sources, selection });

      // Act
      const result = await checkKit(ws, new AbortController().signal);

      // Assert
      expect(result.output).toBe('');
      expect(result.ok).toBe(true);
    },
    TSC_TIMEOUT_MS,
  );
});

describe('checkKit', () => {
  test('reports a kit file with a bad import, by its workspace path', async () => {
    // Arrange
    const ws = join(root, 'ws');
    await prepareWorkspace(ws, sources);
    await writeFile(join(ws, 'kit/rig/broken.ts'), "export * from '../characters/absent/cast';\n");

    // Act
    const result = await checkKit(ws, new AbortController().signal);

    // Assert
    expect(result.ok).toBe(false);
    expect(result.output).toMatch(/^kit\/rig\/broken\.ts\(1,\d+\): error TS2307/m);
  });

  test(
    'keeps its config out of the workspace',
    async () => {
      // Arrange
      const ws = join(root, 'ws');
      await prepareWorkspace(ws, sources);

      // Act
      await checkKit(ws, new AbortController().signal);

      // Assert
      expect(existsSync(join(root, 'kit-check.tsconfig.json'))).toBe(true);
      expect(existsSync(join(ws, 'kit-check.tsconfig.json'))).toBe(false);
    },
    TSC_TIMEOUT_MS,
  );

  test('throws when the check is aborted, so the job is not failed for good', async () => {
    // Arrange
    const ws = join(root, 'ws');
    await prepareWorkspace(ws, sources);
    const aborted = AbortSignal.abort();

    // Act and assert
    await expect(checkKit(ws, aborted)).rejects.toThrow();
  });
});
