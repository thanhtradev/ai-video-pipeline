# Phase 2b rollout: narration (ITERA TTS) with cost guard

Run by the user, in order, after the Phase 2b PR is merged and Phase 2a is live
([phase-2a.md](phase-2a.md)). Conventions as in [README.md](README.md). This is the first step that
**spends money**: nothing is spent until step 4 enables the provider.

What it adds: migrations `20261026000100_tts_flow.sql` and `20261026000200_tts_model_eleven_v3.sql` (TTS registry row, A1 estimate, `cost_guard`,
`cost_record`, the `tts` job created on A1 approval), the worker `tts` step, and a change to WF-05
(the A1 message shows the TTS budget).

How spending is limited (docs/cost-and-providers.md §3): the A1 message shows the TTS budget
(narration characters × price + 10%); approving accepts it. Before every ITERA request the worker
asks `cost_guard`; a request that would go over the approved budget is not sent and the video goes to
NEEDS_DECISION (WF-08 alerts). Provider switched off, missing key/voice, or too few credits → the job
waits as BLOCKED and resumes by itself after the fix.

## 1. API key into the Keychain (Mac mini)

Create the key in the ITERA dashboard (API Keys). Store it without echo and without shell history:

```bash
security unlock-keychain ~/Library/Keychains/login.keychain-db    # only over SSH
security add-generic-password -a aivideo -s aivideo-itera-api-key -w
```

`security` prompts twice for the key. Never paste it into chat, files, or Git.

## 2. Choose the voice and read the price (free, read-only API calls)

A helper that sends the key as a header from stdin (it never appears in `ps` or history). Paste it
as these three lines: on one line, zsh's `url-quote-magic` (Oh My Zsh) inserts a `\` before the `;`
after the URL and breaks the function (the API then answers 401 or 500):

```bash
itera() {
  security find-generic-password -a aivideo -s aivideo-itera-api-key -w | sed 's/^/xi-api-key: /' | curl -sS --fail-with-body -H @- "https://api.genmax.io$1"
}
itera /v1/auth/me | jq '{credit_balance}'
itera /v1/models | jq '.[] | select(.model_id == "eleven_v3")
  | {model_id, model_rates, max_chars: .maximum_text_length_per_request,
     vietnamese: ((.languages // []) | any(.language_id == "vi"))}'
itera '/v1/shared-voices?page_size=30&sort=trending&required_languages=vi' \
  | jq -r '.voices[] | [.voice_id, .name, .gender, .age, .use_case, .preview_url] | @tsv'
```

Listen to the `preview_url`s and pick a Vietnamese voice. `model_rates.character_cost_multiplier`
is the starting price in **credits per character**. Check: `vietnamese` is `true` (the model is
`eleven_v3`, D-043; `eleven_multilingual_v2` has no Vietnamese).

## 3. Backup, then migrate (Mac, repo on an up-to-date `main`)

```bash
ssh lxc-db
su postgres -s /bin/sh -c 'DB_NAME=aivideo /usr/local/bin/pg-backup.sh'
exit
```

```bash
cd ~/remote-dev/AIVIdeo/ai-video-pipeline && git checkout main && git pull && npm ci
read -rs PGPASSWORD && export PGPASSWORD                       # owner password
export DATABASE_URL="postgres://aivideo_owner@192.168.1.102:5432/aivideo?sslmode=disable"
npx dbmate --migrations-dir db/migrations --no-dump-schema up
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f ops/postgres/grants.sql
psql "$DATABASE_URL" -c "SELECT max(version) FROM schema_migrations;"   # 20261026000200
```

## 4. Configure and enable ITERA (same shell)

Replace the two values with what step 2 showed:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -v voice_id='PASTE_VOICE_ID' -v credits_per_char='1' \
  -v source="GET /v1/models character_cost_multiplier, $(date +%F)" \
  -f ops/postgres/itera-tts.sql
unset PGPASSWORD DATABASE_URL
```

**Check**: the last table shows `provider_on` and `model_on` = `t`, your `voice_id`, and one
`per_char` price in `CRD`. Re-running with a new price closes the old price row (versioned).

## 5. Worker (Mac mini)

```bash
printf 'ITERA_BASE_URL=https://api.genmax.io\nFFPROBE_BIN=%s\n' "$(which ffprobe)" >> ~/.config/aivideo/worker.env
launchctl kickstart -k gui/$(id -u)/com.aivideo.worker
tail -n 5 ~/Library/Logs/aivideo-worker.log      # "worker ready"
```

## 6. n8n: update WF-05 (LXC 104)

Open WF-05 → deactivate → ⋯ → Import from File → `wf-05-script-approval.json` (replaces its
content) → set the approval chat id again (`REPLACE_WITH_APPROVAL_CHAT_ID`) → save → activate.

## 7. Smoke test (spends a few hundred credits)

1. Submit a brief in the WF-01 form (e.g. 20 seconds).
2. The A1 message shows `TTS budget: up to N ITERA credits (M characters)`. Approve.
3. Within a minute or two:

```sql
SELECT j.step, j.status, j.attempt_count, j.last_error, j.output->'result'->'total_seconds' AS seconds,
       j.output->'result'->'total_credits' AS credits
FROM job j JOIN video_version vv ON vv.id = j.video_version_id
WHERE vv.video_id = '<video id>' ORDER BY j.created_at;
SELECT kind, units, amount, currency, external_ref FROM cost_entry c
JOIN video_version vv ON vv.id = c.video_version_id WHERE vv.video_id = '<video id>' ORDER BY c.created_at;
```

**Check**: `tts` is `SUCCEEDED`; one `ESTIMATE` row and one `ACTUAL` row per scene; the sum of
`ACTUAL` ≤ the `ESTIMATE`. The clips are in
`$WORK_ROOT/videos/<video id>/v1/jobs/<tts job id>/scene-NN.mp3`: listen to them.
4. Compare `ACTUAL.amount / ACTUAL.units` with the configured price and the drop in
`itera /v1/auth/me`. If ITERA bills differently, re-run step 4 with the measured credits per character.

## Rollback

- **Stop spending now**: `UPDATE provider SET enabled = false WHERE id = 'itera';` (owner). Running
  `tts` jobs block before their next request and resume when it is enabled again.
- Code: revert the merge on `main`, `launchctl kickstart -k …`.
- Migration: `dbmate rollback` works only before the first estimate/cost row exists (it refuses
  otherwise, to keep the cost history); restore the step 3 backup instead.

## Known limits (2b)

- After the narration the version stays in GENERATING_ASSETS; preview rendering is slice 2c.
- NEEDS_DECISION (over budget, no price) has no Telegram decision buttons yet: fix the cause, then
  regenerate the script from a new brief.
- Scripts written before 2b cannot be approved (no scenes in the job output); press Regenerate.
- Narration longer than the brief is not rejected yet; 2c fits scenes to the measured clip lengths.
- Money price per credit and ITERA rate limits are still `[UNKNOWN]` (U-20).
