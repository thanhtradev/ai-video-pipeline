## Kit "Kinh dị": a Vietnamese horror episode told at night

- This is a HORROR episode: the aim is chills, never disgust. The `kits/whatif` rule "Nothing
  frightening" does not apply here; everything else about the drawing language does.
- Scare rules (the script, the storyboard and your code all follow them): no blood, wounds, corpses,
  weapons in use, explicit violence or self-harm; nothing is shown that the brief does not describe.
  The threat is suggested: a shadow at the edge of the lamp light, a door that was closed, a sound
  from the wrong direction, a face you do not get to see. No real names, addresses or dates.
- The reference episode is for TECHNIQUE only (time helpers, shot structure, camera, audio, SFX,
  grade). Do not copy its daytime colours, its gags or its bright sets.

## Channel style (do not deviate)

- Soft pseudo-3D flat cartoon in SVG, rounded shapes, no harsh outlines; the same drawing language
  as the "Nếu bạn…" kit, at night.
- Depth: at least 3 layers, blurred foreground and background, sharp focal character, slow parallax
  (`Stage` layers `far`/`bg`/`mid`/`fg`). ONE warm light source per scene (Mùn's oil lamp, a
  candle, a window, the moon) through the set's `glow`; everything away from it falls into the
  blue-black of `C.night`. Heavy vignette, soft shadows pointing away from the light.
- Palette from `kit/active/theme`: `C.night`, `C.wall`, `C.floor`, `C.lampGlow`, `C.moon`, `C.fog`,
  `C.dusk`. Use it for new sets and props; sets reused from the whatif kit are re-graded by the act
  grade, never repainted.
- Vietnamese settings with real detail: `kit/active/sets` has the night sets (`villageNight`,
  `abandonedHouse`, `dormCorridor`, `riceFieldNight`, `banyanShrine`, `hospitalHall`) and the whatif
  sets (altar room, alley, lantern street, living room, classroom…); `kit/active/props` has
  `OilLampProp`, `Candle`, `BanyanTree`, `WellStone`, `PaperTalisman`, `Mirror`, `OldRadio`, `Moon`
  plus every whatif prop. A setting the kit lacks is drawn in your `src/episode/sets.tsx` in the
  same style, at night.
- Camera: change framing every 2–4 s with hard `cutCam` cuts at word anchors, to a different shot
  size AND position or angle (move x/y, not only z: wide / medium / close-up / extreme close-up).
  Most segments are static (no `b`). A slow push-in (`b`) is allowed on a dread beat: at most one
  segment in four, never on two segments in a row, and never a pull-out right after a push-in.
  No zoom pops or scale bounces on consecutive shots. Handheld shake only when Mùn runs or
  something is wrong. Effects are flickers, flashes and ripples, not transitions.
- "Người lạ" (`NguoiLa` from `kit/active/cast`) appears only in a wide or medium shot, in the
  background or backlit, for at most about one second at a time, never in a close-up, never moving
  fast, never explained or named in the narration beyond "người lạ" / "bóng người".
- Colour grade by act as the brief says, through `GradeCtx` from `kit/active/grade` with the
  presets in `GRADE` from `kit/active/theme` (`dusk`, `night`, `dread`); never on the hero.
- Continuity: a character's look, props and positions stay the same from shot to shot unless the
  story changes them; what a line says happens on screen at that word. Mùn's lamp is lit in every
  shot where Mùn holds it; a shot where the lamp goes out is written in the brief.

## Text on screen

- Captions come from the narration (above). Big on-screen TEXT from the brief uses `BigText`.
- All on-screen text is Vietnamese, exactly as in the brief, with correct diacritics; fonts only
  `FONT` / `HAND` from `kit/active/theme`.
- Every sharp text must lie fully inside the frame (keep it inside `SAFE`), or be fully outside it.
  Text on a board, sign, talisman or paper is drawn on the SAME layer as the object that carries it
  (e.g. the set's `far` layer), never on the actor layer.

## Sound

- Voice: one `<Html5Audio src={staticFile(VOICE)} trimBefore={l.src[0]} trimAfter={l.src[1]}>` per
  sentence inside `<Sequence from={l.from} durationInFrames={l.to - l.from} layout="none">`, as
  the reference episode's `audio.tsx` does. Never change its speed or pitch.
- Silence is the main instrument: between lines the episode is silent apart from event SFX and
  loops tied to an action on screen (slow footsteps, a dripping tap).
- SFX and foley are synthesized by your `sfx/generate-sfx.mjs` (deterministic, seeded). Reuse
  `kit/kits/horror/sfx/horror-sfx.mjs` (`gen`: `door_creak`, `floorboard`, `footsteps_slow_loop`,
  `wind_gust`, `whisper`, `lamp_flicker`, `heartbeat_slow`, `water_drip`, `bell_far`, `sting_low`),
  `kit/kits/whatif/sfx/ep1-sfx.mjs` and `kit/kits/whatif/sfx/sfx-lib.mjs`. Play them with
  `staticFile(\`sfx/${name}.wav\`)`; every file you play must be produced by the script.
- Mix approved by the owner: voice 1.0, SFX × 0.45, SFX ducked −15 dB near the voice (copy the
  ducking from the reference episode's `audio.tsx`). No music, no drones longer than a sting.
- No ambience beds and no room tone: nothing plays under a whole scene (the owner heard them as a
  constant hiss). The gates reject any `amb_*` or `*room_tone*` file. A gust of wind is an event
  of under two seconds, not a bed.
- Avoid pure high sines, long broadband noise, and birds (heard as hiss); low-pass whispers and
  distant voices. No screams: a jump is a sting plus a cut, not a loud noise.
