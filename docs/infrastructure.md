# Infrastructure: known and to be surveyed

Rule: only record a value as `[CONFIRMED]` with a source (user confirmation or survey command + date).
Never put credentials in this file.

## 1. Confirmed by user (source: user, Task 0, 2026-10-23)

| Item | Value |
|---|---|
| Proxmox host | `192.168.1.111` |
| LXC 102 — database | `192.168.1.102`; PostgreSQL only for this project (D-035); mount `/mnt/data/db` |
| LXC 104 — utility/monitoring | `192.168.1.104`; runs n8n and admin/monitoring tools |
| NAS | **Interim:** LXC 106 `lxc-nextcloud` is treated as the NAS until a dedicated NAS is bought (user, 2026-10-23, D-033) |
| Worker 1 | Mac mini M4 — Remotion rendering, heavy tasks |
| Worker 2 | MacBook Pro M1 — audio, subtitles, QA, light tasks; **offline for now, not in tailnet** (D-034) |
| Network | Tailscale in use across the homelab |
| Source control | Private GitHub repositories; manual production deploys |
| Notifications/approval | Telegram Bot |
| Redis | Running on LXC 112 |
| Claude subscription | Claude Max, used by Claude Code on the Mac workers |

## 2. Survey results (read-only, 2026-10-23, via `ssh pve` + `pct exec`, and locally on the Mac mini)

| ID | Item | Observed value | Command |
|---|---|---|---|
| S-01 | Proxmox host | PVE 9.0.18, kernel 7.0.14-22-pve, 4 cores, 23 GiB RAM; **one 465.8G NVMe** holds root, all LXC/VM disks, and `/mnt/data` (300G, 126G free) | `pveversion`, `nproc`, `free -h`, `lsblk`, `pvesm status` |
| S-02 | LXC 102 `lxc-db` | Debian 12, 2 cores, 1 GiB RAM; **PostgreSQL 15.18** cluster `15/main` online, listens `0.0.0.0:5432`; **MariaDB service inactive**; data on `/mnt/data/db/{postgres,mysql}` | `pct config 102`, `psql --version`, `pg_lsclusters`, `systemctl is-active`, `ss -ltn` |
| S-03 | LXC 112 `lxc-redis` | `192.168.1.112`, Debian 12, 1 core, 1 GiB RAM, 8G disk; **Redis 7.0.15**, listens `0.0.0.0:6379`, `protected-mode yes`, `requirepass` set, **`appendonly no`**, **no `maxmemory`** set, default RDB snapshots | `pct config 112`, `redis-server --version`, `grep /etc/redis/redis.conf` |
| S-04 | LXC 104 `lxc-utils` | Ubuntu 24.04, 2 cores, 1.5 GiB RAM (~230 MiB free); Docker 29.8.1; containers: `n8n`, `portainer`, `beszel`, `uptime-kuma` | `pct config 104`, `docker ps` |
| S-05 | n8n | **2.40.5**, Docker image `n8nio/n8n` (untagged), port 5678 on all interfaces; `DB_TYPE` and `EXECUTIONS_MODE` unset → defaults **SQLite** and **regular mode** | `n8n --version`, `printenv DB_TYPE EXECUTIONS_MODE` |
| S-06 | Monitoring | Beszel and Uptime Kuma run as Docker containers on LXC 104 (versions untagged/latest) | `docker ps` |
| S-07 | LXC 103 `lxc-backup` | `192.168.1.103`, Debian 12; `smbd` active; shares `/mnt/data/smb-share` (mounted `/smb`) — **same NVMe as everything else** | `pct config 103`, `systemctl is-active smbd`, `df -h` |
| S-08 | Backups | **No Proxmox backup jobs** (`/etc/pve/jobs.cfg` empty); `/mnt/data/dump` empty; no root crontab on LXC 102 | `cat /etc/pve/jobs.cfg`, `ls /mnt/data/dump`, `crontab -l` |
| S-09 | Tailscale | Tailscale 1.102.4 on LXC 104 (`lxc-utils` 100.85.20.21); also `lxc-core` (LXC 101) and `macmini` (100.71.214.125, online). **LXC 102, 112 not in tailnet. No MacBook Pro seen in tailnet.** `--accept-routes` is false | `tailscale status` on LXC 104 |
| S-11 | LXC 106 `lxc-nextcloud` (the "NAS") | `192.168.1.106`, Ubuntu, 2 cores, 2 GiB RAM; started by user 2026-10-23, now **running, `onboot: 1`**; data `/mnt/data/nextcloud` (106G used) — **same NVMe as production** (S-01). Nextcloud serves WebDAV; the only SMB server seen is LXC 103 | `pct status 106`, `pct config 106`, `du -sh` |
| S-12 | Nextcloud on LXC 106 | **Nextcloud 29.0.16**, installed, not in maintenance; HTTP on **port 8080** (`http://192.168.1.106:8080`, no TLS); database **PostgreSQL on LXC 102** (`dbtype pgsql`), so MariaDB is unused; data dir `/var/www/html/data`. **Joined tailnet 2026-10-23** as `lxc-nextcloud` / `100.120.60.20`; from the Mac mini: direct connection (1 ms), `trusted_domains` accepts both, WebDAV `PROPFIND` → 401 (auth required, as expected) | `curl /status.php`, `grep dbtype/dbhost config.php`, `tailscale ping`, `curl -X PROPFIND /remote.php/dav/` |
| S-10 | Mac mini M4 (this machine) | macOS 27.0.1, 16 GiB RAM, **228 GiB SSD with ~31 GiB free**; Node 25.8.1, npm 11.19.0, ffmpeg 9.0.2, Claude Code 2.1.309, Tailscale 1.104.1; no SMB mounts; `sleep 0` currently because `caffeinate` is running | `sysctl`, `sw_vers`, `df -h /`, `pmset -g`, `mount` |

## 2b. Production rollout results (2026-10-24, run by the user per `ops/README.md`, verified read-only by the agent)

| ID | Item | Observed value | Command |
|---|---|---|---|
| S-13 | Proxmox backup storage | `local` (`/var/lib/vz`) allows backup content, ~76 GB free; `data` allows only images/rootdir. Only dump present: LXC 106 from 2026-03-25. **No backup job yet** (`/cluster/backup` empty) | `pvesm status`, `pvesh get /storage`, `pvesh get /cluster/backup`, `ls /var/lib/vz/dump` |
| S-14 | Bind mounts | `/mnt/data/docker-utils` holds `n8n_data`, `kuma_data`, `beszel_data`, `homarr_data`, `portainer_data`, `vaultwarden`, `infisical`; vzdump does not include bind mounts (R-12) | `ls /mnt/data/docker-utils`, `pct config <id>` |
| S-15 | PostgreSQL databases on LXC 102 | 9 databases besides `postgres` before the rollout (Nextcloud, Infisical, and other applications); all dumped 2026-10-24 to `/var/lib/postgresql/backups/<db>` with SHA-256 | `psql -Atc "SELECT datname FROM pg_database"`, `ls -lR /var/lib/postgresql/backups` |
| S-16 | Pipeline database | `aivideo` with roles from `ops/postgres/bootstrap.sql`; 5 migrations applied (latest `20261024000500`); grants verified (n8n: no DELETE on `job`, no UPDATE on `stream_config`; worker: no table access, 6 lifecycle functions; PUBLIC: no functions). `pg_hba.conf` per-database allow-list + `reject` above the LAN rule; unlisted host → `pg_hba.conf rejects connection`. Nightly dump 02:30 with Uptime Kuma push | `schema_migrations`, `has_table_privilege`, `has_function_privilege`, `pg_hba_file_rules`, `psql -w -h 192.168.1.102 -d aivideo` |
| S-17 | Redis on LXC 112 | `appendonly yes`, `maxmemory 256mb`, `noeviction`; ACL users `aivideo-n8n` and `aivideo-worker-mac-mini-m4` as in `ops/redis/acl-setup.redis`. db 0 holds another application's BullMQ queue (182 `bull:*` keys, 6.4 MB); pipeline uses db 1 | `grep redis.conf` (hashes masked), user-run `INFO keyspace`, `--scan`, `INFO memory` |
| S-18 | Worker on Mac mini | LaunchAgent `com.aivideo.worker` runs from `~/remote-dev/AIVIdeo/ai-video-pipeline` (D-039) with Node 25.8.1 from nvm; secrets in the login Keychain; `/health` OK on `100.71.214.125:8787`; registered in `worker` with heartbeats; `pmset`: `sleep 0`, `autorestart 1`, `disksleep 10` (to set to 0) | `launchctl print`, `curl /health`, `SELECT * FROM worker`, `pmset -g` |
| S-19 | n8n | Credentials `aivideo-postgres`, `aivideo-redis` (db 1), `aivideo-telegram`; WF-99, WF-08, WF-02 active; scheduled runs successful (WF-02 every 30 s) | n8n event log `n8nEventLog.log`, `pg_stat_activity` |
| S-20 | Monitoring | Uptime Kuma (LXC 104, container `uptime-kuma`) monitors n8n, Postgres, Redis, worker `/health`, Nextcloud, backup push; Telegram notification; all targets reachable from the container | `docker exec uptime-kuma curl ...` |
| S-21 | Archive | Nextcloud user `aivideo-archive` with app password (Keychain `aivideo-archive-password`); `archive:selftest` passed both checks (user-reported) | `npm --prefix worker run archive:selftest` |
| S-23 | Claude Code CLI on the Mac mini | 2.1.310 at `~/.local/bin/claude` (symlink to `~/.local/share/claude/versions/`), not on launchd's PATH → `CLAUDE_BIN` in `worker.env`; headless flags `--json-schema`, `--tools`, `--strict-mcp-config`, `--setting-sources`, `--no-session-persistence` present; `--bare` refuses OAuth (Max) logins, so it is not used | `claude --version`, `claude --help` (2026-10-25) |
| S-24 | ITERA TTS public API docs (D-040) | Base `https://api.genmax.io` (`{{BASE_URL}}` in the docs), header `xi-api-key`. **Async:** `POST /v1/text-to-speech/{voice_id}` → `202 {id, status:"pending"}`; poll `GET /v1/history/{id}` → `status` pending/processing/completed/failed, `progress`, `result.audio_url` (MP3), `error`, `characters_used`, `credits_deducted`. Body: `text`, `language_code` (required; `vi` for ElevenLabs/CapCut, `Vietnamese` for MiniMax), `provider` `elevenlabs` (default) / `minimax` / `capcut`, `model_id`, `voice_settings` (speed etc.), `export_transcript` (SRT, ~+15% credits; where the SRT is returned is not documented). `POST /v1/history/{id}/retry` **re-deducts credits** (never used automatically). `GET /v1/models?provider=` (ElevenLabs `max_characters_request` 10000, `character_cost_multiplier`; MiniMax/CapCut `credit_ratio`), `GET /v1/languages?provider=`, voice lists per provider (CapCut filter `language=vi`), `GET /v1/auth/me` → `credit_balance`; voices `GET /v1/default-voices`, `GET /v1/shared-voices?required_languages=vi`. STT `POST /v1/speech-to-text` (async, multipart, `language_code` `vi`, word timestamps `words[].start/end`, optional SRT, charged by audio duration, refunded on failure). Not documented: credit price in money, rate limits / 429 behaviour, commercial-use terms | Docs SPA bundle `itera102.space/docs` (`assets/PublicAPIDocs-*.js` → per-endpoint YAML chunks), 2026-10-25 |
| S-22 | Phase 1 smoke test | Job `simulate` went PENDING → READY → QUEUED (dispatcher) → RUNNING → SUCCEEDED (mac-mini-m4); output SHA-256 matches the file on disk | `audit_log`, `job_attempt`, `shasum -a 256` |

## 3. Risks found by the survey

| ID | Risk | Impact | Proposed action (needs approval) |
|---|---|---|---|
| R-01 | **Confirmed:** the "NAS" (LXC 106 Nextcloud) and the SMB share (LXC 103) are on the **same single NVMe** as production. Archive and backups share one point of failure with the data they protect | Violates D-014/D-015 intent; one disk failure loses data + archive + backups | **Accepted temporarily (D-033)** until the dedicated NAS is bought; then migrate archive + backups to it |
| R-09 | ~~LXC 106 stopped, `onboot: 0`~~ — **resolved 2026-10-23** (running, `onboot: 1`) | — | — |
| R-10 | ~~Nextcloud is WebDAV, not SMB~~ — **resolved**: archive uses WebDAV (D-036) | — | — |
| R-11 | Nextcloud WebDAV is plain HTTP (`:8080`, no TLS) | **Mitigated 2026-10-23**: pipeline uses the tailnet address, encrypted by WireGuard (D-036). LAN `192.168.1.106:8080` and the public domain remain open for other clients | Restrict tailnet ACL so only `macmini` reaches `lxc-nextcloud:8080` (U-08) |
| R-02 | **No backups found** for LXC 102/104/112 or Postgres | Data loss risk today, independent of this project | **Partly resolved 2026-10-24**: all Postgres databases dumped, `aivideo` nightly with restore test. Open: Proxmox backup job (`ops/README.md` §1.1) |
| R-03 | ~~Redis has no AOF and no `maxmemory`~~ — **resolved 2026-10-24** (S-17) | — | — |
| R-04 | n8n uses **SQLite**, regular mode, in an LXC with ~230 MiB free RAM | Limited webhook/cron concurrency; harder backup | Benchmark first; consider Postgres backend for n8n (Q-013) and more LXC RAM |
| R-05 | Postgres and Redis listen on all interfaces of the LAN and are **not in the tailnet** | Pipeline traffic to them is plain LAN traffic | **Mitigated 2026-10-24**: per-client access instead of a port firewall, because other applications share both servers (D-037, D-038). Residual: any LAN host can attempt to authenticate |
| R-12 | vzdump does not back up bind mounts (S-14): Postgres data, Docker app data on LXC 104 (n8n, Vaultwarden, Infisical, …), Nextcloud data | A restored container comes back without its data | Postgres covered by `pg-backup.sh`; n8n by `export:*`; file-level backup of `/mnt/data/docker-utils` and `/mnt/data/nextcloud` still open (target: dedicated NAS, R-01) |
| R-13 | The worker LaunchAgent and the login Keychain need a console login | After a reboot or power cut the worker stays down until someone logs in at the Mac; Uptime Kuma alerts | Accepted for now. Auto-login conflicts with FileVault; revisit if unattended restarts matter |
| R-14 | n8n's Redis credential defaults to db 0; the worker reads db 1 | Jobs stay `QUEUED` silently (happened once on 2026-10-24; fixed by setting db 1) | Runbook warning (`ops/README.md` §5); Phase 2: alert on jobs `QUEUED` longer than a threshold |
| R-06 | Mac mini has **~31 GiB free** | Working area + 30-day retention may not fit | Measure per-video size in Phase 2; set disk-usage alert threshold |
| R-07 | MacBook Pro M1 offline / not in tailnet (D-034) | Single worker: no redundancy; render and light jobs compete on the Mac mini | Accepted for now; concurrency limits set for one machine; join M1 later (U-17) |
| R-08 | MariaDB is installed (data dir `/mnt/data/db/mysql`) but inactive; not used by the project (D-035); Nextcloud also uses PostgreSQL (S-12), so nothing depends on MariaDB | None for the pipeline | Optional cleanup: uninstall + remove data only after user approval and a backup |

## 4. Still unknown [UNKNOWN]

| # | Item | Notes |
|---|---|---|
| U-18 | How the Nextcloud public domain is exposed (Cloudflare Tunnel, port forward + reverse proxy, other) | Internet exposure of the archive account |
| U-05 | How Macs will mount the archive share, mount path | |
| U-07 | Remotion + headless Chrome on Mac mini; MacBook Pro M1 tools when it joins | Remotion is per-project (installed with the repo) |
| U-08 | Tailscale ACL policy content; confirm only `macmini` can reach `lxc-nextcloud:8080` | Admin console |
| U-19 | A client on LXC 101 `lxc-core` (192.168.1.101) connected to `aivideo` as `aivideo_owner` on 2026-10-24 (looks like a DB GUI). New connections from it are now rejected by `pg_hba.conf` | User to identify; add an owner line for it only if it is an admin tool |
| U-10 | Any backup outside Proxmox (e.g. external tool, HAOS) | S-08 found none on the host |
| U-12 | ~~n8n webhook reachable from workers~~ — not needed: workers report via PostgreSQL (P-015) | |
| U-14 | Max plan headless usage limits and terms for automation | Terms confirmed by the user (D-042); usage per video measured from the worker's `script written` log |
| U-20 | ITERA TTS (D-040): money price per credit, rate limits / concurrency, where `export_transcript` returns the SRT, commercial-use and data-retention terms, chosen provider/model/voice for Vietnamese | API surface documented in S-24 (2026-10-25). Price and voice needed before slice 2b goes live; rate limits measured in the first runs |
| U-21 | Public HTTPS URL of n8n (`WEBHOOK_URL`) for the Telegram Trigger (WF-06) and the brief form (WF-01) | Telegram can only deliver button presses to a public HTTPS webhook |
| U-15 | Canonical timezone for reports/retention | |
| U-17 | MacBook Pro M1: tailnet name, macOS, RAM, free SSD, tools | Deferred until it joins (D-034) |

Resolved by survey: U-01 (S-04, S-05), U-02 (S-02), U-06 for Mac mini (S-10), U-16 (S-06).
Resolved by the rollout (2026-10-24): U-03 (S-17), U-04 (S-21), U-09 (S-18), U-11 (bot + approval chat created; ids kept out of Git), U-13 (S-20), database list (S-15).

## 5. Survey commands (read-only)

Run only with user permission; record results in section 2 with the date. Do not change configuration.
Never print env files, `docker inspect` output, or config lines containing passwords.

```bash
# From workstation
ssh pve 'pveversion; pct list; pvesm status; lsblk; cat /etc/pve/jobs.cfg'
ssh pve 'pct config <id>'
ssh pve 'pct exec 104 -- docker ps --format "{{.Names}} {{.Image}} {{.Status}}"'
ssh pve 'pct exec 104 -- docker exec n8n n8n --version'
ssh pve 'pct exec 102 -- pg_lsclusters'
ssh pve 'pct exec 112 -- grep -E "^(bind|port|appendonly|maxmemory|maxmemory-policy) " /etc/redis/redis.conf'
# Mac workers
sw_vers; sysctl hw.memsize; df -h /; node -v; ffmpeg -version | head -1
mount | grep -i smb; tailscale status; pmset -g | grep -E 'sleep|disksleep'
```

## 6. Proposed placement [PROPOSED]

| Service | Proposal | Reason |
|---|---|---|
| Redis | Existing LXC 112; dedicated ACL user + DB index for the pipeline; `appendonly yes` (`everysec`), `maxmemory` + `noeviction` | Fixes R-03; `noeviction` avoids losing messages |
| Pipeline database | Dedicated database + role `aivideo` on PostgreSQL 15, LXC 102 | Isolate from other data |
| Worker service | launchd service on each Mac | Auto-restart after reboot |
| Working dir | Mac mini internal SSD; size budget after R-06 measurement | See `docs/storage-and-manifest.md` |
| Archive/backup target | Interim: Nextcloud WebDAV on LXC 106 (D-036, S-21); dedicated NAS pending (R-01) | Must not share the Proxmox NVMe |
