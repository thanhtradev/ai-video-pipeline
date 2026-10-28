# AI Video Production Pipeline (Homelab)

An automated AI video production system running on a homelab, with human approval at decision points.
**Current status: Phase 1 in production (2026-10-24); Phase 2a (brief → script → Telegram approval) and 2b (narration via ITERA TTS with cost guard) live since 2026-10-25. Phase 2c (preview render: Remotion template in [`remotion/`](remotion/), music, subtitles, thumbnail) implemented; rollout via [`ops/phase-2c.md`](ops/phase-2c.md).**

## Goals

- **MVP:** faceless video — AI script/storyboard, code-generated visuals (Remotion), voice-over, background music/SFX, subtitles,
  Remotion composition and rendering, thumbnail + metadata, QA, cost tracking, approval, NAS archive.
- **Expansion:** short films with consistent characters; explainer/motion graphics; localization.
- **Operational target:** >10 videos/day **after benchmarking** — not a proven capacity.
- **MVP format:** Shorts, 9:16, under 60 seconds.
- **Video content language:** Vietnamese (scripts, narration, subtitles, metadata). Everything else is English — see `CLAUDE.md` §1.

## Default flow per video

```
brief → script + storyboard → [APPROVE] → assets → preview 720p + thumbnail/metadata → QA → [APPROVE]
      → final 1080p → NAS archive (checksum verified) → done
```

## Components

| Component | Role | Location |
|---|---|---|
| n8n | Orchestration, workflow control | LXC 104 `[CONFIRMED]` |
| PostgreSQL | Source of truth | LXC 102 `[CONFIRMED]` has PostgreSQL |
| Redis | Queue + coordination | LXC 112, Redis 7.0.15 `[CONFIRMED]`; AOF + `maxmemory` + ACL users (2026-10-24) |
| Worker service | Runs AI, audio, QA, render tasks | Mac mini M4 (only active worker); MacBook Pro M1 offline for now (D-034) |
| Remotion | Video composition | On Mac workers |
| Claude Code CLI | All LLM work (script, storyboard, metadata) + Remotion code, headless, restricted workspace | Mac workers |
| TTS API | The only external paid API | ITERA TTS (ElevenLabs `eleven_v3` via a reseller, D-040/D-043); API surveyed (S-24); money price per credit `[UNKNOWN]` (U-20) |
| Telegram Bot | Approvals, status, alerts, reports | — |
| NAS | Archive | Interim: LXC 106 Nextcloud, WebDAV via tailnet `lxc-nextcloud:8080` (D-033, D-036); dedicated NAS planned |
| Beszel / Uptime Kuma | Monitoring | LXC 104 (Docker) `[CONFIRMED]` |

## Further reading

- `CLAUDE.md` — mandatory rules for Claude Code
- `docs/architecture.md` — architecture, data flow
- `docs/infrastructure.md` — known infrastructure + survey checklist
- `docs/workflows.md` — n8n workflow list
- `docs/job-lifecycle.md` — state machine, checkpoint, retry, recovery
- `docs/security.md` — credentials, worker auth, agent permissions
- `docs/cost-and-providers.md` — cost guard, provider registry
- `docs/storage-and-manifest.md` — directories, NAS, manifest, retention, backup
- `docs/quality-and-approval.md` — QA, Telegram approval
- `docs/roadmap.md` — phases and acceptance criteria
- `docs/decisions.md` — confirmed decisions, proposals, open questions

## Repository layout

| Path | Contents |
|---|---|
| `db/migrations/` | dbmate SQL migrations: schema, state machines, job/approval/orchestration functions |
| `worker/` | TypeScript worker service (queue consumer, runner, checkpoints, archive, API) and all tests |
| `n8n/workflows/` | n8n workflow exports (WF-01, 02, 05, 06, 08, 12, 13, 14, 99), deployed by the user with `ops/n8n/deploy-workflows.sh` |
| `ops/` | Production runbook, DB roles/grants, Redis ACL, backups, launchd, n8n deploy script, Tailscale, monitoring |
| `docs/` | Design documents |

## Development

Requires Node 22+ and Docker. Tests only ever use the local containers.

```bash
npm ci
npm run infra:up      # Postgres 15.18, Redis 7.0.15, WebDAV on 127.0.0.1 (5543x/5637x/58080)
npm test              # 97 tests: SQL state machines, grants, queue, runner, archive, ACL
npm run typecheck
npm run format:check
npm run infra:down    # removes the test containers and their data
```

## Operating principles

- Production deployment is **manual**; every change goes through a PR on the private GitHub repo.
- Cost over threshold, provider/model changes, QA failures, unclear asset rights, and any deletion → the system asks you via Telegram.
- Never commit secrets. Secrets live in the n8n credentials store / env files outside Git (see `docs/security.md`).
