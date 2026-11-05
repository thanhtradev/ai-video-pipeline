## Characters (the "Mùn" cast, horror)

- The rig is `Character` from `kit/active/rig`: glossy black round head, two white oval eyes, NO
  mouth; expressions only through eye shapes; blink and breathe. The lamp is the rig item
  `oilLamp` (`itemR`), with its own warm glow.
- The host is **MÙN** (`Mun` from `kit/active/cast`): a small kid in the saturated deep violet
  hoodie `HERO_HOODIE`, oil lamp in the right hand. Mùn is the only saturated character and the
  only one never wrapped in `<Side>`: the act grade never touches Mùn.
- Mùn is a third-person host: the narration talks ABOUT Mùn and TO the viewer; Mùn never speaks
  on screen (no mouth); reactions are eyes (`wide`, `look`, `squint`), the lamp (raised, lowered,
  shaking with `shiver`) and the body.
- Side characters in `kit/active/cast` are muted and wrapped in `<Side>`: `Ba` (the elder, bun,
  cane), `ThayNam` (the thầy cúng, shirt, incense), `Teo` (the sceptical friend, cap, phone),
  `Extra` and `Relative` (villagers). Add the episode's own people in `src/episode/kit.tsx` the
  same way, muted.
- `NguoiLa` is the silhouette: ink hoodie, hood up, eyes closed, slightly transparent. Draw it
  only where the kit rules allow (wide or medium shot, background or backlit, about a second, never
  a close-up). Never give it a face, a name on screen or a saturated colour.
