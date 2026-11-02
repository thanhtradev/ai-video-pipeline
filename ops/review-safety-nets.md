# Review safety nets rollout (D-086)

Run by the user after this PR is merged. Conventions as in [README.md](README.md). **Free.**
Needs a worker restart on every worker (the Seatbelt profile and the runner changed).

What it changes (details in `docs/decisions.md` D-086):

- TTS never pays twice for a scene: the scene state is written before the ITERA request; a state
  whose request may have been sent but was not recorded stops the job (`NEEDS_DECISION`) once;
  `/retry` then requests that scene again.
- Finished work is checkpointed before the lease/cancel check; a result that cannot be
  checkpointed is a permanent failure.
- The macOS render sandbox denies `~/.config`, `~/.claude`, `~/.claude.json` (as Linux already did).
- Approval workflows keep sending the buttons when the worker is unreachable; WF-99 alerts even
  when Postgres is down.
- `/retry` is bounded: 5 manual retries per job, then `RETRY_LIMIT`.
- Migration `20261116000100`: indexes, one PENDING approval per type, `final_due()` isolation,
  `job.manual_retries`.

## 1. Migrate (Mac mini)

Backup as in `phase-2b.md` §3, then migrate as in `preview-approval.md` §1; expect
`20261116000100`. The new `CREATE INDEX` statements take the usual locks: run it while no job is
being dispatched (idle queues, or WF-02 paused for a minute).

## 2. n8n

`ops/n8n/deploy-workflows.sh wf-05 wf-12 wf-13 wf-14 wf-15 wf-99 wf-06`.

## 3. Workers

`update-worker.sh` on the Mac mini and the HP (`ops/linux-worker.md`) when no job runs.

## 4. Check

- Mac mini, with `WS` any empty folder:
  `sandbox-exec -f ~/aivideo/repo/ops/claude/episode-render.sb -D WS=$WS -D TMP=$WS/tmp -D HOME=$HOME -D ROOT=$HOME/aivideo /bin/ls ~/.config`
  must answer `Operation not permitted`.
- `/retry` on a stopped video still answers `RETRIED`; `/status` unchanged.
- Stop the worker, let an approval come due, start it again: the buttons were sent at once (not
  with the 6-hour reminder), the media follows on the next poll after the worker is back.

## If a video stops at NEEDS_DECISION with `archive_record_failed`

`final_due()` found the archive job's output malformed (a worker bug: the job itself succeeded,
so `/retry` answers `NO_FAILED_JOB`). The error is in `audit_log` (action
`archive_record_failed`). Fix the worker, then ask for a hand-run SQL step in a session with the
job id from the audit row; nothing is retried automatically.

## Rollback

`update-worker.sh` on the previous `main`, re-import the previous workflow files, then
`npx dbmate … rollback` (drops the indexes and `job.manual_retries`; the manual-retry counts are
lost, nothing else).
