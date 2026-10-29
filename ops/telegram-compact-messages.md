# Compact Telegram messages rollout (D-072)

Run by the user after this PR is merged. **Free.** No migration, no worker restart.

What changes: every bot message uses the short layout of
[docs/quality-and-approval.md](../docs/quality-and-approval.md) §4, times are Vietnam time
(UTC+7), the A1 preview and A3 description are collapsed, and the `kb:/ref:/meta:<token>` line is
gone (the token is in a hidden link at the start of the message).

## 1. n8n

`ops/n8n/deploy-workflows.sh` re-imports and publishes every workflow that sends messages: WF-01,
WF-05, WF-06, WF-08, WF-12, WF-13, WF-14, WF-15, WF-99 ([n8n/README.md](n8n/README.md)).

Requests already in the chat keep their old text; their buttons and replies still work (WF-06 still
reads the old `kb:/ref:/meta:` line). When one of them is decided it shrinks to its first 3 lines.

## 2. Check

- The next approval request: no `[AI Video]`, `⏰ Hạn` in Vietnam time, no link preview under it.
- Tap the collapsed preview on A1: it opens.
- Reply with a note to a new A1 / storyboard / A2 / A3 message: the bot answers "Đã nhận ghi chú…".
- Press a button: the message shrinks to 3 lines plus `✔️ … HH:MM DD/MM`.
- `/status <id>`: `Đang chờ: …, hạn HH:MM DD/MM`.

## Not in this change

Buttons on the media message itself and storyboard pages as one album: the n8n Telegram node (v1.2)
cannot edit a caption or send an album of uploaded files, and calling the Bot API from an HTTP
Request node would need the bot token in the workflow (never, `CLAUDE.md` §3). Each step is
therefore its media plus one button message.

## Rollback

Re-import the previous workflow exports (`git checkout <previous main> -- n8n/workflows`) with the
same script.
