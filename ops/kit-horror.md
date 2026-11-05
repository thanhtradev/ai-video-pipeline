# Horror kit "Kinh dị" and cast "Mùn" (D-106)

Run by the user after this PR is merged. Conventions as in [README.md](README.md). The migration is
free; the voice sample and a test episode make **paid** TTS calls (cost guard as usual).

What it adds: a kit `horror` (16:9, Vietnamese, night sets and horror SFX, own rules without the
whatif "Nothing frightening" line) and a cast `mun` (hero MÙN with an oil lamp; Bà, Thầy Năm, Tèo,
Người lạ). Telegram shows them as `Kit: Kinh dị` and `Nhân vật: Mùn`. `/ideas` includes the pair.

## 1. Migrate (Mac mini)

Backup as in `phase-2b.md` §3, then migrate as in `preview-approval.md` §1; expect `20261130000100`.

## 2. The horror voice

The owner chose ElevenLabs voice `qLk6yIwQI3GT5JfYLzBU` for this kit (2026-11-05). Whether ITERA
serves it is `[UNKNOWN]` until step 4. With `DATABASE_URL` and `PGPASSWORD` set as in step 1:

```bash
psql "$DATABASE_URL" -c "SELECT model_id FROM provider_model WHERE provider_id='itera' AND enabled"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -v model_id=<enabled model> -v kit=horror -v voice_id=qLk6yIwQI3GT5JfYLzBU -v language_code=vi -f ops/postgres/itera-tts-kit-voice.sql
```

The last line printed shows `kit_voices` with `horror`. Until this runs, the kit reads with the
shared Vietnamese voice. Back to it: `-v voice_id=none` (`ops/kit-voice.md`).

## 3. Workers

Restart every worker on the new `main` (`ops/launchd/update-worker.sh`, Linux: `linux-worker.md`):
the catalog, kit files and prompts ship with the code. No n8n change: the Kit / Nhân vật buttons
read `catalog_option`.

## 4. Check

- Look at the review stills before the first paid episode, from the dev checkout:
  `cd remotion && npx remotion still src/channels.ts HorrorCast out/horror-cast.png` and
  `HorrorSet-villageNight`, `HorrorSet-abandonedHouse`, `HorrorSet-dormCorridor`,
  `HorrorSet-riceFieldNight`, `HorrorSet-banyanShrine`, `HorrorSet-hospitalHall`. If MÙN's hoodie
  or a set is wrong, change `remotion/src/characters/mun/cast.tsx` / `kits/horror/sets-horror.tsx`
  in a follow-up PR; nothing is stored per video.
- `/new kit=horror nhanvat=mun 6 Tiếng gõ cửa lúc nửa đêm ở ký túc xá` → the draft shows
  `Kit: Kinh dị` and `Nhân vật: Mùn`. Pressing **Kit →** from `What if… (EN)` lands on `Kinh dị`
  with the cast back to `Chíp (BẠN)`: press **Nhân vật →** until `Mùn`.
- A1: the script follows the scare rules (no blood, corpses or explicit violence; no real names);
  the storyboard is dark with one light source per shot; the final has no `amb_*` file (gates).
- The TTS step of that video reads with the horror voice (`job.input.kit = 'horror'`).

## Rollback

`npx dbmate … rollback` once (`20261130000100` refuses while a video or draft uses `horror` /
`mun`: switch or cancel those briefs first, `ops/cancel-videos.md`). Remove the voice entry with
`-v voice_id=none`. Restart workers on the previous `main`.
