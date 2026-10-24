# n8n workflows

All `[PROPOSED]`. Workflows are stored as JSON exports in the repo (`n8n/workflows/`) and imported manually by the user.
Claude Code never imports/activates production workflows.

## General principles

- Each workflow is short and stateless: read state from Postgres → do one thing → write back to Postgres.
- No Wait nodes for approvals/workers. Waiting = state in the DB; a new event triggers a new workflow.
- All DB writes use a transaction + state condition (`UPDATE ... WHERE status = <expected>`) to prevent races/duplicate handling.
- Every workflow error → Error Workflow (WF-99) → Telegram + audit log.

## List

| ID | Name | Trigger | Responsibility |
|---|---|---|---|
| WF-01 | Intake | n8n Form | Validate brief (video type, ratio 16:9/9:16, length, language, voice), create batch/video/version, FIFO order |
| WF-02 | Dispatcher | Every 30 s | `dispatch_all()` → `RPUSH` job ids to Redis. **Implemented:** `n8n/workflows/wf-02-dispatcher.json`. Cost guard for paid steps added in Phase 2 |
| WF-03 | ~~Worker Event Handler~~ | — | Removed: workers report via PostgreSQL functions (P-015). Phase 2 reacts to finished jobs from the dispatcher/next-step logic |
| WF-04 | Cost Guard | Sub-workflow | Estimate cost, check quota/budget/thresholds; returns `ALLOW` / `NEEDS_DECISION` / `BLOCKED_PROVIDER` (see `docs/cost-and-providers.md` §3) |
| WF-05 | Approval Request | Sub-workflow | Create approval record (token, version, expiry), send Telegram message with buttons |
| WF-06 | Telegram Callback | Telegram Trigger | Verify approver + token + version still valid; record decision; reject stale approvals |
| WF-07 | Archive & Verify | Event `final_ready` | Create `archive` job for a worker; receive verify result; only `ARCHIVE_VERIFIED` on full match |
| WF-08 | Watchdog / Recovery | Every minute | `watchdog_run()`: expired leases, lost queue messages, expired approvals, offline workers; Telegram alert only on change. **Implemented:** `wf-08-watchdog.json` |
| WF-09 | Reports | Daily cron + on batch completion | Status report, cost per step/video/batch/finished minute |
| WF-10 | Retention Reminder | Daily cron | List Mac working copies older than 30 days after verified archive → **request approval** to delete (never auto-delete) |
| WF-11 | Provider Health | Cron | Check provider quota/status; mark `provider_blocked`, notify |
| WF-99 | Error Handler | n8n Error Trigger | Write audit log, notify Telegram with execution id (no payloads). **Implemented:** `wf-99-error-handler.json`. Must be **active** — n8n 2.x skips inactive error workflows |

## Dependencies

```
WF-01 → (DB) → WF-02 ⇄ WF-04 → Redis → worker → (DB functions) → WF-02 ...
                                              (DB) → WF-05 → Telegram → WF-06 → (DB)
WF-08 watches everything; WF-99 catches errors from every workflow.
```

## Open questions

- n8n runs in regular mode with SQLite (S-05); whether to switch to queue mode/PostgreSQL is Q-013.
- Should the Dispatcher be split per stream to avoid head-of-line blocking — decide after Phase 3 benchmark.
