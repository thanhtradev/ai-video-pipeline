# Web console rollout (D-103)

Run by the user after this PR is merged. Conventions as in [README.md](README.md). **Free.**
Claude Code runs none of this (CLAUDE.md §3).

What it adds: a page showing what needs you, every video with its steps, workers and the report. It
is read-only in this PR: approvals and other actions stay on Telegram. Send `/web` to the bot in a
private chat, open the link on a device on the tailnet, and press Sign in.

Data: migration `20261127000100`. It changes no existing table. `/deploy` refuses to run until this
migration is applied, like any other (D-100), and it does not update the console.

## 1. Check room on LXC 104

```bash
ssh lxc-utils 'free -m'
```

The container is limited to 128 MiB. Go on only if at least 200 MiB is available (survey S-04 saw
about 1.4 GiB on 2026-10-29).

## 2. Create the database role

As the `postgres` superuser on LXC 102. **This must come before step 3**, because `grants.sql` now
names `aivideo_web` and fails without it.

```sql
CREATE ROLE aivideo_web NOLOGIN;
CREATE ROLE aivideo_web_lxc104 LOGIN IN ROLE aivideo_web;
GRANT CONNECT ON DATABASE aivideo TO aivideo_web;
\password aivideo_web_lxc104
```

Keep the password for step 5. Add this line to `pg_hba.conf`, next to the one for
`aivideo_n8n_lxc104`, using the same address and method as that line, then reload:

```
host  aivideo  aivideo_web_lxc104  <same address as aivideo_n8n_lxc104>  scram-sha-256
```

## 3. Back up, migrate, grant

As in [README.md](README.md) §1 and §2: back up, then run the migration, then
`psql "$OWNER_URL" -f ops/postgres/grants.sql`.

## 4. Turn on HTTPS on the tailnet

`[UNKNOWN]`: whether HTTPS certificates are enabled for this tailnet. In the admin console, DNS page,
enable MagicDNS and HTTPS Certificates if they are off. Then on LXC 104:

```bash
tailscale serve --bg --https=443 http://127.0.0.1:8790
tailscale serve status
```

The name it prints, `https://lxc-utils.<tailnet>.ts.net`, is the console's address. Record it in
`docs/infrastructure.md`. Do not use `tailscale funnel`: that would put the console on the internet.

## 5. Start the container

On LXC 104, in a clone of the repo at `main`:

```bash
cp ops/web/web.env.example ops/web/web.env
chmod 600 ops/web/web.env
# fill in the password from step 2 and the address from step 4
docker compose -f ops/web/compose.yml up -d --build
docker logs aivideo-web --tail 20
curl -s http://127.0.0.1:8790/health
```

Expect `{"status":"ok"}`. Add `https://lxc-utils.<tailnet>.ts.net/health` to Uptime Kuma, not this
address: Kuma runs in its own container, where `127.0.0.1` is Kuma itself.

## 6. Publish WF-06 with the address

In `ops/n8n/deploy.env`, set `WEB_CONSOLE_URL=https://lxc-utils.<tailnet>.ts.net`, then run
`ops/n8n/deploy-workflows.sh` as usual (or `/deploy`, which needs that value in its own `deploy.env`).
Without it `/web` answers that the console is not set up.

## 7. Tailscale policy

`[UNKNOWN]` U-08: if the policy is not allow-all, add each device that opens the console, using
`lxc-utils:443` as the destination. Each approver needs Tailscale on that device.

## 8. Check it

1. Send `/web` in the approval group: it refuses and sends no link.
2. Send `/web` in a private chat, open the link, press Sign in.
3. Compare the overview with `/status` and `/workers` on Telegram: same videos and states.
4. Open the same link again: it says the link was used.
5. Press Sign out, then reload: it asks you to sign in.
6. After a page load, confirm no approval request was re-posted on Telegram.

## Updating

```bash
git pull && docker compose -f ops/web/compose.yml up -d --build
```

## Rollback

```bash
docker compose -f ops/web/compose.yml down
tailscale serve --https=443 off
```

Then roll WF-06 back. The migration's down section drops the functions and both tables, which ends
every session; nothing else depends on them.
