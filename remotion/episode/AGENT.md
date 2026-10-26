# Episode workspace — TikTok 2 channel ("Chíp Siêu Năng")

You write the code of ONE episode: a 16:9 (1920×1080, 30 fps) Remotion composition drawn entirely
in code, in this channel's style, from the approved script in `brief.md` (and `feedback.md` when it
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
| `kit/ep1/` | shared kit: `Character` rig, `Stage`/`SetStage` parallax + `cutCam`, `sets`, `props`, `ui` (`Captions`, `BigText`, `Pow`, bubbles), `theme` (palette `C`, `FONT`, `HAND`, `SAFE`) | import |
| `kit/ep2/`, `kit/ep3/`, `kit/ep5/` | finished reference episodes; `kit/ep5/` is the best model of the whole structure | read, copy patterns, import components |
| `kit/sfx/` | sound synthesis: `sfx-lib.mjs`, `ep1-sfx.mjs` (synth functions + EP1 sounds), `ep5-sfx.mjs` (an episode script) | import from your SFX script |
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

## Structure (follow `kit/ep5/`)

- `src/episode/kit.tsx` (episode characters and components), `sets.tsx`, `shots/act*.tsx` (one
  component per shot, registered in a `Record<string, ShotDef>`), `audio.tsx`, `Episode.tsx`.
- `Episode` renders every shot of `SHOTS` as a `<Sequence from={s.from} durationInFrames={s.to - s.from}>`
  and adds `<Captions speaking={speakingAt} yAt={() => 886} size={50} />` and the audio layer. Every
  shot in `src/data/timing.json` must have its own visual; never leave a shot empty.
- Import timeline queries from `src/time.ts` only. `kit/*/time.ts` belong to other episodes: never
  call their `L`/`at`/`line`/`shot`/`useShot`. Kit components themselves can be imported freely.
- Never type seconds or frame numbers for story events: anchor them to words, e.g.
  `at('S012', 'vỗ tay')`, `L('S030')`, `line('S030').holdFrom`, and use `sec2f()` only for short
  durations of motion.

## Channel style (do not deviate)

- Soft pseudo-3D flat cartoon in SVG, rounded shapes, no harsh outlines.
- Characters (`Character` from `kit/ep1/Character.tsx`): big glossy black round head with a thin cream
  rim light, two white oval eyes, NO mouth; expressions only through eye shapes (normal, `> <`,
  half-lid, wide, happy arcs, sad droop); blink and breathe. Hoodie with drawstrings, thin tube limbs,
  mitten hands. Kids are smaller with the same proportions.
- The main character "BẠN" ALWAYS wears the saturated orange hoodie (`C.orange`). Everything else is
  muted and desaturated (blue-grey, dusty purple, olive, beige).
- Depth: at least 3 layers, blurred foreground and background, sharp focal character, slow parallax
  (`Stage` layers `far`/`bg`/`mid`/`fg`). One warm glow per scene, soft shadows, light vignette.
- Vietnamese settings with real detail (reuse and extend `kit/ep1/sets.tsx` and `props.tsx`).
- Camera: change framing every 1–3 s (wide / medium / close-up / extreme close-up) with `cutCam` at
  word anchors; slow push-in on emotional beats; handheld shake only on tense beats. Hard cuts; effects
  are flashes, ripples and pops, not transitions.
- Colour grade by act as the brief says, through `GradeCtx` (never on the orange hero).
- Continuity: a character's look, props and positions stay the same from shot to shot unless the
  story changes them; what a line says happens on screen at that word.
- Nothing frightening or graphic.

## Text on screen

- Captions come from the narration (above). Big on-screen TEXT from the brief uses `BigText`.
- All on-screen text is Vietnamese, exactly as in the brief, with correct diacritics; fonts only
  `FONT` / `HAND` from `kit/ep1/theme`.
- Every sharp text must lie fully inside 1920×1080 (keep it inside `SAFE`), or be fully outside it.
  Text on a board, sign or poster is drawn on the SAME layer as the object that carries it (e.g. the
  set's `far` layer), never on the actor layer.

## Sound

- Voice: one `<Html5Audio src={staticFile(VOICE)} trimBefore={l.src[0]} trimAfter={l.src[1]}>` per
  sentence inside `<Sequence from={l.from} durationInFrames={l.to - l.from} layout="none">`, as
  `kit/ep5/audio.tsx` does. Never change its speed or pitch.
- SFX, foley and ambience are synthesized by your `sfx/generate-sfx.mjs` (deterministic, seeded;
  reuse `kit/sfx/ep1-sfx.mjs` functions and `kit/sfx/sfx-lib.mjs`; loops through `loopify`). Play
  them with `staticFile(\`sfx/${name}.wav\`)`; every file you play must be produced by the script.
- Mix approved by the owner: voice 1.0, SFX × 0.45, ambience beds × 0.56, beds ducked −12 dB and SFX
  −15 dB near the voice (copy the ducking from `kit/ep5/audio.tsx`). No music.
- Avoid pure high sines, long broadband noise, and birds (heard as hiss); low-pass distant voices.

## Finish

Stop only when the typecheck passes, the SFX script runs, every shot has its visual and sound, and
you have checked the shot list of `brief.md` one shot at a time against your code. Then reply with a
short summary (what you built, anything you could not do).
