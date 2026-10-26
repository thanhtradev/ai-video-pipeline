# Telegram intake rollout, and moving approvals to a group (D-058)

Run by the user after this PR (and PR #14, which it builds on) is merged. Conventions as in
[README.md](README.md). **Free.**

What it adds:
- migration `20261102000100_telegram_intake.sql`: table `intake_draft`, `telegram_intake_draft()`,
  intake buttons in `telegram_decide()`;
- **WF-06**: `/new [minutes] <topic>` with notes on the next lines; for a full brief, send a `.md` or
  `.txt` file with that command as its caption. The bot answers with a summary and **Create** /
  **Cancel**.

Examples:

```
/new 8 Nếu bạn nghe được suy nghĩ của mèo?
Giọng kể vui, kết cảm động.
```

`/new Nếu bạn dừng được thời gian 30 giây?` (no length: Claude aims for about 6 minutes)

## 1. Migrate (Mac mini)

As in `preview-approval.md` §1, then expect `SELECT max(version) FROM schema_migrations;` →
`20261102000100`. Re-running `ops/postgres/grants.sql` gives n8n access to `intake_draft`. No worker
restart is needed.

## 2. Re-import WF-06

WF-06 now has the placeholder `REPLACE_WITH_APPROVAL_CHAT_ID` in **Parse callback**: `/new` works
only in that chat. Replace it on import (the `sed` loop of the CLI import does), then activate.

**Check**: `/new Mèo nghĩ gì?` in the approval chat → a summary with Create / Cancel; Cancel → "Cancelled;
nothing was created."

## 3. Optional: approvals in a group

1. Create a Telegram group, add the bot and the approvers.
2. Send `/new x` in the group. Until the group is configured the bot answers
   `This chat (-100…) is not the approval chat`, which gives the group's chat id. If Telegram later
   upgrades the group to a supergroup, the id changes; repeat this step.
3. Re-import every workflow that sends messages (WF-01, 05, 06, 08, 12, 13, 99) with that id as
   `REPLACE_WITH_APPROVAL_CHAT_ID`.
4. Every approver needs a row in `approver` (their own Telegram user id). Other members can read
   the group but every button, note and command from them is refused.
5. The bot's privacy mode (BotFather `/setprivacy`) can stay **enabled**: the bot still receives
   commands and replies to its own messages, which is all the pipeline uses. Whether a file whose
   caption is `/new …` reaches the bot with privacy mode on is **[UNKNOWN]**: try it, and if the bot
   does not answer, disable privacy mode (the bot then receives every group message; WF-06 ignores
   them, but each one is an n8n execution).

## Rollback

Re-import the previous `wf-06-telegram-callback.json`; `npx dbmate … rollback` drops the table and
functions (drafts are lost, submitted videos stay).
