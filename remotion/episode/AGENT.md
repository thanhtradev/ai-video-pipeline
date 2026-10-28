# Episode workspace

You write the code of ONE episode: a 16:9 (1920×1080, 30 fps) Remotion composition drawn entirely
in code, in the selected kit's style with the selected cast, from the approved script in `brief.md` (and `feedback.md` when it
exists: the owner's notes on your previous version — apply every one of them). `rules.md` holds the
owner's standing rules for every video; follow them, they override this file where they disagree.
Work alone until the episode is complete; nobody answers questions during the run.

## What exists

| Path | What | You may |
|---|---|---|
| `rules.md` | the channel owner's rules for every video | read, follow |
| `brief.md` | approved script: characters, effects, notes, acts with narration lines (`L001…`) and shots (`act.n`, MỐC, description, SFX, holds) | read |
| `src/data/timing.json` | timeline built from the real narration: sentences `S001…` (each with its script `line`), shots, acts, word frames | read |
| `src/time.ts` | the ONLY way to get times: `L(id)`, `Lend(id)`, `at(id, word)`, `line(id)`, `shot(id)`, `useShot(id)`, `SHOTS`, `LINES`, `TIMING`, `TOTAL`, `sec2f`, `speakingAt` | import |
| `src/index.ts`, `src/Root.tsx` | compositions `Episode`, `EpisodeBoard` (storyboard), `EpisodeQA` (text bounds) | read |
| `kit/active/` | the selected kit and cast, one re-export per module: `rig` (`Character`), `cast` (the people), `theme` (palette `C`, `FONT`, `HAND`, `SAFE`), `stage`/`set-stage` (parallax + `cutCam`), `sets`, `sets-home`, `sets-school`, `props`, `ui` (`Captions`, `BigText`, `Pow`, bubbles), `grade` (`GradeCtx`, `Side`, cams), `lang`, `qa` | import (always from here, never from `kit/kits/...` or `kit/characters/...`) |
| `<!-- REFERENCE -->` | the finished reference episode: the model of the whole structure | read, copy patterns, import components |
| `kit/kits/whatif/sfx/` | sound synthesis: `sfx-lib.mjs`, `ep1-sfx.mjs` (synth functions + EP1 sounds), `ep5-sfx.mjs` (an episode script) | import from your SFX script |
| `src/episode/` | **your code**; `Episode.tsx` must export `Episode: React.FC` | write |
| `sfx/generate-sfx.mjs` | **your SFX script**: `node sfx/generate-sfx.mjs public/sfx` writes every WAV the episode plays into the folder given as its first argument | write |
| `public/voice.wav` | the narration; `public/sfx/` gets your SFX | — |
| `FILES.md` | every file with its size; read files by these paths (there is no search tool) | read |

## Commands

Two commands run. Run each one ALONE, as written: you are already in the workspace, so no `cd`,
and no `&&`, `;`, pipes or `echo $?` (a chained command is refused):

- `node node_modules/typescript/bin/tsc -p tsconfig.json` (must end with no errors)
- `node sfx/generate-sfx.mjs public/sfx`

Read-only commands (`cat`, `ls`, `grep`, `sed -n`) also work for reading files.

There is no network and no way to render or play the video here. After you stop, the worker checks
your work (typecheck, SFX script, a storyboard render of every shot, a text-out-of-frame scan of the
whole episode) and may resume this session with the report and the storyboard pages
(`board/page-NN.jpg`, 12 shots per page at 55 % of each shot): look at them with the Read tool and fix
what is wrong.

## Structure (follow `<!-- REFERENCE -->`)

- `src/episode/kit.tsx` (episode characters and components), `sets.tsx`, `shots/act*.tsx` (one
  component per shot, registered in a `Record<string, ShotDef>`), `audio.tsx`, `Episode.tsx`.
- `Episode` renders every shot of `SHOTS` as a `<Sequence from={s.from} durationInFrames={s.to - s.from}>`
  and adds `<Captions speaking={speakingAt} yAt={() => 886} size={50} />` and the audio layer. Every
  shot in `src/data/timing.json` must have its own visual; never leave a shot empty.
- Import timeline queries from `src/time.ts` only. `kit/episodes/*/time.ts` belong to other episodes: never
  call their `L`/`at`/`line`/`shot`/`useShot`. Kit components themselves can be imported freely.
- Never type seconds or frame numbers for story events: anchor them to words, e.g.
  `at('S012', 'vỗ tay')`, `L('S030')`, `line('S030').holdFrom`, and use `sec2f()` only for short
  durations of motion.

<!-- KIT -->

<!-- CHARACTERS -->

## Finish

Stop only when the typecheck passes, the SFX script runs, every shot has its visual and sound, and
you have checked the shot list of `brief.md` one shot at a time against your code. Then reply with a
short summary (what you built, anything you could not do).
