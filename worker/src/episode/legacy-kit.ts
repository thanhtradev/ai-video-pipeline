import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

// Episodes coded before the kit split (D-064) import the kit as kit/ep1/theme, kit/ep2/kit, ...
// A revision copies that code into a new workspace, where those paths no longer exist. These shims
// re-export the modules from their new places so the old code still typechecks and renders; the
// agent may keep or replace the imports.

/** Old workspace path (under kit/, no extension) -> module under remotion/src. */
export const LEGACY_SHIMS: Readonly<Record<string, string>> = {
  'ep1/theme': 'kits/whatif/theme',
  'ep1/Stage': 'kits/whatif/Stage',
  'ep1/SetStage': 'kits/whatif/SetStage',
  'ep1/ui': 'kits/whatif/ui',
  'ep1/sets': 'kits/whatif/sets',
  'ep1/props': 'kits/whatif/props',
  'ep1/Character': 'rig/Character',
  'ep2/kit': 'episodes/ep2/kit',
  'ep2/sets': 'kits/whatif/sets-home',
  'ep3/sets': 'kits/whatif/sets-school',
  'ep5/kit': 'episodes/ep5/kit',
  'ep5/sets': 'episodes/ep5/sets',
};

/** Episode directories the shims need beyond the selected kit (ep5 is the reference episode). */
export const LEGACY_EPISODE_DIRS: readonly string[] = ['episodes/ep2'];

/** True when the workspace was prepared before the kit split. */
export const isLegacyWorkspace = (ws: string): boolean => existsSync(join(ws, 'kit', 'ep1'));

/** Writes kit/<old path>.ts re-exports into `ws`. */
export async function writeLegacyShims(ws: string): Promise<void> {
  for (const [old, target] of Object.entries(LEGACY_SHIMS)) {
    const file = join(ws, 'kit', `${old}.ts`);
    await mkdir(dirname(file), { recursive: true });
    const up = '../'.repeat(old.split('/').length - 1);
    await writeFile(file, `export * from '${up}${target}';\n`);
  }
}
