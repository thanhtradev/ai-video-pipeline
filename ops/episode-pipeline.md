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

Roll out B1–C4 together (one merge, one migration run, one round of n8n imports): the sections
below are in the order to follow.
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

**Check**: `SELECT max(version)` is `20261029000100`; the last table shows `eleven_v4` with
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

## B3: timing (whisper.cpp)

What it adds: approving an episode A1 also creates a `timing` job on `q:heavy` that waits for the
narration, joins the act clips into `voice.wav`, transcribes it with whisper.cpp and writes
`timing.json`, `captions.json` and `timeline.md` (docs/episode-pipeline.md §5). **Free** (local).
Migration: none beyond B1 + B2 (`20261028000300` already creates the job).

### 1. whisper.cpp and the model (Mac mini)

`whisper.cpp` 1.9.5 is already installed (S-27). The model the reference episodes used is on the
external SSD; copy it to the internal disk so the worker does not depend on the SSD (1.6 GB; 19 GiB
free on 2026-10-26):

```bash
brew list --versions whisper.cpp          # whisper.cpp 1.9.5
mkdir -p ~/Models/whisper
cp /Volumes/256GB/my-video/whisper.cpp/ggml-large-v3-turbo.bin ~/Models/whisper/
shasum -a 256 ~/Models/whisper/ggml-large-v3-turbo.bin   # note it in docs/infrastructure.md S-27
```

### 2. Free test with real speech (about 10 s)

Uses the macOS voice Linh instead of a paid TTS call:

```bash
cd ~/remote-dev/AIVIdeo/ai-video-pipeline/worker
WHISPER_MODEL=$HOME/Models/whisper/ggml-large-v3-turbo.bin npx vitest run test/integration/timing.test.ts
cd ..
```

**Check**: `1 passed`.

### 3. Worker

```bash
grep '^WORKER_STREAMS=' ~/.config/aivideo/worker.env      # must include q:heavy
printf 'WHISPER_BIN=%s\nWHISPER_MODEL=%s\n' "$(which whisper-cli)" "$HOME/Models/whisper/ggml-large-v3-turbo.bin" >> ~/.config/aivideo/worker.env
launchctl kickstart -k gui/$(id -u)/com.aivideo.worker
tail -n 5 ~/Library/Logs/aivideo-worker.log      # "worker ready"
```

Without `WHISPER_MODEL`, timing jobs wait as `BLOCKED` and resume within an hour once it is set.

### 4. Check after an approved episode

Within about a minute of the narration finishing:

```bash
WORK_ROOT=$(grep '^WORK_ROOT=' ~/.config/aivideo/worker.env | cut -d= -f2-)
open "$(ls -t "$WORK_ROOT"/videos/*/v1/jobs/*/timeline.md | head -1)"
open "$(ls -t "$WORK_ROOT"/videos/*/v1/jobs/*/voice.wav | head -1)"
```

Look for: every shot on the right sentence, holds after the gag beats, total length close to the
A1 estimate. A failed timing job (a MỐC never spoken, a cut in speech) puts the video in
`NEEDS_DECISION` with the reason; nothing was spent by it.

## C2: episode code (Claude Code agent)

What it adds: approving an episode A1 also creates an `episode_code` job on `q:render` that waits
for the timeline. Claude Code (`claude-opus-5-5`) writes the episode in a sandboxed workspace, the
worker checks it (typecheck, SFX, storyboard, text in frame) and resumes the agent with the report
and the storyboard. **Uses the Claude subscription**: up to 90 minutes of Opus per episode (more on
revisions); no paid API. Migration: none beyond B1–B3 (`20261028000300` creates the job).

### 1. Chrome for the worker's renders (Mac mini)

The gates render with no network, so Remotion's Chrome must already be downloaded:

```bash
cd ~/remote-dev/AIVIdeo/ai-video-pipeline/remotion && npx remotion browser ensure && cd ..
ls remotion/node_modules/.remotion       # chrome-headless-shell
```

### 2. Optional: plumbing test (about 6 min; a small Claude model on the subscription)

Runs the whole step on a 3-shot mini episode with the macOS voice Linh and a small Claude model:

```bash
cd ~/remote-dev/AIVIdeo/ai-video-pipeline/worker
RUN_AGENT_TESTS=1 WHISPER_MODEL=$HOME/Models/whisper/ggml-large-v3-turbo.bin \
  npx vitest run test/integration/episode-code.test.ts
cd ..
```

**Check**: `1 passed`; the printed folder has `ws/board/page-01.jpg`.

### 3. Worker

`grep '^WORKER_STREAMS=' ~/.config/aivideo/worker.env` must include `q:render`. Optional:
`CLAUDE_AGENT_MODEL` (default `claude-opus-5-5`). Restart:
`launchctl kickstart -k gui/$(id -u)/com.aivideo.worker`.

### 4. Check after an approved episode

```bash
WORK_ROOT=$(grep '^WORK_ROOT=' ~/.config/aivideo/worker.env | cut -d= -f2-)
J=$(ls -td "$WORK_ROOT"/videos/*/v1/jobs/*/ws | head -1); echo "$J"
open "$J"/board/page-*.jpg
```

A failed job leaves its workspace; open it with `claude` in that folder to continue by hand.

## C3 + C4: storyboard approval and the episode render

What it adds:
- migration `20261029000100`: status `AWAITING_STORYBOARD_APPROVAL`, approval type `STORYBOARD`,
  `storyboard_approvals_due()`, `telegram_decide()`, revisions and the `render_episode` job;
- **WF-12** (new) sends each storyboard page as a photo, then a message with Approve / Reject. To ask
  for changes, **reply to that message** with your notes; at most 3 rounds of notes;
- **WF-06** (updated) also listens to messages (the replies) and decides through `telegram_decide()`;
- the worker serves the pages on `GET /boards/…?t=<token>` (D-055) and renders the approved episode
  at 720p (`render_episode`, free): `preview.mp4` (-14 LUFS) + `vi.srt`.

### 1. Migrate (if not done with B1–C2)

`npx dbmate … up` and `grants.sql` as in B1 + B2 §2. **Check**: `SELECT max(version)` is
`20261029000100`.

### 2. n8n (LXC 104)

1. Open **WF-06**, deactivate, ⋯ → Import from File → `wf-06-telegram-callback.json`, save, activate
   (this re-registers the bot webhook, now with `message` updates).
2. Import **WF-12** into a new workflow from `wf-12-storyboard-approval.json`. Replace
   `REPLACE_WITH_APPROVAL_CHAT_ID` (Send page, Send buttons) and, in the **Build pages** code,
   `REPLACE_WITH_WORKER_URL` with the worker API base URL (`http://100.71.214.125:8787`, S-18).
   Reconnect credentials if shown as missing, save, activate.

**Check**: from the n8n host, `curl -s http://100.71.214.125:8787/health` answers `ok`.

### 3. Check with an episode

After the episode code (C2) succeeds, within 30 s the chat gets the storyboard pages and the
message. Reply to it with a note (e.g. `Shot 1.2 tối quá`): the bot answers `Notes received:
revising the storyboard (round 2 of 4)`, and the revised storyboard arrives when the agent is done.
Approve: `Approved: rendering the preview`, then:

```bash
WORK_ROOT=$(grep '^WORK_ROOT=' ~/.config/aivideo/worker.env | cut -d= -f2-)
open "$(ls -t "$WORK_ROOT"/videos/*/v*/jobs/*/preview.mp4 | head -1)"
```

The version stays in `RENDERING_PREVIEW`: sending the preview to Telegram, QA, A2 and the final
1080p render are 2d.

## Rollback

- Code: revert the merge on `main`, `npm ci`, restart the worker.
- TTS model: rerun `itera-tts.sql` with `model_id='eleven_v3'` and the previous voice
  (`pHMSzlSRiVLr5kB4DGOR`).
- Migrations: `npx dbmate … rollback` one at a time; `20261029000100` refuses while a version or
  approval uses the storyboard values, and `20261028000200` once `eleven_v4` has a price (restore
  from the backup instead).
- n8n: deactivate WF-12; re-import the previous `wf-06-telegram-callback.json` from Git.
