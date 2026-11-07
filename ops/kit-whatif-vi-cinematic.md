# Cinematic kit "Nếu bạn… (Điện ảnh)" (D-116)

Run by the user after the PR is merged. Conventions as in [README.md](README.md). The migration is
free; a test episode makes **paid** TTS calls (cost guard as usual).

What it adds: a kit `whatif-vi-cinematic` (16:9, Vietnamese, default cast, shared Vietnamese voice).
It is the `whatif` channel filmed more like a movie: all 23 sets with fuller backgrounds, directional
light, haze and dust; a blurred background in close-ups, with soft round lights; character light,
long shadows and floor reflections; moods (`golden`, `night`, `overcast`, `rain`); over-the-shoulder
shots, focus slides, low and high angles, and object close-ups. `whatif` itself does not change. No
new sound: rain and wind stay silent (D-069).

## 1. Migrate and deploy WF-06 together (Mac mini)

The Kit picker is a fixed grid (D-112), and it refuses to open while the number of kits and the grid
differ, with "Danh sách kit (…) không khớp bố cục nút". So do these two one right after the other.

Backup as in `phase-2b.md` §3, then migrate as in `preview-approval.md` §1; expect
`20261202000100`. Then:

```bash
ops/n8n/deploy-workflows.sh wf-06
```

## 2. Workers

Restart every worker on the new `main` (`ops/launchd/update-worker.sh`, Linux: `linux-worker.md`):
the catalog, kit files and prompts ship with the code.

## 3. Check

- Review from the dev checkout, before the first paid episode:

  ```bash
  cd remotion
  npx remotion render src/channels.ts WhatifCine-reel out/cinematic-reel.mp4
  npx remotion still src/channels.ts WhatifCine-kitchen-after out/kitchen.png
  ```

  `WhatifCine-<set>-before` and `-after` exist for every set. Levels live in
  `remotion/src/kits/whatif-vi-cinematic/` (`sets*.tsx`, `look.tsx`).
- `/new kit=whatif-vi-cinematic worker=<a Mac> 3 Nếu một ngày thời gian dừng lại?` → the draft shows
  `Kit: Nếu bạn… (Điện ảnh)` and `Nhân vật: Chíp (BẠN)`. **Kit ▾** lists five kits, in rows of two.
- A1: the shots name shot types and moods. The storyboard and final show the cinematic sets. All gates
  pass, including the text QA.

## 4. Render time on each worker [UNKNOWN]

The look is heavier by design (the owner chose quality over speed). Measured on the dev Mac only:

| Renderer | Frames | Time |
|---|---|---|
| GPU (ANGLE), the sample reel | 1,062 | 45 s |
| CPU (`swangle`), close-up shots | 60 | 208 s |

At that CPU rate a whole episode would pass `RENDER_TIMEOUT_MS` (90 min), but the HP worker has not
been measured with this kit. Until it has, pin this kit to a Mac with `worker=`. To measure, render a
short episode pinned to the HP and read the render step's time in `/v <id>`. If it fails on the
timeout, keep the kit on the Macs or raise the limit; do not lower the look.

## Rollback

Re-import the previous `wf-06-telegram-callback.json`, then `npx dbmate … rollback` once
(`20261202000100` refuses while a video or draft uses the kit: switch or cancel those briefs first,
`ops/cancel-videos.md`). Restart workers on the previous `main`.
