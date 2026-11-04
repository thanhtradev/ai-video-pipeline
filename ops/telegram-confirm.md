# /cancel and /auto all rollout (D-098)

Run by the user after this PR is merged. Conventions as in [README.md](README.md). **Free.**
No worker restart.

What it adds:
- `/cancel <id> [id…]` (alias `/huy`), owner only, at most 20 ids: a preview, then a Confirm button.
  It does what `ops/postgres/cancel-videos.sql` does: nothing is deleted, a running job finishes
  and its result is dropped, credits already spent are not refunded.
- `/auto all`, any approver: a preview of the active videos without `/auto`, then a Confirm button.
  A gate already waiting is approved at once. Videos created later stay manual.
- `/auto all off`: turns `/auto` off for every active video at once, with no button.

The button works once, for the sender only, for 10 minutes.

Data: migration `20261125000200`, table `command_confirm`.

## 1. Migrate (Mac mini)

Backup as in `phase-2b.md` §3, then migrate as in `preview-approval.md` §1; expect
`20261125000200`. Re-run `ops/postgres/grants.sql`: n8n needs the new table. Do this **before**
step 2, and before using the updated `cancel-videos.sql`, which calls `video_cancel()`.

## 2. n8n

`ops/n8n/deploy-workflows.sh wf-06`. Then paste the BotFather block of
[telegram-commands.md](telegram-commands.md) (it adds `cancel`).

## 3. Check

Make a throwaway video with `/new`, then:

- `/cancel last` shows it with Xác nhận and Bỏ qua. **Bỏ qua**: it keeps running.
- `/cancel last` again, and have another approver press Xác nhận: they are refused and the buttons
  stay. Press it yourself: the video is cancelled and the buttons go. `/status <id>` confirms.
- As a non-owner approver, `/cancel last` answers `Chỉ owner mới hủy được video.`
- With a throwaway video running, `/auto all` lists it. Press Xác nhận, then `/auto all off`.

## Rollback

Re-import the previous `wf-06-telegram-callback.json` and restore the previous
`ops/postgres/cancel-videos.sql` first, then `npx dbmate … rollback`, then paste the previous
BotFather block.
