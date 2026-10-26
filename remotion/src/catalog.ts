import CATALOG_JSON from '../catalog.json';

/**
 * The kit / character-set catalog (remotion/catalog.json is the source; the worker reads the same
 * file). Typed here so the Remotion side can list kits and casts, e.g. for review sheets.
 */
export type ModuleMap = Readonly<Record<string, string>>;
export type KitEntry = {
  readonly label: string;
  readonly dir: string;
  readonly extends?: string;
  readonly referenceEpisode: string;
  readonly episodeDeps: readonly string[];
  readonly modules: ModuleMap;
};
export type CharacterSetEntry = {
  readonly label: string;
  readonly dir: string;
  readonly hero: string;
  readonly modules: ModuleMap;
};
export type Catalog = {
  readonly defaults: { readonly kit: string; readonly characterSet: string };
  readonly rig: { readonly dir: string; readonly modules: ModuleMap };
  readonly kits: Readonly<Record<string, KitEntry>>;
  readonly characterSets: Readonly<Record<string, CharacterSetEntry>>;
};

export const CATALOG: Catalog = CATALOG_JSON;
export const KIT_IDS = Object.keys(CATALOG.kits);
export const CHARACTER_SET_IDS = Object.keys(CATALOG.characterSets);
