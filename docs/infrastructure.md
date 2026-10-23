# Infrastructure: known and to be surveyed

Rule: only record a value as `[CONFIRMED]` with a source (user confirmation or survey command + date).
Never put credentials in this file.

## 1. Confirmed (source: user, Task 0, 2026-10-23)

| Item | Value |
|---|---|
| Proxmox host | `192.168.1.111` |
| LXC 102 — database | `192.168.1.102`; runs PostgreSQL and MariaDB; mount `/mnt/data/db` |
| LXC 104 — utility/monitoring | `192.168.1.104`; runs n8n and admin/monitoring tools |
| Monitoring | Beszel and Uptime Kuma are in use (specific host: U-16) |
| NAS | Exists; archive accessed via SMB |
| Worker 1 | Mac mini M4 — Remotion rendering, heavy tasks |
| Worker 2 | MacBook Pro M1 — audio, subtitles, QA, light tasks |
| Network | Tailscale in use across the homelab |
| Source control | Private GitHub repositories; manual production deploys |
| Notifications/approval | Telegram Bot |
| Redis | Already running on **LXC 112** (source: user, 2026-10-23); IP/version/config: U-03 |
| Claude subscription | Claude Max, used by Claude Code on the Mac workers (source: user, 2026-10-23) |

## 2. To be surveyed [UNKNOWN]

| # | Item | Notes |
|---|---|---|
| U-01 | n8n version, run mode (Docker/npm), queue mode on/off, n8n DB backend | Affects webhooks, concurrency |
| U-02 | PostgreSQL version, LXC 102 resources (CPU/RAM/disk), free space on `/mnt/data/db` | |
| U-03 | Redis on LXC 112: IP, version, persistence (AOF/RDB), `maxmemory`, auth, what else uses it | Shared use affects eviction policy |
| U-04 | NAS address, share name, archive path, SMB version, free space | |
| U-05 | How Macs mount the NAS (Finder/`mount_smbfs`/autofs), actual mount path | |
| U-06 | macOS version, RAM, free SSD space on each Mac | |
| U-07 | Node.js, ffmpeg, Remotion, headless Chrome on each Mac | |
| U-08 | Tailscale: machine names/tailnet IPs, current ACL, are LXC 102/104 in the tailnet | |
| U-09 | Are the Macs always on / no sleep; does the MacBook often leave the network | Affects lease/heartbeat |
| U-10 | Existing backups for LXC 102/104 (Proxmox Backup Server? vzdump?) and schedule | |
| U-11 | Telegram: bot created yet, chat/group for approvals, who may approve | |
| U-12 | Can n8n receive worker webhooks over Tailscale (internal URL, reverse proxy) | |
| U-13 | Uptime Kuma/Beszel: what is monitored, alert channels | |
| U-14 | Which Mac has Claude Code CLI; Max plan headless usage limits and terms for automation | |
| U-15 | Canonical timezone for reports/retention | |
| U-16 | Which host runs Beszel/Uptime Kuma, versions | |

## 3. Suggested survey commands (read-only)

Run only with user permission; record results in section 1 with the date. Do not change configuration.

```bash
# LXC 104
n8n --version || docker ps --format '{{.Image}} {{.Names}}'
# LXC 102
psql --version; df -h /mnt/data/db; free -h; nproc
redis-server --version; redis-cli INFO persistence | head; redis-cli CONFIG GET maxmemory
# Mac workers
sw_vers; sysctl hw.memsize; df -h ~; node -v; ffmpeg -version | head -1
mount | grep -i smb; tailscale status; pmset -g | grep -E 'sleep|disksleep'
```

## 4. Proposed placement [PROPOSED]

| Service | Proposal | Reason |
|---|---|---|
| Redis | Use existing LXC 112; dedicated DB index/ACL user for the pipeline; AOF `everysec`, `maxmemory` + `noeviction` if not shared with caches | `noeviction` avoids losing messages — confirm against U-03 |
| Pipeline database | Dedicated database + role on PostgreSQL LXC 102 (`aivideo`) | Isolate from other data |
| Worker service | launchd service on each Mac, bound to the Tailscale interface | Auto-restart after reboot |
| Working dir | Internal Mac SSD, exact path pending U-06 | See `docs/storage-and-manifest.md` |
