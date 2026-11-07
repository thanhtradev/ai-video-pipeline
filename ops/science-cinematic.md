# Science kit with the cinematic look (D-117)

Run by the user after this PR is merged, and after `ops/kit-whatif-vi-cinematic.md` (D-116).
Conventions as in [README.md](README.md). **Free**: no migration, no n8n change.

What it changes: new **Kit: Khoa học** episodes use the cinematic sets, shots and object close-ups,
in the 9:16 frame and in cool daylight (`clear`), with a bubbling-beaker close-up for experiments.
Episodes already made keep their look. An episode still in progress picks up the new kit when its
job is retried or resumed (D-108), so roll out when no science job is mid-render.

## 1. Workers

Restart every worker on the new `main` (`ops/launchd/update-worker.sh`, Linux: `linux-worker.md`).

## 2. Check

- Review from the dev checkout, before the first paid episode:

  ```bash
  cd remotion
  npx remotion render src/channels.ts SciCine-reel out/science-cinematic-reel.mp4
  npx remotion still src/channels.ts SciCine-classroom-after out/science-classroom.png
  ```

- `/new kit=science nhanvat=chip-science worker=<a Mac> 2 Chíp ơi, tại sao nước sôi?` (a paid test
  episode). Read A1: the shots name close-ups and an object close-up for the experiment. The final
  is 1080×1920, the sets are cool and clear, and every diagram that must be read is sharp.
- Render time: as in `ops/kit-whatif-vi-cinematic.md` §4. Keep science episodes on a Mac with
  `worker=` until the HP worker has been measured with the cinematic look.

## Rollback

Revert this PR's change to `remotion/catalog.json` (science `extends` `whatif` and uses
`kits/whatif/sets*` again) and restart the workers. No data changes.
