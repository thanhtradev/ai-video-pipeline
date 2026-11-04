# Telegram bot commands

The full command list of the bot, as WF-06 parses it (`n8n/workflows/wf-06-telegram-callback.json`,
node "Parse callback"). This file is the source of truth for the menu; the unit tests fail when a
command WF-06 understands is missing here or has no `/help` entry.

## BotFather menu

The menu lists only the daily commands (D-097). Every command in the reference table below works
and appears in `/help`. In BotFather: `/setcommands` → choose the bot → paste the whole block (it
**replaces** the list):

```
new - tập mới: /new [số phút] <chủ đề>
status - tiến độ các video, hoặc /status <id video>
pending - gửi lại yêu cầu duyệt, liệt kê video đang dừng
ideas - ý tưởng video mới theo kit và nhân vật
auto - tự duyệt tới khi lưu Drive: /auto <id video> [off]
retry - chạy lại video bị dừng: /retry <id video>
help - danh sách lệnh và cách dùng
```

## Reference

`<id prefix>` is the first characters of a video id, or `last`: the newest video that has not
finished, of any approver (D-097). The reply always shows the id it resolved to.

| Command | Usage | Where | Who | Decision |
|---|---|---|---|---|
| `/help` | `/help` · `/help <command>` | any chat | approvers; anyone in the approval chat | D-097 |
| `/status` | `/status` · `/status <id prefix>` | any chat | approvers | P-017 |
| `/workers` (alias `/worker`) | `/workers` | any chat | approvers | D-082 |
| `/pending` (alias `/cho`) | `/pending` · `/pending <id prefix>`; the buttons come again in the approval chat; also lists stopped videos (`NEEDS_DECISION`, `BLOCKED_PROVIDER`) | any chat | approvers | D-090, D-097 |
| `/ideas` (alias `/ytuong`) | `/ideas [kit=<slug>] [nhanvat=<slug>]` | approval chat | approvers | D-083 |
| `/new` | `/new [minutes] <topic> [kit=<slug>] [nhanvat=<slug>] [worker=<id>] [auto=on]`, notes on the next lines; full brief as a `.md`/`.txt` file with the command as caption; the draft's Thời lượng button changes the length | approval chat | approvers | D-058, D-066, D-087, D-091, D-096 |
| `/brief` | `/brief` | approval chat | anyone in it | D-077 |
| `/retry` | `/retry <id prefix, ≥ 4 chars>` | any chat | approvers | D-056 |
| `/auto` (alias `/tudong`) | `/auto <id prefix>` turns on automatic approval of every remaining gate (A1, A1b, storyboard, A2, A3; QA WARN approved, FAIL stops; never the Mac cleanup); a gate already waiting is approved at once · `/auto <id prefix> off` | any chat | approvers | D-093 |
| `/move` (alias `/chuyen`) | `/move <id prefix> <worker id>` · `/move <id prefix> huy` cancels a waiting move | any chat | owner | D-087 |
| `/rules` | `/rules [video\|tts\|say]` · `/rules file <scope>` · file captioned `/rules set <scope>` | any chat | approvers | D-059 |
| `/rule` | `/rule add <video\|tts> <text>` · `/rule del <number>` | any chat | approvers | D-059 |
| `/say`, `/unsay` | `/say <term> = <spoken>` · `/unsay <term>` | any chat | approvers | D-059 |
| `/join` | `/join` | approval chat | anyone | D-060 |
| `/members` | `/members` | any chat | approvers | D-060 |
| `/revoke` | `/revoke <user id>` | any chat | owner | D-060 |

Every command also works with the bot's name appended (`/status@<bot>`). A known command with bad
arguments gets its usage, and an unknown one gets a pointer to `/help`, unless it names a bot
(`/x@other_bot`), which is ignored. Buttons and replies with notes to approval messages are not
commands; see `docs/quality-and-approval.md`.

When a PR adds a command: add it to the table above and to `USAGE` in WF-06's "Build help"; add it
to the block only if it is used daily, otherwise to `HIDDEN` in the guard test. If the block
changed, the user pastes it again in BotFather.
