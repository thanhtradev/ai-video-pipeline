import { mkdir, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

// Workspace isolation from docs/security.md §4: every path a job touches must stay under the root,
// including through symlinks.

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface JobLocation {
  videoId: string;
  version: number;
  jobId: string;
}

function isWithin(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel));
}

async function deepestExistingRealPath(path: string): Promise<string> {
  let current = path;
  for (;;) {
    try {
      return await realpath(current);
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      const parent = dirname(current);
      if (parent === current) throw error;
      current = parent;
    }
  }
}

/** Resolves a relative path under root; throws if it escapes lexically or via symlinks. */
export async function resolveInside(root: string, relativePath: string): Promise<string> {
  if (isAbsolute(relativePath)) {
    throw new Error(`path is outside workspace: ${relativePath}`);
  }
  const candidate = resolve(root, relativePath);
  if (!isWithin(resolve(root), candidate)) {
    throw new Error(`path is outside workspace: ${relativePath}`);
  }

  const realRoot = await realpath(root);
  const realCandidate = await deepestExistingRealPath(candidate);
  if (!isWithin(realRoot, realCandidate)) {
    throw new Error(`path is outside workspace: ${relativePath}`);
  }
  return candidate;
}

/** Creates and returns <root>/videos/{video_id}/v{n}/jobs/{job_id}. */
export async function jobWorkspace(root: string, location: JobLocation): Promise<string> {
  const { videoId, version, jobId } = location;
  if (!UUID_PATTERN.test(videoId) || !UUID_PATTERN.test(jobId) || !Number.isInteger(version)) {
    throw new Error('invalid id for job workspace');
  }
  const dir = await resolveInside(root, join('videos', videoId, `v${version}`, 'jobs', jobId));
  await mkdir(dir, { recursive: true });
  return dir;
}
