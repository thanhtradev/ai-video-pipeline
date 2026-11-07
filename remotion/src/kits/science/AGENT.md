## Kit "Khoa học"

- Same drawing language as the "Nếu bạn…" kit above. `kit/active/theme` carries this kit's cooler
  palette (`C.wall`, `C.floor`, `C.blueGray`, `C.beige`, `C.night`); use it for new sets and props.
  Sets reused from `kit/active/sets*` keep their own colours.
- Science objects (boards, diagrams, instruments) are drawn in code with the same rounded shapes; a
  diagram on screen is a set layer, never a caption.

## Vertical frame (9:16, 1080×1920)

- The episode is VERTICAL for phones. `W`, `H`, `SAFE`, `PX` from `kit/active/theme` are the
  portrait values; `Stage`, `Captions`, `BigText`, `Pow` and `PortraitBox` already follow the frame.
- The world coordinates are the same as the reference episode (sets around x≈500, floor y≈1500),
  but the frame is narrow: the wide shot shows about x 0–1080, so place at most two characters
  side by side and stack a diagram ABOVE the host (y 250–800) rather than beside it.
- The reference episode is landscape (16:9): copy its structure (time helpers, shots, audio, SFX,
  grade), not its camera framing or its screen positions; re-frame every shot for the tall frame.
- Captions sit at y≈1380; big TEXT in the upper third. Keep all sharp text inside `SAFE`
  (6 % side margins, nothing below y 1536: the app's buttons and description cover the bottom).

## Cinematic look in the tall frame

The sets, shots and object close-ups of the base kit (above) work in 9:16 too. On a phone:

- **Close-ups carry the most weight.** A face close-up (`closeUpCam`) fills the screen; use it for
  every key fact and every reaction. The background melts and soft round lights appear by themselves.
- **Object close-ups for the experiment:** `BeakerInsert` (bubbling liquid, `liquid` colour), and the
  clock, tea cup and incense ones, for 1–2 s at the moment the narration names the object. They are
  drawn for both frames. Draw the episode's own experiment object the same detailed way.
- **Diagrams must stay readable.** Depth blur grows with the zoom, so a diagram drawn on a set layer
  blurs in a close-up: draw a diagram that must be read on the `mid` layer (beside `actors`), or give
  that shot `blurFar={0}` and `blurBg={0}`. Its text stays inside `SAFE`.
- **Over-the-shoulder:** put the near shoulder low at one side, about 200 to the side of the person
  looked at, so their face stays in the upper half above the captions.
- **Moods:** science settings are cool and clear: pass `{ mood: 'clear' }` to every set by default
  (`classroom(f, { mood: 'clear' })`); use `night`, `overcast` or `rain` only when the story is set
  there, and never `golden`, which belongs to the "Nếu bạn…" channels.
