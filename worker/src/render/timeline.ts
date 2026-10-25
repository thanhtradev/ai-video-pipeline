// Scene timing for the preview: each scene lasts its measured narration clip plus a short pause,
// rounded up to whole frames. Subtitles use the same start times so text and voice stay aligned.

export const SCENE_PAUSE_SECONDS = 0.35;

export interface TimedScene {
  index: number;
  startFrame: number;
  durationInFrames: number;
  startSeconds: number;
  speechSeconds: number;
}

export interface Timeline {
  scenes: TimedScene[];
  durationInFrames: number;
}

export function buildTimeline(
  clips: readonly { index: number; durationSeconds: number }[],
  fps: number,
): Timeline {
  let startFrame = 0;
  const scenes = clips.map((clip) => {
    const durationInFrames = Math.ceil((clip.durationSeconds + SCENE_PAUSE_SECONDS) * fps);
    const scene: TimedScene = {
      index: clip.index,
      startFrame,
      durationInFrames,
      startSeconds: startFrame / fps,
      speechSeconds: clip.durationSeconds,
    };
    startFrame += durationInFrames;
    return scene;
  });
  return { scenes, durationInFrames: startFrame };
}
