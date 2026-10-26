# Final delivery rollout (D-062)

Run by the user after this PR is merged. Conventions as in [README.md](README.md). **Free** apart
from the Claude subscription (one metadata reply per version).

What it adds after the final 1080p render: `qa_final`, `metadata` (title, description, tags,
hashtags, thumbnail), A3 on Telegram, the `archive` job to Nextcloud, `COMPLETED` with a cost report.

## 1. Code, backup, migrate (Mac mini)

```bash
cd ~/remote-dev/AIVIdeo/ai-video-pipeline
git checkout main
git pull
npm ci
```

Backup as in `phase-2b.md` §3, then migrate and re-run grants as in `preview-approval.md` §1; expect
`20261105000100`.

## 2. Worker: archive settings and restart

The archive account already exists (`README.md` §8, S-21): the Keychain item
`aivideo-archive-password` holds its app password, and `run-worker.sh` now exports it. Add the two
non-secret settings to `~/.config/aivideo/worker.env` (values from `README.md` §8):

```bash
ARCHIVE_WEBDAV_URL=http://100.120.60.20:8080/remote.php/dav/files/aivideo-archive/
ARCHIVE_WEBDAV_USER=aivideo-archive
```

Check the Keychain item exists without printing it:

```bash
security find-generic-password -a aivideo -s aivideo-archive-password >/dev/null && echo present
```

Restart the worker (no episode agent running): `launchctl kickstart -k gui/$(id -u)/com.aivideo.worker`.
Without these settings archive jobs wait `BLOCKED` (WF-08 alerts) instead of failing.

## 3. n8n

Re-import **WF-06** and import the new **WF-14** (`wf-14-final-delivery.json`) with the approval
chat id and, in **Build thumbnail**, the worker URL — the CLI loop handles both: add
`wf-14-final-delivery` to its list. Activate WF-14 (and WF-06 again).

## 4. Check

A video already in `RENDERING_FINAL` with its 1080p render done (e.g. `c4703c2d`) is picked up by
WF-14 within a minute: `/status <id>` shows `qa_final` and `metadata`, then the thumbnail and the A3
message arrive. Duyệt → `/status` shows `archive` (gathering, uploading), then the final message with
the Nextcloud path. On the Mac the folder `~/work/videos/<id>/v1/` now holds `renders/`, `manifest.json`
… next to `jobs/` (hard links: no extra disk space for the videos).

## Rollback

Deactivate WF-14 and re-import the previous WF-06; restart the worker on the previous code; then
`npx dbmate … rollback` (fails while a version is `AWAITING_METADATA_APPROVAL`). Archived copies on
Nextcloud and the version folders stay; nothing is deleted.
