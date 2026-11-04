# One-tap commands, grouped /status, /worker rollout (D-102)

Run by the user after this PR is merged. Conventions as in [README.md](README.md). **Free.**
No worker restart.

What it adds:
- Suggested commands can be tapped: `/v_679cd22f`, `/retry_679cd22f`, `/worker_hp_400_g7`. A tap runs
  the command at once, with the same checks as typing it. The list is in
  [telegram-commands.md](telegram-commands.md). The typed forms keep working.
- `/status` groups videos by what they need, stopped ones first, and names each video's worker.
- `/worker <id>`: live state, the videos pinned to that worker and its last 24 hours.
- WF-08 alerts link the video, and a stopped video's alert links `/retry_<id>`.

Data: migration `20261126000100`. `/deploy` does not run migrations.

## 1. Migrate (Mac mini)

Backup as in `phase-2b.md` §3, then migrate as in `preview-approval.md` §1; expect
`20261126000100`. **Right after it**, re-run `ops/postgres/grants.sql`: `telegram_status` is
recreated, and `/status` and `/v` fail for n8n until it has its grant back. Do this **before** step 2:
the new WF-06 needs the new columns, while the old WF-06 works with them.

## 2. n8n

`ops/n8n/deploy-workflows.sh wf-06 wf-08`. Then paste the BotFather block of
[telegram-commands.md](telegram-commands.md) (it adds `workers`).

## 3. Check (real phone, in the approval group)

Tappability is Telegram client behaviour, and the unit tests can't exercise it.

- `/status` shows the groups and a worker under each video. The whole of `/v_<id>` is highlighted, and
  a tap opens the card.
- The card's `/worker_<id>` link opens that worker's detail. Compare the numbers with
  `/workers` and `ops/postgres/video-timing.sql`.
- With a throwaway running video, tap `/retry_<id>` if it is shown, or type `/retry_<id>`: expect
  "không ở trạng thái chờ quyết định" and nothing re-run.
- `/auto_<id>` answers `Không có lệnh`, and turns nothing on.
- No repeat watchdog alert for videos that were already blocked or stopped.

When these pass, change the tappability note in D-102 (`docs/decisions.md`) from `[UNKNOWN]` to
`[CONFIRMED]`, with the date.

## Rollback

Re-import the previous `wf-06-telegram-callback.json` and `wf-08-watchdog.json` first, then
`npx dbmate … rollback`, re-run `ops/postgres/grants.sql`, and paste the previous BotFather block.
