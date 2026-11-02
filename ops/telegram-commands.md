# Telegram bot commands

The full command list of the bot, as WF-06 parses it (`n8n/workflows/wf-06-telegram-callback.json`,
node "Parse callback"). This file is the source of truth for the menu; the unit tests fail when a
command WF-06 understands is missing here.

## BotFather menu

In BotFather: `/setcommands` → choose the bot → paste the whole block (it **replaces** the list):

```
status - tiến độ các video, hoặc /status <id video>
workers - worker nào đang chạy clip nào
ideas - ý tưởng video mới theo kit và nhân vật
new - tập mới: /new [số phút] <chủ đề>
brief - mẫu prompt để LLM khác viết full brief
retry - chạy lại video bị dừng: /retry <id video>
move - chủ sở hữu: chuyển video sang worker khác: /move <id video> <worker>
rules - quy tắc kênh và phát âm
rule - /rule add video|tts <nội dung> hoặc /rule del <số>
say - cách đọc: /say <từ> = <cách đọc>
unsay - bỏ cách đọc: /unsay <từ>
join - xin làm approver (chủ sở hữu duyệt)
members - danh sách approver
revoke - chỉ chủ sở hữu: /revoke <user id>
```

## Reference

| Command | Usage | Where | Who | Decision |
|---|---|---|---|---|
| `/status` | `/status` · `/status <id prefix>` | any chat | approvers | P-017 |
| `/workers` (alias `/worker`) | `/workers` | any chat | approvers | D-082 |
| `/ideas` (alias `/ytuong`) | `/ideas [kit=<slug>] [nhanvat=<slug>]` | approval chat | approvers | D-083 |
| `/new` | `/new [minutes] <topic> [kit=<slug>] [nhanvat=<slug>] [worker=<id>]`, notes on the next lines; full brief as a `.md`/`.txt` file with the command as caption | approval chat | approvers | D-058, D-066, D-087 |
| `/brief` | `/brief` | approval chat | anyone in it | D-077 |
| `/retry` | `/retry <id prefix, ≥ 4 chars>` | any chat | approvers | D-056 |
| `/move` (alias `/chuyen`) | `/move <id prefix> <worker id>` · `/move <id prefix> huy` cancels a waiting move | any chat | owner | D-087 |
| `/rules` | `/rules [video\|tts\|say]` · `/rules file <scope>` · file captioned `/rules set <scope>` | any chat | approvers | D-059 |
| `/rule` | `/rule add <video\|tts> <text>` · `/rule del <number>` | any chat | approvers | D-059 |
| `/say`, `/unsay` | `/say <term> = <spoken>` · `/unsay <term>` | any chat | approvers | D-059 |
| `/join` | `/join` | approval chat | anyone | D-060 |
| `/members` | `/members` | any chat | approvers | D-060 |
| `/revoke` | `/revoke <user id>` | any chat | owner | D-060 |

Every command also works with the bot's name appended (`/status@<bot>`). Buttons and replies with
notes to approval messages are not commands; see `docs/quality-and-approval.md`.

When a PR adds a command: add it to the block and the table above, then the user pastes the block
again in BotFather.
