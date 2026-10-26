# n8n workflows

All `[PROPOSED]`. Workflows are stored as JSON exports in the repo (`n8n/workflows/`) and imported manually by the user.
Claude Code never imports/activates production workflows.

## General principles

- Each workflow is short and stateless: read state from Postgres → do one thing → write back to Postgres.
- No Wait nodes for approvals/workers. Waiting = state in the DB; a new event triggers a new workflow.
- All DB writes use a transaction + state condition (`UPDATE ... WHERE status = <expected>`) to prevent races/duplicate handling.
- Every workflow error → Error Workflow (WF-99) → Telegram + audit log.
- Telegram messages are plain text sent as escaped HTML (`parse_mode: HTML`): the Telegram node otherwise parses Markdown, and a step name like `episode_code` breaks the message.

## List

| ID | Name | Trigger | Responsibility |
|---|---|---|---|
| WF-01 | Intake | n8n Form (basic auth); also `/new` on Telegram via WF-06 (D-058) | `video_submit()`: validate the brief in SQL, create batch/video/version and the `script` job; Telegram status. **Implemented (2a):** `wf-01-intake.json`. The voice is a registry setting (D-043) |
| WF-02 | Dispatcher | Every 30 s | `dispatch_all()` → `RPUSH` job ids to Redis. **Implemented:** `n8n/workflows/wf-02-dispatcher.json`. Paid steps are guarded by the worker calling `cost_guard()` (D-045) |
| WF-03 | ~~Worker Event Handler~~ | — | Removed: workers report via PostgreSQL functions (P-015). Phase 2 reacts to finished jobs from the dispatcher/next-step logic |
| WF-04 | ~~Cost Guard~~ | — | Replaced by the SQL function `cost_guard()` that the worker calls before every paid request (D-045, `docs/cost-and-providers.md` §3) |
| WF-05 | Script Approval Request | Every 30 s | `script_approvals_due()`: versions whose script succeeded → A1 token + Telegram message with Approve / Regenerate / Reject; reminders every 6 h; shows the TTS budget that approving accepts (2b). **Implemented (2a):** `wf-05-script-approval.json`. A2 (preview) follows in 2d |
| WF-06 | Telegram Callback | Telegram Trigger (`callback_query`, `message`) | `telegram_decide()`: allow-list, token, version, expiry and payload hash checked in SQL; answers the button and removes it once settled; approving a script creates the `tts` job and either `render_preview` (Shorts, 2c) or `timing` + `episode_code` (episodes, D-052). Storyboard buttons approve (creates `render_episode`) or reject; a **reply** to a storyboard request with notes starts a revision (≤ 3 rounds). **Implemented (2a, episodes 2c):** `wf-06-telegram-callback.json`. Needs n8n reachable over public HTTPS (U-21) **Implemented (P-017):** also answers `/status` and `/status <video id prefix>` from `telegram_status()`, approvers only. **Implemented (D-056):** `/retry <video id prefix>` gives a permanently failed job one more attempt (`telegram_retry()`), approvers only. **Implemented (D-058):** `/new [minutes] <topic>` (+ notes, + a `.md`/`.txt` full brief) → draft → Create / Cancel → `video_submit()`; only in the approval chat. **Implemented (D-059):** channel rules: `/rules`, `/rule add|del`, `/say`, `/unsay`, `/rules file` / `/rules set` with a Markdown file (`telegram_rules()`). **Implemented (D-060):** `/join` (owner approves with buttons), `/members`, `/revoke <user id>` (`telegram_members()`, `member_decide()`) |
| WF-07 | Archive & Verify | Event `final_ready` | Create `archive` job for a worker; receive verify result; only `ARCHIVE_VERIFIED` on full match |
| WF-08 | Watchdog / Recovery | Every minute | `watchdog_run()`: expired leases, lost queue messages, expired approvals, offline workers, provider-blocked videos, videos needing a decision (failed step + error); Telegram alert only on change. **Implemented:** `wf-08-watchdog.json` |
| WF-09 | Reports | Daily cron + on batch completion | Status report, cost per step/video/batch/finished minute |
| WF-10 | Retention Reminder | Daily cron | List Mac working copies older than 30 days after verified archive → **request approval** to delete (never auto-delete) |
| WF-11 | Provider Health | Cron | Check provider quota/status; mark `provider_blocked`, notify |
| WF-12 | Storyboard Approval Request | Every 30 s | `storyboard_approvals_due()`: episodes whose newest `episode_code` job succeeded → STORYBOARD token; sends each storyboard page (fetched from the worker's `GET /boards/…` with the board token, D-055) and a message with Approve / Reject that also asks for notes as a reply; reminders every 6 h. **Implemented (2c, episodes):** `wf-12-storyboard-approval.json` |
| WF-13 | Preview Approval Request | Every 30 s | `preview_approvals_due()`: episodes whose preview rendered → `qa_preview` job; passed QA → A2 token, the preview video fetched from the worker (`GET /media/…` with the QA job's media token) and a message with the QA warnings, cost, Approve / Reject (notes by reply). **Implemented (D-057):** `wf-13-preview-approval.json` |
| WF-14 | Final Delivery | Every 30 s | `final_due()`: finished final renders → `qa_final` + `metadata` jobs; both done → A3 (thumbnail fetched from the worker, metadata, Duyệt / Viết lại, notes by reply); a verified archive → `COMPLETED` and the final message with the cost report. **Implemented (D-062):** `wf-14-final-delivery.json` |
| WF-99 | Error Handler | n8n Error Trigger | Write audit log, notify Telegram with execution id (no payloads). **Implemented:** `wf-99-error-handler.json`. Must be **active** — n8n 2.x skips inactive error workflows |

## Dependencies

```
WF-01 → (DB) → WF-02 → Redis → worker (cost_guard before paid calls) → (DB functions) → WF-02 ...
                                              (DB) → WF-05 → Telegram → WF-06 → (DB)
                       (DB) → WF-12 → worker GET /boards → Telegram → WF-06 → (DB)   (episodes)
                       (DB) → WF-13 → worker GET /media  → Telegram → WF-06 → (DB)   (episode A2)
                       (DB) → WF-14 → worker GET /media  → Telegram → WF-06 → (DB)   (episode A3, done)
WF-08 watches everything; WF-99 catches errors from every workflow.
```

## Open questions

- n8n runs in regular mode with SQLite (S-05); whether to switch to queue mode/PostgreSQL is Q-013.
- Should the Dispatcher be split per stream to avoid head-of-line blocking — decide after Phase 3 benchmark.
