import { link, mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { z } from 'zod';
import { archiveDirectory, ArchiveConflictError, ArchiveSourceError } from '../archive/archiver.js';
import type { ArchiveTarget } from '../archive/webdav-target.js';
import { readValidCheckpoint, sha256File, type Checkpoint } from '../storage/checkpoint.js';
import { resolveInside } from '../storage/workspace.js';
import { PermanentJobError, ProviderBlockedError, type JobHandler } from '../runner.js';

// Episode `archive` step (q:heavy, D-062, docs/storage-and-manifest.md §3–§4): after A3, gathers the
// deliverables of every job into the version folder (renders, subtitles, script, voice, episode
// code, thumbnail, metadata, QA reports) with a manifest, then archives that folder to Nextcloud and
// verifies every file there (archiveDirectory). Files are hard links to the checkpointed job
// outputs, never copies or moves; jobs/ itself is not archived. Nothing is ever deleted.

const TARGET_NAME = 'nextcloud';
const REPORT = 'archive-report.json';
/** Result fields that are capabilities, never archived. */
const SECRET_FIELD = /_token$/;

const inputSchema = z.object({
  video_id: z.uuid(),
  version: z.number().int().min(1),
  remote_dir: z.string().regex(/^\d{4}\/\d{2}\/[0-9a-f-]{36}\/v\d+$/),
  frozen_at: z.string(),
  script_job_id: z.uuid(),
  timing_job_id: z.uuid(),
  episode_code_job_id: z.uuid(),
  preview_render_job_id: z.uuid(),
  preview_qa_job_id: z.uuid(),
  final_render_job_id: z.uuid(),
  final_qa_job_id: z.uuid(),
  metadata_job_id: z.uuid(),
  approvals: z.array(z.record(z.string(), z.unknown())),
});
type Input = z.infer<typeof inputSchema>;

export interface ArchiveVideoDeps {
  /** Null while ARCHIVE_WEBDAV_* is not configured: jobs wait as BLOCKED. */
  target: ArchiveTarget | null;
  blockSeconds: number;
}

interface Source {
  step: string;
  jobId: string;
  /** Output of the job (checkpoint path) -> place in the version folder. */
  files: (outputs: readonly string[]) => [string, string][];
}

const exactly =
  (...pairs: [string, string][]) =>
  (outputs: readonly string[]): [string, string][] =>
    pairs.filter(([from]) => outputs.includes(from));

function sources(input: Input): Source[] {
  return [
    {
      step: 'script',
      jobId: input.script_job_id,
      files: exactly(['script.json', 'script/script.json'], ['script.md', 'script/script.md']),
    },
    {
      step: 'timing',
      jobId: input.timing_job_id,
      files: exactly(
        ['voice.wav', 'audio/voice.wav'],
        ['timing.json', 'script/timing.json'],
        ['captions.json', 'subtitles/captions.json'],
      ),
    },
    {
      step: 'episode_code',
      jobId: input.episode_code_job_id,
      // The agent's code, SFX script and storyboard pages, and its turn log.
      files: (outputs) =>
        outputs.flatMap((path): [string, string][] => {
          if (path.startsWith('ws/')) return [[path, `remotion/${path.slice(3)}`]];
          return path === 'agent-turns.json' ? [[path, 'logs/agent-turns.json']] : [];
        }),
    },
    {
      step: 'render_episode',
      jobId: input.preview_render_job_id,
      files: exactly(['preview.mp4', 'renders/preview_720p.mp4']),
    },
    {
      step: 'qa_preview',
      jobId: input.preview_qa_job_id,
      files: exactly(['qa-report.json', 'qa/qa-preview.json']),
    },
    {
      step: 'render_final',
      jobId: input.final_render_job_id,
      files: exactly(['final.mp4', 'renders/final_1080p.mp4'], ['vi.srt', 'subtitles/vi.srt']),
    },
    {
      step: 'qa_final',
      jobId: input.final_qa_job_id,
      files: exactly(['qa-report.json', 'qa/qa-final.json']),
    },
    {
      step: 'metadata',
      jobId: input.metadata_job_id,
      files: exactly(
        ['metadata.json', 'metadata/metadata.json'],
        ['thumbnail.jpg', 'thumbnail/thumbnail.jpg'],
      ),
    },
  ];
}

/** SRT → WebVTT: the header, and a dot before the milliseconds. */
export function srtToVtt(srt: string): string {
  const body = srt
    .replace(/\r/g, '')
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')
    .trim();
  return `WEBVTT\n\n${body}\n`;
}

/** A job result without its capability tokens. */
function publicResult(result: Checkpoint['result']): Record<string, unknown> {
  return Object.fromEntries(Object.entries(result).filter(([key]) => !SECRET_FIELD.test(key)));
}

/** Hard-links a checkpointed file into the version folder; an earlier attempt's link is kept. */
async function place(from: string, to: string): Promise<void> {
  await mkdir(dirname(to), { recursive: true });
  try {
    await link(from, to);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    const [a, b] = await Promise.all([sha256File(from), sha256File(to)]);
    if (a.sha256 !== b.sha256) {
      throw new PermanentJobError(`${to} exists with other content; it is never overwritten`);
    }
  }
}

async function assemble(input: Input, jobsDir: string, versionDir: string) {
  const steps = [];
  const files: { path: string; sha256: string; bytes: number; job_id: string }[] = [];
  for (const source of sources(input)) {
    const dir = await resolveInside(jobsDir, source.jobId);
    const checkpoint = await readValidCheckpoint(dir);
    if (!checkpoint) {
      throw new PermanentJobError(`${source.step} job ${source.jobId} is missing or changed`);
    }
    const byPath = new Map(checkpoint.outputs.map((o) => [o.path, o]));
    for (const [from, to] of source.files([...byPath.keys()])) {
      await place(await resolveInside(dir, from), join(versionDir, to));
      const output = byPath.get(from)!;
      files.push({ path: to, sha256: output.sha256, bytes: output.bytes, job_id: source.jobId });
    }
    steps.push({
      step: source.step,
      job_id: source.jobId,
      completed_at: checkpoint.completedAt,
      outputs: checkpoint.outputs,
      result: publicResult(checkpoint.result),
    });
  }
  return { steps, files };
}

export function createArchiveVideoHandler(deps: ArchiveVideoDeps): JobHandler {
  return async ({ input, workDir, logger, progress }) => {
    const parsed = inputSchema.safeParse(input);
    if (!parsed.success) {
      throw new PermanentJobError(`invalid archive input: ${parsed.error.message}`);
    }
    if (!deps.target) {
      throw new ProviderBlockedError('archive WebDAV is not configured', deps.blockSeconds);
    }
    const data = parsed.data;
    const jobsDir = dirname(workDir);
    if (basename(jobsDir) !== 'jobs') throw new PermanentJobError('unexpected job folder layout');
    const versionDir = resolve(jobsDir, '..');

    await progress({ stage: 'archive', step: 'gathering' });
    const { steps, files } = await assemble(data, jobsDir, versionDir);
    const srt = files.find((f) => f.path === 'subtitles/vi.srt');
    if (srt) {
      await writeFile(
        join(versionDir, 'subtitles', 'vi.vtt'),
        srtToVtt(await readFile(join(versionDir, srt.path), 'utf8')),
      );
    }
    // Deterministic: a retry writes the same manifest, so a verified earlier copy is recognised.
    const manifest = {
      manifest_version: 1,
      video_id: data.video_id,
      version: data.version,
      format: 'episode',
      aspect_ratio: '16:9',
      frozen_at: data.frozen_at,
      approvals: data.approvals,
      steps,
      files,
    };
    await writeFile(join(versionDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

    await progress({ stage: 'archive', step: 'uploading' });
    let result;
    try {
      result = await archiveDirectory({
        target: deps.target,
        localDir: versionDir,
        remoteDir: data.remote_dir,
        logger,
      });
    } catch (error: unknown) {
      if (error instanceof ArchiveConflictError || error instanceof ArchiveSourceError) {
        throw new PermanentJobError(error.message);
      }
      throw error;
    }
    const report = {
      target: TARGET_NAME,
      path: result.remotePath,
      file_count: result.fileCount,
      total_bytes: result.totalBytes,
      manifest_sha256: result.manifestSha256,
      verified_at: new Date().toISOString(),
    };
    await writeFile(join(workDir, REPORT), `${JSON.stringify(report, null, 2)}\n`);
    return { outputs: [REPORT], result: report };
  };
}
