# /v card and /report rollout (D-099)

Run by the user after this PR is merged. Conventions as in [README.md](README.md). **Free.**
No worker restart.

What it adds:
- `/v <id>` (alias `/video`): the text of `/status <id>` with buttons Chạy lại, Tự duyệt, Gửi lại
  duyệt and Hủy. The buttons run the same checks as the commands, and a card of an older version
  does nothing. Tự duyệt approves a waiting gate at once, as `/auto <id>` does.
- `/report [today|7d|30d]`: video outcomes, actual cost, cost per finished minute, slowest steps
  and approval wait. Costs are what `cost_entry` recorded, which does not include Claude usage.

Data: migration `20261125000300`.

## 1. Migrate (Mac mini)

Backup as in `phase-2b.md` §3, then migrate as in `preview-approval.md` §1; expect
`20261125000300`. Do this **before** step 2: the buttons need the new `video_ref()`.

## 2. n8n

`ops/n8n/deploy-workflows.sh wf-06`. Then paste the BotFather block of
[telegram-commands.md](telegram-commands.md) (it adds `v`).

## 3. Check

- `/v last` with a throwaway video running shows the card.
- **Gửi lại duyệt** answers like `/pending <id>`. **Chạy lại** on a running video answers that it
  is not stopped. **Hủy** opens the `/cancel` preview. **Tự duyệt** turns on `/auto`; undo it with
  `/auto <id> off`.
- `/report 7d` agrees with `psql "$DATABASE_URL" -f ops/postgres/video-timing.sql` on the slowest
  steps. That script shows medians per step over the same 7 days.

## Rollback

Re-import the previous `wf-06-telegram-callback.json` first, then `npx dbmate … rollback`, then
paste the previous BotFather block.
