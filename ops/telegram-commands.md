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
v - chi tiết video kèm nút: /v <id video>
workers - các worker, hoặc /worker <id worker> để xem chi tiết
pending - gửi lại yêu cầu duyệt, liệt kê video đang dừng
ideas - ý tưởng video mới theo kit và nhân vật
auto - tự duyệt tới khi lưu Drive: /auto <id video>|all [off]
retry - chạy lại video bị dừng: /retry <id video>
cancel - hủy video: /cancel <id video> [id...]
help - danh sách lệnh và cách dùng
```

## Reference

`<id prefix>` is the first characters of a video id, or `last`: the newest video that has not
finished, of any approver (D-097). The reply always shows the id it resolved to.

| Command | Usage | Where | Who | Decision |
|---|---|---|---|---|
| `/help` | `/help` · `/help <command>` | any chat | approvers; anyone in the approval chat | D-097 |
| `/status` | `/status` · `/status <id prefix>` | any chat | approvers | P-017 |
| `/v` (alias `/video`) | `/v <id prefix>`: the text of `/status <id>` with buttons Chạy lại, Tự duyệt, Gửi lại duyệt, Hủy, bound to that version. The buttons run the same checks as the commands | any chat | approvers | D-099 |
| `/report` | `/report [today\|7d\|30d]`, today from midnight UTC+7: video outcomes, actual cost, cost per finished minute, slowest steps, approval wait | any chat | approvers | D-099 |
| `/workers` (alias `/worker`) | `/workers`: every worker · `/worker <worker id>`: exact id: live state, videos pinned to it, last 24 hours | any chat | approvers | D-082, D-102 |
| `/pending` (alias `/cho`) | `/pending` · `/pending <id prefix>`; the buttons come again in the approval chat; also lists stopped videos (`NEEDS_DECISION`, `BLOCKED_PROVIDER`) | any chat | approvers | D-090, D-097 |
| `/ideas` (alias `/ytuong`) | `/ideas [kit=<slug>] [nhanvat=<slug>]` | approval chat | approvers | D-083 |
| `/new` | `/new [minutes] <topic> [kit=<slug>] [nhanvat=<slug>] [worker=<id>] [auto=on]`, notes on the next lines; full brief as a `.md`/`.txt` file with the command as caption; the draft's Thời lượng button changes the length | approval chat | approvers | D-058, D-066, D-087, D-091, D-096 |
| `/brief` | `/brief` | approval chat | anyone in it | D-077 |
| `/retry` | `/retry <id prefix, ≥ 4 chars>` | any chat | approvers | D-056 |
| `/auto` (alias `/tudong`) | `/auto <id prefix>` turns on automatic approval of every remaining gate (A1, A1b, storyboard, A2, A3; QA WARN approved, FAIL stops; never the Mac cleanup); a gate already waiting is approved at once · `/auto <id prefix> off` · `/auto all`: every active video, after a preview and a Confirm button for the sender; videos created later stay manual · `/auto all off`: at once | any chat | approvers | D-093, D-098 |
| `/cancel` (alias `/huy`) | `/cancel <id prefix> [id prefix…]`, at most 20: a preview, then a Confirm button for the sender, 10 minutes. Nothing is deleted | any chat | owner | D-094, D-098 |
| `/move` (alias `/chuyen`) | `/move <id prefix> <worker id>` · `/move <id prefix> huy` cancels a waiting move | any chat | owner | D-087 |
| `/deploy` | `/deploy`, no arguments: updates the workers and n8n to `origin/main` after a preflight and a Confirm button; refused if a migration is missing; `/deploy` again shows the one in progress | any chat; messages go to the approval chat | owner | D-100 |
| `/library` (alias `/thuvien`) | `/library`: each kit's count and 5 newest archived videos with Drive links · `/library kit=<slug>` · `/library nhanvat=<slug>`: the 20 newest | any chat | approvers | D-104 |
| `/web` | `/web`: a link to the web console that works once, for 5 minutes (`ops/web-console.md`) | private chat with the bot; in a group it refuses and sends no link | approvers | D-103 |
| `/rules` | `/rules [video\|tts\|say]` · `/rules file <scope>` · file captioned `/rules set <scope>` | any chat | approvers | D-059 |
| `/rule` | `/rule add <video\|tts> <text>` · `/rule del <number>` | any chat | approvers | D-059 |
| `/say`, `/unsay` | `/say <term> = <spoken>` · `/unsay <term>` | any chat | approvers | D-059 |
| `/join` | `/join` | approval chat | anyone | D-060 |
| `/members` | `/members` | any chat | approvers | D-060 |
| `/revoke` | `/revoke <user id>` | any chat | owner | D-060 |

## One-tap forms (D-102)

Telegram makes a command tappable only up to the first character that isn't a letter, digit or `_`,
and at most 32 characters. So the bot suggests these forms, which run the typed command, with the
same checks, at once:

| Tap form | Runs |
|---|---|
| `/v_<id>` | `/v <id>` |
| `/status_<id>` | `/status <id>` |
| `/retry_<id>` | `/retry <id>` |
| `/pending_<id>` | `/pending <id>` |
| `/auto_<id>_off` | `/auto <id> off` |
| `/move_<id>_huy` | `/move <id> huy` |
| `/worker_hp_400_g7` | `/worker hp-400-g7` |

`/auto <id>` (on) has no tap form because it approves a waiting gate at once. `/cancel` has none
because the bot never suggests it and the `/v` card has Hủy. `/move <id> <worker>` needs a choice of
worker. A tap on an old message acts on the video's current state, as typing does; only `/v` buttons
are bound to a version.

Every command also works with the bot's name appended (`/status@<bot>`). A known command with bad
arguments gets its usage, and an unknown one gets a pointer to `/help`, unless it names a bot
(`/x@other_bot`), which is ignored. Buttons and replies with notes to approval messages are not
commands; see `docs/quality-and-approval.md`.

When a PR adds a command: add it to the table above and to `USAGE` in WF-06's "Build help"; add it
to the block only if it is used daily, otherwise to `HIDDEN` in the guard test. If the block
changed, the user pastes it again in BotFather.
