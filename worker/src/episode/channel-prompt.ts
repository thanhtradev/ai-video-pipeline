import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { CATALOG_PATH, resolveSelection, type ResolvedSelection } from './catalog.js';
import { describeFrame } from './frame.js';

// The channel description for the script and metadata prompts: the selected kit's and character
// set's prompt.md fragments (remotion/src/<dir>/prompt.md), base kit first. Episode code gets the
// AGENT.md fragments instead (workspace.ts); both describe the same selection.

const REMOTION_SRC = join(dirname(CATALOG_PATH), 'src');

/** A job input's selection fields, as the database writes them (brief.kit / brief.character_set). */
export interface SelectionInput {
  kit?: string | undefined;
  character_set?: string | undefined;
}

/** The catalog selection of a job input; the defaults when the fields are absent. */
export function selectionOf(input: SelectionInput): ResolvedSelection {
  return resolveSelection({ kit: input.kit, characterSet: input.character_set });
}

/** The frame, then the kit and character prompt fragments joined, in English, for a system prompt. */
export async function channelDescription(selection: ResolvedSelection): Promise<string> {
  const texts = await Promise.all(
    [...selection.kitPrompts, ...selection.characterPrompts].map(async (path) =>
      (await readFile(join(REMOTION_SRC, path), 'utf8')).trim(),
    ),
  );
  return [`${describeFrame(selection.frame)} episodes.`, ...texts.filter(Boolean)].join(' ');
}
