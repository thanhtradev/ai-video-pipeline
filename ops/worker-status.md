# Worker status command rollout (D-082)

Run by the user after this PR is merged. Conventions as in [README.md](README.md). **Free.**
No worker restart.

What it adds: `/workers` (or `/worker`) in the approval chat answers, for each worker (Mac mini,
HP), whether it is online, which clip it is running (id, version, title), the step, time in the
step, attempt, progress (e.g. `đang render 1800 khung hình`) and how many jobs wait for it.
Only approvers get an answer. Data: `telegram_workers()` (migration `20261114000100`).

## 1. Migrate (Mac mini)

Backup as in `phase-2b.md` §3, then migrate as in `preview-approval.md` §1; expect
`20261114000100`.

## 2. n8n

`ops/n8n/deploy-workflows.sh wf-06`. Optional: add to the BotFather command list
(`ops/vietnamese-messages.md`):

```
workers - worker nào đang chạy clip nào
```

## 3. Check

Send `/workers`: one block per worker, `🟢 … · online` with `▶ <id> v<n> · <title>` and the step
while it renders, `rảnh` when idle, `🔴 … · offline <time>` when it stopped sending heartbeats.

## Rollback

Re-import the previous `wf-06-telegram-callback.json`; `npx dbmate … rollback` drops
`telegram_workers()`.
