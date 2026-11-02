# Choose the worker at /new and move videos between workers (D-087)

Run by the user after this PR is merged. Conventions as in [README.md](README.md). **Free**: no paid
API is called; a move copies files between your own workers over Tailscale.

What it adds:
- the `/new` confirmation shows `Worker: Tự động` and a **Worker → …** button that cycles through
  the workers n8n can reach; `/new … worker=hp-400-g7` picks one directly. **Tạo** pins the video
  to that worker, so every job, the first included, runs there. `Tự động` keeps today's behaviour.
- `/move <8 ký tự đầu của id> <worker>` (or `/chuyen`), **owner only**, moves a video: nothing of
  it is dispatched meanwhile; once its current step is done, the new worker copies the whole video
  folder from the old worker, checks every checkpoint, then the video continues there. `/move <id>
  huy` cancels a move that has not started copying. WF-08 reports `Đã chuyển video …` or
  `Chuyển video … thất bại …` (after 3 failed copies the video stays on its old worker).
- `/workers` lists open moves (`↪ <id>: mac-mini-m4 → hp-400-g7 · đang chờ / đang copy`).

Both workers must be online (heartbeat under 2 minutes) and have `WORKER_API_URL` set
([worker-affinity.md](worker-affinity.md) §2). The old worker keeps its copy; nothing is deleted.

Limitation: an `episode_code` step that stopped half-way resumes its Claude session on `/retry`
(D-056), and that session lives in `~/.claude` on the old worker only. Do not move a video that is
stopped inside `episode_code`; `/retry` it where it is, and move it after that step has finished.
Paid TTS state is in the job folder and is copied, so a moved `tts` step never pays twice.

## 1. Migrate (Mac mini)

Backup as in `phase-2b.md` §3, then migrate and re-run grants as in `preview-approval.md` §1;
expect `20261117000100`. The grants give the worker role the four `video_move_*` functions.

## 2. Workers (both)

Mac mini: `~/aivideo/repo/ops/launchd/update-worker.sh`; HP VM:
`~/aivideo/repo/ops/systemd/update-worker.sh`. Both run `npm ci`, which installs the new `tar`
dependency. The new code serves `/transfer/…` and runs moves when its queues are empty. Until a
worker runs the new code, a move to it stays `đang chờ`, and a move from it fails its copies.

## 3. n8n

`ops/n8n/deploy-workflows.sh wf-06 wf-08`. Then paste the BotFather menu from
[telegram-commands.md](telegram-commands.md) again (it now lists `move`).

## 4. Check

1. `/new Mèo nghĩ gì?` → the summary has `Worker: Tự động` and a `Worker → hp-400-g7` button;
   press it, then **Tạo**; `/workers` shows the script job on `hp-400-g7`.
2. Pick a small video that has finished at least one step on one worker: `/move <id> <other
   worker>`. The answer says it is moving; within a few minutes WF-08 sends `Đã chuyển video …`,
   `/workers` no longer lists the move, and the next step runs on the other worker.
3. On the new worker: `ls ~/aivideo/work/videos/<id>`; `videos/.incoming/` is empty.

## Removing the old copy

The source keeps `~/aivideo/work/videos/<id>` and the target keeps any older copy it replaced
under `videos/.moved-away/`. Remove them by hand only after the video is archived and verified
(`ops/final-delivery.md`); an agent never deletes them.

## Rollback

Re-import the previous `wf-06`/`wf-08`, restart both workers on the previous code, then
`npx dbmate … rollback`: `video_move` and its history are dropped; videos keep their current pin.
