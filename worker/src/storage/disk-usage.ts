import { lstat, readdir } from 'node:fs/promises';
import { join } from 'node:path';

/** Bytes a directory takes, hard links counted once; symlinks are not followed. */
export async function diskBytes(dir: string): Promise<number> {
  const seen = new Set<string>();
  let total = 0;
  for (const entry of await readdir(dir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const info = await lstat(join(entry.parentPath, entry.name));
    const key = `${info.dev}:${info.ino}`;
    if (seen.has(key)) continue;
    seen.add(key);
    total += info.size;
  }
  return total;
}
