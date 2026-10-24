# Cost and providers

## 1. Strategy [CONFIRMED]

- **TTS is the only external paid API.** All LLM work (script, storyboard, metadata, Remotion code) runs through Claude Code CLI on the subscription; **no Claude API** (D-019, 2026-10-23).
- Visuals are code-only (Remotion, SVG, typography, charts) (D-020). No image/video generation API.
- Music/SFX from a free royalty-free library; no cost, but license recorded per track (D-021).
- ~~Image-first, AI video for key scenes~~ — superseded by D-019 for now.
- No fixed spending cap yet → estimate first and ask for approval.
- Record estimated and actual cost per step, video, batch, and finished video minute.
- Quota exhausted/provider error: stop new requests, keep jobs queued, notify Telegram.
- **No automatic fallback** to another provider/model.
- The Claude Code subscription is **not** assumed to grant access to other image, video, or TTS APIs.

## 2. Provider registry [PROPOSED]

TTS provider: ITERA TTS (D-040), model `eleven_multilingual_v2` (D-043), priced in ITERA credits (`CRD`, D-044). **Implemented (2b):** migration `20261026000100_tts_flow.sql` seeds the ITERA rows disabled; the voice, the price and enabling are a rollout step (`ops/postgres/itera-tts.sql`). Money price per credit and terms `[UNKNOWN]` (U-20). Registry also tracks Claude Code as a **usage-limited** (not per-request priced) provider. Tables:

| Table | Key fields |
|---|---|
| `provider` | id, name, capability (`llm`/`tts`/`music`/`sfx`/`stt`; `image`/`video` reserved for later), billing (`per_request`/`subscription`/`license`/`local`), data_sent_description, enabled |
| `provider_model` | provider_id, model_id, default params, max_concurrency, enabled |
| `provider_price` | model_id, unit (`per_image`, `per_second_video`, `per_1k_chars`, `per_1m_tokens`…), unit_price, currency, valid_from, valid_to, source_note |
| `provider_quota` | model_id, period, limit, used, reset_at, status (`OK`/`EXHAUSTED`/`ERROR`) |
| `pipeline_config` | version, step→model mapping, retry policy, thresholds — each video records the `config_version` used |

Price or mapping changes → new (versioned) record, never overwrite; write to `audit_log`.

## 3. Cost guard

**Implemented (2b)** as `cost_guard(job, worker, units)`, called by the worker before **every paid request** (each TTS scene, including retries) — not an n8n workflow (D-045). Answers: `ALLOW` (with the model settings to use), `DISABLED`/`EXHAUSTED` → job BLOCKED until fixed, `NO_PRICE`/`OVER_BUDGET` → NEEDS_DECISION. Every answer is audited. The TTS estimate (narration characters × price + 10%) is recorded as `ESTIMATE` when A1 is requested and shown in the A1 message; approving A1 makes it the budget. The worker also checks the ITERA credit balance before each request.

Design (thresholds not yet implemented are marked in the text):

```
estimate = unit_price × estimated_units   (from storyboard: scene count, clip seconds, TTS characters…)
if provider/model disabled or quota EXHAUSTED/ERROR → BLOCKED_PROVIDER, notify
if step model ≠ model approved for this video      → NEEDS_DECISION
if video_spent + estimate > video_approved_budget  → NEEDS_DECISION
if batch_spent + estimate > batch_approved_budget  → NEEDS_DECISION
if daily_spent + estimate > daily_threshold        → NEEDS_DECISION
else ALLOW (write cost_entry kind=ESTIMATE, reserve)
```

- The whole-video estimate is produced after the storyboard and sent with the script approval → the approved amount becomes `video_approved_budget`.
- Approval model: per-video estimate approved with A1; any spend above the approved estimate → ask the user (D-023). No `daily_threshold` for now (check skipped while unset; Q-002).
- Per-model concurrency respects `max_concurrency` (counter in Redis, reconciled with Postgres).

## 4. Cost recording

**Implemented (2b):** `cost_record(job, worker, provider_task_id, units, amount)` stores the provider-reported `credits_deducted` as `ACTUAL`, once per provider task (`cost_entry.external_ref`), even if the job lost its lease. Reports (WF-09) come in 2d.

`cost_entry`: video_version_id, job_id, attempt_id, provider/model, kind (`ESTIMATE`/`ACTUAL`), units, unit_price, amount, currency, price_version, created_at.

- Actual cost comes from the provider response/usage when available; otherwise computed from the price table and flagged `derived`.
- Failed attempts that were billed are still recorded as `ACTUAL`.
- Reports: per step, video, batch, day, and **cost per finished minute** = total ACTUAL / final duration.

## 5. Currency

Canonical reporting currency: `[UNKNOWN]` (Q-002). Store the provider's original currency; convert only when reporting.
