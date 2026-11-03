# Thời lượng button on the /new draft (D-091)

Run by the user after this PR is merged. Conventions as in [README.md](README.md). **Free.**
No worker restart.

What it adds: the `/new` confirmation gets a **Thời lượng → …** button next to Worker. Each press
changes the episode length: Tự động (~6 phút) → 3 → 4 → 5 → 6 → 8 → 10 → 12 phút → Tự động (a
`/new 7 …` length moves to 8). Tạo submits the length shown. With a **full brief** the narration is
copied verbatim from VOICE, so no length can be chosen: the draft shows
`Thời lượng: theo VOICE, ước tính ~X phút (N từ)` (3.2 words per second, holds not counted) and
the button only answers that the length follows VOICE. Data: `duration_selection()`,
`brief_voice_words()`, kind `duration` of `telegram_intake_cycle()` (migration `20261120000100`).

## 1. Migrate (Mac mini)

Backup as in `phase-2b.md` §3, then migrate as in `preview-approval.md` §1; expect
`20261120000100`.

## 2. n8n

`ops/n8n/deploy-workflows.sh wf-06`.

## 3. Check

- `/new Mèo nghĩ gì?` → `Thời lượng: Tự động (~6 phút)`; press **Thời lượng → 3 phút** twice →
  `Thời lượng: 4 phút`; Tạo → the clip's script aims for about 4 minutes.
- `/new <chủ đề>` with a full brief file → `Thời lượng: theo VOICE, ước tính ~… phút (… từ)`;
  pressing the button shows "Có full brief: thời lượng theo mục VOICE…" and changes nothing.

## Rollback

Re-import the previous `wf-06-telegram-callback.json` first (it has no Thời lượng button), then
`npx dbmate … rollback` restores `telegram_intake_cycle()` / `intake_selection()` and drops the two
new functions.
