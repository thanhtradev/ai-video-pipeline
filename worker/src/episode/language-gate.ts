import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { hasVietnameseLetters, type Language } from './language.js';
import type { GateReport } from './gates.js';

// D-092: an English episode must not show Vietnamese. The text-bounds scan only sees where text
// sits, so the worker also reads the agent's code: any line (comments removed) of src/episode/
// with a Vietnamese letter fails the gates, wherever it would be drawn.

const CODE = /\.(tsx?|jsx?|json)$/;
const MAX_HITS = 20;

export interface LanguageHit {
  file: string;
  line: number;
  text: string;
}

async function codeFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const nested = await Promise.all(
    entries.map((e) =>
      e.isDirectory()
        ? codeFiles(join(dir, e.name))
        : Promise.resolve(CODE.test(e.name) ? [join(dir, e.name)] : []),
    ),
  );
  return nested.flat().sort();
}

/** The code without comments; line breaks are kept so line numbers stay right. */
export function stripComments(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ''))
    .replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
}

/** Lines of the episode code that carry Vietnamese text. */
export async function vietnameseLines(ws: string): Promise<LanguageHit[]> {
  const hits: LanguageHit[] = [];
  for (const file of await codeFiles(join(ws, 'src', 'episode'))) {
    const lines = stripComments(await readFile(file, 'utf8')).split('\n');
    lines.forEach((text, i) => {
      if (hasVietnameseLetters(text)) {
        hits.push({ file: relative(ws, file), line: i + 1, text: text.trim().slice(0, 120) });
      }
    });
  }
  return hits;
}

/** The gate report with the language check of an English episode; unchanged for Vietnamese. */
export async function withLanguageGate(
  report: GateReport,
  ws: string,
  language: Language,
): Promise<GateReport> {
  if (language !== 'en') return report;
  const hits = await vietnameseLines(ws);
  return {
    ...report,
    ok: report.ok && hits.length === 0,
    language: { ok: hits.length === 0, hits: hits.slice(0, MAX_HITS) },
  };
}
