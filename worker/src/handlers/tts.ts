import { createHash } from 'node:crypto';
import { readFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { z } from 'zod';
import type { CostStore, GuardResult } from '../db/cost-store.js';
import type { DurationProbe } from '../media/ffprobe.js';
import { writeFileAtomic } from '../storage/checkpoint.js';
import {
  pronounce,
  rulesSchema,
  type Pronunciation,
  type RulesSource,
} from '../rules/channel-rules.js';
import type { IteraClient, IteraTask } from '../tts/itera-client.js';
import { languageSchema, type Language } from '../episode/language.js';
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
  language: languageSchema,
});

const paramsSchema = z.object({
  provider: z.string().min(1),
  language_code: z.string().min(1),
  voice_id: z.string().min(1),
  voice_settings: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Voices per video language (D-092): `voices.<lang>` overrides the flat voice_id/language_code,
 * which stay the Vietnamese voice so existing clips keep their keys.
 */
const voicesSchema = z.object({
  voices: z
    .record(
      z.string(),
      z.object({ voice_id: z.string().min(1), language_code: z.string().min(1) }).partial(),
    )
    .optional(),
});

const sceneStateSchema = z.object({
  key: z.string(),
  /** Null while the request is being sent (the intent); set once the provider returned the id. */
  taskId: z.string().nullable(),
  done: z.boolean(),
  chars: z.number(),
  credits: z.number().optional(),
  durationSeconds: z.number().optional(),
  /** An intent without a task id was already reported to the owner (see pendingIntent). */
  reported: z.boolean().optional(),
});

type Scene = z.infer<typeof inputSchema>['scenes'][number];
type SceneState = z.infer<typeof sceneStateSchema>;
type QueuedState = SceneState & { taskId: string };

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
  /** The owner's pronunciation table (D-059), taken once per job. */
  rules: RulesSource;
}

const PRONUNCIATION_FILE = 'pronunciation.json';
const pronunciationSchema = z.object({
  version: z.string(),
  entries: rulesSchema.shape.pronunciation,
});

/**
 * The pronunciation table of this job: read on the first attempt and kept in the job folder, so a
 * retry reads the same text (an edit in between must not make paid clips again).
 */
async function jobPronunciation(
  deps: TtsHandlerDeps,
  workDir: string,
): Promise<{ version: string; entries: Pronunciation }> {
  const path = join(workDir, PRONUNCIATION_FILE);
  try {
    return pronunciationSchema.parse(JSON.parse(await readFile(path, 'utf8')));
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const rules = await deps.rules();
  const snapshot = { version: rules.version, entries: rules.pronunciation };
  await writeFileAtomic(path, `${JSON.stringify(snapshot, null, 1)}\n`);
  return snapshot;
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

/**
 * The scene's state, or null when none was written yet. Any other problem (unreadable or corrupt
 * file) stops the job: a missing state means "pay for this scene", so it is never guessed.
 */
async function readState(path: string): Promise<SceneState | null> {
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (error: unknown) {
    throw new PermanentJobError(`corrupt scene state ${path}: ${String(error)}`);
  }
  const parsed = sceneStateSchema.safeParse(json);
  if (!parsed.success) {
    throw new PermanentJobError(`corrupt scene state ${path}: ${parsed.error.message}`);
  }
  return parsed.data;
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

/**
 * A state whose request may have reached the provider but whose task id was never saved (the
 * process died between the two). The provider cannot be asked which task that was, so the first
 * time this is seen the job stops for a decision: the owner checks the ITERA history and uses
 * /retry, which then requests the scene again (the only retry path after a permanent failure).
 */
async function pendingIntent(
  run: SceneRun,
  scene: Scene,
  state: SceneState,
  statePath: string,
): Promise<void> {
  if (!state.reported) {
    // Mark it only when this attempt will really end as a permanent failure: an aborted attempt
    // (lost lease) is re-dispatched by the watchdog, not by the owner.
    if (!run.context.signal.aborted) await writeState(statePath, { ...state, reported: true });
    throw new PermanentJobError(
      `scene ${scene.index}: a TTS request of ${state.chars} characters may have been sent but ` +
        'its task id was not saved; check the ITERA history, then /retry requests the scene again',
    );
  }
  run.context.logger.warn(
    { scene: scene.index, chars: state.chars },
    'requesting a scene whose earlier request was not recorded (owner retried)',
  );
}

/** Guard, balance check, then queue a new provider task and remember it before waiting. */
async function startTask(
  run: SceneRun,
  scene: Scene,
  key: string,
  statePath: string,
): Promise<QueuedState> {
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
  // The intent goes to disk before the paid request, so a crash in between is never mistaken for
  // "nothing was sent" (CLAUDE.md §5: a re-run must not pay twice).
  await writeState(statePath, { key, taskId: null, done: false, chars });
  let taskId: string;
  try {
    taskId = await deps.itera.createSpeech(
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
  } catch (error: unknown) {
    // A classified refusal (4xx: key, credits, rate limit, bad request) means the provider
    // answered and queued nothing: forget the intent so the retry is a normal one. Anything else
    // (timeout, socket drop, 5xx) is ambiguous and keeps it.
    if (error instanceof ProviderBlockedError || error instanceof PermanentJobError) {
      await rm(statePath, { force: true });
    }
    throw error;
  }
  const state: QueuedState = { key, taskId, done: false, chars };
  await writeState(statePath, state);
  context.logger.info({ scene: scene.index, taskId, chars }, 'tts task queued');
  return state;
}

/** The scene's queued task from an earlier run, or null when a new request is needed. */
async function queuedTask(
  run: SceneRun,
  scene: Scene,
  key: string,
  statePath: string,
): Promise<QueuedState | null> {
  const state = await readState(statePath);
  if (state === null || state.key !== key) return null;
  if (state.taskId === null) {
    await pendingIntent(run, scene, state, statePath);
    return null;
  }
  return { ...state, taskId: state.taskId };
}

async function recordCost(run: SceneRun, task: IteraTask, state: QueuedState): Promise<number> {
  const credits = task.creditsDeducted ?? state.chars;
  await run.deps.costs.record(
    run.context.jobId,
    run.deps.workerId,
    task.id,
    task.charactersUsed ?? state.chars,
    credits,
  );
  return credits;
}

async function synthesizeScene(run: SceneRun, scene: Scene): Promise<SceneResult> {
  const { deps, context } = run;
  const file = sceneName(scene.index, 'mp3');
  const audioPath = join(context.workDir, file);
  const statePath = join(context.workDir, sceneName(scene.index, 'json'));
  const key = sceneKey(run.voice, scene.text);

  const existing = await queuedTask(run, scene, key, statePath);
  if (existing?.done && existing.durationSeconds && (await exists(audioPath))) {
    return toResult(scene.index, file, existing);
  }
  const state = existing ?? (await startTask(run, scene, key, statePath));

  const task = await waitForTask(run, state.taskId);
  if (task.status === 'failed') {
    // ITERA refunds failed tasks; forget the task so the next attempt queues a new one.
    await rm(statePath, { force: true });
    throw new Error(`ITERA task ${state.taskId} failed: ${task.error ?? 'unknown error'}`);
  }
  // A completed task was charged: record it before anything else can go wrong.
  const credits = await recordCost(run, task, state);
  if (!task.audioUrl) {
    // Keep the state: the next attempt polls the same (paid) task instead of buying another.
    throw new Error(`ITERA task ${state.taskId} completed without an audio url`);
  }
  await writeFileAtomic(audioPath, await deps.itera.download(task.audioUrl, context.signal));
  const durationSeconds = await deps.probe(audioPath);
  const finished: QueuedState = { ...state, done: true, credits, durationSeconds };
  await writeState(statePath, finished);
  return toResult(scene.index, file, finished);
}

function toResult(index: number, file: string, state: QueuedState): SceneResult {
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
async function resolveVoice(
  deps: TtsHandlerDeps,
  jobId: string,
  language: Language,
): Promise<Voice> {
  const guard = await deps.costs.guard(jobId, deps.workerId, 0);
  checkGuard(guard, deps.blockSeconds);
  const voices = voicesSchema.safeParse(guard.params);
  const own = voices.success ? voices.data.voices?.[language] : undefined;
  // Never another language's voice: an unconfigured language waits for the owner (CLAUDE.md §3).
  if (language !== 'vi' && !(own?.voice_id && own.language_code)) {
    throw new ProviderBlockedError(
      `no TTS voice configured for language ${language} (provider_model.default_params.voices.${language})`,
      deps.blockSeconds,
    );
  }
  const params = paramsSchema.safeParse({ ...(guard.params as object), ...own });
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

    const { language } = parsed.data;
    const voice = await resolveVoice(deps, context.jobId, language);
    // The owner's pronunciation table is written for the Vietnamese voice.
    const pronunciation =
      language === 'vi'
        ? await jobPronunciation(deps, context.workDir)
        : { version: 'none', entries: [] };
    const spoken = parsed.data.scenes.map((scene) => ({
      ...scene,
      text: pronounce(scene.text, pronunciation.entries),
    }));
    const tooLong = spoken.find((scene) => scene.text.length > MAX_SCENE_CHARS);
    if (tooLong) {
      throw new PermanentJobError(
        `scene ${tooLong.index} is over ${MAX_SCENE_CHARS} characters after pronunciation`,
      );
    }
    const run: SceneRun = { deps: { ...deps, itera }, context, voice };
    const scenes: SceneResult[] = [];
    for (const [i, scene] of spoken.entries()) {
      await context.progress({ stage: 'tts', scene: i + 1, of: spoken.length });
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
        // The timing step aligns whisper with the same spoken forms.
        pronunciation,
      },
    };
  };
}
