# Voice approval (A1b) and storyboard mix rollout (D-071)

Run by the user after this PR is merged. Conventions as in [README.md](README.md). **Free** to roll
out; afterwards each **Đọc lại** pressed on Telegram is one more paid TTS narration (the button
shows its estimate).

What it adds: after the timeline, the whole voice comes to Telegram as audio with Duyệt / Đọc lại /
Từ chối, and the episode code is written only after Duyệt. The storyboard request also brings the
episode's audio mix (voice + SFX). Design: [docs/episode-pipeline.md](../docs/episode-pipeline.md)
§5b, §6, §7.

## 1. Migrate (Mac mini)

Backup as in `phase-2b.md` §3, then migrate and re-run grants as in `preview-approval.md` §1; expect
`20261108000100`.

## 2. Worker

`~/aivideo/repo/ops/launchd/update-worker.sh` (no episode agent running). The new worker writes
`voice.m4a` in timing jobs and `mix.m4a` in episode_code jobs; nothing to configure.

## 3. n8n

`ops/n8n/deploy-workflows.sh wf-06 wf-12 wf-15` re-imports WF-06 (the `a1b:` buttons) and WF-12
(the mix), imports the new **WF-15** (`wf-15-voice-approval.json`) with the approval chat id and the
worker URL, and publishes them ([n8n/README.md](n8n/README.md)).

Order: migration → worker → workflows. Until WF-15 runs, an episode approved at A1 waits after its
timeline (`GENERATING_ASSETS`, no episode code); WF-15's first run requests it. A timeline built by
the old worker has no `voice.m4a`: its A1b message comes without audio (Đọc lại builds a new one).
Versions approved at A1 before the migration already have their episode code and skip A1b.

## 4. Check

New episode → approve A1 → after the narration and the timeline, an audio message
"Video … · giọng đọc lần 1/3" and the A1b message. Duyệt → `/status <id>` shows `episode_code`.
The storyboard pages are followed by "âm thanh đầy đủ (giọng + SFX)". Đọc lại → `/status` shows a
new `tts` and `timing`, then the next take (lần 2/3).

## Rollback

Deactivate WF-15, re-import the previous WF-06 and WF-12, restart the worker on the previous code,
then `npx dbmate … rollback` (fails while a version is `AWAITING_VOICE_APPROVAL` or a VOICE approval
exists: decide or cancel them first). Extra `voice.m4a` / `mix.m4a` files stay in their job folders.
