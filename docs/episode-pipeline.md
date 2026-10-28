# Episode pipeline (TikTok 2 channel) [PROPOSED]

How one 16:9 episode in the TikTok 2 style (D-050) goes from a topic to a rendered MP4 with no
interactive session. Reference process (manual, EP1–EP5): `docs/video-process-export.md`.
Decisions: D-050 (format/style), D-051 (kit port), D-052 (automated step 5, storyboard approval), D-053 (agent sandbox and limits), D-054 (renders run by the worker).

## 1. Flow

```
form (topic | full brief)
  → script        q:light   Claude text-only → episode script JSON            → A1 (Telegram, + TTS estimate)
  → tts           q:light   ITERA eleven_v4, one request per act (audio tags kept)
  → timing        q:heavy   concat → whisper.cpp word times → line/shot timeline → cut check
  → episode_code  q:render  Claude Code headless in a sandboxed workspace → code + SFX
                            → worker gates (typecheck, cut check, text bounds, storyboard)
  → STORYBOARD approval     Telegram: storyboard pages + Approve / Feedback (≤ 3 feedback rounds)
       └─ feedback → new episode_code job with the feedback and the previous code
  → render_preview q:render 720p MP4 + SRT, loudness -14 LUFS (then 2d: QA, A2, final 1080p, archive)
```

Each step is a job with a checkpoint (`checkpoint.json`) and an idempotency key; re-running a
step never repeats a paid call (only `tts` is paid).

## 2. Video status

New status `AWAITING_STORYBOARD_APPROVAL` and approval type `STORYBOARD`:

| From | To | When |
|---|---|---|
| `GENERATING_ASSETS` | `AWAITING_STORYBOARD_APPROVAL` | episode_code succeeded and its gates passed |
| `AWAITING_STORYBOARD_APPROVAL` | `GENERATING_ASSETS` | feedback: a revision job is created |
| `AWAITING_STORYBOARD_APPROVAL` | `RENDERING_PREVIEW` | approved: render_preview becomes READY |
| `RENDERING_PREVIEW` | `QA_RUNNING` | the preview rendered: WF-13 creates `qa_preview` (§9) |
| `QA_RUNNING` | `AWAITING_PREVIEW_APPROVAL` | QA passed (or only warned): A2 is requested |
| `AWAITING_PREVIEW_APPROVAL` | `RENDERING_FINAL` / `GENERATING_ASSETS` / `CANCELLED` | A2 approve / notes / reject |
| `RENDERING_FINAL` | `AWAITING_METADATA_APPROVAL` | final QA and metadata done: A3 (§10) |
| `AWAITING_METADATA_APPROVAL` | `ARCHIVING` / `RENDERING_FINAL` | A3 approve / Viết lại or notes |
| `ARCHIVING` | `ARCHIVE_VERIFIED` | the archive is verified on Google Drive: CLEANUP asked |
| `ARCHIVE_VERIFIED` | `COMPLETED` | Mac copy deleted (owner's Xóa) or kept (Giữ lại, expiry) |

A fourth feedback, an episode_code job that keeps failing its gates, or a 90-minute timeout →
`NEEDS_DECISION` (the user can still open an interactive session on the job workspace).

## 3. Script (A1)

Intake (WF-01): `Topic` (required), `Kit` and `Character set` (dropdowns, D-066), `Duration
(minutes)` (2–12, optional), `Full brief` (optional, ≤ 30000 characters, kept verbatim), `Notes`.
The brief gets `format: "episode"`, which `brief_normalize` validates and `video_submit` turns into
a 16:9 video; Shorts briefs still work. `kit` and `character_set` are slugs of enabled rows of
`catalog_option` (seeded from `remotion/catalog.json`: kits `whatif`, `science`; character sets
`chip`, `bip`), filled with the defaults when absent and refused when unknown. On Telegram,
`/new` takes `kit=<slug>` / `nhanvat=<slug>` on its first line, and the confirmation shows
`Kit: … · Nhân vật: …` with two buttons that switch to the next option
(`telegram_intake_cycle()`) before **Tạo**. The selection reaches the script job in the brief and
the `episode_code`, revision and `metadata` jobs as `kit` / `character_set` in their input
(`version_selection()`); the script and metadata prompts describe the channel from the kit's and
character set's `prompt.md` (the hero, the fixed hook and ending: Chíp = "Nếu bạn…?" / "Một chữ
nếu… một cuộc đời khác.", Bíp = "Bíp ơi, tại sao…?" / "Bíp đã hiểu. Còn bạn?").

The script step returns one JSON document (schema in `worker/src/handlers/episode-script.ts`):

- `title`, `logline` (shown in A1), `characters[]` (`name`, `look`), `effects` and `notes` (Markdown);
- `acts[]` (1–12): `title`, `grade` (colour note), `lines[]` (narration with ElevenLabs audio tags
  such as `[punchy]`), `shots[]` (`id` "act.n", `moc` = first words of the narration where it
  starts, `description`, optional `hold_seconds` and `fast`, `sfx[]`).

The worker checks what the schema cannot and retries the step otherwise: shot ids numbered
`act.n` in order, every MỐC found in its act's narration after the previous one, each act under
10000 characters (one TTS request), and, from a full brief, every line present verbatim in it
(the EP5 brief passes all of these). It then assigns line ids `L001…` in order (never the model)
and writes `script.json` (the hashed A1 content) and `script.md`. From a full brief in the user's
format (VOICE / NHÂN VẬT / VISUAL STYLE / HIỆU ỨNG / DANH SÁCH SHOT), Claude only restructures it;
from a topic it writes the episode (≈ 3.2 words per second, the EP5 pace with holds).

## 4. TTS

Model `eleven_v4` (1 credit/char, ≤ 10000 chars per request), Vietnamese voice
`47rM9DW5VmjOw23BVHWi`: registered by migration `20261028000200`, then made the one enabled TTS
model by `ops/postgres/itera-tts.sql`. One request
per act: an act's lines joined with newlines, tags included. `eleven_v4` honours the audio tags
(`[punchy]`, `[short pause]`, `[as Grandpa, cheerful]` …) [CONFIRMED by the user, 2026-10-26]. The A1 estimate counts the same text.

The owner's pronunciation table (D-059) replaces each term (case-sensitive, whole word, never inside
an audio tag) by how it is said, in the TTS text only: `TikTok = tích tốc` makes the voice say
"tích tốc" while captions keep "TikTok". The job saves the table it used (`pronunciation.json`, and
in its result) so a retry reads the same text; the timing step matches whisper's words against the
same spoken forms. A replacement can make a few more characters than the A1 estimate counted.

## 5. Timing

`timing` job (q:heavy, free), created with the TTS job when A1 is approved and run after it. A port of
the reference `build_timing.py` + `check_cuts.py` (`worker/src/episode/`):

1. The act clips are joined in order with 0.6 s of silence between acts → `voice.wav` (48 kHz mono,
   what the composition plays) and a 16 kHz copy.
2. `whisper-cli` (whisper.cpp, model `large-v3-turbo`, `-l vi -ml 1 -sow -ojf`) gives word times;
   digits it writes ("30", "100.000") are read the Vietnamese way for matching.
3. The script lines are split into spoken **sentences** `S001…` (after `. ! ? … :`, tags removed;
   each keeps its script line id `L…`), the reference episodes' timing unit. Their words are
   aligned with whisper's (jsdiff).
4. Sentence boundaries: every real silence (10 ms dB envelope, voiced = floor + 14 dB) near a rough
   boundary is a candidate; one ordered set is chosen by dynamic programming, scoring distance to
   the rough boundary, silence length, and each sentence's length against its expected length
   (its words × the voice's speaking rate). Pauses shorter than 0.2 s are cut exactly at their
   quietest frame; no pause at all → read in one breath (no gap or hold there).
5. Cuts get 0.06 s lead-in and 0.09 s tail; gaps are the natural pause bounded to 0.15–0.38 s
   (0.15 s in `fast` shots); a shot's `hold_seconds` follows its last sentence; shots start at
   the sentence where their MỐC is spoken; 1.5 s end card.
6. `timing.json` and `captions.json` in the reference shapes (the kit's `time.ts` reads them),
   `timeline.md` for people. A cut louder than floor + 20 dB, or a MỐC never spoken, fails the
   job permanently (re-running cannot change it).

Measured on EP5 (reference episode, real ffmpeg + whisper.cpp 1.9.5, 2026-10-26): 261/261
sentences as in the reference, 242 of them cut within 3 frames of the hand-checked reference,
no cut in speech (the reference had one), 401.6 s against 400.0 s; whisper took 43 s.

## 6. Episode code (Claude Code headless)

`episode_code` job (q:render), created with the TTS and timing jobs when A1 is approved and run
after the timeline. Workspace `jobs/<job>/ws/`, prepared by the worker from `remotion/episode/` and
the kit catalog (`remotion/catalog.json`, D-064): a clip has one **kit** (visual style:
`remotion/src/kits/<kit>/`) and one **character set** (a cast on the shared rig:
`remotion/src/characters/<set>/`), chosen per clip in the brief (§3, D-066) and passed in the job
input; absent fields mean the catalog defaults `whatif` + `chip`. Unknown slugs fail the job;
there is no fallback.

```
CLAUDE.md               contract (remotion/episode/AGENT.md) with the selected kit's and character set's AGENT.md spliced in
brief.md, feedback.md   the approved script.md; the owner's notes on a revision
rules.md                the owner's channel rules from Telegram (D-059), read-only
FILES.md                every file with its size (the CLI has no Glob/Grep tools)
kit/                    read-only copy of remotion/src parts at the same paths: rig/ (Character), kits/<kit>/ (style,
                        QA, SFX synthesis), characters/<set>/ (cast), episodes/<ref>/ (the kit's reference episode);
                        kit/active/<name>.ts re-exports the selected modules (theme, ui, sets, cast, rig, …)
src/index.ts, Root.tsx  compositions Episode, EpisodeBoard (storyboard), EpisodeQA (text bounds)
src/time.ts, data/      timeline queries over timing.json / captions.json from the timing job
src/episode/            the agent writes here; Episode.tsx exports `Episode`
sfx/generate-sfx.mjs    the agent writes; writes the WAVs into public/sfx
public/voice.wav        from the timing job
node_modules            symlink to the repo's packages
```

`claude -p` with `claude-opus-5-5` (`CLAUDE_AGENT_MODEL`), `--permission-mode dontAsk`,
`--setting-sources project`, no MCP, the worker's environment stripped of secrets, and per-job
settings written outside the workspace (`worker/src/episode/agent-settings.ts`, spiked 2026-10-26
with CLI 2.1.310):

- file tools: Read only inside the workspace, Edit/Write only in `src/episode/` and `sfx/`;
- Bash: the macOS sandbox (no network, writes only in the workspace, reads of `~/.ssh`,
  `~/.config`, `~/.claude`, `~/Library`, `/Volumes`, … denied, no unsandboxed fallback) with
  auto-allow **off**: only `node node_modules/typescript/bin/tsc …` and `node sfx/generate-sfx.mjs …`
  run (never chained), plus the CLI's built-in read-only commands (`cat`, `ls`, `grep`, `sed`);
- the worker files in the workspace (`CLAUDE.md`, `kit/`, `src/time.ts`, …) are write-protected.

Chrome cannot start inside that sandbox, so the agent never renders (D-054). The worker runs every
render of agent-written code under its own profile `ops/claude/episode-render.sb` (loopback only,
writes only in the workspace) via `remotion/scripts/episode-gates.mjs`:

1. typecheck; 2. the SFX script; 3. storyboard pages (`board/page-NN.jpg`, 12 shots per page at
55 % of each shot; a missing audio file fails here); 4. text-out-of-frame scan of the whole episode
(every 10th frame, 0 sharp hits allowed); then a scan of the agent's files for secret values.

Turns (one session, resumed): turn 1 writes; turn 2 always reviews the storyboard pages (the Read
tool shows images) with the gate report; turn 3 only if gates still fail. All turns share a 90-minute
limit. Gates failing after the last turn → `NEEDS_DECISION`; the workspace stays for an interactive
session. `agent-turns.json` keeps prompts, replies and usage, and is the step's checkpoint (D-056):
it is written after every agent turn and gate run, so a retry (worker restart, a gate crash,
`/retry` on Telegram) resumes the same session where it stopped. The limit counts all attempts. The
step and `render_episode` wait (`BLOCKED`) while Remotion's Chrome is not installed. A Chrome crash
during the board or QA render (`Page crashed!`, `Target closed`) is never shown to the agent: the
attempt fails retryable and the retry re-runs the gates. Follow-up turns an older worker spent on a Chrome crash do not
count toward the three turns (job 476042c2, 2026-10-27). The QA scan opens a fresh browser every 20
samples; 100 per browser crashed Chrome (a V8 fatal check) on one episode, 2026-10-27.

The board and QA compositions last as long as the episode: Remotion drops any `<Sequence>` that
starts after its composition ends. The reference `check-text-bounds.mjs` used a composition one
tenth as long, so it only measured the first tenth of each episode; scanned in full, EP5 has 25 sharp
texts partly outside the frame (e.g. `NHỚ CHI TIẾT NÀY`, wall-calendar numbers).

Measured: the gates take about 1.5 min on EP5 (7 pages, 1200 samples). A 3-shot mini episode went
through the whole step (macOS `say` voice → whisper timing → real agent → gates) in under 6 min.

**Episodes coded before the kit split (D-064).** Their code imports `kit/ep1/theme`,
`kit/ep2/kit`, … A revision of such a workspace gets `kit/ep1/*.ts`, `kit/ep2/*.ts`, `kit/ep3/sets.ts`
and `kit/ep5/*.ts` shims that re-export the moved modules (`worker/src/episode/legacy-kit.ts`), plus
`kit/episodes/ep2/`, so the old code still typechecks and renders; new workspaces get no shims.

## 7. Storyboard approval

Migration `20261029000100`: status `AWAITING_STORYBOARD_APPROVAL`, approval type `STORYBOARD`.
When the newest `episode_code` job of an episode succeeds, `storyboard_approvals_due()` (WF-12)
issues a token bound to `video_id` + version + the SHA-256 of every file the job produced (code,
SFX script, pages). WF-12 sends each page as a photo, fetched from the worker with the job's board
token (D-055), then a message with **Approve** / **Reject** that asks for notes as a reply.

WF-06 handles both through `telegram_decide()`:

| Telegram | Effect |
|---|---|
| Approve | → `RENDERING_PREVIEW`, `render_episode` job (§8) |
| Reject | → `CANCELLED` |
| reply with notes | → `GENERATING_ASSETS`, a new `episode_code` job revising the previous code with the notes (`feedback.md`); its storyboard comes back as the next round |
| notes after round 4 (3 revisions) | → `NEEDS_DECISION` |

## 8. Render

`render_episode` (q:render, free) copies the approved workspace and renders `Episode` at 1280×720
under the worker's sandbox profile (`remotion/scripts/episode-render.mjs`, ANGLE, 8 tabs; burned-in
captions are part of the composition), normalises loudness (-14 LUFS, -1.5 dBTP, D-032) and writes
`vi.srt` from the sentence timeline. QA and A2 follow (§9). A real mini episode (say voice → whisper → agent → render) came out
at -14.0 LUFS with matching subtitles.

## 9. Preview QA and A2 (D-057)

Migration `20261101000100`. WF-13 polls `preview_approvals_due()` every 30 s:

1. A version in `RENDERING_PREVIEW` whose newest `render_episode` (of the newest code) succeeded gets
   a `qa_preview` job (q:light, free) → `QA_RUNNING`.
2. `qa_preview` checks the 720p file (`worker/src/episode/qa.ts`): MP4 with H.264/AAC, 1280×720 at
   30 fps, duration = timeline ± 0.5 s, -14 ± 1 LUFS and true peak ≤ -1 dBTP, a valid SRT (FAIL);
   black stretches ≥ 1 s and silences ≥ 3 s (WARN). Any FAIL fails the job permanently →
   `NEEDS_DECISION` (WF-08 alerts; `/retry` after a fix). `qa-report.json` is kept either way.
3. QA passed → `AWAITING_PREVIEW_APPROVAL` and an A2 request bound to the SHA-256 of the render's
   outputs. WF-13 fetches `preview.mp4` from the worker (`GET /media/<video>/<version>/<qa job>/
   preview.mp4?t=<media token>`, the token from the QA checkpoint, like D-055) and sends it as a
   Telegram video (bots may upload up to 50 MB; a 3-minute 720p preview is about 25 MB), then the
   message with the QA warnings, cost so far and **Approve** / **Reject**.

| Telegram | Effect |
|---|---|
| Approve | → `RENDERING_FINAL`, `render_final` job: the same render at 1920×1080 (`final.mp4`) |
| Reject | → `CANCELLED` |
| reply with notes | → `GENERATING_ASSETS`, a revision of the code as for storyboard notes, sharing its rounds; storyboard, preview, QA and A2 follow again |

What follows the final render is §10. The final file is not sent to Telegram (a 1080p episode
exceeds the 50 MB bot upload limit).

## 10. Final QA, metadata (A3), archive (D-062, D-063)

Migration `20261105000100`, status `AWAITING_METADATA_APPROVAL`, approval type `METADATA`. WF-14
polls `final_due()` every 30 s:

1. A finished `render_final` gets `qa_final` (§9's checks on `final.mp4` at 1920×1080) and
   `metadata` (q:light): Claude writes the title (≤ 100 characters), description, 5–15 tags (under
   450 characters together), 1–3 hashtags and picks `thumbnail_shot`. Captions are burned in, so the
   prompt lists the shots with a caption-free pause and the worker grabs the middle of that pause
   (else 60 % into the shot). A failed QA or metadata job → `NEEDS_DECISION` as usual.
2. Both done → `AWAITING_METADATA_APPROVAL`; A3 is bound to the SHA-256 of the metadata, the
   thumbnail and the final render. WF-14 sends the thumbnail (`GET /media/…/thumbnail.jpg` with the
   metadata job's media token) and the message ending in `meta:<token>`.

| Telegram | Effect |
|---|---|
| Duyệt | → `ARCHIVING`, `archive` job (q:heavy) to Google Drive |
| Viết lại | a new metadata version (`RENDERING_FINAL` until it is done) |
| reply with notes | the same, with the notes; after 6 versions → `NEEDS_DECISION` |

3. `archive` hard-links the deliverables into the version folder and archives it to Google Drive
   through rclone (D-063; Nextcloud only as a fallback) with the verified procedure of
   `docs/storage-and-manifest.md` §4:

```
videos/<id>/v<n>/
  renders/final_1080p.mp4, preview_720p.mp4     subtitles/vi.srt, vi.vtt, captions.json
  script/script.md, script.json, timing.json   audio/voice.wav
  remotion/src/episode/…, sfx/…, board/…        thumbnail/thumbnail.jpg   metadata/metadata.json
  qa/qa-preview.json, qa-final.json             logs/agent-turns.json
  manifest.json, checksums.sha256               (jobs/ stays on the Mac only)
```

   Remote: `<ARCHIVE_RCLONE_REMOTE>/<yyyy>/<mm>/<video_id>/v<n>`. No archive configured → the job
   waits `BLOCKED`. Verified → `archive_record`, `ARCHIVE_VERIFIED`, and WF-14 sends the final message
   (archive path, file count, size, cost by currency, agent minutes) with **Xóa bản trên Mac** /
   **Giữ lại** (CLEANUP, 7 days).
4. Only the **owner** can press Xóa. The `cleanup` job (q:heavy) re-verifies the remote copy against
   the local `checksums.sha256` and the archive record, then deletes the version folder on the Mac
   except its own job folder; WF-14 reports the space freed. Giữ lại or no answer keeps the copy.
   Either way → `COMPLETED`.

## 11. Rollout slices

Runbook: [ops/episode-pipeline.md](../ops/episode-pipeline.md).

| Slice | Content | User rollout |
|---|---|---|
| B1 | ✅ episode script schema + prompt, form fields, A1 message | migration, WF-01/WF-05 import |
| B2 | ✅ `eleven_v4` + voice, per-act TTS, no typography preview for episodes | migration, `itera-tts.sql` |
| B3 | ✅ timing job (whisper.cpp + port of build_timing/check_cuts) | whisper model path, `q:heavy` |
| C1 | ✅ sandbox spike (D-054), fonts bundled via `@fontsource` | — |
| C2 | ✅ episode_code job, workspace, gates | Chrome download, migration |
| C3 | ✅ STORYBOARD approval, pages on Telegram, notes by reply (≤ 3 rounds) | migration, WF-06/WF-12 import |
| C4 | ✅ `render_episode`: 720p episode render, loudness, SRT | — |
| D1 | ✅ preview QA, A2 on Telegram with the video, final 1080p render (D-057) | migration, WF-06/WF-13 import (`ops/preview-approval.md`) |
| D2 | ✅ final QA, metadata + thumbnail (A3), archive to Google Drive, owner-approved Mac cleanup, COMPLETED with cost report (D-062, D-063) | rclone + Drive login, migration, worker env + restart, WF-06/WF-14 import (`ops/final-delivery.md`) |
