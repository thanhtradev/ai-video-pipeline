# Phase 1 production rollout

Everything in this file changes production and is **run by the user**, in order (CLAUDE.md §3).
Each step ends with a check. Secrets are generated on the target machine
(`openssl rand -hex 32`, hex so they are URL-safe) and stored only where noted — never in Git,
chat, or shell history.

| Step | What | Where | Fixes |
|---|---|---|---|
| 1 | Backups + restore test | Proxmox, LXC 102 | R-02 |
| 2 | Pipeline database, roles, migrations, grants | LXC 102 | — |
| 3 | Redis persistence, memory limit, ACL users | LXC 112 | R-03 |
| 4 | Worker service | Mac mini | — |
| 5 | n8n credentials and workflows | LXC 104 | — |
| 6 | Tailscale ACL, firewall | Admin console, LXC 102/112 | R-05, U-08 |
| 7 | Monitoring | Uptime Kuma | U-13 |
| 8 | Archive account + self-test | Nextcloud, Mac mini | U-04 |
| 9 | Phase 1 acceptance | — | — |

## 1. Backups first (R-02)

Before any schema change, so there is something to roll back to.

1. **Proxmox**: Datacenter → Backup → Add. Containers 102, 104, 106, 112; daily 02:00; mode
   snapshot; retention keep-daily 30. Target storage must allow "VZDump backup file" content.
   All local storage is on the same NVMe (R-01, accepted until the dedicated NAS arrives).
2. **PostgreSQL dump** on LXC 102:
   ```bash
   install -m 755 ops/backup/pg-backup.sh ops/backup/pg-restore-test.sh /usr/local/bin/
   # Back up every existing database (Nextcloud included) before any change:
   for db in $(sudo -u postgres psql -Atc "SELECT datname FROM pg_database WHERE NOT datistemplate AND datname <> 'postgres'"); do
     sudo -u postgres DB_NAME="$db" pg-backup.sh
   done
   ```
   Then add one line per database to the postgres crontab (`crontab -u postgres -e`); for the
   pipeline database (after step 2), with the push URL from ops/monitoring/uptime-kuma.md:
   ```cron
   30 2 * * * DB_NAME=aivideo /usr/local/bin/pg-backup.sh --prune >> /var/lib/postgresql/aivideo-backup.log 2>&1 && curl -fsS -m 10 "<push-url>" >/dev/null
   ```
   `--prune` deletes this database's dumps older than 30 days (D-015). Dumps land in
   `/var/lib/postgresql/backups/<db>`, which is on the host mount `/mnt/data/db/postgres`.
3. **Check**: `sudo -u postgres DB_NAME=aivideo pg-restore-test.sh` prints `RESTORE TEST PASSED`.
   Repeat monthly and before upgrades (D-031).

## 2. PostgreSQL (LXC 102)

```bash
sudo -u postgres psql -f ops/postgres/bootstrap.sql
sudo -u postgres psql -c '\password aivideo_owner'
sudo -u postgres psql -c '\password aivideo_n8n_lxc104'
sudo -u postgres psql -c '\password aivideo_worker_mac_mini_m4'
```

Add to `pg_hba.conf` (then `systemctl reload postgresql`), replacing `<mac-mini-lan-ip>`:

```
host  aivideo  aivideo_owner               127.0.0.1/32        scram-sha-256
host  aivideo  aivideo_n8n_lxc104          192.168.1.104/32    scram-sha-256
host  aivideo  aivideo_worker_mac_mini_m4  <mac-mini-lan-ip>/32 scram-sha-256
```

Migrations and grants, from a checkout of `main` (any machine that can reach LXC 102 as owner):

```bash
read -rs PGPASSWORD && export PGPASSWORD
DATABASE_URL="postgres://aivideo_owner@192.168.1.102:5432/aivideo?sslmode=disable" \
  npx --prefix worker dbmate --migrations-dir db/migrations --no-dump-schema up
psql "postgres://aivideo_owner@192.168.1.102:5432/aivideo" -f ops/postgres/grants.sql
psql "postgres://aivideo_owner@192.168.1.102:5432/aivideo" \
  -c "INSERT INTO approver (telegram_user_id, name) VALUES (<your-telegram-user-id>, 'owner')"
```

**Check**: `SELECT * FROM stream_config;` shows three streams; `SELECT max(version) FROM schema_migrations;`
matches the newest file in `db/migrations`.

## 3. Redis (LXC 112)

Follow [redis/README.md](redis/README.md): check other users, enable AOF + `maxmemory` +
`noeviction`, create the two ACL users. Store the n8n Redis password in the n8n credential
(step 5) and the worker one in the Mac mini Keychain (step 4).

## 4. Worker (Mac mini)

1. Clone the repo to `~/ai-video-pipeline` (checkout `main`), `npm ci`.
2. `mkdir -p ~/.config/aivideo && cp ops/launchd/worker.env.example ~/.config/aivideo/worker.env && chmod 600 ~/.config/aivideo/worker.env`; set `WORK_ROOT` and the Mac's LAN-reachable hosts.
3. Keychain items (prompts for each value, nothing in history):
   ```bash
   security add-generic-password -a aivideo -s aivideo-db-password -w
   security add-generic-password -a aivideo -s aivideo-redis-password -w
   security add-generic-password -a aivideo -s aivideo-api-key-n8n -w   # new: openssl rand -hex 32
   ```
4. Install the LaunchAgent: see the header of `ops/launchd/com.aivideo.worker.plist`
   (adjust `/Users/aivideo` to the actual home directory).
5. Keep the Mac awake without `caffeinate`: `sudo pmset -a sleep 0 disksleep 0` (U-09).

**Check**: `curl http://100.71.214.125:8787/health` returns `{"status":"ok","workerId":"mac-mini-m4"}`;
`tail ~/Library/Logs/aivideo-worker.log` shows `worker ready`.

## 5. n8n (LXC 104)

1. Telegram: create a bot with @BotFather, note the chat id of your approval chat (U-11).
2. Credentials in n8n (names must match the workflow files):
   - `aivideo-postgres` (Postgres): host `192.168.1.102`, db `aivideo`, user `aivideo_n8n_lxc104`.
   - `aivideo-redis` (Redis): host `192.168.1.112`, port 6379, db `1`, user `aivideo-n8n`.
   - `aivideo-telegram` (Telegram API): bot token.
3. Import `n8n/workflows/*.json` (Workflows → Import from file). Reconnect each node to the
   credentials above if n8n shows them as missing, and replace `REPLACE_WITH_APPROVAL_CHAT_ID`.
4. Activate in this order: **WF-99 Error Handler first** (n8n 2.x only runs an error workflow
   that is active), then WF-08 Watchdog, then WF-02 Dispatcher.

**Check**: n8n → Executions shows WF-02 every 30 s and WF-08 every minute, all successful.

## 6. Network

- Merge `ops/tailscale/acl-snippet.hujson` into the tailnet policy (preview first).
- Restrict TCP 5432 (LXC 102) and 6379 (LXC 112) to `192.168.1.104` and the Mac mini (R-05).

## 7. Monitoring

Add the monitors in [monitoring/uptime-kuma.md](monitoring/uptime-kuma.md).

## 8. Archive account and self-test (Nextcloud)

1. In Nextcloud create user `aivideo-archive` (not your own account) and an app password for it.
2. On the Mac mini:
   ```bash
   read -rs ARCHIVE_WEBDAV_PASSWORD && export ARCHIVE_WEBDAV_PASSWORD
   ARCHIVE_WEBDAV_URL=http://lxc-nextcloud:8080/remote.php/dav/files/aivideo-archive/ \
   ARCHIVE_WEBDAV_USER=aivideo-archive npm --prefix worker run archive:selftest
   ```
   Expect two `PASS` lines. Store the app password in the Keychain as `aivideo-archive-password`
   for Phase 2. The self-test leaves a `selftest/` folder in Nextcloud; delete it when you like.

## 9. Phase 1 acceptance

End-to-end smoke test with the `simulate` step (no paid calls), as `aivideo_owner`:

```sql
WITH p AS (INSERT INTO project (name) VALUES ('phase-1-smoke') RETURNING id),
     b AS (INSERT INTO batch (project_id) SELECT id FROM p RETURNING id),
     v AS (SELECT * FROM video_create((SELECT id FROM b), 1, '9:16', '{"smoke":true}'))
SELECT job_create((SELECT version_id FROM v), 'simulate', 'q:light',
                  '{"durationMs":5000}'::jsonb, 'smoke-1');
```

Within a minute the job is `SUCCEEDED` (`SELECT status, output FROM job`) and
`~/work/videos/<video_id>/v1/jobs/<job_id>/simulated.txt` exists on the Mac mini.
Then tick the Phase 1 rows in `docs/roadmap.md`.
