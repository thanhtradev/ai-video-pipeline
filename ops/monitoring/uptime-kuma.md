# Uptime Kuma monitors

Uptime Kuma runs on LXC 104 (S-06). Add these monitors and route alerts to the Telegram
notification used for the pipeline (U-11, U-13).

| Monitor | Type | Target | Interval | Notes |
|---|---|---|---|---|
| n8n | HTTP(s) | `http://192.168.1.104:5678/healthz` | 60s | n8n built-in health endpoint |
| PostgreSQL | TCP port | `192.168.1.102:5432` | 60s | |
| Redis | TCP port | `192.168.1.112:6379` | 60s | |
| Worker mac-mini-m4 | HTTP(s) - keyword | `http://100.71.214.125:8787/health`, keyword `"status":"ok"` | 60s | Tailscale address; needs the ACL rule `lxc-utils -> macmini:8787` |
| Nextcloud (interim NAS) | HTTP(s) - keyword | `http://100.120.60.20:8080/status.php`, keyword `"maintenance":false` | 300s | |
| Backup freshness | Push | push URL called at the end of `pg-backup.sh` cron line | 26h heartbeat | Alerts if the nightly backup did not run |

For the backup push monitor, append the push call to the cron line so it only fires on success:

```cron
30 2 * * * DB_NAME=aivideo /usr/local/bin/pg-backup.sh --prune >> /var/lib/postgresql/aivideo-backup.log 2>&1 && curl -fsS -m 10 "<uptime-kuma-push-url>" >/dev/null
```

The push URL contains a token: keep it in the crontab on LXC 102 only, never in Git.
Test it once without waiting for 02:30:
`su postgres -s /bin/sh -c 'DB_NAME=aivideo /usr/local/bin/pg-backup.sh' && curl -fsS -m 10 "<push-url>" >/dev/null`.

All targets above were reachable from inside the `uptime-kuma` container on 2026-10-24, including the
worker over Tailscale. Alert test: `launchctl kill TERM gui/$(id -u)/com.aivideo.worker` (a clean
exit, so launchd does not restart it), wait for the alert, then `launchctl kickstart gui/$(id -u)/com.aivideo.worker`.
