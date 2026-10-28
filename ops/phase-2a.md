# Phase 2a rollout: brief → script → Telegram approval (A1)

Run by the user, in order, after the Phase 2a PR is merged (CLAUDE.md §3). Conventions as in
[README.md](README.md): secrets only where noted, paste-safe commands, a check after each step.

What it adds: migration `20261025000100_script_flow.sql`, the worker `script` step (headless Claude
Code), workflows WF-01 Intake, WF-05 Script Approval Request, WF-06 Telegram Callback, and a change
to WF-08 (provider-blocked alerts).

## 0. Prerequisite: n8n on public HTTPS (U-21)

Telegram delivers button presses only to a public HTTPS webhook, and the brief form is opened from
your browser. In LXC 104: `docker exec n8n printenv WEBHOOK_URL` must print an `https://` URL that
reaches n8n from the internet (for example through the Cloudflare Tunnel that serves Uptime Kuma).
If it prints nothing, set `WEBHOOK_URL` in the n8n container environment first and restart n8n.
Without it WF-06 cannot be activated.

## 1. Backup, then migrate (Mac, repo on an up-to-date `main`)

```bash
ssh lxc-db
su postgres -s /bin/sh -c 'DB_NAME=aivideo /usr/local/bin/pg-backup.sh'
exit
```

```bash
cd ~/aivideo/repo && git checkout main && git pull && npm ci
read -rs PGPASSWORD && export PGPASSWORD                       # owner password
export DATABASE_URL="postgres://aivideo_owner@192.168.1.102:5432/aivideo?sslmode=disable"
npx dbmate --migrations-dir db/migrations --no-dump-schema up
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f ops/postgres/grants.sql
psql "$DATABASE_URL" -c "SELECT max(version) FROM schema_migrations;"   # 20261025000100
unset PGPASSWORD DATABASE_URL
```

## 2. Worker (Mac mini)

1. Add the Claude Code settings to `~/aivideo/config/worker.env` (see
   `ops/launchd/worker.env.example`):
   ```bash
   printf 'CLAUDE_BIN=%s\nCLAUDE_TIMEOUT_SECONDS=600\nCLAUDE_BLOCK_SECONDS=3600\n' "$(which claude)" >> ~/aivideo/config/worker.env
   ```
2. Give the worker its own long-lived Claude Code token (D-046). The interactive login cannot be
   refreshed by the worker while the login Keychain is locked. On the Mac (a browser opens, or a URL
   is printed to open elsewhere):
   ```bash
   claude setup-token                      # prints a token starting with sk-ant-oat01-
   security unlock-keychain ~/Library/Keychains/login.keychain-db    # only over SSH
   security add-generic-password -a aivideo -s aivideo-claude-oauth-token -w
   ```
   Paste the token at the two `security` prompts (it is not echoed); never into chat or files.
   Check it works headless (one tiny request on the Max plan):
   ```bash
   security find-generic-password -a aivideo -s aivideo-claude-oauth-token -w >/dev/null && echo stored
   CLAUDE_CODE_OAUTH_TOKEN="$(security find-generic-password -a aivideo -s aivideo-claude-oauth-token -w)" \
     claude -p --tools "" "Reply with OK"    # → OK
   ```
3. Restart: `launchctl kickstart -k gui/$(id -u)/com.aivideo.worker`; the log shows `worker ready`.

## 3. n8n (LXC 104)

1. Credential **`aivideo-form-auth`** (type Basic Auth): user `aivideo`, password from
   `openssl rand -hex 16`, saved in the password manager. It protects the brief form.
2. Import into **new** workflows (Create Workflow → ⋯ → Import from File → Save):
   `wf-01-intake.json`, `wf-05-script-approval.json`, `wf-06-telegram-callback.json`. Reconnect
   credentials if shown as missing; replace `REPLACE_WITH_APPROVAL_CHAT_ID` in WF-01 and WF-05.
3. Update **WF-08**: open the existing WF-08, deactivate, ⋯ → Import from File →
   `wf-08-watchdog.json` (replaces its content), set the chat id again, save, activate.
4. Activate **WF-06** (registers the bot's Telegram webhook), then **WF-05**, then **WF-01**.

**Check**: the WF-01 form opens at `<WEBHOOK_URL>/form/aivideo-brief` and asks for the basic-auth login.

## 4. Smoke test

1. Submit the form: topic in Vietnamese (e.g. `Vì sao bầu trời có màu xanh?`), duration `30`.
   Telegram: `New video submitted … scripting`.
2. Within ~1–3 minutes (dispatch every 30 s, then Claude Code): `Script ready for approval (A1)` with
   the title, scene list and three buttons. Worker log: `script written` with the Claude usage
   (record it for Q-004).
3. Press **Regenerate** → the message is closed with `Regenerating as v2`, and a new A1 message for
   v2 arrives. Press **Approve** on it → `Decision: Approved`.
4. Database (Mac, owner): the video's version 2 is `GENERATING_ASSETS`, version 1 `SUPERSEDED`:
   ```bash
   psql "postgres://aivideo_owner@192.168.1.102:5432/aivideo" -c "SELECT v.id, vv.version, vv.status FROM video_version vv JOIN video v ON v.id = vv.video_id ORDER BY vv.created_at DESC LIMIT 4;"
   ```
   It stays there until slice 2b adds the TTS step.
5. Optional: press a button from another Telegram account → `You are not an approver.`, nothing changes.

## Rollback

Deactivate WF-01, WF-05, WF-06; re-import the previous `wf-08-watchdog.json` from Git. Database:
`npx dbmate --migrations-dir db/migrations --no-dump-schema rollback` (as owner) reverts only this
migration; it drops `batch.submission_id`, so restore from the step 1 dump if intake data matters.
Worker: check out the previous `main` commit and kickstart.

## Known limits of 2a

- A1 shows no cost estimate yet (needs TTS pricing, slice 2b).
- "Revise with a note" is not implemented; Regenerate reruns the same brief.
- If the Telegram send in WF-05 fails after the approval was created, the 6-hour reminder resends it.
