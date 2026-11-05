# Kit picker on the /new draft (D-109)

Run by the user after this PR is merged. Conventions as in [README.md](README.md). **Free.**
No worker restart.

What it changes: the `/new` confirmation's **Kit → …** button (which cycled to the next kit on
each press) becomes **Kit: <kit> ▾**. Pressing it sends a new message "Chọn kit cho tập mới:"
with one button per enabled kit (the current one ticked), as a reply to the draft. Tapping a kit
sets it on the draft (the cast follows the kit's language as before), updates the draft message
in place and deletes the picker. Tapping the kit already chosen only shows "Vẫn là kit này." and
deletes the picker. Nhân vật, Worker and Thời lượng still cycle. Data:
`telegram_intake_options()`, `telegram_intake_pick()` (migration `20261201000100`).

## 1. Migrate (Mac mini)

Backup as in `phase-2b.md` §3, then migrate as in `preview-approval.md` §1; expect
`20261201000100`.

## 2. n8n

`ops/n8n/deploy-workflows.sh wf-06`.

## 3. Check

- `/new Mèo nghĩ gì?` → the draft shows **Kit: Nếu bạn… ▾**. Press it → a reply "Chọn kit cho
  tập mới:" with ✅ Nếu bạn… / Khoa học / What if… (EN) / Kinh dị.
- Tap **Kinh dị** → the draft reads `Kit: Kinh dị · Nhân vật: Chíp (BẠN)` and the picker is gone.
- Press Kit again and tap **Kinh dị** → toast "Vẫn là kit này.", picker gone, draft unchanged.
- Tap **Hủy**, press Kit on the old draft → alert "Bản nháp đã được quyết định rồi.".

Two things this PR could not verify without Telegram; if either fails, note it in the PR:

- **Dynamic keyboard.** "Send picker" gives the Telegram node its whole `inlineKeyboard` as one
  expression (`{{ $json.keyboard }}`). If n8n rejects it ("rows" undefined or similar), open the
  node, switch Inline Keyboard to Expression and paste `{{ $json.keyboard }}`, then re-export.
- **Reply link.** The pick finds the draft message through `callback_query.message.reply_to_message`.
  If the draft is not updated but the picker turns into the draft (and stays), that field was
  missing: the fallback worked, report it so the message id can be stored on the draft instead.

## Rollback

Re-import the previous `wf-06-telegram-callback.json` first (its Kit button cycles again), then
`npx dbmate … rollback` drops the two new functions.
