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
| S-11 | LXC 106 `lxc-nextcloud` (the "NAS") | `192.168.1.106`, Ubuntu, 2 cores, 2 GiB RAM; **status stopped, `onboot: 0`**; data `/mnt/data/nextcloud` (106G used) — **same NVMe as production** (S-01). Nextcloud serves WebDAV; the only SMB server seen is LXC 103 | `pct status 106`, `pct config 106`, `du -sh` |
| S-10 | Mac mini M4 (this machine) | macOS 27.0.1, 16 GiB RAM, **228 GiB SSD with ~31 GiB free**; Node 25.8.1, npm 11.19.0, ffmpeg 9.0.2, Claude Code 2.1.309, Tailscale 1.104.1; no SMB mounts; `sleep 0` currently because `caffeinate` is running | `sysctl`, `sw_vers`, `df -h /`, `pmset -g`, `mount` |

## 3. Risks found by the survey

| ID | Risk | Impact | Proposed action (needs approval) |
|---|---|---|---|
| R-01 | **Confirmed:** the "NAS" (LXC 106 Nextcloud) and the SMB share (LXC 103) are on the **same single NVMe** as production. Archive and backups share one point of failure with the data they protect | Violates D-014/D-015 intent; one disk failure loses data + archive + backups | **Accepted temporarily (D-033)** until the dedicated NAS is bought; then migrate archive + backups to it |
| R-09 | LXC 106 is **stopped** with `onboot: 0` | Archive target unavailable; jobs would fail | Decide whether to run LXC 106, or archive via LXC 103 SMB |
| R-10 | Nextcloud is WebDAV, not SMB; SMB is served by LXC 103 | Archive protocol in docs (SMB) may not match | Decide archive path: SMB on LXC 103, or Nextcloud WebDAV/external storage |
| R-02 | **No backups found** for LXC 102/104/112 or Postgres | Data loss risk today, independent of this project | Create vzdump job + `pg_dump` to a separate device; run restore test (Phase 1) |
| R-03 | Redis has **no AOF and no `maxmemory`** | Conflicts with D-002 (persistence + resource limits) | Enable `appendonly yes`, set `maxmemory` + `noeviction` after checking other Redis users (U-03) |
| R-04 | n8n uses **SQLite**, regular mode, in an LXC with ~230 MiB free RAM | Limited webhook/cron concurrency; harder backup | Benchmark first; consider Postgres backend for n8n (Q-013) and more LXC RAM |
| R-05 | Postgres and Redis listen on all interfaces of the LAN and are **not in the tailnet** | Worker → Redis traffic would go over LAN, not Tailscale ACL as designed in `docs/security.md` | Decide: add LXC 112 to tailnet, or restrict by LAN firewall to known worker IPs |
| R-06 | Mac mini has **~31 GiB free** | Working area + 30-day retention may not fit | Measure per-video size in Phase 2; set disk-usage alert threshold |
| R-07 | MacBook Pro M1 offline / not in tailnet (D-034) | Single worker: no redundancy; render and light jobs compete on the Mac mini | Accepted for now; concurrency limits set for one machine; join M1 later (U-17) |
| R-08 | MariaDB is installed (data dir `/mnt/data/db/mysql`) but inactive; not used by the project (D-035) | None for the pipeline | Optional cleanup: uninstall + remove data only after user approval and a backup |

## 4. Still unknown [UNKNOWN]

| # | Item | Notes |
|---|---|---|
| U-03 | Redis: who else uses it, used memory, DB indexes in use | Needs authenticated `INFO`; not read to avoid handling the password |
| U-04 | Archive share and path (LXC 103 SMB or LXC 106 Nextcloud); free space is shared with `/mnt/data` (126G free) | See R-01, R-09, R-10 |
| U-05 | How Macs will mount the archive share, mount path | |
| U-07 | Remotion + headless Chrome on Mac mini; MacBook Pro M1 tools when it joins | Remotion is per-project (installed with the repo) |
| U-08 | Tailscale ACL policy content | Admin console |
| U-09 | Mac mini sleep setting without `caffeinate` | Only worker, must stay awake |
| U-10 | Any backup outside Proxmox (e.g. external tool, HAOS) | S-08 found none on the host |
| U-11 | Telegram bot, approval chat | |
| U-12 | n8n webhook URL reachable from workers (LAN `192.168.1.104:5678` or tailnet `100.85.20.21:5678`), reverse proxy, TLS | |
| U-13 | What Uptime Kuma/Beszel monitor today, alert channels | |
| U-14 | Max plan headless usage limits and terms for automation | |
| U-15 | Canonical timezone for reports/retention | |
| U-17 | MacBook Pro M1: tailnet name, macOS, RAM, free SSD, tools | Deferred until it joins (D-034) |
| — | PostgreSQL database/role list on LXC 102 | Query blocked by the agent's permission policy; user may run `\l` and `\du` |

Resolved by survey: U-01 (S-04, S-05), U-02 (S-02), U-06 for Mac mini (S-10), U-16 (S-06).

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
| Archive/backup target | Pending U-04 / R-01 | Must not share the Proxmox NVMe |
