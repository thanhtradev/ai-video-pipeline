# Pin each video to one worker rollout (D-074)

Run by the user after this PR is merged. Conventions as in [README.md](README.md). **Free.**

What it changes: the first job of a video pins it (`video.worker_id`) to the worker that started
it; every later job of that video goes to that worker's own Redis list `q:<stream>:w:<worker id>`.
n8n fetches the video's media (script, storyboard, mix, voice, preview, thumbnail, final) from that
worker's `WORKER_API_URL`. With one worker nothing visible changes; it is the groundwork for a
second worker ([docs/architecture.md](../docs/architecture.md) §5).

## 1. Migrate (Mac mini)

Backup as in `phase-2b.md` §3, then migrate and re-run grants as in `preview-approval.md` §1; expect
`20261110000100`. Existing videos are pinned to the worker of their latest attempt:

```sql
SELECT worker_id, count(*) FROM video GROUP BY 1;
```

## 2. Worker (right after the migration)

Add to `~/aivideo/config/worker.env` (the Mac's Tailscale address, S-09):

```
WORKER_API_URL=http://100.71.214.125:8787
```

then `~/aivideo/repo/ops/launchd/update-worker.sh`. Until the new worker runs, jobs of pinned videos
wait on `q:*:w:mac-mini-m4`, which the old worker does not read; nothing is lost. Check:

```sql
SELECT id, api_url, last_seen_at FROM worker;
```

## 3. n8n

`ops/n8n/deploy-workflows.sh wf-05 wf-08 wf-12 wf-13 wf-14 wf-15`. WF-02 is unchanged: it pushes
onto the list `dispatch_all()` names. `WORKER_URL` in `deploy.env` stays as the fallback for videos
whose worker has no `api_url`.

## 4. Check

New video → `/status <id>` runs as before; `SELECT worker_id FROM video WHERE id = '<id>'` is
`mac-mini-m4`; the A1 script file and the storyboard pages still arrive on Telegram.

## Re-pinning a stalled video

WF-08 sends "Video đang chờ worker mất kết nối" when a video's worker is offline. Its files live
only on that worker, so first try to bring the worker back. Moving the video means its finished
steps are gone on the new worker: cancel the version and create a new video from the same brief.
Do not `UPDATE video SET worker_id` on a video with finished steps; its next job would fail on
missing files.

## Rollback

Re-import the previous workflows, restart the worker on the previous code, then
`npx dbmate … rollback`. Jobs queued on `q:*:w:*` lists at that moment are re-queued by the
watchdog after 10 minutes.
