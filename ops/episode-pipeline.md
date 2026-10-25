# Episode pipeline rollout (TikTok 2 channel)

Run by the user, in order, after PR #9 is merged. Design: [docs/episode-pipeline.md](../docs/episode-pipeline.md).
Conventions as in [README.md](README.md). Sections are added as slices land; each section says
what it costs.

## B1 + B2: episode script (A1) and eleven_v4 narration

What it adds:
- WF-01 asks for an episode: `Topic`, `Duration (minutes)` (optional), `Full brief` (optional,
  narration kept verbatim), `Notes`. Videos are 16:9.
- The `script` step writes the episode (acts, narration with audio tags, shots with MỐC) and A1
  shows it in minutes, acts and shots, with the TTS budget (≈ 1 credit per narration character;
  EP5 was 6251 characters).
- Approving A1 creates one ITERA request per act with `eleven_v4` and the voice Tuấn Anh
  (`47rM9DW5VmjOw23BVHWi`). No typography preview is made for episodes.
- Migrations `20261027000100` (2c preview flow, Shorts only), `20261028000100` (episode briefs),
  `20261028000200` (registers `eleven_v4`, disabled), `20261028000300` (episode A1 approval).

Until B3 (timing) lands, an approved episode stops after its narration, in `GENERATING_ASSETS`.
**Approving A1 spends ITERA credits**; Reject and Regenerate are free.

### 1. Code (Mac mini)

```bash
cd ~/remote-dev/AIVIdeo/ai-video-pipeline && git checkout main && git pull && npm ci
```

### 2. Backup, migrate, switch TTS to eleven_v4

Check first that no `tts` job is waiting: the switch disables `eleven_v3`, so such a job would
wait for its model.

```bash
ssh lxc-db
su postgres -s /bin/sh -c 'DB_NAME=aivideo /usr/local/bin/pg-backup.sh'
exit
```

```bash
read -rs PGPASSWORD && export PGPASSWORD                       # owner password
export DATABASE_URL="postgres://aivideo_owner@192.168.1.102:5432/aivideo?sslmode=disable"
psql "$DATABASE_URL" -c "SELECT count(*) FROM job WHERE step = 'tts'
  AND status NOT IN ('SUCCEEDED', 'FAILED_PERMANENT', 'CANCELLED');"   # 0
npx dbmate --migrations-dir db/migrations --no-dump-schema up
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f ops/postgres/grants.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -v model_id='eleven_v4' -v voice_id='47rM9DW5VmjOw23BVHWi' -v credits_per_char='1' \
  -v source="GET /v1/models eleven_v4 rate 1, $(date +%F)" \
  -f ops/postgres/itera-tts.sql
unset PGPASSWORD DATABASE_URL
```

**Check**: `SELECT max(version)` is `20261028000300`; the last table shows `eleven_v4` with
`model_on` = `t`, the voice id and a `per_char` price of `1` `CRD`, and `eleven_v3` with `f`.

### 3. Worker and n8n

1. `launchctl kickstart -k gui/$(id -u)/com.aivideo.worker`; the log shows `worker ready`.
2. n8n: open **WF-01**, deactivate, ⋯ → Import from File → `wf-01-intake.json`, set the chat id
   again, save, activate. Same for **WF-05** with `wf-05-script-approval.json`.

**Check**: the form at `<WEBHOOK_URL>/form/aivideo-brief` shows the four episode fields.

### 4. Smoke test (free until you approve)

1. Submit the form with only a topic (e.g. `Nếu bạn nghe được suy nghĩ của mèo?`) and duration
   `3`. Within a few minutes A1 arrives: `Episode ~N min, … acts, … shots`, the logline, the acts.
2. Open the full storyboard on the Mac mini:

   ```bash
   WORK_ROOT=$(grep '^WORK_ROOT=' ~/.config/aivideo/worker.env | cut -d= -f2-)
   open "$(ls -t "$WORK_ROOT"/videos/*/v1/jobs/*/script.md | head -1)"
   ```

3. Submit a second form with your own full brief (e.g. the EP5 text) in `Full brief`. Its
   `script.md` must show your narration word for word.
4. Press **Regenerate** or **Reject** to keep it free. Press **Approve** only to hear the
   narration: about 1 credit per character, one MP3 per act in the `tts` job folder.

## Rollback

- Code: revert the merge on `main`, `npm ci`, restart the worker.
- TTS model: rerun `itera-tts.sql` with `model_id='eleven_v3'` and the previous voice
  (`pHMSzlSRiVLr5kB4DGOR`).
- Migrations: `npx dbmate … rollback` one at a time; `20261028000200` refuses once `eleven_v4`
  has a price (restore from the backup instead).
