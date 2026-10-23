# Architecture and data flow

Labels: `[CONFIRMED]` / `[PROPOSED]` / `[UNKNOWN]` — see `CLAUDE.md`.
Everything in this file is `[PROPOSED]` unless stated otherwise.

## 1. Component diagram

```
                 ┌────────────── Telegram Bot ──────────────┐
                 │ approvals · status · alerts · reports    │
                 └───────────────▲──────────────┬───────────┘
                                 │ notify       │ callback (signed token)
┌─────────┐ brief   ┌────────────┴──────────────▼──────────┐
│ n8n Form├────────►│ n8n (LXC 104) — orchestration only   │
└─────────┘         │ intake · dispatcher · event handler  │
                    │ cost guard · approvals · watchdog     │
                    └───┬───────────────▲───────────────┬──┘
           read/write   │               │ signed events │ enqueue
           (state)      ▼               │ (HTTP, Tailnet)▼
        ┌───────────────────────┐       │      ┌─────────────────┐
        │ PostgreSQL (LXC 102)  │       │      │ Redis (LXC 112) │
        │ SOURCE OF TRUTH       │       │      │ queue + leases  │
        └───────────────────────┘       │      └───────┬─────────┘
                                        │              │ pull (consumer group)
                         ┌──────────────┴──────────────▼───────────────┐
                         │ Worker service (Tailscale only)             │
                         │  Mac mini M4: render, heavy                 │
                         │  MacBook Pro M1: audio, subtitles, QA, light│
                         │  → AI provider APIs, Remotion, ffmpeg,      │
                         │    Claude Code CLI (sandboxed workspace)    │
                         └──────────────┬──────────────────────────────┘
                                        │ SMB copy + checksum verify
                                        ▼
                                 ┌─────────────┐
                                 │ NAS archive │  [UNKNOWN] address/path
                                 └─────────────┘
Monitoring: Beszel + Uptime Kuma (existing, host [UNKNOWN]) watch n8n, Postgres, Redis, worker /health.
```

## 2. Responsibilities

| Component | Does | Does not |
|---|---|---|
| n8n | Receive briefs, create jobs in Postgres, dispatch, handle worker events, cost guard, send/receive Telegram, watchdog | Render, heavy media processing, keep state only inside an execution |
| PostgreSQL | projects, batches, videos, versions, jobs, attempts, approvals, costs, assets, providers, audit log | Act as a high-frequency polling queue |
| Redis | Streams per capability, lease/heartbeat, rate-limit/concurrency counters | Be the only holder of state |
| Worker | Claim task, execute, write files to workspace, send signed events, heartbeat | Switch provider on its own, delete files, approve |
| Claude Code CLI | Code/automation tasks inside the job workspace (e.g. generating/adjusting Remotion compositions) | Deploy, edit production workflows, read out-of-scope secrets |
| Telegram | Approval and notification channel | Source of state |
| NAS | Long-term archive | Working area |

## 3. Core data model [PROPOSED]

```
project 1─* batch 1─* video 1─* video_version 1─* job 1─* job_attempt
                                   │                 └─* cost_entry
                                   ├─* approval
                                   └─* asset (license_status, source_url, checksum)
provider 1─* provider_price (versioned) ; provider_quota ; audit_log (append-only)
```

State machine details: `docs/job-lifecycle.md`. Cost: `docs/cost-and-providers.md`.

## 4. Data flow for one video [PROPOSED]

1. **Intake** — n8n Form → validate → create `video` (status `BRIEF_SUBMITTED`) in a batch, FIFO order.
2. **Script/storyboard** — `script` job via Claude Code CLI headless (no Claude API, D-019). Usage guard before the call. Output validated against a JSON schema, stored as files + DB rows.
3. **Script approval** — Telegram sends a summary + file link; approval bound to `video_version`. Waiting = DB state, not a Wait node.
4. **Assets** — bounded parallel jobs: `tts` (paid API, cost guard), `visuals` (code-only: Claude Code + Remotion templates, D-020), `music/sfx` (free royalty-free library, license per track, D-021).
5. **Subtitles** — from script + actual audio (alignment) → SRT + VTT.
6. **Preview 720p** + **thumbnail/metadata** — `render_preview` job on Mac mini M4; `thumbnail` (Remotion still) and `metadata` (Claude Code) jobs in parallel (D-026).
7. **Automated QA** — `qa` job on MacBook Pro M1 (`docs/quality-and-approval.md`).
8. **Preview approval** — Telegram, includes thumbnail + metadata; QA failures → user decides.
9. **Final 1080p** — `render_final` job.
10. **Archive** — copy to NAS, verify file count/size/checksum, write manifest → `COMPLETED`.
11. **Report** — cost per step/video/batch/finished minute sent to Telegram.

## 5. Dispatch and worker communication [PROPOSED]

- **Pull model:** workers pull tasks from Redis Streams (consumer groups) → no inbound port needed for dispatch; an offline worker does not lose tasks.
- **Dispatcher (n8n)** selects `READY` jobs in Postgres (`FOR UPDATE SKIP LOCKED`), marks them `QUEUED`, then `XADD`s to the capability stream. If Redis loses data, jobs are still `QUEUED`/`READY` in Postgres and get re-enqueued (see recovery).
- **Return events:** workers send events (`claimed`, `heartbeat`, `progress`, `succeeded`, `failed`) to an n8n webhook over Tailscale, HMAC-signed, with a local outbox for resend when n8n is down. Events are idempotent by `event_id`.
- **Minimal worker API:** `GET /health`, `GET /capabilities`, `POST /jobs/{id}/cancel` — Tailscale interface only, authenticated.

Proposed streams: `q:render` (M4), `q:heavy` (M4), `q:light` (M1 preferred; M4 takes it when it has no render/heavy work, D-027).

## 6. Cross-cutting design rules

- Idempotency key for every job: `{video_version_id}:{step}:{input_hash}`.
- Checkpoint after each step = output file + checksum + DB record.
- Each video is independent; batch FIFO only decides **start** order, it creates no dependency.
- No automatic provider fallback; quota exhausted/provider error → stop new requests, keep the job, notify Telegram.
