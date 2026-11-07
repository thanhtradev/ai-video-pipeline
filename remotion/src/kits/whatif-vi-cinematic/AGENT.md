## Channel style (do not deviate)

- Soft pseudo-3D flat cartoon in SVG, rounded shapes, no harsh outlines, filmed like a movie.
- Depth: at least 3 layers, blurred foreground and background, sharp focal character, slow parallax
  (`Stage` layers `far`/`bg`/`mid`/`fg`). Each set in `kit/active/sets`, `sets-home` and `sets-school`
  already carries its light, haze, dust, focus curve, character light and finish: use them through
  `SetStage` (or `Stage2`) and do not add another vignette, glow or `Grain`.
- Vietnamese settings with real detail (reuse and extend those sets and `props`). A set you write
  yourself goes through `cinematicSet` from `kit/active/sets`, so it gets the same look.
- Camera: change framing every 2–4 s with hard `cutCam` cuts at word anchors, to a different shot
  size AND position or angle (move x/y, not only z: wide / medium / close-up / extreme close-up).
  Most segments are static (no `b`). A slow push-in (`b`) only on an emotional or gag beat: at most
  one segment in four, never on two segments in a row, and never a pull-out right after a push-in.
  No zoom pops or scale bounces on consecutive shots (the owner hears/sees them as constant zooming).
  Handheld shake only on tense beats. Effects are flashes, ripples and pops, not transitions.
- Colour grade by act as the brief says, through `GradeCtx` from `kit/active/grade` (never on the hero).
- Continuity: a character's look, props and positions stay the same from shot to shot unless the
  story changes them; what a line says happens on screen at that word.
- Nothing frightening or graphic.

## Cinematic shots

Everything below is imported from `kit/active/sets`. Use these so the episode looks filmed, and vary them. Too many effects at once looks busy: at most
one special shot (over-the-shoulder, angle, focus slide) in four, never two of one kind in a row.

- **Mood:** the sets take `{ mood }`: `golden`, `night`, `overcast`, `rain`
  (`livingRoom(f, { mood: 'rain' })`). Without it a set keeps its own light. Choose by the act, and keep
  one mood through a scene unless the story changes it. Rain is silent: no rain bed (see Sound).
- **Face close-up:** `closeUpCam(x, feetY, size?, z?)`, for reactions and key
  lines. The background melts and soft round lights appear on their own as the zoom rises.
- **Over-the-shoulder:** `overShoulderCam(x, feetY)` with
  `fg={<OverShoulder x={…} y={…} color={…} t={f} />}` on `SetStage`, for conversations. Draw only the
  person being looked at in `actors`.
- **Focus slide:** spread `{...rackFocus(localFrame, [from, to], A, B)}` on `SetStage` to move from an object to a face, as in
  `{ blurFar: 0, blurBg: 4, blurMid: 14 }` to `{ blurFar: 9, blurBg: 7, blurMid: 0 }`. For a reveal.
  Text on a layer you make sharp must be fully inside `SAFE`.
- **Low and high angle:** add `tilt` to a `Cam` (about `9` looks up, `-9` looks down), held for the
  whole segment. Low for power or awe, high for loneliness.
- **Object close-up:** `ClockInsert`, `TeaCupInsert`, `IncenseInsert`, in
  place of `SetStage` for a beat of 1–2 s. Draw others in the same detailed way when the story needs
  them, with `FilmFinish`.
- **Foreground:** pass an object close to the lens through `fg` (`RailingFg`; a chair back, a door edge, a plant) to frame a shot; it never covers a
  face or a caption.
- **Details that move:** `FallingLeaves`, `Laundry`-style cloth,
  `flicker(f, seed)` for candles, `RainStreaks`, `RainOnGlass`. Tie them to the scene; most sets
  already move a little.
- The light on characters comes from the set. Do not draw rim lights or shadows on them yourself;
  pass no `rimSide`. Characters keep the channel's design: two white eyes, nothing else on the face.

## Text on screen

- Captions come from the narration (above). Big on-screen TEXT from the brief uses `BigText`.
- All on-screen text is Vietnamese, exactly as in the brief, with correct diacritics; fonts only
  `FONT` / `HAND` from `kit/active/theme`.
- Every sharp text must lie fully inside the frame (keep it inside `SAFE`), or be fully outside it.
  Text on a board, sign or poster is drawn on the SAME layer as the object that carries it (e.g. the
  set's `far` layer), never on the actor layer.

## Sound

- Voice: one `<Html5Audio src={staticFile(VOICE)} trimBefore={l.src[0]} trimAfter={l.src[1]}>` per
  sentence inside `<Sequence from={l.from} durationInFrames={l.to - l.from} layout="none">`, as
  the reference episode's `audio.tsx` does. Never change its speed or pitch.
- SFX and foley are synthesized by your `sfx/generate-sfx.mjs` (deterministic, seeded;
  reuse `kit/kits/whatif/sfx/ep1-sfx.mjs` functions and `kit/kits/whatif/sfx/sfx-lib.mjs`; loops through `loopify`). Play
  them with `staticFile(\`sfx/${name}.wav\`)`; every file you play must be produced by the script.
- Mix approved by the owner: voice 1.0, SFX × 0.45, SFX ducked −15 dB near the voice (copy the
  ducking from the reference episode's `audio.tsx`). No music.
- No ambience beds and no room tone: nothing plays under a whole scene (the owner heard them as a
  constant hiss). Between lines the episode is silent apart from event SFX and loops tied to an
  action on screen (boiling, footsteps). The gates reject any `amb_*` or `*room_tone*` file.
- Avoid pure high sines, long broadband noise, and birds (heard as hiss); low-pass distant voices.
