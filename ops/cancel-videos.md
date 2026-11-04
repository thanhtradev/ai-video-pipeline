# Cancel a list of videos (D-094)

From Telegram, the owner can do the same with `/cancel <id> [id…]` and its Confirm button (D-098,
[telegram-confirm.md](telegram-confirm.md)). This script stays for the shell; it needs migration
`20261125000200`.

Run by the user. Conventions as in [README.md](README.md). **Free.** No migration, no worker
restart, no n8n change. The script is `ops/postgres/cancel-videos.sql` (owner role).

Use it when a batch must be stopped, e.g. before a new TTS voice. It cancels the **current
version** of each listed video. Each video is handled alone (a wrong id is only reported). The
waiting approvals of a cancelled video are closed (their buttons no longer work), its unfinished
jobs are cancelled, and `/auto` is cleared. Nothing is deleted. A job that is already running
finishes on its worker, but its result is dropped, and credits it already spent are not refunded.

## 1. Connect (Mac mini)

```bash
cd ~/aivideo/repo
git pull
read -rs PGPASSWORD && export PGPASSWORD                       # owner password
export DATABASE_URL="postgres://aivideo_owner@192.168.1.102:5432/aivideo?sslmode=disable"
```

## 2. Dry run, then cancel

Put the id prefixes Telegram shows (8 characters) in `ids`, separated by spaces:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -v ids='4e6f760a 878da929' -f ops/postgres/cancel-videos.sql
```

Each line shows the video, its status and `WOULD_CANCEL` (or `NOT_FOUND`, `AMBIGUOUS`,
`ALREADY_<status>`). Nothing changed yet. If the list is right, run the same command with
`-v apply=1` added: the lines then say `CANCELLED`. Then `unset PGPASSWORD DATABASE_URL`.

## 3. Check

`/status <id>` no longer lists the video as running, and `/workers` shows no new step for it.
A job that was running stops when its worker's next lease renewal sees it cancelled.

## Next: a new voice, then the batch again

The TTS voice is read when the TTS step runs, so set it before creating the videos again. For the
Vietnamese voice, without touching the price, use the model the TTS step uses (check with
`psql "$DATABASE_URL" -c "SELECT model_id FROM provider_model WHERE provider_id='itera' AND enabled"`):

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -v model_id=<enabled model> -v language=vi \
  -v voice_id=<new voice id> -v language_code=vi -f ops/postgres/itera-tts-voice.sql
```

Then `/new …` again (new video ids) and `/auto <id>` if wanted.
