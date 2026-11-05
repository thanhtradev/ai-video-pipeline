# Horror kit "Kinh dị" (D-106) and its style v2 with the cast "Bóng" (D-111)

Run by the user after the PR is merged. Conventions as in [README.md](README.md). The migrations
are free; the voice sample and a test episode make **paid** TTS calls (cost guard as usual).

What the kit is now: `horror` (16:9, Vietnamese, `style: horror`) tells first-person witness
stories in black silhouettes, with no burned-in captions (only a typed title card and one closing
line), film grain, a heavy vignette, long still shots, a glitch when NÓ appears, black-out beats,
quiet low drones and the horror SFX library. The cast is `bong` ("Bóng"): TÔI (the narrator, a tall
shadow with pale eyes and an oil lamp), NÓ (the entity), other people as dimmer shadows. The first
cast `mun` (Mùn on the Chíp rig) is switched off in the database but stays in the code, so earlier
briefs still resolve. Telegram shows `Kit: Kinh dị` and `Nhân vật: Bóng`; `/ideas` pairs them.

## 1. Migrate (Mac mini)

Backup as in `phase-2b.md` §3, then migrate as in `preview-approval.md` §1; expect
`20261130000100` (kit + Mùn, if not applied yet) and `20261201000300` (Bóng, Mùn disabled).

## 2. The horror voice

The owner chose ElevenLabs voice `qLk6yIwQI3GT5JfYLzBU` for this kit (2026-11-05). Whether ITERA
serves it is `[UNKNOWN]` until step 4. With `DATABASE_URL` and `PGPASSWORD` set as in step 1:

```bash
psql "$DATABASE_URL" -c "SELECT model_id FROM provider_model WHERE provider_id='itera' AND enabled"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -v model_id=<enabled model> -v kit=horror -v voice_id=qLk6yIwQI3GT5JfYLzBU -v language_code=vi -f ops/postgres/itera-tts-kit-voice.sql
```

The last line printed shows `kit_voices` with `horror`. Until this runs, the kit reads with the
shared Vietnamese voice. Back to it: `-v voice_id=none` (`ops/kit-voice.md`). The script asks for
`[whispers]`, `[long pause]` and similar audio tags on most lines; `eleven_v4` honours them.

## 3. Workers

Restart every worker on the new `main` (`ops/launchd/update-worker.sh`, Linux: `linux-worker.md`):
the catalog, kit files, prompts and the gates script ship with the code. No n8n change: the Kit
and Nhân vật pickers read `catalog_option`.

## 4. Check

- Review stills from the dev checkout, before the first paid episode:
  `cd remotion && npx remotion still src/channels.ts HorrorCast out/horror-cast.png`, then
  `HorrorSet-dormCorridor`, `HorrorSet-bedroomNight`, `HorrorGlitch`, `HorrorTitle`. Levels live in
  `remotion/src/kits/horror/theme.ts` (`POST`), the figures in `remotion/src/characters/bong/`.
- `/new kit=horror nhanvat=bong 6 Tiếng dép lúc hai giờ sáng ở ký túc xá` → the draft shows
  `Kit: Kinh dị` and `Nhân vật: Bóng`. Picking the kit alone keeps the default cast (Chíp (BẠN)):
  pick `Bóng` in the Nhân vật picker, or pass `nhanvat=bong`.
- A1: the script is first person ("tôi"), most lines carry an audio tag, shots are few and long,
  NÓ is in at most three shots, no blood or real names. The storyboard shows silhouettes, no
  captions, one light per shot. QA may report black stretches as WARN: expected for this kit.
- The final has the typed title at the start, at least one black-out, grain, and `vi.srt` in the
  archive (YouTube CC stays possible without burned-in captions).
- The TTS step of that video reads with the horror voice (`job.input.kit = 'horror'`).

## Rollback

`npx dbmate … rollback` once (`20261201000300`: Bóng removed, Mùn enabled again; refuses while a
video or draft uses `bong`: switch or cancel those briefs first, `ops/cancel-videos.md`). Restart
workers on the previous `main`. The voice entry is independent (`-v voice_id=none` removes it).
