# Roadmap and acceptance criteria

Each phase starts only after the previous one meets its acceptance criteria and the user confirms.

## Phase 0 — Context (this task)

- [x] Architecture document set with CONFIRMED/PROPOSED/UNKNOWN labels.
- [ ] User reviews the docs and answers high-priority open questions (`docs/decisions.md`).

## Phase 1 — Foundation

Status 2026-10-24: **done**. Code merged (PR #2); production rollout (`ops/README.md`) run by the
user and verified read-only (`docs/infrastructure.md` §2b); smoke job succeeded end to end (S-22).
✅ = verified in production; ⏳ = open follow-up that does not block Phase 2.

| Item | Acceptance criteria | Status |
|---|---|---|
| Environment inventory | Every U-xx in `docs/infrastructure.md` has a real value or a reason it is not needed yet; date + command recorded | ✅ rollout values recorded (S-13…S-22) · ⏳ U-08, U-14, U-15, U-19 |
| PostgreSQL schema | Versioned migrations for the tables in `docs/architecture.md` §3; tests for valid/invalid transitions; rollback works | ✅ (S-16) |
| Redis/queue | Redis has persistence + `maxmemory` + auth; test: losing Redis → re-enqueue from Postgres with no lost or duplicated jobs | ✅ AOF + `maxmemory` + ACL users (S-17); loss/duplicate tests |
| Worker API | `/health` and signed `/capabilities` on Tailscale only; HMAC + timestamp + nonce; tests reject bad signatures/replays. Cancellation goes through the DB heartbeat instead of `/jobs/{id}/cancel` (P-015) | ✅ `/health` on Tailscale (S-18) |
| Security | Tailscale ACL per `docs/security.md`; no secrets in repo (scan); Claude Code permissions configured and checked | ✅ least privilege verified in production, pg_hba allow-list (D-038) · ⏳ Tailscale ACL still allow-all (U-08) |
| Checkpoints | Simulated (non-paid) job killed mid-run → resumes without re-running checkpointed steps | ✅ |
| Logging | Logs carry `video_id`/`job_id`, redacted; audit_log works | ✅ |
| Monitoring | Uptime Kuma watches n8n, Postgres, Redis, worker `/health`; Telegram alerts | ✅ (S-19, S-20) |
| Storage verification | Archive job with test data: verifies file count/size/SHA-256 on NAS; deliberately corrupted file → failure detected | ✅ self-test on Nextcloud (S-21) |
| Backup | Daily backup runs; **restore test** succeeds once | ✅ all databases dumped, `aivideo` nightly + restore test · ⏳ Proxmox backup job, bind-mount data (R-02, R-12) |

## Phase 2 — Faceless MVP

One video end-to-end from n8n Form to MP4.

| Criteria |
|---|
| Brief via Form → script/storyboard → A1 via Telegram (with estimate) |
| 9:16 Short under 60s; code-only visuals (D-020) + TTS voice + royalty-free music (D-021) + subtitles (SRT, VTT) |
| Preview 720p + thumbnail + metadata → QA (subtitles/audio/technical) → A2 |
| Final MP4 H.264/AAC 1080×1920 30 FPS |
| Cost report per step/video and cost per finished minute; matches provider invoices within accepted tolerance |
| Complete manifest; NAS archive verified; Mac copy intact |
| Stale approvals / approvals for another version are rejected (tested) |
| TTS provider chosen and approved (Q-003); Claude Code usage per video measured (Q-004) |

## Phase 3 — Batch / load testing

| Criteria |
|---|
| Batch of 3 videos runs FIFO, each video independent |
| Deliberately fail 1 video → the other 2 complete |
| Stop a worker mid-run → job detected, kept queued/reassigned validly, Telegram notified |
| Restart n8n, Redis, worker → system recovers from checkpoints, no duplicate cost |
| Simulated quota exhaustion → new requests stop, no fallback, notification sent |
| Batch cost report + per-step processing time (input for benchmarking) |

## Phase 4 — Expansion

| Item | Criteria |
|---|---|
| Throughput | Benchmark with data: videos/day achieved with a specific configuration; the >10/day target is claimed only when the benchmark proves it |
| Concurrency | Tune parallel jobs per stream/worker based on CPU/RAM/time data |
| Short film | Needs an image/video source, decided at Phase 4 (Q-016). Consistent characters (reference/seed/LoRA depending on provider) across scenes; evaluation criteria approved by the user |
| Motion graphics/explainer | Reusable Remotion templates |
| Advanced localization | Multi-language voice + subtitles; per-language QA |
