# Security: credentials, worker authentication, agent permissions, privacy

## 1. Secrets [CONFIRMED requirement / PROPOSED approach]

- No secrets in Git, prompts, logs, manifests, Telegram messages, or docs. `[CONFIRMED]`
- n8n: use the n8n Credentials store for Telegram, Postgres, Redis, provider APIs. `[PROPOSED]`
- Mac workers: secrets in an env file outside the repo (mode `600`, owned by the service user) or macOS Keychain. The repo only has a value-free `.env.example`. `[PROPOSED]`
- ITERA TTS API key: Keychain item `aivideo-itera-api-key` on the worker, exported only into the worker process by `run-worker.sh`; sent only to the API origin; never logged (2b). `[IMPLEMENTED]`
- Nextcloud archive access: dedicated Nextcloud user with an app password, limited to the archive folder; stored in macOS Keychain on the worker (D-036). `[CONFIRMED]` approach
- Each component has its own credential (dedicated DB role for n8n; one HMAC key per worker). No shared superuser. `[PROPOSED]`
- Logs: redact `Authorization` headers, query params containing keys, provider payloads containing tokens. `[PROPOSED]`
- Rotation: documented procedure to rotate HMAC keys/bot token; rotate immediately on suspected leak. `[PROPOSED]`

## 2. Network [PROPOSED]

- The worker API listens on the Tailscale interface only (`API_HOST`).
- Tailscale ACL (`ops/tailscale/acl-snippet.hujson`): Mac mini → Nextcloud WebDAV; LXC 104 → worker API.
- Postgres and Redis are reached over the LAN with per-client credentials and are shared with other
  applications, so access is limited per client rather than by port firewall `[CONFIRMED 2026-10-24]`:
  Postgres by a per-database `pg_hba.conf` allow-list ending in `reject` (D-038); Redis by ACL users
  limited to `q:*`/`nonce:*` (D-037).
- Current ACL state: default allow-all assumed, not narrowed yet `[UNKNOWN]` (U-08).

## 3. Authentication [IMPLEMENTED in Phase 1]

- **PostgreSQL** (`ops/postgres/`): one login role per client. The worker role can execute only the five lifecycle functions; n8n can read, insert and update but never delete; `PUBLIC` has no function access. Covered by `worker/test/db/grants.test.ts`.
- **Redis** (`ops/redis/acl-setup.redis`): n8n may only `RPUSH`; the worker may only move/remove queue messages and set nonces. Covered by `worker/test/integration/redis-acl.test.ts`.
- **Worker API** (n8n → worker) uses request signing:

```
X-Client-Id: n8n
X-Timestamp: <unix seconds>
X-Nonce: <uuid>
X-Signature: hex(HMAC-SHA256(key_of(client_id), method + "\n" + path + "\n" + timestamp + "\n" + nonce + "\n" + sha256(body)))
```

- Reject if clock skew > 300s, unknown client, bad signature (constant-time compare), or nonce already used (Redis, 10-minute TTL; claimed only after the signature checks out). Covered by `worker/test/unit/hmac.test.ts`.
- A worker may only report on jobs it has claimed (`job.claimed_by`, enforced in SQL), and only under its own id: `assert_worker_identity` requires login role `aivideo_worker_<worker_id with - as _>`, so a leaked credential cannot act for another worker (D-010).

## 4. Workspace isolation [PROPOSED]

- Each job runs in its own directory: `<WORK_ROOT>/videos/{video_id}/v{n}/jobs/{job_id}/`.
- Worker validates every path (no `..`, no symlinks escaping `WORK_ROOT`).
- Service runs as a dedicated non-admin macOS user.
- Input from providers/external URLs is untrusted data: check MIME/size, never execute.

## 5. Claude Code CLI permissions [CONFIRMED requirement / PROPOSED approach]

`[CONFIRMED]`: Claude Code never deploys to production or edits production workflows directly; code changes go through branch/PR, tests, and review.

**Implemented (2a)** for text steps (`worker/src/claude/claude-cli.ts`): `claude -p` with `--tools ""`
(no tools), `--strict-mcp-config` (no MCP servers), `--setting-sources project`, the pipeline deny-list
`ops/claude/pipeline-settings.json`, `--no-session-persistence`, a JSON schema, a timeout, and a child
environment of only `PATH`, `HOME`, `USER`, `LOGNAME`, `TMPDIR`, `LANG` (no worker secrets). It uses the
Claude Code login of the macOS user running the worker (D-039); no `--fallback-model` is ever passed.

`[PROPOSED]` when Claude Code runs inside the pipeline (headless):
- `cwd` = job workspace; read/write only inside it.
- Claude Code `permissions` config: deny `Bash(ssh:*)`, `Bash(scp:*)`, `Bash(rm:*)`, `Bash(curl:*)` to internal hosts, `Bash(git push:*)`, reading `.env*` files; allow the minimum for Node/Remotion builds.
- No secrets in prompts; if a task needs an API call, the worker makes it, not the agent.
- No write access to the NAS archive and no read access to Postgres.
- Time and turn limits; store a (redacted) transcript in the workspace.
- Claude Code is the pipeline's only LLM (D-019). Text-only steps (script, storyboard, metadata) run with tools disabled in an empty workspace; code steps (Remotion) may only build/render inside the job workspace.
- Worker login uses a long-lived Claude Code token stored in macOS Keychain, never in Git or env files committed anywhere.
- The subscription does not cover TTS or other APIs. Terms/limits of automated headless use: `[UNKNOWN]` (U-14, Q-004).

## 6. Telegram [PROPOSED]

- Accept callbacks only from an allow-list of Telegram user ids (configured outside Git). Currently only the owner; more can be added (D-029).
- `callback_data` (64-byte limit) holds only a short random token referencing an `approval` record; no sensitive data.
- Messages contain no secrets or sensitive internal paths.

## 7. Privacy and content

- Briefs and content may be sent to external providers — the user must know which provider receives which data (recorded in the provider registry).
- Assets with unclear usage rights: `license_status = UNVERIFIED` → user decides. Storing a source URL does **not** mean rights are verified. `[CONFIRMED]`
- Do not use real people's voices/likeness without clear rights. `[PROPOSED]`

## 8. Audit

Append-only `audit_log` table: actor, action, object, timestamp, result. Recorded for approvals, provider/price config changes, deletion requests, security failures (bad signature, replayed nonce).
