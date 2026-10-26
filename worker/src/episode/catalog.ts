import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

/**
 * The kit / character-set catalog (remotion/catalog.json): which visual kits and casts exist, where
 * their files are under remotion/src, and which modules become kit/active/<name>.ts in an episode
 * workspace. A clip selects one kit and one character set (docs/episode-pipeline.md §6).
 * Unknown slugs are an error, never a fallback (CLAUDE.md §5).
 */
export const CATALOG_PATH = fileURLToPath(
  new URL('../../../remotion/catalog.json', import.meta.url),
);
export const AGENT_DOC = 'AGENT.md';
export const PROMPT_DOC = 'prompt.md';

const slug = z.string().regex(/^[a-z0-9-]{2,40}$/);
const relPath = z.string().regex(/^[A-Za-z0-9_./-]+$/);
const modules = z.record(z.string().regex(/^[a-z][a-z0-9-]*$/), relPath);
const kitSchema = z.object({
  label: z.string().min(1),
  dir: relPath,
  extends: slug.optional(),
  referenceEpisode: relPath,
  episodeDeps: z.array(relPath),
  modules,
});
const characterSetSchema = z.object({
  label: z.string().min(1),
  dir: relPath,
  hero: z.string().min(1),
  modules,
});
const catalogSchema = z.object({
  defaults: z.object({ kit: slug, characterSet: slug }),
  rig: z.object({ dir: relPath, modules }),
  kits: z.record(slug, kitSchema),
  characterSets: z.record(slug, characterSetSchema),
});
export type Catalog = z.infer<typeof catalogSchema>;

export class CatalogError extends Error {
  override name = 'CatalogError';
}

export interface Selection {
  kit?: string | undefined;
  characterSet?: string | undefined;
}

export interface ResolvedSelection {
  readonly kit: string;
  readonly characterSet: string;
  readonly hero: string;
  /** Directories under remotion/src to copy into ws/kit at the same relative path. */
  readonly dirs: readonly string[];
  /** kit/active/<name>.ts -> module path under remotion/src (no extension). */
  readonly modules: Readonly<Record<string, string>>;
  /** e.g. `episodes/ep5` (ws path `kit/episodes/ep5/`). */
  readonly referenceEpisode: string;
  /** AGENT.md fragments to splice into CLAUDE.md, base kit first. */
  readonly kitDocs: readonly string[];
  readonly characterDocs: readonly string[];
}

let cached: Catalog | undefined;

export function loadCatalog(): Catalog {
  if (cached) return cached;
  const parsed = catalogSchema.safeParse(JSON.parse(readFileSync(CATALOG_PATH, 'utf8')));
  if (!parsed.success) throw new CatalogError(`invalid ${CATALOG_PATH}: ${parsed.error.message}`);
  const catalog = parsed.data;
  if (!catalog.kits[catalog.defaults.kit])
    throw new CatalogError(`default kit ${catalog.defaults.kit} is not in the catalog`);
  if (!catalog.characterSets[catalog.defaults.characterSet])
    throw new CatalogError(
      `default character set ${catalog.defaults.characterSet} is not in the catalog`,
    );
  cached = catalog;
  return catalog;
}

/** The kit and the kits it extends, base first. */
function kitChain(catalog: Catalog, id: string): string[] {
  const chain: string[] = [];
  let current: string | undefined = id;
  while (current) {
    if (chain.includes(current)) throw new CatalogError(`kit ${id}: circular extends`);
    const kit: Catalog['kits'][string] | undefined = catalog.kits[current];
    if (!kit) throw new CatalogError(`unknown kit ${current}`);
    chain.unshift(current);
    current = kit.extends;
  }
  return chain;
}

export function resolveSelection(selection: Selection): ResolvedSelection {
  const catalog = loadCatalog();
  const kitId = selection.kit ?? catalog.defaults.kit;
  const setId = selection.characterSet ?? catalog.defaults.characterSet;
  const kit = catalog.kits[kitId];
  if (!kit) throw new CatalogError(`unknown kit "${kitId}"`);
  const set = catalog.characterSets[setId];
  if (!set) throw new CatalogError(`unknown character set "${setId}"`);
  const chain = kitChain(catalog, kitId);
  const kitDirs = chain.map((id) => catalog.kits[id]!.dir);
  const dirs = [catalog.rig.dir, ...kitDirs, set.dir, kit.referenceEpisode, ...kit.episodeDeps];
  return {
    kit: kitId,
    characterSet: setId,
    hero: set.hero,
    dirs: [...new Set(dirs)],
    modules: { ...catalog.rig.modules, ...kit.modules, ...set.modules },
    referenceEpisode: kit.referenceEpisode,
    kitDocs: kitDirs.map((dir) => `${dir}/${AGENT_DOC}`),
    characterDocs: [`${set.dir}/${AGENT_DOC}`],
  };
}
