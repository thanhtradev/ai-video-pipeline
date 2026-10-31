# Vietnamese Telegram messages rollout (D-061)

Run by the user after this PR (and #19, which it builds on) is merged. **Free.** No migration, no
worker restart.

Re-import every workflow that sends messages, with the approval chat id (and the worker URL for
WF-12/WF-13): WF-01, WF-05, WF-06, WF-08, WF-12, WF-13, WF-99. `ops/n8n/deploy-workflows.sh`
does all of them at once and publishes them in the right order ([n8n/README.md](n8n/README.md)).

Requests that are already in the chat keep their English buttons and text; they still work.

Optional: Vietnamese descriptions in the command menu (BotFather `/setcommands`, replaces the list):

```
status - tiến độ các video, hoặc /status <id video>
workers - worker nào đang chạy clip nào
new - tập mới: /new [số phút] <chủ đề>
retry - chạy lại video bị dừng: /retry <id video>
rules - quy tắc kênh và phát âm
rule - /rule add video|tts <nội dung> hoặc /rule del <số>
say - cách đọc: /say <từ> = <cách đọc>
unsay - bỏ cách đọc: /unsay <từ>
join - xin làm approver (chủ sở hữu duyệt)
members - danh sách approver
revoke - chỉ chủ sở hữu: /revoke <user id>
```

**Check**: `/status` answers in Vietnamese.
