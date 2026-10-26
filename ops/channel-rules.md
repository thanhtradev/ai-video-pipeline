# Channel rules rollout (D-059)

Run by the user after this PR (and #14, #15, which it builds on) is merged. Conventions as in
[README.md](README.md). **Free.**

What it adds:
- migration `20261103000100_channel_rules.sql`: tables `rule` and `pronunciation`,
  `telegram_rules()` for n8n, `rules_current()` for the worker (granted by `grants.sql`);
- the worker puts the rules into the episode script prompt and the agent's `rules.md`, and the
  pronunciation table into the TTS text (captions keep the written term);
- **WF-06**: the commands below, approvers only.

| Telegram | Effect |
|---|---|
| `/rules` | all rules with their numbers, and the pronunciation table |
| `/rules video` · `/rules tts` · `/rules say` | one list |
| `/rule add video Không dùng nhạc nền.` | adds a rule for every video |
| `/rule add tts Câu hỏi mở đầu có [short pause] phía sau.` | adds a rule for narration lines |
| `/rule del 12` | removes rule #12 (kept in history) |
| `/say TikTok = tích tốc` | the voice says "tích tốc" for "TikTok" (case-sensitive, whole word) |
| `/unsay TikTok` | read as written again |
| `/rules file video` (or `tts`, `say`) | the list as a Markdown file to edit |
| send the edited file with the caption `/rules set video` | replaces that whole list |

Changes apply to steps that start afterwards: a script, TTS or episode-code job that already started
keeps what it read (a TTS retry keeps its table, so nothing is paid twice).

## 1. Migrate and restart (Mac mini)

As in `preview-approval.md` §1; expect `20261103000100`. Re-run `ops/postgres/grants.sql` (it grants
`rules_current` to the worker). Then restart the worker (it needs `rules_current`):
`launchctl kickstart -k gui/$(id -u)/com.aivideo.worker`, when no episode agent is running.

## 2. Re-import WF-06

As before (with the approval chat id). Optional: in BotFather, `/setcommands` so the commands show
up in the chat's menu:

```
status - progress of active videos, or /status <video id>
new - new episode: /new [minutes] <topic>
retry - retry a stopped video: /retry <video id>
rules - channel rules and pronunciation
rule - /rule add video|tts <text> or /rule del <number>
say - pronunciation: /say <term> = <how to say it>
unsay - remove a pronunciation: /unsay <term>
```

**Check**: `/say TikTok = tích tốc`, then `/rules say` lists it; `/unsay TikTok` removes it.

## Rollback

Re-import the previous WF-06 and restart the worker on the previous code first (it calls
`rules_current`), then `npx dbmate … rollback` drops the tables (the rules are lost: export them with
`/rules file` beforehand).
