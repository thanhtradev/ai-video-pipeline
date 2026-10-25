# Phase 2c rollout: preview render (template, music, subtitles, thumbnail)

Run by the user, in order, after the Phase 2c PR is merged and Phase 2b is live
([phase-2b.md](phase-2b.md)). Conventions as in [README.md](README.md). **Nothing here is paid**:
rendering runs on the Mac mini, and the music comes from the free shared library.

What it adds:
- migration `20261027000100_preview_flow.sql`: approving A1 now also creates a `render_preview`
  job on `q:render` that waits for the `tts` job. When it starts, the version moves to
  `RENDERING_PREVIEW`;
- the Remotion template in `remotion/` (typography explainer, D-049);
- the worker `render_preview` step. It writes `preview.mp4` (720×1280, H.264/AAC, -14 LUFS),
  `thumbnail.png`, and `vi.srt` + `vi.vtt`;
- a `music_style` field in new scripts.

No n8n change: the A1 buttons call the same SQL function.

## 1. Code and music library (Mac mini)

```bash
cd ~/remote-dev/AIVIdeo/ai-video-pipeline && git checkout main && git pull && npm ci
ls ~/MediaLibrary/music/catalog.json && python3 -c "import json;print(len(json.load(open('$HOME/MediaLibrary/music/catalog.json'))['tracks']), 'tracks')"
```

**Check**: `30 tracks`. Read `~/MediaLibrary/music/README.md` before you publish anything. Every
video with Incompetech music needs the track's `credit` text in its description (D-047).

## 2. Test render without the database (about 1 minute)

The first render downloads Remotion's Chrome Headless Shell into `node_modules` (once, and again
after each `npm ci`).

```bash
cd worker && RUN_RENDER_TESTS=1 KEEP_RENDER=1 npx vitest run test/integration/render-preview.test.ts; cd ..
```

**Check**: `1 passed`. Open the printed folder and watch `preview.mp4`. It plays test tones, not
a voice.

## 3. Backup, then migrate (same as phase-2b §3)

```bash
ssh lxc-db
su postgres -s /bin/sh -c 'DB_NAME=aivideo /usr/local/bin/pg-backup.sh'
exit
```

```bash
read -rs PGPASSWORD && export PGPASSWORD                       # owner password
export DATABASE_URL="postgres://aivideo_owner@192.168.1.102:5432/aivideo?sslmode=disable"
npx dbmate --migrations-dir db/migrations --no-dump-schema up
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f ops/postgres/grants.sql
psql "$DATABASE_URL" -c "SELECT max(version) FROM schema_migrations;"   # 20261027000100
```

Keep this shell open for step 5.

## 4. Worker (Mac mini)

```bash
grep '^WORKER_STREAMS=' ~/.config/aivideo/worker.env      # must include q:render
printf 'FFMPEG_BIN=%s\nMUSIC_LIBRARY_DIR=%s\n' "$(which ffmpeg)" "$HOME/MediaLibrary/music" >> ~/.config/aivideo/worker.env
launchctl kickstart -k gui/$(id -u)/com.aivideo.worker
tail -n 5 ~/Library/Logs/aivideo-worker.log      # "worker ready"
```

## 5. Smoke test (free)

Render the preview of the 2b smoke-test video. Its narration already exists, so no credits are
spent. Use the same shell as step 3:

```bash
psql "$DATABASE_URL" -c "SELECT render_preview_job_create(vv.id) FROM video_version vv
  WHERE vv.video_id = '<video id from the 2b smoke test>' AND vv.status = 'GENERATING_ASSETS';"
```

Within 30 s (WF-02 dispatch) and about a minute of rendering:

```sql
SELECT j.step, j.status, j.last_error, j.output->'result'->'duration_seconds' AS seconds,
       j.output->'result'->'music'->>'title' AS music, j.output->'result'->'loudness' AS loudness
FROM job j JOIN video_version vv ON vv.id = j.video_version_id
WHERE vv.video_id = '<video id>' ORDER BY j.created_at;
SELECT status FROM video_version WHERE video_id = '<video id>';
```

**Check**:
- `render_preview` is `SUCCEEDED` and the version is `RENDERING_PREVIEW`;
- `output_lufs` is about -14 and `output_true_peak` is at most -1;
- the files play correctly:

```bash
unset PGPASSWORD DATABASE_URL
WORK_ROOT=$(grep '^WORK_ROOT=' ~/.config/aivideo/worker.env | cut -d= -f2-)
open "$(ls -t "$WORK_ROOT"/videos/*/v1/jobs/*/preview.mp4 | head -1)"
open "$(ls -t "$WORK_ROOT"/videos/*/v1/jobs/*/thumbnail.png | head -1)"
cat "$(ls -t "$WORK_ROOT"/videos/*/v1/jobs/*/vi.srt | head -1)"
```

Look for: text in sync with the voice, music audible but well under the voice, correct Vietnamese
diacritics, and subtitles that match the narration.

From now on, a new brief that you approve on A1 runs narration and then the preview without any
further step.

## Rollback

- Code: revert the merge on `main`, `npm ci`, `launchctl kickstart -k …`. A `render_preview` job
  that already exists then fails (no handler) and the version needs a decision. Nothing is spent.
- Migration: `npx dbmate … rollback` removes the job creation and the trigger. Existing
  `render_preview` jobs stay as history.

## Known limits (2c)

- The preview is not sent to Telegram yet. Delivery, QA, metadata (with the music credit) and the
  A2 approval are slice 2d. After rendering, the version stays in `RENDERING_PREVIEW`.
- Subtitle timing inside a scene is estimated from text length (D-048), not from the audio.
- A narration longer than the brief is rendered anyway; the duration check (< 60 s, D-025) is QA in 2d.
- Previews of scripts written before 2c use the `calm` music style.
