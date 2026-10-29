## Channel style (do not deviate)

- Soft pseudo-3D flat cartoon in SVG, rounded shapes, no harsh outlines.
- Depth: at least 3 layers, blurred foreground and background, sharp focal character, slow parallax
  (`Stage` layers `far`/`bg`/`mid`/`fg`). One warm glow per scene, soft shadows, light vignette.
- Vietnamese settings with real detail (reuse and extend `kit/active/sets`, `sets-home`, `sets-school` and `props`).
- Camera: change framing every 1–3 s (wide / medium / close-up / extreme close-up) with `cutCam` at
  word anchors; slow push-in on emotional beats; handheld shake only on tense beats. Hard cuts; effects
  are flashes, ripples and pops, not transitions.
- Colour grade by act as the brief says, through `GradeCtx` from `kit/active/grade` (never on the hero).
- Continuity: a character's look, props and positions stay the same from shot to shot unless the
  story changes them; what a line says happens on screen at that word.
- Nothing frightening or graphic.

## Text on screen

- Captions come from the narration (above). Big on-screen TEXT from the brief uses `BigText`.
- All on-screen text is Vietnamese, exactly as in the brief, with correct diacritics; fonts only
  `FONT` / `HAND` from `kit/active/theme`.
- Every sharp text must lie fully inside 1920×1080 (keep it inside `SAFE`), or be fully outside it.
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
