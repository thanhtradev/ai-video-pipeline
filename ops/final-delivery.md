# Final delivery rollout (D-062, D-063)

Run by the user after this PR is merged. Conventions as in [README.md](README.md). **Free** apart
from the Claude subscription (one metadata reply per version) and your Google storage.

What it adds after the final 1080p render: `qa_final`, `metadata` (title, description, tags,
hashtags, thumbnail), A3 on Telegram, the `archive` job to **Google Drive**, the owner's
"Xóa bản trên Mac?" question with the `cleanup` job, `COMPLETED` with a cost report.

## 1. Code, backup, migrate (Mac mini)

```bash
cd ~/remote-dev/AIVIdeo/ai-video-pipeline
git checkout main
git pull
npm ci
```

Backup as in `phase-2b.md` §3, then migrate and re-run grants as in `preview-approval.md` §1; expect
`20261105000100`.

## 2. Google Drive through rclone (once)

1. Install rclone and note its path and version (for `docs/infrastructure.md` U-22):

   ```bash
   brew install rclone
   which rclone
   rclone version | head -1
   ```

2. Create the remote, logging in with the Google account that will hold the archive:

   ```bash
   rclone config
   ```

   - `n` (new remote), name **`aivideo-drive`**, storage **`drive`** (Google Drive);
   - client_id / client_secret: leave empty (rclone's shared app; your own OAuth app is optional);
   - scope: **`drive.file`** (only files rclone creates — it cannot see the rest of your Drive);
   - root_folder_id, service_account_file: empty; advanced config: `n`; auto config: `y` — the
     browser opens, log in and allow;
   - shared drive: `n`; then `y` to keep the remote.

3. Encrypt rclone's config (it now holds the OAuth token) with a password kept in the Keychain:

   ```bash
   security add-generic-password -a aivideo -s aivideo-rclone-config-pass -w
   rclone config          # s) Set configuration password -> a) Add Password -> the same password
   chmod 600 ~/.config/rclone/rclone.conf
   ```

4. Check it, with the password from the Keychain (nothing is printed):

   ```bash
   export RCLONE_CONFIG_PASS="$(security find-generic-password -a aivideo -s aivideo-rclone-config-pass -w)"
   rclone mkdir "aivideo-drive:AI Video Archive"
   rclone lsjson --stat "aivideo-drive:AI Video Archive"
   rclone about aivideo-drive:
   unset RCLONE_CONFIG_PASS
   ```

   `rclone about` shows the account's free space (15 GB on a free account; an episode is about
   150 MB on Drive).

## 3. Worker: settings and restart

Add to `~/.config/aivideo/worker.env` (the rclone path from step 2.1):

```bash
ARCHIVE_RCLONE_REMOTE="aivideo-drive:AI Video Archive"
RCLONE_BIN=/opt/homebrew/bin/rclone
```

`run-worker.sh` exports `RCLONE_CONFIG_PASS` from the Keychain. Restart the worker (no episode agent
running): `launchctl kickstart -k gui/$(id -u)/com.aivideo.worker`. Without these settings archive
and cleanup jobs wait `BLOCKED` (WF-08 alerts) instead of failing.

## 4. n8n

Re-import **WF-06** and import the new **WF-14** (`wf-14-final-delivery.json`) with the approval
chat id (Send thumbnail, Send buttons, Send done, Send cleaned) and, in **Build thumbnail**, the
worker URL — the CLI loop handles both: add `wf-14-final-delivery` to its list. Activate WF-14 (and
WF-06 again).

## 5. Check

A video already in `RENDERING_FINAL` with its 1080p render done (e.g. `c4703c2d`) is picked up by
WF-14 within a minute: `/status <id>` shows `qa_final` and `metadata`, then the thumbnail and the A3
message arrive. Duyệt → `/status` shows `archive`, then "Video hoàn tất ✓" with the Drive path and
**Xóa bản trên Mac / Giữ lại**. In Drive, the folder `AI Video Archive/<yyyy>/<mm>/<id>/v1` holds
`renders/`, `manifest.json`, `checksums.sha256` …

Xóa (from the owner's account) → `cleanup` re-checks every file on Drive, deletes
`~/work/videos/<id>/v1/` except the cleanup job's folder, and reports the space freed. Pressing it
from another account is refused.

## Rollback

Deactivate WF-14 and re-import the previous WF-06; restart the worker on the previous code; then
`npx dbmate … rollback` (fails while a version is `AWAITING_METADATA_APPROVAL` or a METADATA/CLEANUP
approval exists). Copies on Drive stay; the Mac copy is only ever deleted by an approved cleanup.
