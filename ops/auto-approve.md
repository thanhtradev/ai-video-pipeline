# Final video before Drive and `/auto` rollout (D-093)

Run by the user after this PR is merged. Conventions as in [README.md](README.md). **Free** in
itself; note that `/auto` approves paid steps (TTS after A1) without asking — the budget guard of
each step still applies. No worker restart.

What it adds:

- `final.mp4` now arrives on Telegram **with the A3 (metadata) request**, between the thumbnail and
  the buttons, so it is there before the Google Drive upload starts (it used to come with the
  "Video hoàn tất" message, after the upload). A metadata rewrite does not send it again.
- `/auto <id>` (or `/tudong <id>`): every remaining approval of that video — kịch bản, giọng đọc,
  storyboard, preview, metadata — is approved automatically in your name, QA warnings included; a QA
  FAIL still sends the normal buttons. A gate already waiting is approved at once. The **"Xóa bản
  trên Mac?"** question is never automatic. `/auto <id> off` turns it off. Approvers only.

Data: `video_version.auto_approve_by/at`, `telegram_auto()`, `approval_auto_decide()` (migration
`20261122000100`).

## 1. Migrate (Mac mini)

Backup as in `phase-2b.md` §3, then migrate and re-run grants as in `preview-approval.md` §1; expect
`20261122000100`.

## 2. n8n

```bash
ops/n8n/deploy-workflows.sh wf-05 wf-06 wf-12 wf-13 wf-14 wf-15
```

Then paste the BotFather command list of [telegram-commands.md](telegram-commands.md) (it adds
`auto`).

## 3. Check

1. Create a test clip with `/new`, note its id, send `/auto <id>`: the reply says `🤖 Đã bật tự
   duyệt …`. Each step then posts a `🤖 #<id> v1 · … tự duyệt (/auto)` line (script, voice,
   storyboard) or the preview without buttons; `/status <id>` shows it moving on.
2. When the final render is done: thumbnail → **final.mp4** → metadata (no buttons) arrive, and only
   later "✅ Video hoàn tất" with the Drive path and **Xóa bản trên Mac / Giữ lại**, which still
   waits for the owner.
3. A clip without `/auto`: A3 arrives as thumbnail → final.mp4 → message with Duyệt / Viết lại.
4. `/auto <id> off` on a running clip: the next step sends buttons again.

## Rollback

Re-import the previous workflows (`git checkout <previous tag> -- n8n/workflows` then the deploy
script), then `npx dbmate … rollback`: drops the two columns and `telegram_auto()`, restores the
previous functions. Approvals already made by `/auto` stay recorded (`approval`, `audit_log`).
