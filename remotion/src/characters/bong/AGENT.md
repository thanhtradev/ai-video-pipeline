## Characters (the "Bóng" cast, silhouettes)

- There is NO rig in this cast: never import `Character` from `kit/active/rig`, never draw a
  hoodie, a glossy head or a face. Every person is `Figure` from `kit/active/cast`: a black
  shadow-puppet body (`INK`) with human proportions, a rim light on the lit side (`rim`,
  `rimSide`), and at most a pair of eyes (`eyes`: `none` · `slits` · `hollow` · `glow`). Props:
  `x`, `y` (feet), `size`, `facing`, `pose` (`stand` · `still` · `walk` · `sit` · `crouch` ·
  `reach` · `turnBack`), `t` (breath, sway, walk cycle), `jitter`, `tilt`, `stretch`, `longArms`,
  `rough`, `prop` (`lamp` · `phone` · `none`), `opacity`.
- **TÔI** (`Toi`): the narrator, tall (`stretch` 1.18), pale round eyes, lamp in hand. TÔI is the
  only figure with the strong rim light (`HERO_RIM`) and is never wrapped in `<Side>`: the act
  grade never touches TÔI. TÔI never speaks on screen; the narration is TÔI's voice.
- **NÓ** (`No`): arms past the knees, head tilted, a faint shiver; `far` shows only two glowing
  eyes. NÓ appears at most three times in an episode, each time for about a second, in a wide or
  medium shot, in the background or at the edge of the lamp light, never in a close-up, never
  walking towards the camera. Between appearances NÓ is absent, not hidden somewhere clever.
- Other people are `Nguoi k={n}` (smaller, dimmer, eye slits) and `DamDong` (a faceless row).
  Add the episode's own people in `src/episode/kit.tsx` the same way, with `Figure`.
- Light rule for every figure: the rim light is on the side of the scene's light source
  (`rimSide` 1 when the lamp is to the right of the figure). A figure with the lamp has `rim`
  on the lamp side. In a black-out beat nobody is drawn.
