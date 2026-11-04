# /help, usage replies, `last`, shorter menu rollout (D-097)

Run by the user after this PR is merged. Conventions as in [README.md](README.md). **Free.**
No worker restart.

What it adds:
- `/help` and `/help <command>`. Bad arguments get the usage instead of silence, and an unknown
  command gets a pointer to `/help`.
- `last` instead of a video id in `/status`, `/pending`, `/retry`, `/auto` and `/move`: the newest
  video that has not finished, of any approver. The reply shows the id it resolved to.
- `/pending` also lists stopped videos (`NEEDS_DECISION`, `BLOCKED_PROVIDER`).
- A shorter BotFather menu. Commands left out of it still work.

Data: migration `20261125000100`.

## 1. Migrate (Mac mini)

Backup as in `phase-2b.md` §3, then migrate as in `preview-approval.md` §1; expect
`20261125000100`. Migrate **before** step 2: the new WF-06 queries call `video_ref()`.

## 2. n8n

`ops/n8n/deploy-workflows.sh wf-06`. Then paste the BotFather block of
[telegram-commands.md](telegram-commands.md) (it replaces the list).

## 3. Check

- `/help` lists the commands by group; `/help new` shows the `/new` usage.
- `/retry` with no id, and the same from the menu in a group, shows the usage.
- `/nope` answers `Không có lệnh /nope. Xem /help.`; `/nope@other_bot` gets no answer.
- With a video running: `/status last` shows that video.
- With a video at `NEEDS_DECISION`: `/pending` lists it under `⛔` with `/retry <id>`.

## Rollback

Re-import the previous `wf-06-telegram-callback.json` first, then `npx dbmate … rollback`, then
paste the previous BotFather block.
