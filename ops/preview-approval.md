# Preview approval rollout (D-057)

Run by the user after this PR is merged. Conventions as in [README.md](README.md). **Free.**

What it adds:
- migration `20261101000100_preview_approval.sql`: `preview_approvals_due()` for WF-13, A2 decisions
  in `telegram_decide()`;
- worker steps `qa_preview` (q:light) and `render_final` (q:render, 1080p), and
  `GET /media/<video>/<version>/<qa job>/preview.mp4?t=<token>` for WF-13;
- **WF-13** (new): QA job for each new episode preview, then the preview as a Telegram video with the
  QA warnings, cost and Approve / Reject; notes by reply;
- **WF-06**: A2 buttons (`a2:`) and replies.

An episode already waiting in `RENDERING_PREVIEW` (e.g. `679cd22f`) is picked up by WF-13 once
everything below is done: QA runs, then the preview arrives on Telegram.

## 1. Code, backup, migrate (Mac mini)

```bash
cd ~/remote-dev/AIVIdeo/ai-video-pipeline
git checkout main
git pull
npm ci
```

Backup as in `phase-2b.md` §3, then:

```bash
read -rs PGPASSWORD && export PGPASSWORD                       # owner password
export DATABASE_URL="postgres://aivideo_owner@192.168.1.102:5432/aivideo?sslmode=disable"
npx dbmate --migrations-dir db/migrations --no-dump-schema up
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f ops/postgres/grants.sql
psql "$DATABASE_URL" -c "SELECT max(version) FROM schema_migrations;"   # 20261101000100
unset PGPASSWORD DATABASE_URL
```

Restart the worker so it knows `qa_preview` and `render_final`:
`launchctl kickstart -k gui/$(id -u)/com.aivideo.worker` (wait for a running episode agent first).

## 2. n8n

- **WF-06**: deactivate, ⋯ → Import from File → `wf-06-telegram-callback.json`, save, activate.
- **WF-13** (new): import `wf-13-preview-approval.json`; set the approval chat id
  (`REPLACE_WITH_APPROVAL_CHAT_ID`, Send video and Send buttons) and, in **Build video**,
  `REPLACE_WITH_WORKER_URL` with the worker API base URL (same as WF-12); activate.

Import WF-06 before activating WF-13, so the A2 buttons are understood.

**Check**: within a minute `/status 679cd22f` shows `qa_preview`, then the status
`AWAITING_PREVIEW_APPROVAL`, and the preview arrives on Telegram with the A2 message.

## Rollback

Deactivate WF-13 and re-import the previous `wf-06-telegram-callback.json`;
`npx dbmate … rollback` removes the functions (a version in `QA_RUNNING` or
`AWAITING_PREVIEW_APPROVAL` stays there until decided by hand).
