# Kit and character set per clip (D-066)

Run by the user, in order (CLAUDE.md §3). Nothing here touches running videos: briefs made before
this change get the defaults (`whatif` + `chip`) through `version_selection()`.

## 1. Database

As in `preview-approval.md` §1; expect `20261106000100` (`catalog_option`, `catalog_selection()`,
`telegram_intake_cycle()`, `version_selection()`, the job-creating functions). Then re-run
`ops/postgres/grants.sql` (the new table and functions need the n8n and worker grants).

Check:

```bash
psql "$DATABASE_URL" -c "SELECT kind, slug, label, is_default FROM catalog_option ORDER BY kind, sort_order"
psql "$DATABASE_URL" -c "SELECT brief_normalize('{\"format\":\"episode\",\"topic\":\"Bíp ơi, tại sao bầu trời xanh?\",\"kit\":\"science\",\"character_set\":\"bip\"}'::jsonb)"
```

The second prints the brief with `kit` and `character_set`; an unknown slug raises `invalid brief`.

## 2. Worker

`~/aivideo/repo/ops/launchd/update-worker.sh` (pulls `main`, `npm ci`, restarts). The log shows
`worker ready`; the next `script`, `episode_code` and `metadata` jobs read the selection from their
input.

## 3. n8n

Re-import `wf-01-intake.json` (two dropdowns: `Kit`, `Character set`) and
`wf-06-telegram-callback.json` (set `APPROVAL_CHAT` in **Parse callback** again, as in
`telegram-intake.md`), activate both.

## 4. Check on Telegram

1. `/new Bíp ơi, tại sao nước sôi?` → the confirmation shows `Kit: Nếu bạn… · Nhân vật: Chíp (BẠN)`
   with **Tạo**, **Hủy**, **Kit → Khoa học**, **Nhân vật → Bíp**.
2. Press **Kit → Khoa học**, then **Nhân vật → Bíp**: the message is edited in place and now reads
   `Kit: Khoa học · Nhân vật: Bíp` (the buttons offer the way back).
3. **Tạo** → `SELECT brief->>'kit', brief->>'character_set' FROM video_version ORDER BY created_at DESC LIMIT 1`
   gives `science`, `bip`; the script job's log line `episode script written` follows the Bíp
   prompt (`worker.log`: the system prompt is not logged, but the A1 message shows the hook
   "Bíp ơi, tại sao…?" and the ending "Bíp đã hiểu. Còn bạn?").
4. `/new 5 Nếu bạn biết bay? kit=whatif nhanvat=chip` drafts with the defaults directly;
   `/new … kit=anime` answers `Chưa tạo: invalid brief: unknown kit "anime"`.
