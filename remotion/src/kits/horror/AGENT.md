## Kit "Kinh dị": a Vietnamese horror episode told in silhouettes (style v2)

- This is a HORROR episode: the aim is dread, never disgust. The whatif rules do not apply here;
  this file is the style. The reference episode is for TECHNIQUE only (time helpers, shot
  structure, `Sequence` layout, audio ducking, SFX script shape): never copy its colours, its
  captions, its gags or its camera rhythm.
- Scare rules (the script, the storyboard and your code all follow them): no blood, wounds,
  corpses, weapons in use, explicit violence or self-harm; nothing is shown that the brief does not
  describe. The threat is suggested: a shadow at the edge of the lamp light, a door that was
  closed, a sound from the wrong direction, two eyes that should not be there. No real names,
  addresses or dates.

## Picture (do not deviate)

- People are `Figure` silhouettes from `kit/active/cast` (see the cast section): black bodies,
  a rim light on the lit side, at most a pair of eyes. No rig, no hoodie, no face, no colour on a
  person. TÔI is the one figure with the strong rim light.
- ONE light source per scene through the set's `glow` (`kit/active/sets`: `villageNight`,
  `abandonedHouse`, `dormCorridor`, `riceFieldNight`, `banyanShrine`, `hospitalHall`,
  `bedroomNight`, `stairwell`, plus the whatif sets re-graded) and the props of
  `kit/active/props` (`OilLampProp`, `Candle`, `Moon`, `PaperTalisman`, `Mirror`, `OldRadio`…).
  The lamp may die (`lit` 0): then only the door gap, the moon or a phone screen lights the shot.
  Everything away from the light is `C.night`. Multiply the glow's `a` by `flickerGain(f)` from
  `kit/active/ui` (re-exported by the kit) so every flame breathes; a flame that dies does it in
  one frame.
- Every shot is wrapped in `HorrorPost` (grain + heavy vignette, levels in `POST` from
  `kit/active/theme`) and the SetStage gets `vignette={POST.vignette}`.
- Camera: shots are LONG and STILL. A shot holds 6–15 s with no camera move; at most one slow
  push-in (`b`) per act, on the thing TÔI is looking at; a hard cut lands on a sting or at the
  start of a line. No cuts every 2–4 s, no zoom pops, no scale bounces, no transitions. Handheld
  shake only when TÔI runs.
- NÓ beat: a `Glitch` of 4–8 frames (`at` the word anchor) on the shot where NÓ is in frame, then
  a hard cut. NÓ follows the cast rules (wide or medium, edge of the light, about a second, at most
  three times an episode, never a close-up).
- Black-out beats: 1–3 per episode, 1–3 s each, `Blackout` over the shot with only SFX and the
  voice under it (a breath, three knocks, flip-flops in the corridor). The worker's QA reports
  black stretches as WARN; that is expected for this kit.
- Colour grade by act through `GradeCtx` from `kit/active/grade` with `GRADE` from
  `kit/active/theme` (`dusk`, `night`, `dread`); never on TÔI.
- Continuity: a figure's props and positions stay the same from shot to shot unless the story
  changes them; what a line says happens on screen at that word.

## Text on screen

- NO captions: do not render `<Captions>` and do not use `BigText`, `Pow` or bubbles. The
  narration is heard, not read (the worker still writes the SRT sidecar).
- The only text is `TitleCard` from the kit: once at the start with the episode title (typed over
  the first line, then faded with `fadeOutFrom`) and once at the very end with one closing line
  from the brief's last act. Vietnamese with correct diacritics, `HAND` font, inside `SAFE`.

## Sound

- Voice: one `<Html5Audio src={staticFile(VOICE)} trimBefore={l.src[0]} trimAfter={l.src[1]}>` per
  sentence inside `<Sequence from={l.from} durationInFrames={l.to - l.from} layout="none">`, as
  the reference episode's `audio.tsx` does. Never change its speed or pitch.
- Silence is the main instrument. Between lines nothing plays except event SFX, loops tied to an
  action on screen, and the one ambience allowed below.
- SFX are synthesized by your `sfx/generate-sfx.mjs` (deterministic, seeded). Reuse
  `kit/kits/horror/sfx/horror-sfx.mjs` (`gen`: `door_creak`, `floorboard`,
  `footsteps_slow_loop`, `flipflops_slow_loop`, `wind_gust`, `whisper`, `lamp_flicker`,
  `heartbeat_slow`, `breath_near`, `knock_three`, `water_drip`, `bell_far`, `sting_low`,
  `static_burst`, `tv_hiss_short`, and the ambiences `amb_drone_low_loop`, `amb_wind_far_loop`,
  `amb_insects_loop`), `kit/kits/whatif/sfx/ep1-sfx.mjs` and `sfx-lib.mjs`. Play them with
  `staticFile(\`sfx/${name}.wav\`)`; every file you play must be produced by the script.
- Mix: voice 1.0, event SFX × 0.45 ducked −15 dB near the voice (copy the ducking from the
  reference `audio.tsx`). Ambience (`amb_*`) is allowed in THIS kit only: at most one at a time,
  gain ≤ 0.12, faded in and out over a second at the scene change, never under the title card or
  a black-out. The gates accept at most 3 `amb_*` files and refuse one whose peak is above 0.5.
  No music files, no drone longer than a scene.
- No screams: a jump is `sting_low` or `static_burst` plus a cut. Avoid pure high sines and long
  broadband noise; low-pass whispers and distant voices.
