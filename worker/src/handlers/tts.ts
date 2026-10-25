import { createHash } from 'node:crypto';
import { readFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { z } from 'zod';
import type { CostStore, GuardResult } from '../db/cost-store.js';
import type { DurationProbe } from '../media/ffprobe.js';
import { writeFileAtomic } from '../storage/checkpoint.js';
import type { IteraClient, IteraTask } from '../tts/itera-client.js';
import {
  PermanentJobError,
  ProviderBlockedError,
  type HandlerContext,
  type JobHandler,
} from '../runner.js';

// Phase 2b `tts` step: one ITERA request per scene (Q-003), so each scene's timing is the measured
// length of its own clip. Cost rules (CLAUDE.md §5): cost_guard before every new provider task,
// cost_record after it. Per-scene state files make re-runs free: a finished scene is reused, and
// a queued provider task is polled again instead of being paid for twice.

// A scene is one Short scene or one episode act; eleven_v4 takes up to 10000 characters per
// request (D-050), and the episode script step keeps every act under that.
const MAX_SCENE_CHARS = 10_000;

const inputSchema = z.object({
  scenes: z
    .array(
      z.object({ index: z.number().int().min(1), text: z.string().min(1).max(MAX_SCENE_CHARS) }),
    )
    .min(1)
    .max(20),
  provider_model_id: z.uuid(),
  language: z.literal('vi'),
});

const paramsSchema = z.object({
  provider: z.string().min(1),
  language_code: z.string().min(1),
  voice_id: z.string().min(1),
  voice_settings: z.record(z.string(), z.unknown()).optional(),
});

const sceneStateSchema = z.object({
  key: z.string(),
  taskId: z.string(),
  done: z.boolean(),
  chars: z.number(),
  credits: z.number().optional(),
  durationSeconds: z.number().optional(),
});

type Scene = z.infer<typeof inputSchema>['scenes'][number];
type SceneState = z.infer<typeof sceneStateSchema>;

interface Voice {
  modelId: string;
  params: z.infer<typeof paramsSchema>;
}

export interface SceneResult {
  index: number;
  file: string;
  task_id: string;
  chars: number;
  credits: number;
  duration_seconds: number;
}

export interface TtsHandlerDeps {
  /** Null when no ITERA API key is configured: jobs wait as BLOCKED until it is. */
  itera: IteraClient | null;
  costs: CostStore;
  probe: DurationProbe;
  workerId: string;
  pollMs: number;
  taskTimeoutMs: number;
  blockSeconds: number;
}

/** Characters the provider bills: code points after NFC, as tts_chars() counts in SQL. */
export function billedChars(text: string): number {
  return Array.from(text.normalize('NFC')).length;
}

function sceneName(index: number, extension: string): string {
  return `scene-${String(index).padStart(2, '0')}.${extension}`;
}

/** Identifies what a clip was made from; any change in voice, model, or text makes a new clip. */
function sceneKey(voice: Voice, text: string): string {
  return createHash('sha256')
    .update(JSON.stringify([voice.modelId, voice.params, text]))
    .digest('hex');
}

function checkGuard(guard: GuardResult, blockSeconds: number): void {
  const { decision } = guard;
  if (decision === 'ALLOW') return;
  if (decision === 'DISABLED' || decision === 'EXHAUSTED') {
    throw new ProviderBlockedError(`cost guard: TTS provider ${decision}`, blockSeconds);
  }
  if (decision === 'LOST') throw new Error('cost guard: job is no longer running here');
  throw new PermanentJobError(
    `cost guard: ${decision} (spent ${guard.spent} + ${guard.amount} > budget ${guard.budget} ` +
      `${guard.currency ?? ''})`.trim(),
  );
}

async function readState(path: string): Promise<SceneState | null> {
  try {
    const parsed = sceneStateSchema.safeParse(JSON.parse(await readFile(path, 'utf8')));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

async function writeState(path: string, state: SceneState): Promise<void> {
  await writeFileAtomic(path, JSON.stringify(state));
}

async function exists(path: string): Promise<boolean> {
  return stat(path).then(
    () => true,
    () => false,
  );
}

interface SceneRun {
  deps: TtsHandlerDeps & { itera: IteraClient };
  context: HandlerContext;
  voice: Voice;
}

async function waitForTask(run: SceneRun, taskId: string): Promise<IteraTask> {
  const deadline = Date.now() + run.deps.taskTimeoutMs;
  for (;;) {
    const task = await run.deps.itera.getTask(taskId, run.context.signal);
    if (task.status === 'completed' || task.status === 'failed') return task;
    if (Date.now() >= deadline) {
      // The task stays recorded in the scene state: the next attempt polls it again for free.
      throw new Error(`ITERA task ${taskId} not finished after ${run.deps.taskTimeoutMs} ms`);
    }
    await sleep(run.deps.pollMs, undefined, { signal: run.context.signal });
  }
}

/** Guard, balance check, then queue a new provider task and remember it before waiting. */
async function startTask(
  run: SceneRun,
  scene: Scene,
  key: string,
  statePath: string,
): Promise<SceneState> {
  const { deps, context, voice } = run;
  const chars = billedChars(scene.text);
  const guard = await deps.costs.guard(context.jobId, deps.workerId, chars);
  checkGuard(guard, deps.blockSeconds);
  const balance = await deps.itera.creditBalance(context.signal);
  if (balance < (guard.amount ?? 0)) {
    throw new ProviderBlockedError(
      `ITERA credit balance ${balance} is below the ${guard.amount} needed`,
      deps.blockSeconds,
    );
  }
  const taskId = await deps.itera.createSpeech(
    {
      voiceId: voice.params.voice_id,
      text: scene.text,
      modelId: voice.modelId,
      provider: voice.params.provider,
      languageCode: voice.params.language_code,
      ...(voice.params.voice_settings ? { voiceSettings: voice.params.voice_settings } : {}),
    },
    context.signal,
  );
  const state: SceneState = { key, taskId, done: false, chars };
  await writeState(statePath, state);
  context.logger.info({ scene: scene.index, taskId, chars }, 'tts task queued');
  return state;
}

async function synthesizeScene(run: SceneRun, scene: Scene): Promise<SceneResult> {
  const { deps, context } = run;
  const file = sceneName(scene.index, 'mp3');
  const audioPath = join(context.workDir, file);
  const statePath = join(context.workDir, sceneName(scene.index, 'json'));
  const key = sceneKey(run.voice, scene.text);

  let state = await readState(statePath);
  if (state?.key !== key) state = null;
  if (state?.done && state.durationSeconds && (await exists(audioPath))) {
    return toResult(scene.index, file, state);
  }
  state ??= await startTask(run, scene, key, statePath);

  const task = await waitForTask(run, state.taskId);
  if (task.status === 'failed' || !task.audioUrl) {
    // ITERA refunds failed tasks; forget the task so the next attempt queues a new one.
    await rm(statePath, { force: true });
    throw new Error(`ITERA task ${state.taskId} failed: ${task.error ?? 'no audio url'}`);
  }

  const credits = task.creditsDeducted ?? state.chars;
  await deps.costs.record(
    context.jobId,
    deps.workerId,
    task.id,
    task.charactersUsed ?? state.chars,
    credits,
  );
  await writeFileAtomic(audioPath, await deps.itera.download(task.audioUrl, context.signal));
  const durationSeconds = await deps.probe(audioPath);
  const finished: SceneState = { ...state, done: true, credits, durationSeconds };
  await writeState(statePath, finished);
  return toResult(scene.index, file, finished);
}

function toResult(index: number, file: string, state: SceneState): SceneResult {
  return {
    index,
    file,
    task_id: state.taskId,
    chars: state.chars,
    credits: state.credits ?? 0,
    duration_seconds: state.durationSeconds ?? 0,
  };
}

/** The model and voice the guard allows; any configuration gap blocks instead of guessing. */
async function resolveVoice(deps: TtsHandlerDeps, jobId: string): Promise<Voice> {
  const guard = await deps.costs.guard(jobId, deps.workerId, 0);
  checkGuard(guard, deps.blockSeconds);
  const params = paramsSchema.safeParse(guard.params);
  if (!params.success || !guard.modelId) {
    throw new ProviderBlockedError(
      'TTS model has no voice_id/provider configured',
      deps.blockSeconds,
    );
  }
  return { modelId: guard.modelId, params: params.data };
}

export function createTtsHandler(deps: TtsHandlerDeps): JobHandler {
  return async (context) => {
    const parsed = inputSchema.safeParse(context.input);
    if (!parsed.success) {
      throw new PermanentJobError(`invalid tts input: ${parsed.error.message}`);
    }
    const { itera } = deps;
    if (!itera)
      throw new ProviderBlockedError('ITERA API key is not configured', deps.blockSeconds);

    const voice = await resolveVoice(deps, context.jobId);
    const run: SceneRun = { deps: { ...deps, itera }, context, voice };
    const scenes: SceneResult[] = [];
    for (const [i, scene] of parsed.data.scenes.entries()) {
      await context.progress({ stage: 'tts', scene: i + 1, of: parsed.data.scenes.length });
      scenes.push(await synthesizeScene(run, scene));
    }

    const totalSeconds = scenes.reduce((sum, scene) => sum + scene.duration_seconds, 0);
    const totalCredits = scenes.reduce((sum, scene) => sum + scene.credits, 0);
    context.logger.info({ scenes: scenes.length, totalSeconds, totalCredits }, 'narration written');
    return {
      outputs: scenes.map((scene) => scene.file),
      result: {
        provider: 'itera',
        model_id: voice.modelId,
        voice_id: voice.params.voice_id,
        scenes,
        total_seconds: Math.round(totalSeconds * 100) / 100,
        total_chars: scenes.reduce((sum, scene) => sum + scene.chars, 0),
        total_credits: totalCredits,
      },
    };
  };
}
