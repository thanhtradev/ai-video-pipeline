# Episode recovery rollout (D-056)

Run by the user after this PR is merged. Conventions as in [README.md](README.md). **Free.**

What it adds:
- `episode_code` and `render_episode` wait (`BLOCKED`, checked again every 30 min) while Remotion's
  Chrome is missing, instead of failing after the agent has worked;
- `agent-turns.json` is the agent's checkpoint: a retry resumes the same session at the gates or the
  next turn instead of writing the episode again;
- migration `20261031000100_job_retry.sql`: `telegram_retry()` for n8n;
- **WF-06** answers `/retry <first characters of a video id>`: a video stopped by a failed job
  (`NEEDS_DECISION`) gets one more attempt. `/status <id>` of such a video shows the command.

## 1. Chrome (Mac mini, once)

The worker runs from this checkout, so Chrome must be downloaded here (not in another worktree):

```bash
cd ~/remote-dev/AIVIdeo/ai-video-pipeline/remotion
npx remotion browser ensure
ls node_modules/.remotion/chrome-headless-shell    # VERSION, mac-arm64
```

## 2. Code, backup, migrate

```bash
cd ~/remote-dev/AIVIdeo/ai-video-pipeline
git checkout main
git pull
npm ci
```

Backup as in `phase-2b.md` §3, then:

```bash
read -rs PGPASSWORD && export PGPASSWORD                       # owner password
export DATABASE_URL="postgres://aivideo_owner@192.168.1.102:5432/aivideo?sslmode=disable"
npx dbmate --migrations-dir db/migrations --no-dump-schema up
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f ops/postgres/grants.sql
psql "$DATABASE_URL" -c "SELECT max(version) FROM schema_migrations;"   # 20261031000100
unset PGPASSWORD DATABASE_URL
```

Restart the worker: `launchctl kickstart -k gui/$(id -u)/com.aivideo.worker` (wait for a running
episode agent to finish first).

## 3. n8n

Open **WF-06**, deactivate, ⋯ → Import from File → `wf-06-telegram-callback.json`, save, activate.

## 4. A job that failed before this change

Its workspace has no checkpoint, so a retry would write the episode again. If the last attempt's
agent turn finished (its session transcript ends with the agent's summary), write the checkpoint for
it in the job folder before `/retry`: the session id is the newest transcript in
`~/.claude/projects/<workspace path with / as ->/`, and `agentMs` is that turn's wall time.

```json
{
 "sessionId": "<session id>",
 "agentMs": 0,
 "turns": [{ "prompt": "first turn (before checkpoints)", "result": { "sessionId": "<session id>" }, "gates": null }],
 "report": null
}
```

Then `/retry <video id prefix>`: the worker runs the gates on that workspace and continues with the
review turn in the same session.

**Check**: `/status <video id prefix>` shows `episode_code` running `checking (turn 1/3)`, then
`agent turn 2/3`.

## Rollback

Re-import the previous `wf-06-telegram-callback.json`; `npx dbmate … rollback` removes
`telegram_retry()`. The worker change needs no rollback step (an older worker ignores the new
checkpoint format and starts a fresh workspace).
