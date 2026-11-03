# TTS voice per kit rollout (D-095)

Run by the user after this PR is merged. Conventions as in [README.md](README.md). **Free**
(listening to a sample of a new voice first is one paid TTS call).

What it adds: a kit can read with its own ITERA voice. The science kit's videos use it; the other
kits keep the Vietnamese voice they have today. Only TTS steps created after the migration use it:
videos already past the voice step keep their voice.

## 1. Code, backup, migrate (Mac mini)

As in `preview-approval.md` §1 (pull `main`, backup, migrate, grants); expect `20261123000100`.

## 2. Workers

Restart each worker on the new code (`update-worker.sh` on mac-mini-m4, mac-mini-m4-02 and
hp-400-g7), with no episode agent running.

## 3. The science voice

With `DATABASE_URL` and `PGPASSWORD` set as in step 1, check which ITERA model is enabled, then
set the voice on it:

```bash
psql "$DATABASE_URL" -c "SELECT model_id FROM provider_model WHERE provider_id='itera' AND enabled"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -v model_id=<enabled model> -v kit=science -v voice_id=xhfhhoIVxzqWcDxnFU2J -v language_code=vi -f ops/postgres/itera-tts-kit-voice.sql
```

The last line printed shows `kit_voices` with `science`. Back to the shared voice:
`-v voice_id=none`.

## 4. Check

`/new 3 <chủ đề> kit=science nhanvat=chip-science`, approve the script: the voice message (A1b)
reads with the new voice. A whatif video still reads with the old voice.

## Rollback

`npx dbmate … rollback` drops the trigger (science goes back to the shared voice for new jobs);
restart the workers on the previous code. The `kit_voices` entry can stay or be removed with
`voice_id=none`.
