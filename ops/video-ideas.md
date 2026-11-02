# Video ideas rollout (D-083)

Run by the user after this PR is merged. Conventions as in [README.md](README.md). **Free**: ideas
come from the Claude CLI on the subscription; nothing renders until you press **Tạo** on a draft.

What it adds:

- `/ideas` (or `/ytuong`) in the approval chat. With no arguments it covers every pair in
  `idea_pair` (whatif · chip, science · chip-science). `/ideas kit=science` covers one kit, and
  `/ideas kit=whatif nhanvat=chip-science` covers any valid pair.
- A daily message at 07:00 (Vietnam time) with 5 ideas per pair.
- Ideas build on each pair's video history. 🔗 Series continues a series or turns a past video
  into one, ↪️ Liên quan is a new angle on a past video, and ✨ Mới is a new subject.
- Buttons 1–5 open the usual `/new` draft. You can still switch the kit or character there before
  pressing Tạo.

Details: `docs/episode-pipeline.md` §12.

## 1. Migrate (Mac mini)

1. Back up as in `phase-2b.md` §3.
2. Migrate as in `preview-approval.md` §1. Expect `20261115000100`.
3. Re-run the grants as the owner role:

   ```
   psql "$OWNER_URL" -f ops/postgres/grants.sql
   ```

   The worker role gets `idea_claim` / `idea_complete` / `idea_fail` / `idea_block`.

## 2. Workers

Update and restart every worker with `ops/launchd/update-worker.sh` (Linux: the systemd unit, as
in `linux-worker.md`). Only workers whose `WORKER_STREAMS` include `q:light` write ideas. They do
it only when their queues are empty. A video job that arrives while ideas are being written waits
for them to finish, usually a minute or two.

## 3. n8n

```
ops/n8n/deploy-workflows.sh wf-06 wf-16
```

WF-16 is new. It gets the approval chat id on deploy and is published right after WF-06.

Optional: add this line to the BotFather command list (`vietnamese-messages.md`):

```
ideas - ý tưởng video mới theo kit và nhân vật
```

## 4. Check

1. Send `/ideas kit=science`. The reply is `⏳ science · chip-science: đang nghĩ ý tưởng…`.
2. A few minutes later (after any running job), `💡 Ý tưởng · Khoa học · Chíp Khoa học` arrives
   with 5 ideas and buttons 1–5.
3. Press one. A `🆕 Tập mới: xác nhận` draft appears with the topic, the hook and angle as notes
   and, for a series idea, `Series: … · tập N`. Press **Hủy** if you are only testing; the idea can
   then be picked again.
4. The next morning at 07:00, `💡 Ý tưởng hôm nay` arrives once for each pair.

If Claude hits its usage limit, the chat gets `⏸ … Claude hết lượt dùng (thử lại lúc …)` once, and
the request resumes on its own.

To change the daily pairs, edit `idea_pair` (`enabled`, `sort_order`) with a migration.

## Rollback

1. Re-import the previous `wf-06-telegram-callback.json` and deactivate WF-16 in n8n.
2. Put the workers back on the previous release first. An updated worker calls `idea_claim` when
   it is idle and would log an error on every poll without it.
3. `npx dbmate … rollback` drops the idea tables and functions. The ideas written so far are
   lost; they are only suggestions.
