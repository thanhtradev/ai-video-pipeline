# Vietnamese Telegram messages rollout (D-061)

Run by the user after this PR (and #19, which it builds on) is merged. **Free.** No migration, no
worker restart.

Re-import every workflow that sends messages, with the approval chat id (and the worker URL for
WF-12/WF-13): WF-01, WF-05, WF-06, WF-08, WF-12, WF-13, WF-99. `ops/n8n/deploy-workflows.sh`
does all of them at once and publishes them in the right order ([n8n/README.md](n8n/README.md)).

Requests that are already in the chat keep their English buttons and text; they still work.

Optional: Vietnamese descriptions in the command menu (BotFather `/setcommands`): paste the block
of [telegram-commands.md](telegram-commands.md).

**Check**: `/status` answers in Vietnamese.
