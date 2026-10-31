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
