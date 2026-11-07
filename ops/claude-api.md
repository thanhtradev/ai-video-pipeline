# Claude API overflow for the Max limit (D-118)

Run by the owner after the PR is merged. Conventions as in [README.md](README.md). Steps 1–5 are
free; Step 0's smoke test and every job moved to the API are **paid** (USD, Claude API).

What it adds:
- migration `20261203000100_claude_api.sql`: provider `anthropic-api` (off), the month limit ($45),
  `claude_api_step` caps (empty), grants, reservations, `claude_api_offers_due()`,
  `claude_api_begin()` / `claude_api_record()`, and `CLAUDE_API` in `telegram_confirm()`;
- worker: a job with a grant runs the same CLI with the API key (never with the subscription token),
  `--max-budget-usd` and an explicit model, and records the CLI's cost;
- **WF-08**: when a `script`, `metadata` or `episode_code` job is blocked by the Max limit, a message
  with **Chạy bằng API (tối đa $X)** / **Bỏ qua** (owner only, 12 h);
- **WF-06**: the answer to that tap.

Without a tap nothing changes: the job waits for Max as before. Design and limits:
`docs/cost-and-providers.md` §6.

## 0. Check first

| Check | How | Why |
|---|---|---|
| CLI ≥ 2.1.217 on every worker | `claude --version` (mac mini 1, `ssh macmini2`, `ssh hp-worker`) | `--max-budget-usd` |
| Max **usage credits off** | claude.ai → Settings → Usage | otherwise Max may overflow by itself, past the button and the ledger |
| Smoke test (paid, ≤ $0.50, after step 1) | below | budget-stop wording, `--resume` under the key |

Smoke test on the Mac mini, **outside the pipeline**, in an empty folder:

```bash
mkdir -p /tmp/claude-api-smoke && cd /tmp/claude-api-smoke
KEY="$(security find-generic-password -a aivideo -s aivideo-claude-api-key -w)"
# 1. The key works, and the model is the one you set as CLAUDE_MODEL (step 3)
env -u CLAUDE_CODE_OAUTH_TOKEN ANTHROPIC_API_KEY="$KEY" claude -p --output-format json \
  --model <CLAUDE_MODEL> --max-budget-usd 0.20 "Reply with OK" | head -c 600; echo
# 2. What the budget stop looks like (expect is_error and a budget message)
env -u CLAUDE_CODE_OAUTH_TOKEN ANTHROPIC_API_KEY="$KEY" claude -p --output-format json \
  --model <CLAUDE_MODEL> --max-budget-usd 0.001 "Write 300 words about rain" | head -c 600; echo
unset KEY
```

Send the two outputs to the PR (no key appears in them). If the second does not say "budget",
the worker's `API_BLOCK` pattern (`worker/src/claude/claude-cli.ts`) needs its wording; until then
such a stop is a retryable error, and its reservation still counts as fully spent.

## 1. Console workspace and key

In the Claude Console: a **new workspace** `aivideo-overflow` (the default workspace cannot have a
spend limit), **spend limit $50/month**, a key in that workspace, **no auto-reload**, and load
only $50 of credit at first. Then on each worker that may run Claude steps:

```bash
# macOS (Mac mini 1 and 2)
security unlock-keychain ~/Library/Keychains/login.keychain-db    # only over SSH
security add-generic-password -a aivideo -s aivideo-claude-api-key -w
# Linux (hp-worker)
cd ~/aivideo/config/secrets && read -rsp "aivideo-claude-api-key: " value \
  && printf '%s' "$value" > aivideo-claude-api-key && chmod 600 aivideo-claude-api-key; unset value; echo
```

Paste the key at the prompt; never into chat or files. A worker without it blocks a granted job
with `claude api: PIPELINE_ANTHROPIC_API_KEY is not set on this worker` (nothing is spent).

## 2. Code, backup, migrate (Mac mini)

Backup as in `phase-2b.md` §3, then migrate and grant as in `preview-approval.md` §1; expect
`20261203000100`.

## 3. Worker settings

Text steps need an explicit model in API mode. Pick the one they use today: the `models` column of
`psql "$DATABASE_URL" -f ops/postgres/claude-usage.sql`. In `~/aivideo/config/worker.env` on every
worker:

```bash
CLAUDE_MODEL=<that model>
```

Then `update-worker.sh` (or restart) on each worker so it reads the new secret and setting.

## 4. Workflows

Import WF-06 and WF-08 with `ops/n8n/deploy-workflows.sh` (or the owner's `/deploy`).

## 5. Caps, then switch on

Set the caps from measured cost, never a guess: run the report after about 10 videos and take
roughly twice the largest cost of each step (`max_usd`; for `episode_code` see the note in the
report). Leave a step out to never offer it. With the owner `DATABASE_URL` as in step 2:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO claude_api_step (step, cap_usd) VALUES ('script', <usd>), ('metadata', <usd>)
ON CONFLICT (step) DO UPDATE SET cap_usd = EXCLUDED.cap_usd;
UPDATE provider_model SET enabled = true WHERE provider_id = 'anthropic-api';
UPDATE provider SET enabled = true WHERE id = 'anthropic-api';
SQL
```

The month limit is `provider_quota.limit_value` ($45); keep it below the Console limit.

**Check** (one paid job): when a job blocks on the Max limit, the message arrives within a minute.
Tap the button; the job runs again and then:

```bash
psql "$DATABASE_URL" -c "SELECT job_id, reserved_usd, actual_usd, detail->'models' FROM claude_api_spend ORDER BY created_at DESC LIMIT 5;"
```

`actual_usd` should be close to the Console's usage for the workspace, and the next blocked job
asks again.

## Switch off

`UPDATE provider SET enabled = false WHERE id = 'anthropic-api';`: no more offers, and a granted
job that has not started yet is refused (`claude api refused: DISABLED`) and waits for Max.

## Rollback

Switch off, re-import the previous WF-06 and WF-08, `npx dbmate … rollback` (recorded API costs
stay in `cost_entry`), remove the secret, and `update-worker.sh` the previous code.
