# Self-hosted Telegram Bot API server and the final video (D-073)

Run by the user. Conventions as in [README.md](README.md). **Free.**

Why: `api.telegram.org` lets a bot upload at most 50 MB. A self-hosted
[`telegram-bot-api`](https://github.com/tdlib/telegram-bot-api) server raises that to 2000 MB, so
long A2 previews and the 1080p final fit. Files still go worker → n8n over HTTP (`GET /media`),
then n8n uploads them to this server.

## 1. Switch the bot (done 2026-10-29, `docs/infrastructure.md` S-29)

Server: `http://192.168.1.107:8081`. Read the token without echoing it or saving it to shell history:

```bash
read -rs TG_TOKEN
```

1. From the n8n container, the server answers `getMe` with `"ok":true`:
   ```bash
   ssh pve "pct exec 104 -- docker exec n8n wget -qO- http://192.168.1.107:8081/bot$TG_TOKEN/getMe"
   ```
2. Log the bot out of the cloud server, once: `curl -s "https://api.telegram.org/bot$TG_TOKEN/logOut"`.
3. n8n UI → Credentials → **aivideo-telegram** → Base URL `http://192.168.1.107:8081` (no trailing
   `/`, no `/bot…`) → Save.
4. Deactivate and activate **WF-06** so its Telegram Trigger calls `setWebhook` through the new
   server. A plain `docker restart n8n` was not enough. Do not call `setWebhook` by hand: n8n
   sets its own `secret_token` and rejects updates that lack it.
5. Check `getWebhookInfo` (same command as step 1). `url` should end in
   `/webhook/6f1d6a10-0000-4000-8000-0000000006ff/webhook`, there should be no
   `last_error_message`, and `pending_update_count` should fall to 0. Then `unset TG_TOKEN`.

From now on, **never call `api.telegram.org` with the bot token**. Once 10 minutes have passed
since `logOut`, any request there logs the bot back into the cloud server and updates stop
reaching this one.

## 2. Things to check on this setup

- **Files sent to the bot** (`/new` with a brief, `/rules set`): in `--local` mode `getFile`
  returns a path on the Bot API server's disk. Test one `.md` upload. If WF-06 "Get file" fails,
  the server is not serving `/file/…` over HTTP, and that has to be fixed on the server side (for
  example nginx over its data directory). Not verified.
- **n8n memory**: LXC 104 has little free RAM, and n8n keeps binary data in memory by default. A
  1080p episode is a few hundred MB. Set `N8N_DEFAULT_BINARY_DATA_MODE=filesystem` on the `n8n`
  container and recreate it before the first final is sent. How the container is defined is
  `[UNKNOWN]`.

## 3. Final video rollout (this PR)

Order: migration → worker → workflow.

1. **Migrate** (Mac mini): back up as in `phase-2b.md` §3, then migrate and re-run grants as in
   `preview-approval.md` §1. Expect `20261109000100`.
2. **Worker**: `~/aivideo/repo/ops/launchd/update-worker.sh`. The new worker serves `final.mp4`
   against the `qa_final` media token. Nothing to configure.
3. **n8n**: `ops/n8n/deploy-workflows.sh wf-14`.

Check: the next archived episode posts `🎬 #<id> vN · final 1080p` as a video, followed by
"✅ Video hoàn tất" with its buttons. If the fetch or upload fails, the video is skipped and the done
message still arrives. The failed step is visible in WF-14's executions in n8n.

A `qa_final` that ran before step 2 still has a media token (since D-062), so its video can be
served once the worker is updated.

## Rollback

- Final video: re-import the previous WF-14, then `npx dbmate … rollback` (restores `final_due()`).
  The worker change is harmless on its own.
- Bot API server: call `logOut` on the local server, clear the credential's Base URL, then
  deactivate and activate WF-06. Uploads above 50 MB fail again after this.
