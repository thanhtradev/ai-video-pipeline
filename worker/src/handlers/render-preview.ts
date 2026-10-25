import { rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { z } from 'zod';
import {
  FPS,
  HEIGHT,
  MUSIC_STYLES,
  WIDTH,
  type ExplainerProps,
} from '../../../remotion/src/props.js';
import type { LoudnessNormalizer } from '../media/loudness.js';
import type { DurationProbe } from '../media/ffprobe.js';
import { startMediaServer } from '../render/media-server.js';
import type { MusicChoice, MusicLibrary } from '../render/music.js';
import type { PreviewRenderer } from '../render/remotion-renderer.js';
import { buildCues, toSrt, toVtt } from '../render/subtitles.js';
import { buildTimeline } from '../render/timeline.js';
import { readValidCheckpoint } from '../storage/checkpoint.js';
import { resolveInside } from '../storage/workspace.js';
import { PermanentJobError, type HandlerContext, type JobHandler } from '../runner.js';

// Phase 2c `render_preview` step (q:render): the typography explainer at 720×1280 (D-025) timed
// by the measured narration clips of the version's tts job, a music bed from the shared library,
// loudness normalised to D-032, plus the thumbnail and Vietnamese SRT/VTT subtitles. No paid calls.

export const PREVIEW_SCALE = 2 / 3;
const RAW_VIDEO = 'preview.raw.mp4';
const VIDEO = 'preview.mp4';
const THUMBNAIL = 'thumbnail.png';
const SRT = 'vi.srt';
const VTT = 'vi.vtt';

const inputSchema = z.object({
  title: z.string().min(1).max(200),
  hook: z.string().min(1).max(400),
  music_style: z.enum(MUSIC_STYLES),
  language: z.literal('vi'),
  tts_job_id: z.uuid(),
  scenes: z
    .array(
      z.object({
        index: z.number().int().min(1),
        narration: z.string().min(1),
        on_screen_text: z.string().min(1),
        emphasis: z.array(z.string()),
      }),
    )
    .min(1)
    .max(20),
});

const ttsResultSchema = z.object({
  scenes: z.array(
    z.object({
      index: z.number().int().min(1),
      file: z.string().min(1),
      duration_seconds: z.number().positive(),
    }),
  ),
});

type Input = z.infer<typeof inputSchema>;

interface Clip {
  index: number;
  path: string;
  durationSeconds: number;
}

export interface RenderPreviewDeps {
  renderer: PreviewRenderer;
  loudness: LoudnessNormalizer;
  probe: DurationProbe;
  /** Null when no library is configured: the preview has no music. */
  music: MusicLibrary | null;
}

/** The narration clips from the tts job's checkpoint, which proves they are complete. */
async function narrationClips(workDir: string, input: Input): Promise<Clip[]> {
  const ttsDir = await resolveInside(dirname(workDir), input.tts_job_id);
  const checkpoint = await readValidCheckpoint(ttsDir);
  if (!checkpoint) {
    throw new PermanentJobError(`narration of tts job ${input.tts_job_id} is missing or changed`);
  }
  const tts = ttsResultSchema.safeParse(checkpoint.result);
  if (!tts.success) throw new PermanentJobError('tts job result has no scene clips');
  const byIndex = new Map(tts.data.scenes.map((scene) => [scene.index, scene]));
  return Promise.all(
    input.scenes.map(async (scene) => {
      const clip = byIndex.get(scene.index);
      if (!clip) throw new PermanentJobError(`no narration clip for scene ${scene.index}`);
      return {
        index: scene.index,
        path: await resolveInside(ttsDir, clip.file),
        durationSeconds: clip.duration_seconds,
      };
    }),
  );
}

async function pickMusic(
  deps: RenderPreviewDeps,
  input: Input,
  context: HandlerContext,
): Promise<MusicChoice | null> {
  if (!deps.music) {
    context.logger.warn('no music library configured; rendering without music');
    return null;
  }
  const choice = await deps.music.pick(input.music_style, input.tts_job_id);
  if (!choice) context.logger.warn({ style: input.music_style }, 'no music track for this style');
  return choice;
}

function musicResult(choice: MusicChoice | null): Record<string, unknown> | null {
  if (!choice) return null;
  const { track } = choice;
  return {
    id: track.id,
    title: track.title,
    artist: track.artist,
    style: track.style,
    license: track.license,
    license_url: track.license_url,
    source_url: track.source_url,
    credit: track.credit,
    volume: choice.volume,
  };
}

export function createRenderPreviewHandler(deps: RenderPreviewDeps): JobHandler {
  return async (context) => {
    const parsed = inputSchema.safeParse(context.input);
    if (!parsed.success) {
      throw new PermanentJobError(`invalid render_preview input: ${parsed.error.message}`);
    }
    const input = parsed.data;
    const { workDir, signal, logger } = context;

    const clips = await narrationClips(workDir, input);
    const timeline = buildTimeline(clips, FPS);
    const cues = buildCues(
      input.scenes.map((scene, i) => ({
        narration: scene.narration,
        startSeconds: timeline.scenes[i]!.startSeconds,
        speechSeconds: timeline.scenes[i]!.speechSeconds,
      })),
    );
    await writeFile(join(workDir, SRT), toSrt(cues));
    await writeFile(join(workDir, VTT), toVtt(cues));

    const music = await pickMusic(deps, input, context);
    const files = new Map(clips.map((clip) => [`/voice/${basename(clip.path)}`, clip.path]));
    if (music) files.set(`/music/${basename(music.path)}`, music.path);
    const server = await startMediaServer(files);
    try {
      const props: ExplainerProps = {
        style: input.music_style,
        title: input.title,
        durationInFrames: timeline.durationInFrames,
        music: music
          ? { src: server.url(`/music/${basename(music.path)}`), volume: music.volume }
          : null,
        scenes: input.scenes.map((scene, i) => ({
          index: scene.index,
          text: scene.on_screen_text,
          emphasis: scene.emphasis,
          startFrame: timeline.scenes[i]!.startFrame,
          durationInFrames: timeline.scenes[i]!.durationInFrames,
          audioSrc: server.url(`/voice/${basename(clips[i]!.path)}`),
        })),
      };
      logger.info(
        { frames: timeline.durationInFrames, music: music?.track.id ?? null },
        'rendering preview',
      );
      await deps.renderer.renderVideo(props, join(workDir, RAW_VIDEO), PREVIEW_SCALE, signal);
    } finally {
      await server.close();
    }

    const loudness = await deps.loudness(join(workDir, RAW_VIDEO), join(workDir, VIDEO), signal);
    await rm(join(workDir, RAW_VIDEO), { force: true });
    await deps.renderer.renderThumbnail(
      { style: input.music_style, title: input.title, hook: input.hook },
      join(workDir, THUMBNAIL),
      PREVIEW_SCALE,
      signal,
    );
    const durationSeconds = await deps.probe(join(workDir, VIDEO));

    return {
      outputs: [VIDEO, THUMBNAIL, SRT, VTT],
      result: {
        template: 'TypographyExplainer',
        width: Math.round(WIDTH * PREVIEW_SCALE),
        height: Math.round(HEIGHT * PREVIEW_SCALE),
        fps: FPS,
        frames: timeline.durationInFrames,
        duration_seconds: Math.round(durationSeconds * 100) / 100,
        scenes: timeline.scenes.map((scene) => ({
          index: scene.index,
          start_seconds: Math.round(scene.startSeconds * 1000) / 1000,
          speech_seconds: scene.speechSeconds,
          frames: scene.durationInFrames,
        })),
        subtitles: { language: 'vi', cues: cues.length, files: [SRT, VTT] },
        music: musicResult(music),
        loudness,
      },
    };
  };
}
