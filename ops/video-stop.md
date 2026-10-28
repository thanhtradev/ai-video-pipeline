# Stopping a video from Telegram (D-067)

Run by the user, in order (CLAUDE.md §3). For a **Tạo** or an approve button pressed by mistake:
`/stop <first characters of the video id>` ends that video; `/stop` alone works when only one
video is active. Immediate, no confirmation, no undo; nothing is deleted.

## 1. Database

As in `preview-approval.md` §1; expect `20261107000100` (`telegram_stop()`). Then re-run
`ops/postgres/grants.sql` (n8n needs EXECUTE on the new function).

Check:

```bash
psql "$DATABASE_URL" -c "SELECT * FROM telegram_stop(0, 'ffffffff')"
```

prints `NOT_APPROVER` (user id 0 is nobody) and changes nothing.

## 2. Re-import WF-06

As before (set `APPROVAL_CHAT` in **Parse callback** again, as in `telegram-intake.md`), activate.
The worker needs no change: it already aborts a job whose heartbeat answers `CANCELLED`.

Optional: add the command in BotFather (`/setcommands` replaces the whole list):

```
status - progress of active videos, or /status <video id>
new - new episode: /new [minutes] <topic>
stop - cancel a video: /stop <video id>, or /stop when only one is active
retry - retry a stopped video: /retry <video id>
rules - channel rules and pronunciation
rule - /rule add video|tts <text> or /rule del <number>
say - pronunciation: /say <term> = <how to say it>
unsay - remove a pronunciation: /unsay <term>
join - ask the owner to become an approver
members - list approvers
revoke - owner only: /revoke <user id>
```

## 3. Check on Telegram

1. `/new Bíp ơi, tại sao nước sôi?` → **Tạo**. The reply gives the id, e.g. `Đã tạo video 679cd22f`.
2. `/status 679cd22f` ends with `Dừng video: /stop 679cd22f`.
3. `/stop 679cd22f` → `Đã dừng video 679cd22f: hủy N job, không chạy tiếp…`. Within one heartbeat
   (`HEARTBEAT_SECONDS`) `worker.log` shows the running job `aborted` with reason `CANCELLED`, and
   `/status 679cd22f` reads `Trạng thái: CANCELLED`.
4. `/stop 679cd22f` again → `đã kết thúc từ trước`. An old approve button of that video answers
   `Đã có phiên bản mới hơn; yêu cầu này không còn hiệu lực.`
5. With no active video, `/stop` → `Không có video nào đang chạy để dừng.`

## What it does not do

- It does not refund provider credits already spent (TTS clips, agent turns).
- It does not delete the workspace under `WORK_ROOT`; keep or remove it by hand.
- It cannot be undone: `/retry` only resumes `NEEDS_DECISION`, not `CANCELLED`. Start over with `/new`.
