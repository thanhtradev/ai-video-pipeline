## Kit "What if… (EN)": an English episode for an international audience

- This is an ENGLISH episode with a Western concept from the first line, not a translation: the
  script in `brief.md` is English, and so is everything on screen.
- In `Episode`, call `setLang('en')` from `kit/active/lang` before rendering (and `setLang('vi')`
  in the cleanup of a `useEffect`), so shared kit components that carry text (`tr(vi, en)`) draw
  their English side.
- Captions: `<Captions speaking={speakingAt} yAt={() => 886} size={CAPTION_SIZE} />` with
  `CAPTION_SIZE` (40) from `kit/active/theme`, not 50.
- The reference episode is for TECHNIQUE only (time helpers, shot structure, camera, audio, SFX,
  grade). Do not copy its Vietnamese settings, props, signs, names or customs.
- Anchors use English words, e.g. `at('S012', 'clap')`.

## Channel style (do not deviate)

- Soft pseudo-3D flat cartoon in SVG, rounded shapes, no harsh outlines.
- Depth: at least 3 layers, blurred foreground and background, sharp focal character, slow parallax
  (`Stage` layers `far`/`bg`/`mid`/`fg`). One warm glow per scene, soft shadows, light vignette.
- Western settings with real detail, never Vietnamese ones: use and extend `kit/active/sets`
  (`livingRoom`, `classroom`, `hallway` with lockers, `bedroom`, `cafeteria`, `suburbStreet`, `park`),
  `kit/active/sets-home` (`bedroomDay`, `kitchen` with a range, `dining` with plates, `frontPorch`),
  `kit/active/sets-school` (`schoolFront`, `busStop`) and `kit/active/props` (`SuburbHouse`,
  `PicketFence`, `Mailbox`, `Car`, `SchoolBus`, `Lockers`, `EggCarton`, `DailyCalendar`, `Teacup`,
  `Milkshake`, `IcedCoffee`…). Never import `kit/kits/whatif/sets*` or `kit/kits/whatif/props`:
  they hold Vietnamese sets (altar, alley, lanterns, motorbikes, grille windows, plastic chairs).
  A setting the kit lacks is drawn in your `src/episode/sets.tsx` in the same style.
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

## Text on screen

- Captions come from the narration (above). Big on-screen TEXT from the brief uses `BigText`.
- All on-screen text is English, exactly as in the brief; no Vietnamese word or letter anywhere
  (the gates reject a string with Vietnamese diacritics). Fonts only `FONT` / `HAND` from
  `kit/active/theme`. English text is longer: shrink or wrap it to stay inside `SAFE`.
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
