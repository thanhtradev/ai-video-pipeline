import { createHash, randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { open, readFile, rename, rm } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { z } from 'zod';
import { resolveInside } from './workspace.js';

// Checkpoints from docs/job-lifecycle.md §4: a step is done only when its outputs exist with
// recorded SHA-256. A valid checkpoint lets a retried job skip work (and cost) already done.

export const CHECKPOINT_FILE = 'checkpoint.json';

const outputSchema = z.object({
  path: z.string(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  bytes: z.number().int().nonnegative(),
});

const checkpointSchema = z.object({
  version: z.literal(1),
  completedAt: z.string(),
  outputs: z.array(outputSchema),
  result: z.record(z.string(), z.unknown()),
});

export type CheckpointOutput = z.infer<typeof outputSchema>;
export type Checkpoint = z.infer<typeof checkpointSchema>;

export interface FileDigest {
  sha256: string;
  bytes: number;
}

/** Writes via a temp file + fsync + rename so readers never see a partial file. */
export async function writeFileAtomic(path: string, data: string | Uint8Array): Promise<void> {
  const temp = join(dirname(path), `.${basename(path)}.${randomBytes(6).toString('hex')}.tmp`);
  const handle = await open(temp, 'w');
  try {
    await handle.writeFile(data);
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await rename(temp, path);
  } catch (error: unknown) {
    await rm(temp, { force: true });
    throw error;
  }
}

export async function sha256File(path: string): Promise<FileDigest> {
  const hash = createHash('sha256');
  let bytes = 0;
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk as Buffer);
    bytes += (chunk as Buffer).length;
  }
  return { sha256: hash.digest('hex'), bytes };
}

export async function writeCheckpoint(
  jobDir: string,
  outputPaths: readonly string[],
  result: Record<string, unknown>,
): Promise<Checkpoint> {
  const outputs: CheckpointOutput[] = [];
  for (const path of outputPaths) {
    const absolute = await resolveInside(jobDir, path);
    outputs.push({ path, ...(await sha256File(absolute)) });
  }
  const checkpoint: Checkpoint = {
    version: 1,
    completedAt: new Date().toISOString(),
    outputs,
    result,
  };
  await writeFileAtomic(join(jobDir, CHECKPOINT_FILE), JSON.stringify(checkpoint, null, 2));
  return checkpoint;
}

/** Returns the checkpoint only if every recorded output still exists with the same hash. */
export async function readValidCheckpoint(jobDir: string): Promise<Checkpoint | null> {
  let raw: string;
  try {
    raw = await readFile(join(jobDir, CHECKPOINT_FILE), 'utf8');
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }

  const parsed = checkpointSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) return null;

  for (const output of parsed.data.outputs) {
    try {
      const digest = await sha256File(await resolveInside(jobDir, output.path));
      if (digest.sha256 !== output.sha256 || digest.bytes !== output.bytes) return null;
    } catch {
      return null;
    }
  }
  return parsed.data;
}
