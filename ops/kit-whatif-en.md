# English kit "What if… (EN)" (D-092)

Run by the user after this PR is merged. Conventions as in [README.md](README.md). The migration is
free; a test episode makes **paid** TTS calls (cost guard as usual).

What it adds: a kit `whatif-en` and a cast `chip-en` (hero YOU). An episode of that kit is English
from the first step, with a Western concept: the script and storyboard (Western settings, names,
holidays; Vietnam-specific props banned), the TTS voice of the language, whisper `-l en`, English
captions at 40 px, English metadata, and `en.srt` / `en.vtt`. The episode agent gets Western sets
(`kits/whatif-en/sets*-intl.tsx`, `props-intl.tsx`) as `kit/active/sets*` and the worker fails its
gates on any Vietnamese text in the episode code. Telegram stays Vietnamese (D-061).

Data: `video.language` comes from `catalog_option.language` of the kit (migration
`20261121000100`); the trigger `job_input_language` copies it into every job input with a
`language`; `brief_pair_language()` gives an English kit the English cast (migration
`20261121000200`). Not in `/ideas` yet (its prompt is Vietnamese).

## 1. Migrate (Mac mini)

Backup as in `phase-2b.md` §3, then migrate as in `preview-approval.md` §1; expect
`20261121000100`, `20261121000200` and `20261121000300`.

## 2. English voice [UNKNOWN]

The English voice id is not chosen yet. D-050 names `cBTYF7NiJbR8Bvmdeuse`, but whether ITERA
serves it is UNKNOWN. Pick a voice on ITERA, listen to a sample, then:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -v model_id=eleven_v4 -v language=en \
  -v voice_id=<voice id> -v language_code=en -f ops/postgres/itera-tts-voice.sql
```

Until then an English episode's TTS job waits as BLOCKED with "no TTS voice configured for
language en"; it never uses the Vietnamese voice.

## 3. Workers and n8n

Restart every worker on the new `main` (`ops/launchd/update-worker.sh`, Linux: `linux-worker.md`):
the catalog, kit files and prompts ship with the code. Then `ops/n8n/deploy-workflows.sh wf-06`:
a draft button that changes nothing (Nhân vật on an English draft has one cast; one worker) is
answered "Không có lựa chọn khác để đổi." instead of failing "Edit confirmation" with Telegram's
"message is not modified" (`UNCHANGED` from `telegram_intake_cycle()`, migration
`20261121000300`).

## 4. Check

- `/new kit=whatif-en 3 What if you could stop time?` → the draft shows `Kit: What if… (EN)` and
  `Nhân vật: Chip (YOU, EN)` (the English cast is chosen even without `nhanvat=`). Pressing
  **Kit →** onto `What if… (EN)` switches the cast too; **Nhân vật →** on it only answers
  "Không có lựa chọn khác để đổi.".
- A1 shows an English script whose shots describe Western places; the storyboard (WF-12) shows
  English text only; A3 metadata is English; the archive has `subtitles/en.srt`.

## Rollback

Re-import the previous `wf-06-telegram-callback.json`, then `npx dbmate … rollback` three times
(`20261121000300` restores the cycle without `UNCHANGED`); `20261121000200` refuses while a video or draft uses `whatif-en` /
`chip-en` (switch those briefs first); `20261121000100` drops the language column and trigger
(English videos in progress would then get Vietnamese job inputs, so finish or cancel them first).
