# CLAUDE.md — Mandatory rules for every Claude Code session

Project: **AI Video Production Pipeline** running on a homelab. Read this file before doing anything.
Overview: `README.md`. Architecture: `docs/architecture.md`. Decisions: `docs/decisions.md`.

## 1. Language

| Content | Language |
|---|---|
| Code, identifiers, code comments, commit messages, PR descriptions | **English only** |
| Documentation files (`*.md`, ADRs, runbooks, config comments, workflow notes) | **English only** |
| Log messages, error messages, DB enum values | **English only** |
| Telegram messages sent by the bot (requests, replies, alerts, button labels) | **Vietnamese** (D-061); ids, step/status names and command names stay as they are |
| Video scripts, storyboards, voice-over text, subtitles, on-screen text, video titles/descriptions/tags, and other video resources | **Vietnamese** |

- Vietnamese is allowed **only** for content that ends up in, or directly describes, a video (script, narration, subtitles, metadata for publishing).
- Prompts sent to AI providers: instructions in English; quoted video content may be Vietnamese.
- Never translate Vietnamese video content to English when storing it; keep the original text.

## 2. Information status labels

All documents use these three labels. Never upgrade a label without evidence.

| Label | Meaning |
|---|---|
| `[CONFIRMED]` | Confirmed by the user or verified by survey (record source/date) |
| `[PROPOSED]` | Proposed design, not yet approved or implemented |
| `[UNKNOWN]` | Needs survey; never fill in a guessed value |

Do not guess software versions, IPs/NAS addresses, mount paths, credentials, or service state.
When a real value is surveyed, update `docs/infrastructure.md` with the date and the command used.

## 3. Things you must NOT do

- Do not deploy to production; do not import/edit/activate production n8n workflows.
- Do not connect to and change configuration of production machines (Proxmox, LXC, NAS, Mac workers) unless the task says so explicitly and the user approved it.
- Do not call paid AI APIs (image, video, TTS, music, LLM API) unless the task explicitly allows it and the cost guard approved it.
- Do not delete files, data, tables, queues, or archives. If deletion is needed → warn and ask for approval.
- Do not write secrets (tokens, API keys, passwords, Telegram bot token, HMAC keys) into code, prompts, logs, docs, or Git.
- Do not switch provider/model automatically on error or quota exhaustion.
- Do not claim usage rights for an asset are verified just because its source URL was stored.
- Do not treat the target throughput (>10 videos/day) as proven.

## 4. Code process

1. Work on a dedicated branch; changes go through a PR on the private GitHub repo. Never push directly to `main`.
2. Write tests first (TDD), run tests, review before opening a PR.
3. n8n workflows are versioned as JSON exports in the repo; the user imports them manually.
4. Database migrations are versioned files with a rollback plan; never run them against production from an agent.
5. Commits follow Conventional Commits: `feat|fix|refactor|docs|test|chore|perf|ci: ...`.
6. Before committing: `npm run format:check && npm run typecheck && npm test` (needs `npm run infra:up`).
   Tests use only the local `docker-compose.test.yml` containers — never a production host.
7. State rules belong in SQL (migrations + `worker/test/db/`); n8n workflows stay one query per step.

## 5. Architectural invariants (never violate)

- **PostgreSQL is the source of truth.** Redis is only queue/coordination; losing Redis must not lose job state.
- **n8n only orchestrates.** No heavy rendering in n8n. Never use a long-waiting n8n execution (Wait node for hours) as the source of state.
- **Every step has a checkpoint + idempotency key.** Re-running a step must not incur duplicate cost.
- **Each video is independent.** One video failing does not block the others in a batch.
- **Retries are bounded**; no automatic provider fallback.
- **Check quota/budget before every paid step.**
- **Telegram approvals are bound to `video_id` + `version` + token**; reject stale/expired approvals.
- **Never delete the Mac copy before NAS verification (file count, size, checksum) succeeds.**

## 6. Claude Code permissions inside the pipeline

Details: `docs/security.md` section 5. Summary: Claude Code runs in a per-job workspace,
cannot read secrets beyond the variables it is given, cannot deploy, cannot write to the NAS archive,
and has no network access to admin systems (Proxmox UI, production SSH).

## 7. Documentation

- Prefer concise, actionable docs; avoid duplication — link to the source file instead of copying.
- Source of truth per topic:

| Topic | File |
|---|---|
| Infrastructure, known/unknown values | `docs/infrastructure.md` |
| Job states, retry, recovery | `docs/job-lifecycle.md` |
| n8n workflows | `docs/workflows.md` |
| Secrets, auth, agent permissions | `docs/security.md` |
| Cost, providers, quota | `docs/cost-and-providers.md` |
| Directories, NAS, manifest, retention | `docs/storage-and-manifest.md` |
| QA, Telegram, approval | `docs/quality-and-approval.md` |
| Episode pipeline (TikTok 2 channel) | `docs/episode-pipeline.md` |
| Phases, acceptance criteria | `docs/roadmap.md` |
| Decisions, open questions | `docs/decisions.md` |
