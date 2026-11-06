# Kit picker on the /new draft (D-109)

Run by the user after this PR is merged. Conventions as in [README.md](README.md). **Free.**
No worker restart.

**2026-11-06 (D-112):** the first rollout sent the picker without buttons (n8n 2.40.5 drops an
object-valued keyboard expression). The fix is only in WF-06: run §2 again, then §3. The migration
of §1 is unchanged and already applied.

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

One thing this PR could not verify without Telegram; if it fails, note it in the PR:

- **Reply link.** The pick finds the draft message through `callback_query.message.reply_to_message`.
  If the draft is not updated but the picker turns into the draft (and stays), that field was
  missing: the fallback worked, report it so the message id can be stored on the draft instead.

The keyboard itself is verified: "Send picker" holds a fixed grid of 4 buttons (two rows of two)
read from "Build picker", checked against n8n 2.40.5 and a mock Bot API (D-112). When a kit is
added or disabled, the Kit button answers "Danh sách kit (N) không khớp bố cục nút (4); cần cập
nhật WF-06." until the grid and `PICKER_SLOTS` in "Build picker" are edited to the new count and
WF-06 is deployed again.

## Rollback

Re-import the previous `wf-06-telegram-callback.json` first (its Kit button cycles again), then
`npx dbmate … rollback` drops the two new functions.
