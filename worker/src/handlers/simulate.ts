import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { z } from 'zod';
import { PermanentJobError, type JobHandler } from '../runner.js';

// Phase 1 smoke-test step: no paid calls, no external services. Lets the full pipeline
// (dispatch -> worker -> checkpoint -> succeed) be exercised end to end.

const MAX_DURATION_MS = 10 * 60 * 1000;

const inputSchema = z.object({
  durationMs: z.number().int().min(0).max(MAX_DURATION_MS).default(0),
  content: z.string().max(10_000).default('simulated output'),
});

export const simulateHandler: JobHandler = async ({ input, workDir, signal }) => {
  const parsed = inputSchema.safeParse(input ?? {});
  if (!parsed.success) {
    throw new PermanentJobError(`invalid simulate input: ${parsed.error.message}`);
  }
  await sleep(parsed.data.durationMs, undefined, { signal });
  await writeFile(join(workDir, 'simulated.txt'), parsed.data.content);
  return { outputs: ['simulated.txt'], result: { bytes: parsed.data.content.length } };
};
