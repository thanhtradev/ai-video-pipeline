# Pending approvals command rollout (D-090)

Run by the user after this PR is merged. Conventions as in [README.md](README.md). **Free.**
No worker restart.

What it adds: `/pending` (or `/cho`) lists every approval request still waiting (clip id, version,
title, type, deadline) and, within about 30 seconds, the bot sends each of them again in the
approval chat as a `⏰ Nhắc:` message with the same buttons. `/pending <id prefix>` limits it to
one clip. Only approvers get an answer. The old message keeps working too. Cleanup requests ("Xóa
bản trên Mac?") are listed but not sent again; their buttons stay in the DONE message. Data:
`telegram_pending()` (migration `20261119000100`).

## 1. Migrate (Mac mini)

Backup as in `phase-2b.md` §3, then migrate as in `preview-approval.md` §1; expect
`20261119000100`.

## 2. n8n

`ops/n8n/deploy-workflows.sh wf-06`. Then paste the BotFather command list of
[telegram-commands.md](telegram-commands.md) (it adds `pending`).

## 3. Check

With a clip waiting for an approval, send other messages until it scrolls away, then send
`/pending`: the reply lists it, and its `⏰ Nhắc:` message with buttons follows within ~30 s.
Press a button on the reminder: it is accepted and its buttons are removed. With nothing waiting:
`Không có yêu cầu nào đang chờ duyệt.`

## Rollback

Re-import the previous `wf-06-telegram-callback.json`; `npx dbmate … rollback` drops
`telegram_pending()`.
