# Security: credentials, worker authentication, agent permissions, privacy

## 1. Secrets [CONFIRMED requirement / PROPOSED approach]

- No secrets in Git, prompts, logs, manifests, Telegram messages, or docs. `[CONFIRMED]`
- n8n: use the n8n Credentials store for Telegram, Postgres, Redis, provider APIs. `[PROPOSED]`
- Mac workers: secrets in an env file outside the repo (mode `600`, owned by the service user) or macOS Keychain. The repo only has a value-free `.env.example`. `[PROPOSED]`
- Each component has its own credential (dedicated DB role for n8n; one HMAC key per worker). No shared superuser. `[PROPOSED]`
- Logs: redact `Authorization` headers, query params containing keys, provider payloads containing tokens. `[PROPOSED]`
- Rotation: documented procedure to rotate HMAC keys/bot token; rotate immediately on suspected leak. `[PROPOSED]`

## 2. Network [PROPOSED]

- Worker API and the event webhook listen on the Tailscale interface only.
- Tailscale ACL: worker → only n8n webhook, Redis, (NAS SMB); n8n → worker API; workers cannot reach Proxmox UI, LXC SSH, or Postgres directly.
- Current ACL state: `[UNKNOWN]` (U-08).

## 3. Worker authentication and request signing [PROPOSED]

Applies in both directions (n8n → worker API, worker → n8n webhook):

```
X-Worker-Id: mac-mini-m4
X-Timestamp: <unix seconds>
X-Nonce: <uuid>
X-Signature: hex(HMAC-SHA256(key_of(worker_id), method + "\n" + path + "\n" + timestamp + "\n" + nonce + "\n" + sha256(body)))
```

- Reject if clock skew > 300s, nonce already used (stored in Redis with 10-minute TTL), unknown worker id, or bad signature (constant-time compare).
- A worker may only report on jobs it has claimed (check `job.claimed_by`).
- Redis: enable `requirepass`/ACL with a dedicated worker user with minimal rights on the relevant streams.

## 4. Workspace isolation [PROPOSED]

- Each job runs in its own directory: `<WORK_ROOT>/videos/{video_id}/v{n}/jobs/{job_id}/`.
- Worker validates every path (no `..`, no symlinks escaping `WORK_ROOT`).
- Service runs as a dedicated non-admin macOS user.
- Input from providers/external URLs is untrusted data: check MIME/size, never execute.

## 5. Claude Code CLI permissions [CONFIRMED requirement / PROPOSED approach]

`[CONFIRMED]`: Claude Code never deploys to production or edits production workflows directly; code changes go through branch/PR, tests, and review.

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
