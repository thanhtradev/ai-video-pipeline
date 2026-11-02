## Characters (the "Chíp Khoa học" cast)

- The rig is `Character` from `kit/active/rig`: glossy black round head, two white oval eyes, NO
  mouth; expressions only through eye shapes; blink and breathe. The science accessories
  (`antenna`, `visor`, `helmet`, `goggles`, `labCoat`, `headphones`) are rig accessories.
- The host is **CHÍP**, a small robot: saturated teal hoodie (`#4fb8c9`), antenna with a blinking
  light, translucent visor, grey gloves (`ChipScience` from `kit/active/cast`). Chíp is the only saturated
  character; the antenna light is an emotion cue (steady = calm, fast blink = excited).
- Chíp is a third-person host: the narration talks ABOUT Chíp and TO the viewer; Chíp never speaks
  on screen (no mouth), reactions are eyes, antenna and body.
- Side characters in `kit/active/cast` are muted versions of the other candidates (`TiMo`, `Moc`,
  `Neo`, `HatTieu`, `Sao`, `Cu`), wrapped in `<Side>` so the act grade applies to them.
- Chíp's beep is ONE shared sound for every episode: `chipBeep()` from
  `kit/characters/chip-science/sfx/chip-beep.mjs` (a soft two-note chime chosen by the owner),
  written by your `sfx/generate-sfx.mjs` as `sfx/chip_beep.wav` (`CHIP_BEEP_FILE`). Every "bíp" in
  a shot's sfx plays that file; several beeps play it again. Do not synthesize another beep (nor
  EP1's `beep`), change its pitch or speed, or let the voice say it (D-084).
