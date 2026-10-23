# QA, Telegram, and approval policy

## 1. Approval points [CONFIRMED]

| Point | Sent for approval | Outcome |
|---|---|---|
| A1 — Script/storyboard | Script summary, scene list, cost estimate, assets with unclear license | Approve / Revise (with note) / Reject |
| A2 — Preview 720p | Preview link, thumbnail, metadata (title/description/tags), QA report, cost so far, estimate for the rest | Approve / Revise / Reject |
| Ad-hoc decision | Cost over threshold, provider/model change, QA failure, unclear license, file deletion request | Situation-specific choices |

Never render final without A1 and A2 for the **same version**.

## 2. Approval binding [PROPOSED implementation]

`approval` record: id, video_version_id, type, token (random, short), payload_hash, status (`PENDING`/`APPROVED`/`REJECTED`/`EXPIRED`/`SUPERSEDED`), requested_at, expires_at, decided_by, decided_at.

On callback (WF-06), reject when:
- The clicking user is not on the allow-list.
- The token does not exist, is already decided, expired, or `SUPERSEDED` (a newer version exists).
- The video's current version ≠ the approval's version.
- `payload_hash` does not match the current content (content changed after sending).

Update with `UPDATE approval SET status=… WHERE token=… AND status='PENDING'` → a double click takes effect only once. After a decision, edit the Telegram message to remove the buttons.

Approval expiry: 24h, reminder every 6h (D-028). On expiry → mark `EXPIRED`, offer re-request, **never** auto-approve.
Approvers: allow-list of Telegram user ids; currently only the owner, more can be added via config (D-029).

## 3. Automated QA [PROPOSED]

Runs on MacBook Pro M1 (`qa` job), result in `qa/qa-report.json` with each check `PASS`/`WARN`/`FAIL`.

| Group | Checks |
|---|---|
| Video technical | MP4 container, H.264/AAC codecs, 9:16 resolution (720×1280 preview, 1080×1920 final), duration < 60s (D-025), 30 FPS, duration matches storyboard (± tolerance), no abnormal black/frozen frames |
| Audio | Integrated loudness -14 LUFS ± tolerance, true peak ≤ -1 dBTP (D-032), no clipping, no abnormally long silence, voice not masked by music |
| Subtitles | SRT + VTT syntactically valid, increasing timestamps, no overlaps, within video duration, max 2 lines, ~42 chars/line, ~17 chars/s (D-032), matches script (Vietnamese text diff) |
| Content | Every asset used in the render has a checksum in the manifest; `UNVERIFIED` license assets are listed |
| Metadata | Title/description/tags (Vietnamese) present, lengths within limits |

- `FAIL` → video `NEEDS_DECISION`; user chooses: fix (new version or re-run a specific step), accept the risk, or cancel. **Never** auto-retry QA until it "passes".
- `WARN` → shown in A2.
- Final 1080p QA: re-run the technical group before archiving.

## 4. Telegram notifications [PROPOSED]

| Type | When |
|---|---|
| Approval | A1, A2, ad-hoc decisions |
| Status | Video started, preview done, completed; batch completed |
| Alert | Provider quota exhausted/error, worker offline, stuck job, archive verify failure, security failure (bad signature), backup failure |
| Report | Daily: videos by state, cost, cost per finished minute |

Every message includes a short `video_id` + version for cross-reference. No secrets or sensitive paths.
Anti-spam: group repeated alerts (same cause) within a time window.
System text is in English; quoted video content (script excerpts, titles) stays in Vietnamese.
