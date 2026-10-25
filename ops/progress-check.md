# Progress check rollout (P-017)

Run by the user after this PR is merged. Conventions as in [README.md](README.md). **Free.**

What it adds:
- migration `20261030000100_progress_check.sql`: `job.progress`, `job_report_progress()` for workers,
  `telegram_status()` for n8n;
- the worker reports what long steps are doing: TTS act n of N, timing (voice, whisper), agent turn
  and checks, render;
- **WF-06** answers `/status` (active videos) and `/status <first characters of a video id>` (that
  video's jobs, time per job, cost, the approval it waits for). Only approvers get an answer.

## 1. Code, backup, migrate (Mac mini)

```bash
cd ~/remote-dev/AIVIdeo/ai-video-pipeline && git checkout main && git pull && npm ci
```

Backup as in `phase-2b.md` §3, then:

```bash
read -rs PGPASSWORD && export PGPASSWORD                       # owner password
export DATABASE_URL="postgres://aivideo_owner@192.168.1.102:5432/aivideo?sslmode=disable"
npx dbmate --migrations-dir db/migrations --no-dump-schema up
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f ops/postgres/grants.sql
psql "$DATABASE_URL" -c "SELECT max(version) FROM schema_migrations;"   # 20261030000100
unset PGPASSWORD DATABASE_URL
```

Restart the worker **after** the migration (it calls `job_report_progress`):
`launchctl kickstart -k gui/$(id -u)/com.aivideo.worker`. A running job is stopped and retried
from its checkpoint; wait for the episode agent to finish first if one is running.

## 2. n8n

Open **WF-06**, deactivate, ⋯ → Import from File → `wf-06-telegram-callback.json`, save, activate.

**Check**: send `/status` in the approval chat. The bot answers with the active videos; then
`/status` followed by the first 8 characters of one of them shows its jobs.

## Rollback

Re-import the previous `wf-06-telegram-callback.json`; `npx dbmate … rollback` removes the
functions and columns (the worker then logs `progress report failed` warnings until reverted).
