#!/usr/bin/env node
// Copies docs/brief-prompt.md into the BRIEF_PROMPT constant of WF-06's "Brief document" node
// (D-077), editing only that string so the rest of the export keeps its layout.
// Run after editing the prompt: node ops/n8n/embed-brief-prompt.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PROMPT = fileURLToPath(new URL('../../docs/brief-prompt.md', import.meta.url));
const WORKFLOW = fileURLToPath(
  new URL('../../n8n/workflows/wf-06-telegram-callback.json', import.meta.url),
);
const CONSTANT = /^const BRIEF_PROMPT = .*;$/m;

const source = readFileSync(WORKFLOW, 'utf8');
const node = JSON.parse(source).nodes.find((n) => n.name === 'Brief document');
if (!node || !CONSTANT.test(node.parameters.jsCode)) {
  throw new Error('WF-06 has no "Brief document" node with a BRIEF_PROMPT line');
}
const before = node.parameters.jsCode;
const prompt = readFileSync(PROMPT, 'utf8');
const after = before.replace(CONSTANT, () => `const BRIEF_PROMPT = ${JSON.stringify(prompt)};`);
const encoded = JSON.stringify(before);
if (!source.includes(encoded)) throw new Error('could not locate the node code in the export');
writeFileSync(
  WORKFLOW,
  source.replace(encoded, () => JSON.stringify(after)),
);
process.stdout.write(after === before ? 'already up to date\n' : 'BRIEF_PROMPT updated\n');
