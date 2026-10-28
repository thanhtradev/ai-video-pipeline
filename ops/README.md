# Phase 1 production rollout

Everything in this file changes production and is **run by the user**, in order (CLAUDE.md §3).
Each step ends with a check. Secrets are generated on the target machine
(`openssl rand -hex 32`, hex so they are URL-safe) and stored only where noted — never in Git,
chat, or shell history. First run completed 2026-10-24 (`docs/infrastructure.md` §2b).

| Step | What | Where | Fixes |
|---|---|---|---|
| 1 | Backups + restore test | Proxmox, LXC 102, LXC 104 | R-02, R-12 |
| 2 | Pipeline database, roles, migrations, grants, pg_hba | LXC 102 | — |
| 3 | Redis persistence, memory limit, ACL users | LXC 112 | R-03 |
| 4 | Worker service | Mac mini | — |
| 5 | n8n credentials and workflows | LXC 104 | — |
| 6 | Network | LXC 102, Tailscale admin console | R-05, U-08 |
| 7 | Monitoring | Uptime Kuma | U-13 |
| 8 | Archive account + self-test | Nextcloud, Mac mini | U-04 |
| 9 | Phase 1 acceptance | — | — |

**Copying repo files into a container.** Use the Proxmox host as the hop: `scp <file> pve:/root/`,
then `ssh pve 'pct push <ctid> /root/<file> <dest>'`. SSH aliases such as `lxc-db` that use
`RemoteCommand pct enter <ctid>` only work for interactive `ssh`; `scp` ignores `RemoteCommand` and
copies to the Proxmox host instead.

**Multi-line commands.** Paste-friendly forms are used below (`export` instead of `\` line
continuations, `psql -f` instead of heredocs): pasted indentation breaks both.

## 1. Backups first (R-02)

Before any schema change, so there is something to roll back to.

1. **Proxmox** (`ssh pve`). Target storage `local` (`/var/lib/vz`); storage `data` does not allow
   backup content. Measure one run first, then size the retention to the free space:
   ```bash
   vzdump 102 104 106 112 --storage local --mode snapshot --compress zstd
   pvesh create /cluster/backup --id aivideo-daily --schedule "02:00" --storage local \
     --vmid 102,104,106,112 --mode snapshot --compress zstd --prune-backups keep-daily=7,keep-weekly=4 --enabled 1
   ```
   **vzdump skips bind mounts (R-12)**: Postgres data (`/mnt/data/db`), n8n and other Docker app data
   (`/mnt/data/docker-utils`), and Nextcloud data (`/mnt/data/nextcloud`) are not in these archives.
   Postgres is covered by step 1.2; the others need their own backup.
   All local storage is on the same NVMe (R-01, accepted until the dedicated NAS arrives).
2. **PostgreSQL dumps** on LXC 102. Copy the scripts in (see the note above), then:
   ```bash
   ssh pve 'pct push 102 /root/pg-backup.sh /usr/local/bin/pg-backup.sh --perms 755'
   ssh pve 'pct push 102 /root/pg-restore-test.sh /usr/local/bin/pg-restore-test.sh --perms 755'
   ssh lxc-db
   # Back up every existing database (Nextcloud included) before any change:
   for db in $(su postgres -s /bin/sh -c "psql -Atc \"SELECT datname FROM pg_database WHERE NOT datistemplate AND datname <> 'postgres'\""); do
     su postgres -s /bin/sh -c "DB_NAME=$db /usr/local/bin/pg-backup.sh"
   done
   ```
   Dumps land in `/var/lib/postgresql/backups/<db>` (host mount `/mnt/data/db/postgres`). The cron
   line for the pipeline database is added in §2.5 and gets its monitoring push in §7.
3. **n8n** on LXC 104 (its data is a bind mount, so vzdump misses it):
   ```bash
   docker exec n8n n8n export:workflow --backup --output=/home/node/.n8n/backups/workflows/
   docker exec n8n n8n export:credentials --backup --output=/home/node/.n8n/backups/credentials/
   ```
   Credentials stay encrypted; the key is in `n8n_data/config` — keep a copy in the password manager.

## 2. PostgreSQL (LXC 102)

1. Roles and database, from the repo on the Mac:
   ```bash
   ssh pve 'pct exec 102 -- su postgres -c "psql -v ON_ERROR_STOP=1"' < ops/postgres/bootstrap.sql
   ```
   (`could not change directory to "/root"` is harmless.)
2. Passwords, interactively in the container (`ssh lxc-db`, `su postgres -c psql`), one
   `openssl rand -hex 32` each, saved straight to the password manager:
   `\password aivideo_owner`, `\password aivideo_n8n_lxc104`, `\password aivideo_worker_mac_mini_m4`.
3. `pg_hba.conf` (`/etc/postgresql/15/main/pg_hba.conf`). Rules are **first match wins**: this block
   must sit **above** any broad rule such as `host all all 192.168.1.0/24`, with `reject` last, so
   only these clients reach `aivideo` while other databases keep their rules (D-038):
   ```
   host  aivideo  aivideo_owner               192.168.1.2/32    scram-sha-256
   host  aivideo  aivideo_n8n_lxc104          192.168.1.104/32  scram-sha-256
   host  aivideo  aivideo_worker_mac_mini_m4  192.168.1.2/32    scram-sha-256
   host  aivideo  all                         all               reject
   ```
   `192.168.1.2` is the Mac mini's LAN address (it runs migrations as owner and the worker).
   Then `systemctl reload postgresql`. Check the order took effect:
   `su postgres -c "psql -c 'SELECT line_number, database, user_name, address, auth_method FROM pg_hba_file_rules'"`.
4. Migrations and grants, from the repo on the Mac (checkout of `main`, `npm ci` done):
   ```bash
   read -rs PGPASSWORD && export PGPASSWORD
   export DATABASE_URL="postgres://aivideo_owner@192.168.1.102:5432/aivideo?sslmode=disable"
   npx dbmate --migrations-dir db/migrations --no-dump-schema up
   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f ops/postgres/grants.sql
   psql "$DATABASE_URL" -c "SELECT * FROM stream_config;" -c "SELECT max(version) FROM schema_migrations;"
   unset PGPASSWORD DATABASE_URL
   ```
5. Backup cron for the new database, in LXC 102:
   ```bash
   su postgres -s /bin/sh -c 'DB_NAME=aivideo /usr/local/bin/pg-backup.sh'
   su postgres -s /bin/sh -c 'DB_NAME=aivideo /usr/local/bin/pg-restore-test.sh'   # RESTORE TEST PASSED
   crontab -u postgres -e
   ```
   ```cron
   30 2 * * * DB_NAME=aivideo /usr/local/bin/pg-backup.sh --prune >> /var/lib/postgresql/aivideo-backup.log 2>&1
   ```
   `--prune` deletes this database's dumps older than 30 days (D-015). Repeat the restore test monthly
   and before upgrades (D-031).

**Check**: `stream_config` shows three streams; `max(version)` matches the newest file in `db/migrations`.

## 3. Redis (LXC 112)

Follow [redis/README.md](redis/README.md): check other users, enable AOF + `maxmemory` +
`noeviction`, create the two ACL users. Store the n8n Redis password in the n8n credential
(step 5) and the worker one in the Mac mini Keychain (step 4).

## 4. Worker (Mac mini)

Every worker Mac has one runtime root, `~/aivideo` (D-065); nothing of the worker lives anywhere
else, so a new worker is these steps and nothing more:

```
~/aivideo/
  repo/      plain clone of this repository, always on main   (AIVIDEO_ROOT/repo)
  work/      WORK_ROOT: videos/<video_id>/v<n>/…
  config/    worker.env (no secrets; the Keychain holds them)
  logs/      worker.log (launchd stdout + stderr)
  models/    whisper/ggml-large-v3-turbo.bin
  media/     music/ (catalog.json + files, D-047)
```

The worker loads code once at start, so **restart it only from an up-to-date `main`**:
`~/aivideo/repo/ops/launchd/update-worker.sh` (fetch, `git pull --ff-only`, `npm ci`, Chrome,
`launchctl kickstart`, `/health`). Development happens in another checkout
(`~/remote-dev/AIVIdeo/ai-video-pipeline`), never in `~/aivideo/repo`.

1. Clone and build (the `gh` CLI is logged in to the private repo):
   ```bash
   mkdir -p ~/aivideo/config ~/aivideo/logs ~/aivideo/models ~/aivideo/media
   gh repo clone thanhtradev/ai-video-pipeline ~/aivideo/repo -- --branch main
   cd ~/aivideo/repo && npm ci && cd remotion && npx remotion browser ensure && cd ..
   ```
2. Config (no secrets). Set `WORKER_ID`, the DB/Redis hosts and users, and this Mac's Tailscale
   address; the paths in the example already point into `~/aivideo`:
   ```bash
   cp ops/launchd/worker.env.example ~/aivideo/config/worker.env && chmod 600 ~/aivideo/config/worker.env
   sed -i '' "s#/Users/aivideo#$HOME#g" ~/aivideo/config/worker.env
   ```
3. Keychain items (prompts for each value, nothing in history). **Over SSH the login Keychain is
   locked** and `security` fails with "User interaction is not allowed" — unlock it first:
   ```bash
   security unlock-keychain ~/Library/Keychains/login.keychain-db
   security add-generic-password -a aivideo -s aivideo-db-password -w      # Postgres worker role
   security add-generic-password -a aivideo -s aivideo-redis-password -w   # Redis worker ACL user
   security add-generic-password -a aivideo -s aivideo-api-key-n8n -w      # new: openssl rand -hex 32
   ```
   Use `-U` to replace an existing item. To compare a stored Redis password with the server without
   printing it: `sha256` of the Keychain value must equal the `#<hash>` on the `user` line in
   `/etc/redis/redis.conf`. The other items (ITERA, rclone, Claude token) are listed in
   `ops/launchd/run-worker.sh`.
4. Models and music: whisper's model into `~/aivideo/models/whisper/`, the music library into
   `~/aivideo/media/music/` (`ops/episode-pipeline.md`, `ops/phase-2c.md`).
5. LaunchAgent. launchd does not load the shell profile, so the plist PATH must contain the Node
   binary directory (nvm here) — update it after changing Node versions:
   ```bash
   PLIST=~/Library/LaunchAgents/com.aivideo.worker.plist
   NODE_BIN=$(dirname "$(which node)")
   sed -e "s#/Users/aivideo#$HOME#g" \
       -e "s#<string>/opt/homebrew/bin:#<string>$NODE_BIN:/opt/homebrew/bin:#" \
       ~/aivideo/repo/ops/launchd/com.aivideo.worker.plist > "$PLIST"
   plutil -lint "$PLIST" && launchctl bootstrap gui/$(id -u) "$PLIST"
   ```
6. Keep the Mac awake without `caffeinate`: `sudo pmset -a sleep 0 disksleep 0 autorestart 1` (U-09).

**Check**: `curl http://<tailscale ip>:8787/health` returns `{"status":"ok","workerId":"<WORKER_ID>"}`;
`tail ~/aivideo/logs/worker.log` shows `worker ready`.

**Known limitation (R-13)**: a LaunchAgent and the login Keychain need a console login. After a
reboot (including `autorestart` after a power cut) the worker starts only once someone logs in at
the Mac.

### 4b. Moving an existing worker to `~/aivideo` [PROPOSED: Mac mini still on the D-039 layout]

The Mac mini still runs from the development checkout with `WORK_ROOT=~/work`,
`~/.config/aivideo/worker.env`, `~/Models/whisper`, `~/MediaLibrary/music` and
`~/Library/Logs/aivideo-worker.log` until the current batch of videos has rendered. Then, with no
job running (`tail` the log, `curl /health`):

1. Steps 1 and 5's `sed` above, into `~/aivideo/repo` and a plist in the scratch folder (not yet
   installed); `~/aivideo/config/worker.env` = the old file with `WORK_ROOT`, `MUSIC_LIBRARY_DIR`,
   `WHISPER_MODEL` rewritten to the new paths (`diff` the two files).
2. `launchctl bootout gui/$(id -u)/com.aivideo.worker`.
3. `mv ~/work ~/aivideo/work`, `mv ~/Models/whisper ~/aivideo/models/whisper`,
   `mv ~/MediaLibrary/music ~/aivideo/media/music`,
   `mv ~/Library/Logs/aivideo-worker.log ~/aivideo/logs/worker.log` (renames on the same volume;
   nothing is deleted, the old `worker.env` stays until the new worker is verified).
4. Install the new plist, `launchctl bootstrap`, then the **Check** above and
   `ops/progress-check.md`. Record the result in `docs/infrastructure.md` S-18.

## 5. n8n (LXC 104)

1. Telegram: create a bot with @BotFather; get your user id from @userinfobot (for a private chat
   with the bot, the chat id equals the user id) (U-11).
2. Credentials in n8n (names must match the workflow files):
   - `aivideo-postgres` (Postgres): host `192.168.1.102`, db `aivideo`, user `aivideo_n8n_lxc104`, SSL disabled.
   - `aivideo-redis` (Redis): host `192.168.1.112`, port 6379, user `aivideo-n8n`,
     **Database Number `1`** — the default `0` silently sends jobs where the worker never looks
     (R-14).
   - `aivideo-telegram` (Telegram API): bot token.
3. Import each file of `n8n/workflows/` into its **own new workflow** (Create Workflow → ⋯ →
   Import from File → Save); importing into an open workflow replaces it. Reconnect nodes to the
   credentials above if shown as missing, and replace `REPLACE_WITH_APPROVAL_CHAT_ID` in WF-99.
4. Activate in this order: **WF-99 Error Handler first** (n8n 2.x only runs an error workflow
   that is active), then WF-08 Watchdog, then WF-02 Dispatcher.
5. Register yourself as approver (from the Mac, as owner):
   `psql "postgres://aivideo_owner@192.168.1.102:5432/aivideo" -c "INSERT INTO approver (telegram_user_id, name) VALUES (<user-id>, 'owner')"`.

**Check**: n8n → Executions shows WF-02 every 30 s and WF-08 every minute, all successful.

## 6. Network

- **Postgres**: per-database allow-list in `pg_hba.conf` (§2.3), not a port firewall — other
  applications share LXC 102 (D-038). Check: a connection to `aivideo` from an unlisted host fails
  with `pg_hba.conf rejects connection`.
- **Redis**: no port firewall — another application (BullMQ, db 0) shares LXC 112. Isolation is the
  per-client ACL users from step 3 (D-037).
- **Tailscale**: merge `ops/tailscale/acl-snippet.hujson` into the tailnet policy (preview first).
  While the policy still has the default allow-all rule the snippet adds nothing; narrowing it
  requires listing your own devices first so you do not lock yourself out (U-08).

## 7. Monitoring

Add the monitors and the backup push in [monitoring/uptime-kuma.md](monitoring/uptime-kuma.md).

## 8. Archive account and self-test (Nextcloud)

1. In Nextcloud create user `aivideo-archive` (not your own account, no admin group, optional
   quota), log in as it, and create an app password (Personal settings → Security).
2. On the Mac mini:
   ```bash
   security add-generic-password -a aivideo -s aivideo-archive-password -w   # the app password
   export ARCHIVE_WEBDAV_URL=http://100.120.60.20:8080/remote.php/dav/files/aivideo-archive/
   export ARCHIVE_WEBDAV_USER=aivideo-archive
   export ARCHIVE_WEBDAV_PASSWORD="$(security find-generic-password -a aivideo -s aivideo-archive-password -w)"
   npm --prefix worker run archive:selftest
   unset ARCHIVE_WEBDAV_PASSWORD
   ```
   Expect two `PASS` lines. The self-test leaves a `selftest/` folder in Nextcloud; delete it when you like.

## 9. Phase 1 acceptance

End-to-end smoke test with the `simulate` step (no paid calls), from the repo on the Mac:

```bash
read -rs PGPASSWORD && export PGPASSWORD
export OWNER_URL="postgres://aivideo_owner@192.168.1.102:5432/aivideo"
psql "$OWNER_URL" -v ON_ERROR_STOP=1 -f ops/postgres/smoke-test.sql
psql "$OWNER_URL" -c "SELECT status, attempt_count, claimed_by, output FROM job ORDER BY created_at DESC LIMIT 1;"
```

Within a minute the job is `SUCCEEDED`, `audit_log` shows PENDING → READY → QUEUED → RUNNING →
SUCCEEDED, and `~/work/videos/<video_id>/v1/jobs/<job_id>/simulated.txt` exists on the Mac mini.
A job stuck in `QUEUED` while the worker logs nothing usually means the n8n Redis credential points
at the wrong database (R-14): check with `redis-cli -n 0 LRANGE q:light 0 -1` on LXC 112.
