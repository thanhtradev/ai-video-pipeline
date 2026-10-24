# Job lifecycle: state machine, checkpoint, retry, recovery, idempotency

All `[PROPOSED]`. State lives in PostgreSQL; Redis only transports tasks.

## 1. Two levels of state

- **Video version** (`video_version.status`): business progress of one version of a video.
- **Job** (`job.status`): one technical step (script, visuals, tts, render_preview, qa, ...), with many `job_attempt`s.

Revising content after rejection → create a new `video_version` (v2, v3…); approvals for the old version become invalid automatically.

## 2. State machine — video version

```
BRIEF_SUBMITTED → SCRIPTING → AWAITING_SCRIPT_APPROVAL ──reject/revise──► (new version)
                                   │approve
                                   ▼
                       GENERATING_ASSETS → RENDERING_PREVIEW (+ thumbnail, metadata) → QA_RUNNING
                                                                  ▼
                                          AWAITING_PREVIEW_APPROVAL ──reject/revise──► (new version)
                                                                  │approve
                                                                  ▼
                       RENDERING_FINAL → ARCHIVING → ARCHIVE_VERIFIED → COMPLETED

Blocking states (from any step; return to the previous step once resolved):
  NEEDS_DECISION   — cost over threshold, QA failure, unclear license, provider/model change
  BLOCKED_PROVIDER — quota exhausted / provider error
Terminal: COMPLETED · FAILED (retries exhausted, user confirmed stop) · CANCELLED
```

## 3. State machine — job

```
PENDING → READY → QUEUED → RUNNING → SUCCEEDED
                     ▲         │
                     │         ├─► FAILED_RETRYABLE ──(attempt < max, after backoff)──► READY
                     │         ├─► FAILED_PERMANENT  ──► video NEEDS_DECISION
                     │         └─► (lease expired) ──► watchdog → READY / FAILED_RETRYABLE
                     └──── re-enqueue if Redis lost the message
BLOCKED (cost/quota/approval) ──(resolved)──► READY
CANCELLED (from any non-terminal state)
```

- `PENDING`: waiting on dependencies (previous job not done). `READY`: eligible for dispatch.
- Transitions always use `UPDATE job SET status=$new WHERE id=$id AND status=$expected` → ignore when 0 rows (duplicate/late event).

## 4. Checkpoint

A step is `SUCCEEDED` only when all of:
1. Output files exist in the version workspace, fully written (write to temp file, then atomic rename).
2. SHA-256 of outputs recorded in the DB (`asset`) and the draft manifest.
3. Actual cost (if any) recorded in `cost_entry`.

On recovery: a step with a valid checkpoint (file exists + checksum matches) is **not re-run**.

## 5. Idempotency

- `job.idempotency_key = {video_version_id}:{step}:{input_hash}` — UNIQUE. Creating a duplicate job returns the existing one.
- `input_hash` = hash of normalized input (prompt, params, model/provider id, input asset checksums).
- Provider calls: pass an idempotency key when the provider supports it; otherwise the worker checks the checkpoint before calling to avoid paying twice.
- Worker calls are guarded by expected status and `claimed_by`, so duplicate or late calls return `false`/`LOST` instead of changing state.

## 6. Retry

| Error type | Action |
|---|---|
| Network/timeout/5xx/429 | `FAILED_RETRYABLE`, exponential backoff with jitter, max N attempts (proposed default 3, configurable per step) |
| 4xx due to input, content rejected by provider | `FAILED_PERMANENT` → `NEEDS_DECISION` |
| Quota / budget exhausted, Claude Code usage limit | `BLOCKED_PROVIDER` / `BLOCKED` — does not count as an attempt; resume after reset/decision, never switch to Claude API |
| Render/QA error | Render: bounded retry; QA failure: no retry, user decides |

**Never** retry with a different provider/model. Every attempt of a paid step goes through the cost guard again.

## 7. Recovery

| Incident | Detection | Recovery |
|---|---|---|
| Worker dies mid-task | Lease/heartbeat expired (WF-08) | Job → `FAILED_RETRYABLE` → `READY`; the next worker checks checkpoint before running |
| Worker offline for long | `/health` + heartbeat | Notify Telegram; job stays queued; never moved to a worker lacking the capability |
| Redis restart/message loss | Job `QUEUED` > 10 min **and** a worker serving its stream has since found its queues empty (`worker_idle`); a job merely waiting behind a long job is left alone | Re-queue from Postgres (safe: `job_start` drops duplicates) |
| n8n down | Uptime Kuma | No new dispatch; running jobs finish and report to Postgres directly; crons resume when n8n is back |
| Postgres down | Uptime Kuma | Dispatch stops; a worker that cannot report keeps its checkpoint; the lease expires and the retry completes from the checkpoint without rework |
| Approval expired | `expires_at` passed (24h, reminders every 6h, D-028) | Mark expired, offer re-request; never auto-approve |

## 8. Batch

- FIFO by `batch.created_at`, then `video.sequence`.
- Concurrency limited per stream/worker (configured in DB); FIFO decides **start** order.
- Blocked videos are skipped; the dispatcher continues with the next video → one failure does not block the batch.
- A batch is `COMPLETED` when every video is in a terminal state; the report covers each video and total cost.
