# Member approval rollout (D-060)

Run by the user after this PR is merged. Conventions as in [README.md](README.md). **Free.**

What it adds:
- migration `20261104000100_member_approval.sql`: `approver.is_owner` (at most one owner),
  `added_by`/`added_at`, table `member_request`, `telegram_members()`, owner-only decisions in
  `telegram_decide()`;
- **WF-06**: `/join`, `/members`, `/revoke <user id>`, and the Approve / Reject buttons of a request.

| Telegram | Who | Effect |
|---|---|---|
| `/join` (in the approval chat) | anyone who is not an approver | posts a request with Approve / Reject (expires after 72 h) |
| Approve / Reject on a request | **the owner only**; anyone else gets "Only the owner can approve new members." | adds the user as an approver, or not |
| `/members` | approvers | lists approvers, the owner first, with their user ids |
| `/revoke <user id>` | the owner | that user is no longer an approver (the owner cannot be revoked) |

## 1. Migrate (Mac mini)

```bash
cd ~/remote-dev/AIVIdeo/ai-video-pipeline
git checkout main
git pull
```

Backup as in `phase-2b.md` §3, then migrate and re-run grants as in `preview-approval.md` §1;
expect `20261104000100`. No worker restart is needed.

## 2. Check the owner

The migration marks the owner only when there is exactly one active approver (the setup in
`README.md` §5). Check:

```bash
psql "$DATABASE_URL" -c "SELECT telegram_user_id, name, is_owner, active FROM approver;"
```

If no row has `is_owner = t`, set yourself (your Telegram user id; at most one owner is allowed):

```bash
psql "$DATABASE_URL" -c "UPDATE approver SET is_owner = true WHERE telegram_user_id = <your id>;"
```

## 3. Re-import WF-06

As before (with the approval chat id). Optional: add the new commands in BotFather (`/setcommands`
replaces the whole list):

```
status - progress of active videos, or /status <video id>
new - new episode: /new [minutes] <topic>
retry - retry a stopped video: /retry <video id>
rules - channel rules and pronunciation
rule - /rule add video|tts <text> or /rule del <number>
say - pronunciation: /say <term> = <how to say it>
unsay - remove a pronunciation: /unsay <term>
join - ask the owner to become an approver
members - list approvers
revoke - owner only: /revoke <user id>
```

**Check**: `/members` lists you with ★. From a second account in the group, `/join` → a request;
pressing Approve from that account is refused, from yours it adds them.

## Rollback

Re-import the previous `wf-06-telegram-callback.json`; `npx dbmate … rollback` removes the owner
flag and the requests (approvers added meanwhile stay).
