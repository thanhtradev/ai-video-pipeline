# AI Video Production Pipeline (Homelab)

An automated AI video production system running on a homelab, with human approval at decision points.
**Current status: design (Task 0). No implementation yet.**

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
| Redis | Queue + coordination | LXC 112 `[CONFIRMED]` (details `[UNKNOWN]`) |
| Worker service | Runs AI, audio, QA, render tasks | Mac mini M4 (render), MacBook Pro M1 (light) |
| Remotion | Video composition | On Mac workers |
| Claude Code CLI | All LLM work (script, storyboard, metadata) + Remotion code, headless, restricted workspace | Mac workers |
| TTS API | The only external paid API | `[UNKNOWN]` provider (Q-003) |
| Telegram Bot | Approvals, status, alerts, reports | — |
| NAS (SMB) | Archive | `[UNKNOWN]` address/path |
| Beszel / Uptime Kuma | Monitoring | Existing; host `[UNKNOWN]` |

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

## Operating principles

- Production deployment is **manual**; every change goes through a PR on the private GitHub repo.
- Cost over threshold, provider/model changes, QA failures, unclear asset rights, and any deletion → the system asks you via Telegram.
- Never commit secrets. Secrets live in the n8n credentials store / env files outside Git (see `docs/security.md`).
