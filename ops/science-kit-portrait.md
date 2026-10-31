# Science kit in 9:16 rollout (D-080)

Run by the user after this PR is merged (and after `ops/chip-science-telegram-only.md`).
Conventions as in [README.md](README.md). **Free.**

What it changes: clips with **Kit: Khoa học** become vertical 1080×1920 videos (preview 720×1280);
"Nếu bạn…" clips stay 1920×1080. Clips already created keep their frame.

## 1. Migrate (Mac mini)

Backup as in `phase-2b.md` §3, then migrate as in `preview-approval.md` §1; expect
`20261113000100`. Check:

```sql
SELECT slug, aspect_ratio FROM catalog_option WHERE kind = 'kit';  -- whatif 16:9, science 9:16
```

## 2. Workers (right after the migration)

`~/aivideo/repo/ops/launchd/update-worker.sh` on the Mac mini and
`~/aivideo/repo/ops/systemd/update-worker.sh` on the HP worker. n8n: `ops/n8n/deploy-workflows.sh
wf-06` (the `/brief` prompt names each channel's frame).

## 3. Check

`/new 2 Chíp ơi, tại sao nước sôi?` → **Kit → Khoa học**, **Nhân vật → Chíp Khoa học** → **Tạo**.
`SELECT aspect_ratio FROM video WHERE id = '<id>'` is `9:16`; the storyboard pages show tall tiles,
the preview on Telegram is vertical, and the A3 final is 1080×1920.

Review the first vertical episode closely: the reference episode is landscape, so watch for shots
that are cut off at the sides; send notes as a reply to the storyboard.

## Rollback

Restart the workers on the previous code and `npx dbmate … rollback`; science clips created in
between keep `9:16` in `video.aspect_ratio` but would render 16:9 on the old code.
