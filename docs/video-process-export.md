# video-process-export.md — "Kênh TikTok 2" / "Chíp Siêu Năng" (EP1, EP2, EP3, EP5)

Exported from one Claude Code session (VS Code extension). Session dates: 2026-10-24 → 2026-10-25. All timestamps below are **UTC** taken from the session transcript.

**Status labels**
- **[CONFIRMED]** means it was done or observed in this session (a command was run, a file was seen, or output was checked).
- **[UNKNOWN]** means it was not observed or not verifiable from this session.

**No generative image, video or music AI was used.**
- Every frame is drawn procedurally in code (React/SVG rendered by Remotion).
- Every sound effect is synthesized in code (Node.js DSP).
- The only "AI" pieces are:
  - the LLM (Claude) that wrote the code and made the editing decisions;
  - local Whisper speech-to-text, used for word timing;
  - the voice-over, which was supplied by the user as finished MP3/SRT files. Who or what generated it is [UNKNOWN].

---

## 1. Overview

### 1.1 Visual style (as implemented) [CONFIRMED]

The style source is the user's briefs (verbatim in Appendix A) plus four reference screenshots in `public/kênh tiktok 2/Ref cho kênh tiktok 2/`.
- The screenshots show a soft flat-cartoon subway platform with black round-headed characters in muted hoodies.
- The brief says "Chỉ tham khảo … không đưa ảnh vào video" (reference only, don't put the images in the video). The screenshots are not used in the video.
- Two of these images (2186×1264 and 2228×1260) were also attached to the EP1 brief message.

**Art style.** "Soft pseudo-3D flat cartoon", all in SVG.
- **Characters:** a big glossy black round head with a radial gradient and a thin cream rim light (`#f3e2c2`). Two white oval eyes and no mouth; expression comes only from eye shapes (normal, "> <" squint, half-lid, wide, happy arcs, droop). Hoodie with drawstrings, thin black tube limbs, mitten hands. Idle breathing bob and blinks.
- **Main character "Bạn"** always wears an **orange hoodie `#ff7a1a`**. Side characters and sets are muted: blue-gray, dusty purple, olive and beige (`src/tiktok2/ep1/theme.ts`).

**Depth and camera.**
- The `Stage` component draws parallax layers:
  - `far` (0.45× camera movement, blur 7px × zoom factor);
  - `bg` (0.78×, blur 5px);
  - `mid` (1.0×, sharp; set back + actors + set front);
  - `fg` (1.3×, blur 9px).
- One warm glow per scene, soft shadows, and a vignette of 0.42.
- The world camera `{x, y, z}` maps to the screen anchor (960, 540) with a global scale `CAM_K = 0.85`.
- `cutCam` switches framing at word/line anchors and automatically sub-cuts any segment longer than 100 frames, so framing changes every 1–3 s.
- There is handheld shake on tense beats.

**Colour grade by act** (CSS filters through `GradeCtx`, applied to the set and side characters but never to the orange hero):
- EP1: acts 1–6 normal; act 7 desaturates to about 60%; act 8 warm lantern glow; act 9 full saturation.
- EP5:
  - act 6 desaturates to 60%;
  - act 7 is a warm dinner light that turns harsh;
  - act 8 is a cold blue night;
  - act 9 is `saturate(1.12) brightness(1.04)`.
- EP5's "frozen world" filter is `saturate(1-0.85k) sepia(0.25k) hue-rotate(175k deg) brightness(1-0.12k)`, applied to the set and side characters only.

**Pacing.**
- Voice-driven: the narration is cut per sentence, and the picture decides the holds.
- Holds are 0.2–1.2 s.
- Minimum gap between sentences is 0.15 s and maximum is 0.38 s (`timing-overrides.json`).
- Cuts are hard. There are no `<Series>`/`TransitionSeries` transitions; effects are flashes, ripples and pops.

**Format** [CONFIRMED]:
- 16:9, 1920×1080, 30 fps, H.264 (CRF 18), AAC audio.
- The EP1 brief asked for 9:16 1080×1920. The user changed it at 2026-10-24T06:35 ("tỷ lệ 16:9"), and every episode was then made 16:9.

### 1.2 Clips produced [CONFIRMED]

| Episode | Title (verbatim) | Composition id | Output file | Duration | Sentences | Shots |
|---|---|---|---|---|---|---|
| EP1 | Nếu bạn tàng hình được — nhưng chỉ khi nín thở? | `Tiktok2Ep1` | `/Users/thanhphu/my-video/out/tiktok 2/tiktok2-ep1.mp4` (143,998,863 B) | 7:03.27 (12,698 frames) | 270 | 76 |
| EP2 | Nếu bạn nhân bản được chính mình? | `Tiktok2Ep2` | `/Users/thanhphu/my-video/out/tiktok 2/tiktok2-ep2.mp4` (118,967,052 B) | 6:13.43 (11,203 frames) | 228 | 75 |
| EP3 | Nếu bạn quay lại được 30 giây — nhưng chỉ 3 lần mỗi ngày? | `Tiktok2Ep3` | `/Users/thanhphu/my-video/out/tiktok 2/tiktok2-ep3.mp4` (106,282,614 B) | 6:25.47 (11,564 frames) | 224 | 80 |
| EP5 | Nếu bạn dừng được thời gian 30 giây — nhưng mỗi lần dừng bạn già thêm 1 ngày? | `Tiktok2Ep5` | `/Users/thanhphu/my-video/out/tiktok 2/tiktok2-ep5.mp4` (122,433,520 B) | 6:40.00 (12,000 frames) | 261 | 83 |

Notes:
- **There is no EP4 for this channel in this session.** The user went from EP3 to EP5.
- **A side file was also written:**
  - `/Users/thanhphu/my-video/out/tiktok 2/ep5-audio.wav` (76.8 MB), the EP5 audio stem used for the mux.
  - Per-episode timeline tables `out/tiktok 2/epN-timeline.md` were written by `build_timing.py`, and the EP5 table was rewritten at the end.
- **The delivered MP4s lag behind the current source.** After the last renders of EP2, EP3 and EP5, camera framing in a few shots was changed to fix text cut off at the frame edge (section 3, step 11). The MP4s on disk do **not** contain those fixes yet; a re-render was offered and not yet requested. Rendering from the current source will produce slightly different framing in EP2 shot 2.2, EP3 shots 2.1/2.7 and EP5 shots 2.4–2.11.
- **EP1 English version.** The repository also contains an English EP1 version (`Tiktok2Ep1En`, `timing.en.json`, `captions.en.json`, and `en` branches in `transcribe.mjs`/`build_timing.py`). It was **not** made in this session ([UNKNOWN] — another session). It is out of scope here.

---

## 2. Tools & services

| Tool | Version / model ID | Tier | How called | Used for |
|---|---|---|---|---|
| Claude Code (VS Code extension) running Claude | model `claude-opus-5-5` (all 848 assistant turns) [CONFIRMED] | paid plan, exact plan [UNKNOWN] | chat in VS Code; Claude ran Bash/Read/Edit/Write tools on the local Mac | wrote all code (scenes, sets, characters, audio mix, SFX synthesis, scripts), wrote shot lists from the briefs, reviewed storyboard images visually, ran renders and QA |
| Remotion (`remotion`, `@remotion/cli`, `@remotion/renderer`, `@remotion/bundler`, `@remotion/google-fonts`, `@remotion/install-whisper-cpp`, `@remotion/compositor-darwin-arm64`) | 4.0.536 [CONFIRMED from package.json / node_modules] | license terms not verified (see §10) | CLI `npx remotion render|still`; Node API `bundle()`, `selectComposition()`, `renderFrames()` in `scripts/tiktok2/check-text-bounds.mjs` | rendering video/audio/stills, storyboard boards, text-bounds QA |
| Chrome headless shell | managed by Remotion (path `node_modules/.remotion/chrome-headless-shell/mac-arm64/…`) [CONFIRMED], version [UNKNOWN] | free | spawned by Remotion | page rendering |
| React / React-DOM | 19.2.3 [CONFIRMED] | free | — | composition code |
| TypeScript | 5.9.3 [CONFIRMED] | free | `npx tsc --noEmit -p .` | type-checking after every edit |
| Node.js | v24.22.0 [CONFIRMED] | free | `node …mjs` | SFX synthesis, Whisper wrapper, QA |
| tsx | 4.23.15 [CONFIRMED], fetched on demand by `npx` into the npm cache (not added to package.json) | free | `npx tsx scripts/tiktok2/ep5/bake-freeze-stem.ts` | running the TS stem-baking script and two debug snippets |
| Python | 3.11.1 [CONFIRMED] | free | `python3 …py` | timing builder, cut/mix checks, noise scans |
| whisper.cpp | installed earlier in the repo at `./whisper.cpp` (via `@remotion/install-whisper-cpp`; script comment says whisper.cpp **1.7.1** — not re-verified) [CONFIRMED present, install not performed in this session] | free, local | `whisper.cpp/main` CLI via `scripts/tiktok2/ep1/transcribe.mjs` | word-level timestamps of the Vietnamese voice |
| Whisper model | `ggml-large-v3-turbo.bin` [CONFIRMED file name] | free, local | `-m whisper.cpp/ggml-large-v3-turbo.bin` | ASR (language `vi`) |
| ffmpeg / ffprobe | binaries bundled in `@remotion/compositor-darwin-arm64` [CONFIRMED]; version [UNKNOWN]. This build has **no** `volumedetect`, `fps` or `tile` filters [CONFIRMED by failure]. Needs `DYLD_LIBRARY_PATH=node_modules/@remotion/compositor-darwin-arm64` | free | CLI | audio conversion, mux, probing, analysis extraction |
| Google Fonts via `@remotion/google-fonts` | Baloo 2 (weights 600, 800), Patrick Hand (400), subsets vietnamese+latin [CONFIRMED in theme.ts] | free | `loadFont()` | captions/titles (Baloo 2), chalk/handwriting (Patrick Hand) |
| Voice-over | user-supplied `public/kênh tiktok 2/Voice/epN/epN tiktok2.mp3` + `.srt` [CONFIRMED files]; generating service/voice [UNKNOWN]. The EP5 brief's script contains delivery tags such as `[punchy]`, `[short pause]`, `[as Grandpa, cheerful]`, but the TTS service is not named anywhere | [UNKNOWN] | file drop by user | narration |
| Image / video / music generation | **none used** [CONFIRMED] | — | — | — |

---

## 3. Step-by-step process

### 3.0 Repository layout (final state) [CONFIRMED]

```
src/tiktok2/index.ts                 standalone Remotion entry: registerRoot(Tiktok2Compositions)
src/tiktok2/Tiktok2Root.tsx          all compositions (episodes, storyboard boards, QA comps)
src/tiktok2/ep1/                     channel base: theme.ts, Character.tsx, Stage.tsx, SetStage.tsx, props.tsx, sets.tsx, ui.tsx, time.ts, audio.tsx, kit.tsx, shots/act*.tsx, Episode.tsx, data/{shotlist,timing-overrides,timing}.json, captions.json
src/tiktok2/ep2|ep3|ep5/             per-episode kit.tsx, sets.tsx, shots/act*.tsx, audio.tsx, time.ts, Episode.tsx, data/*.json, captions.json (EP5 also freeze.ts)
src/tiktok2/qa/TextBoundsQA.tsx      text-out-of-frame probe
scripts/tiktok2/ep1/                 transcribe.mjs, build_timing.py, check_cuts.py, check_mix.py, generate-sfx.mjs (shared by all eps via an "epN" argument)
scripts/tiktok2/ep2|ep3|ep5/generate-sfx.mjs
scripts/tiktok2/ep5/bake-freeze-stem.ts
scripts/tiktok2/check-text-bounds.mjs
scripts/sfx-lib.mjs                  DSP helpers (pre-existing in the repo, dated 2026-10-20; not written in this session)
public/kênh tiktok 2/Voice/epN/      user voice mp3 + srt
public/kênh tiktok 2/sfx/epN/        generated WAVs
whisper.cpp/                         ASR binary + model + per-episode 16 kHz wav + transcript json
out/tiktok 2/                        final MP4s, timeline tables, review boards, qa reports
```

**Why a standalone entry.** Every render uses `src/tiktok2/index.ts` rather than the project's `src/index.ts`. Another series (`src/sk-ep1`, owned by another session) broke the shared bundle while EP1 was being made [CONFIRMED: a `SyntaxError: Identifier 'ramp' has already been declared` in the shared bundle at 2026-10-24T06:54].

### 3.1 Per-episode pipeline (the order actually used for EP2, EP3, EP5; EP1 established it)

| # | Input | Tool | Parameters | Output |
|---|---|---|---|---|
| 1 | Brief pasted by the user (Appendix A); voice MP3 + SRT dropped into `public/kênh tiktok 2/Voice/epN/` | human | — | brief text, `epN tiktok2.mp3`, `epN tiktok2.srt` |
| 2 | voice MP3 | `node scripts/tiktok2/ep1/transcribe.mjs epN` → bundled ffmpeg + whisper.cpp | ffmpeg `-ar 16000 -ac 1 -c:a pcm_s16le`; whisper `-m ggml-large-v3-turbo.bin -l vi -ojf -ml 1 -sow -t 8 -np` (one word per segment, split on word, full JSON with token times, 8 threads, no prints) | `whisper.cpp/tiktok2-epN-16k.wav`, `whisper.cpp/tiktok2-epN-transcript.json` |
| 3 | brief shot list | Claude (LLM) | one entry per shot: `id`, `act`, `moc` (first words of the narration line = "MỐC"), `hold` seconds, optional `lineHolds`, `fast`, `atHold` (visual-only shot inside a hold), `joinNext` on lines | `src/tiktok2/epN/data/shotlist.json`, `data/timing-overrides.json` |
| 4 | SRT + transcript + 16 kHz wav + shotlist + overrides | `python3 scripts/tiktok2/ep1/build_timing.py epN` | FPS 30; sentence text = SRT; each sentence boundary = the real silence run (10 ms energy envelope) closest to the SRT boundary; lines without silence are joined contiguously (`joinNext`, the hold after them is dropped); gaps clamped to `minGap` 0.15 s / `maxGap` 0.38 s; shot ↔ line fuzzy match on accent-stripped MỐC in order; `anchors` override the match; end card `endCard` 1.5 s | `src/tiktok2/epN/data/timing.json` (lines with `src` trim frames in the original voice, absolute `from/to`, holds, shots, acts, total), `src/tiktok2/epN/captions.json` (word times), `out/tiktok 2/epN-timeline.md` |
| 5 | timing.json | `python3 scripts/tiktok2/ep1/check_cuts.py epN` | flags a cut whose ±20 ms energy is > noise floor + 20 dB | console list; fixed by anchors/joinNext/trim, then re-run 4–5 |
| 6 | brief (style, characters, special effects, shots) | Claude writes TSX | `time.ts` (only `sec2f`, `L(id)`, `at(id, word)`, `useShot(id)` read timing — no hand-typed seconds), `kit.tsx`, `sets.tsx`, `shots/act*.tsx`, `audio.tsx`, `Episode.tsx` | code |
| 7 | brief SFX list | Claude writes `scripts/tiktok2/epN/generate-sfx.mjs`, run with `node` | deterministic seeded DSP (noise, filters, envelopes, reverb), mono 44.1 kHz 16-bit; loops made seamless with `loopify` | `public/kênh tiktok 2/sfx/epN/*.wav` (EP1 67, EP2 64, EP3 58, EP5 55 files incl. `freeze_stem.wav`) |
| 8 | code | `npx tsc --noEmit -p .` | — | type errors fixed |
| 9 | code | `npx remotion render src/tiktok2/index.ts T2E{N}Board "out/tiktok 2/review/board{N}" --sequence --image-format=jpeg --log=error` (EP1 used `src/index.ts T2E1Board`) | storyboard composition 1920×1500, one page per frame, N shots per page, `pick` prop = relative position inside each shot (default 0.55; also 0.2 / 0.85 were rendered for EP2) | JPEG pages in `out/tiktok 2/review/boardN/` that Claude inspected visually; spot `npx remotion still … --frame=F --scale=0.4` PNGs for fixes |
| 10 | code | `npx remotion render src/tiktok2/index.ts Tiktok2EpN "out/tiktok 2/tiktok2-epN.mp4" --codec=h264 --crf=18 --concurrency=8 [--timeout=240000] --log=error` | H.264 CRF 18, 30 fps, 1920×1080 | MP4 |
| 10b | (when only audio changed, or when disk was low) | `npx remotion render … --codec=wav` and/or `… --muted`, then the ffmpeg mux below | AAC 256 kb/s | MP4 |
| 11 | MP4 / WAV | `python3 scripts/tiktok2/ep1/check_mix.py <file> epN`; scratch HF-noise scans (`hiss.py`, `noisy.py`, `hf2.py`); `node scripts/tiktok2/check-text-bounds.mjs epN` (added at the end) | dead air = 250 ms windows < −55 dBFS; quiet lines = max RMS < −30 dB; hiss = 4–9 kHz band energy outside voice; text = any visible text element partly outside 1920×1080 | reports; fixes looped back to steps 6–10 |
| 12 | timing.json | inline Python | — | timeline table by act + total duration, printed to the user |

The mux command (verbatim; this is the EP5 final mux):
```bash
DYLD_LIBRARY_PATH=$F $F/ffmpeg -y -hide_banner -loglevel error -i "$S/ep5-video.mp4" -i "out/tiktok 2/ep5-audio.wav" -map 0:v -map 1:a -c:v copy -c:a aac -b:a 256k -shortest "out/tiktok 2/tiktok2-ep5.mp4"
```
Here `F=node_modules/@remotion/compositor-darwin-arm64` and `S` is the session scratch folder. Every ffmpeg invocation from the session is in Appendix D.

### 3.2 Chronology with retries, failures and fixes [CONFIRMED unless marked]

**EP1 — "Nếu bạn tàng hình được — nhưng chỉ khi nín thở?"** (2026-10-24)
1. 05:57 Brief received (9:16 at that point). The assets were inspected: the voice MP3 + SRT, the 4 reference screenshots, and Whisper models (large-v3-turbo was present).
2. 06:01 Whisper transcription (0.8 min).
3. 06:05 EP1 SFX were generated. 06:06–06:17: wrote `shotlist.json` + `timing-overrides.json` and built the timing.
   - **Retry:** the first cut points were taken from the SRT/energy. `check_cuts` showed them clipping speech.
   - **Fix:** each boundary is now the nearest real silence run to the SRT midpoint, and `joinNext` handles lines read without a pause. The anchors were then adjusted.
4. 06:20–06:44 Review stills and storyboard pages. Three retries fixed:
   - (a) `inputRange must contain only finite numbers, but got [Infinity,Infinity]`, fixed with `Number.isFinite` guards;
   - (b) `inputRange must be strictly monotonically increasing but got [0,30,26,46]` (shake range), fixed;
   - (c) lying characters were repositioned (Bạn/Bin on the bed in act 7/9).
5. 06:35 The user wrote "tỷ lệ 16:9". The frame was changed to 1920×1080 (`W/H`, `CAM_K=0.85`, `PX()` mapper for old portrait screen coordinates, `SAFE` 5% margins).
6. 06:44 A 90-frame benchmark took 12.45 s. The first full render took **8.9 min**.
7. 06:53 `check_mix` showed dead windows. The ambience was raised (night bed + room tone), the audio re-rendered with `--codec=wav` (5:00 min wall time) and muxed.
   - One retry failed: the audio render via `src/index.ts` hit `SyntaxError: Identifier 'ramp' has already been declared` from another series. **Fix:** the standalone entry `src/tiktok2/index.ts`.
8. 07:05 User feedback:
   - "cảnh đầu người mẹ đâu có tàn hình, tại sao k có mặt? lại trong suoors nhỉ"
   - "ủa các nhân vật khác luôn, tàn hình mới trong suốt chứ, ai k tàn hình thì hình ảnh như cũ mà"

   **Cause:** non-invisible characters looked transparent because set furniture was drawn over them. **Fix:** actors are drawn after `set.front`, and the paper was moved into Mom's hand.

   The re-render then started. It was **killed after 64.9 min**: it was slowed by another session's concurrent `Episode6` render, and the user's next request changed the captions anyway.
9. 08:12 "kiểm tra subtitle quá to". Captions went from 76 px to **50 px** and caption Y from 900 to 950. Re-rendered with `--concurrency=6` (**12.6 min**).
10. 08:39 "âm thanh sfx quá to, giảm lại đi, tăng voice off lớn xíu" + "sau đó render lại". The mix became voice 1.0, SFX ×0.45 (−7 dB), beds ×0.56 (−5 dB), and the bed duck went from −15 to −12 dB. Audio-only re-render + mux.
11. 13:15–14:15 (together with EP2) "Có âm thanh sfx nào đó bị giống nư bị noise, e e rất ồn" and "5;25p đấy có tiếng xè xè".
    - HF scans found broadband/high-sine content.
    - Crickets, cicadas, alarm, water, panting, shimmer and phone swipe were rewritten as soft band-limited sounds, and the swipe volumes lowered.
    - All SFX were regenerated and the audio re-rendered + muxed for EP1 and EP2 (**8.8 min**).
    - One render failed with "seek timeout / browser closed" while another session was rendering. **Fix:** `--timeout=240000 --concurrency=4`.

**EP2** (2026-10-24 11:21 → 2026-10-25 05:02)
1. 11:22 `transcribe.mjs`, `build_timing.py`, `check_cuts.py` and `check_mix.py` were parameterised by episode; it was verified that EP1 output was unchanged.
2. Shotlist; breathless lines set to `joinNext`.
   - The EP1 SFX functions were exported from `ep1/generate-sfx.mjs`, and it was verified that the EP1 WAVs were byte-identical.
   - EP2 SFX generated; storyboard; fixes (phone-photo reframing).
   - Final render **5.8 min**. The dinner bed was raised (`amb_dinner_loop` 0.75 + room tone 0.4), audio re-rendered and muxed.
3. 12:56 The user asked "Sai rồi ep2 đó kênh sự kiện là khác mà" → "à dudusng k nhỉ? mình lưu nhầm à" → "mình đã tự xóa, tiến độ tới đâu rồi". The user had saved a file in the wrong place and deleted it themselves; no change was made.
4. 13:13 "kiểm tra lại có người đang bị trong suốt" → "à bản render thì k bị" (the final render was fine). Contact sheets failed because ffmpeg has no `tile` filter, so boards were rendered at `pick` 0.2/0.85 instead.
5. 2026-10-25 04:50 "ep2 đang bị lỗi âm thanh, cứ có âm thanh xè xè rất ồn và lặp lại nhiều lần?", "nằm ngay khúc intro", "sfx đó lưu ở đâu tôi nghe và nhắc bạn bỏ luôn", "amb_bedroom_morning_loop bỏ hẳn và render lại", "amb_class_loop luôn", "render lại cả ep3 và ep3".
   - `amb_bedroom_morning_loop` and `amb_class_loop` were removed, and quiet/room-tone beds used instead.
   - Audio was re-rendered for EP2 + EP3 and muxed.

**EP3** (2026-10-25 04:26–05:05)
- Whisper; the `atHold` shot type was added (EP2 timing was verified unchanged); shotlist; timing; SFX; storyboard.
- Fixes: a syntax error, and Bạn was moved beside the bus window (`WIN.x + 330`).
- Final render **8.8 min**. After the ambience removal above: audio re-render + mux.

**EP5** (2026-10-25 09:32–10:21)
1. Whisper.
   - Additive `Character` props `hair`, `shirtColor`, `sleeve` (default 0.84) and eye `droop`, plus an exported `Side`.
   - Shotlist (83 shots) with anchors `3.6→L055, 4.1→L063, 5.1→L080, 5.6→L101, 6.9→L132, 7.7→L150, 8.15→L218`.
   - `check_cuts` flagged L143/L144. The boundary was inspected: it sits in a 40 ms silence, so it was accepted.
2. SFX (54 files, no birds, low-passed babble); storyboard. Fixes:
   - the ER "CẤP CỨU" sign was drawn unfiltered (red) in the frozen world;
   - Grandpa was moved to sit on the bed with a blanket;
   - the 5.4 camera flash was capped at 0.7.
3. 09:51 Final render **failed after 8.1 min** with ffmpeg "No space left on device" in `mergeAudioTrackUnlimited`.
   - **Cause:** about 900 `<Audio>` tracks (261 voice lines, beds, 33 claps × 3 cues, 431 clock ticks) on a disk that was 98% full (9.1 GB free). Remotion pads each track to full length while merging.
   - A cleanup of stale Remotion temp bundles in `$TMPDIR` (~8.5 GB) was **denied** by the permission classifier and not performed.
   - **Fix:** `scripts/tiktok2/ep5/bake-freeze-stem.ts` mixes all claps, whooshes, day-ticks and clock-ticks into one `freeze_stem.wav`. Positions come from `freeze.ts`, and the stem is pre-multiplied by FX gain 0.45 (peak 1.62 → 0.73). That leaves about 430 tracks.
4. 10:07 Audio-only WAV rendered OK. 10:10 Muted video render + mux (**7.6 min**).
5. `check_mix` found 31 dead windows (digital zeros at 62–87 s and 308–338 s).
   - **Cause:** a looped bed `<Audio>` whose volume callback stayed at 0 through a long freeze stayed silent after it.
   - **Fix:** split the bed runs around freezes (`pieces()` in `ep5/audio.tsx`). The audio was re-rendered with `--concurrency=4`: 0 dead windows, min RMS −48.4 dB, peak −4.1 dBFS. Re-muxed.
6. Hiss scan: the 4–9 kHz peak outside voice is −55.4 dB and the median is −72.1 dB, in line with the approved episodes.
7. 10:44 The user wrote "các tập gần đây out chữ bị lọt ngoài khung, hãy kiểm tra để tránh bị lỗi sau này". The text-bounds QA was built:
   - A first attempt used the CLI `--log=verbose`. Browser console logs were not forwarded, so it switched to the Node `renderFrames({ onBrowserLog, imageFormat: "none" })` API.
   - A full EP5 run crashed Chrome at about frame 1000 (only ~2 GB RAM free), so runs were chunked into 100 frames with a new browser per chunk at concurrency 3.
   - The first results:
     - EP1: 0
     - EP2: 3 (poster "CỐ LÊN!", clock "6:00")
     - EP3: 2 ("TRƯỜNG THCS HOA SEN")
     - EP5: 27 (classroom board text)
   - **Fixes:**
     - several rounds of camera y/x nudges in EP2 2.2 / EP3 2.1, 2.7 / EP5 2.4–2.9;
     - the EP5 chalk text moved from the actor layer onto the board's `far` layer (`withBoard()`);
     - a new optional `blurFar` prop on the shared `SetStage`, checked by A/B on an EP1 still with `cmp` (byte-identical), used to focus the board in close-ups;
     - the 2.11 red circle repositioned;
     - the QA tool now separates blurred-background text ("blur", informational) from sharp text.
   - **Final result:** 0 sharp text out of frame in EP1, EP2, EP3 and EP5 (EP5 has 10 blurred-background notes). **Not re-rendered yet.**

---

## 4. Character & consistency

**How consistency is achieved** [CONFIRMED]:
- **One parametric rig.** There are no images, seeds or LoRAs. Every character is the same React component `Character` (`src/tiktok2/ep1/Character.tsx`) with props:
  - `hoodieColor, size, eyes, invisible, accessories, pose, facing, back, t, seed, look, itemR/L, handR/L, squash, puff, flush, fade, lean, speed, shadow, blink, shiver, rimSide, opacity, sparkle, px`;
  - added later as optional props: `hair, shirtColor, sleeve`.

  Accessories: `bun, glassesRound, glassesSquare, cap, aodai, hoodUp, backpack, shirt, ponytail, clip, gloves, bob, stetho`.
- **Per-episode casting** is a thin wrapper with fixed props in `epN/kit.tsx`, e.g. `Ban` = `<Character seed={1} hoodieColor={C.orange} hair />`. A character therefore looks identical in every shot.
- **Shared code across episodes.** Each episode imports ep1 components. Shared changes may only add optional props with defaults (project rule, `CLAUDE.md`), and A/B stills are compared with `cmp`.
- **Sets** are functions returning layers `{far, bg, back, front, fg, glow, sky}` (`ep1/sets.tsx`, `epN/sets.tsx`), reused across shots with different cameras.
- **EP5 aging** is the `age` prop on `Ban`, driven by the day counter.
- **Seeded randomness only:** `random(seed)` and `seed` props.

**Character descriptions — verbatim from the briefs.**

~~~~~text
=== NHÂN VẬT ===
- BẠN: thiếu niên, hoodie CAM.
- MẸ: hoodie tím phấn, búi tóc nhỏ.
- BIN: em trai 5 tuổi, nhỏ, hoodie xanh da trời nhạt.
- HUY: hoodie xanh rêu.
- CÔ GIÁO: áo dài xám xanh, kính tròn.
- THẦY HIỆU TRƯỞNG: hoodie xám, kính vuông, cầm ấm trà.
- NHÓM BẠN: 3 người hoodie be, xám, tím.
- KẺ BẮT CÓC: hoodie đen xám, mũ lưỡi trai sẫm, mắt nửa mí.
- ĐÁM ĐÔNG: nhiều nhân vật màu trầm, cỡ khác nhau.
~~~~~

~~~~~text
=== NHÂN VẬT ===
- BẠN và các BẢN SAO: thiếu niên, hoodie CAM, tóc rối (vài sợi tóc trên đỉnh đầu).
- MẸ: hoodie tím phấn, búi tóc nhỏ.
- BA: áo sơ mi xanh nhạt bên ngoài hoodie xám, hơi to con.
- CÔ DẠY THÊM / CÔ CHỦ NHIỆM: áo dài xám xanh, kính tròn.
- ĐỘI BÓNG XÓM: các bạn hoodie màu trầm.
- HỌ HÀNG: các nhân vật lớn tuổi màu trầm.
~~~~~

~~~~~text
=== NHÂN VẬT ===
- BẠN: thiếu niên, hoodie CAM.
- LINH: bạn lớp bên, hoodie hồng phấn trầm, tóc buộc đuôi ngựa ngắn, kẹp tóc nhỏ.
- PHONG: bạn thân từ mẫu giáo, hoodie xanh navy, tóc lởm chởm, cao hơn bạn một chút.
- MẸ: hoodie tím phấn, búi tóc nhỏ.
- CÔ GIÁO: áo dài xám xanh, kính tròn.
- THỦ MÔN SÂN XÓM: hoodie xám, găng tay to.
- BẠN CÙNG LỚP, HỌC SINH Ở CỔNG TRƯỜNG, HÀNH KHÁCH BẾN XE: nhiều nhân vật màu trầm.
~~~~~

~~~~~text
=== NHÂN VẬT ===
- BẠN: thiếu niên, hoodie CAM.
- ÔNG NỘI: 81 tuổi, áo sơ mi ca rô nâu bạc màu ngoài hoodie xám, kính lão, dáng hơi còng, chống gậy nhẹ.
- BA: sơ mi xanh nhạt ngoài hoodie xám. MẸ: hoodie tím phấn, búi tóc nhỏ.
- CÔ GIÁO TOÁN: áo dài xám xanh, kính tròn.
- VY: bạn cùng lớp giỏi Toán, hoodie xanh mint trầm, tóc ngắn ngang vai.
- ĐẠT: bạn cùng lớp, hoodie xanh rêu, tóc dựng.
- BÁC SĨ CẤP CỨU: áo blouse trắng ngoài hoodie xanh y tế, đeo ống nghe.
- HỌC SINH, NGƯỜI ĐI ĐƯỜNG, KÍP CẤP CỨU: nhiều nhân vật màu trầm.
~~~~~

**Visual style blocks — verbatim from the briefs.** These are repeated so §1 can be checked against them.

~~~~~text
=== VISUAL STYLE (kênh mới — không dùng lại style hay component hình ảnh của các kênh cũ) ===
- Soft pseudo-3D flat cartoon, rounded shapes, no harsh outlines.
- Characters: large glossy black round head (~45% body height), subtle radial gradient, thin warm cream rim light; face = two white oval eyes only, no mouth. Expressions only via eye shapes: normal ovals, "> <" squint (straining / holding breath), half-closed lids (bored/suspicious), wide ovals (shock), curved arcs (happy). Blink every 3–5s.
- Body: hoodie with drawstrings, thin black tube arms/legs, round mitten hands. Kids smaller, same proportions. Subtle idle breathing bob.
- Palette: environments and side characters muted and desaturated (blue-gray, dusty purple, olive, beige). Main character ALWAYS in a saturated ORANGE hoodie.
- Depth: ≥3 layers (foreground/midground/background); blur foreground and background (filter blur 4–10px), focal character sharp; slow parallax on camera moves.
- Lighting: soft ambient, one warm glow source per scene, soft shadows under feet, light vignette.
- INVISIBLE STATE: body and everything worn/held fully transparent, shown only as a thin faint white outline (~35% opacity) with gentle shimmer. Vanish = 8-frame fade to outline + small sparkle; reappear = 4-frame "pop" with squash-and-stretch.
- Vietnamese settings, furnished with real detail.
- Camera: change framing every 1–3s (wide / medium / close-up / extreme close-up); slow push-in on emotional beats; light handheld shake on tense beats.
- Color grade by act: acts 1–6 normal; act 7 gradually desaturate to ~60%; act 8 warm lantern glow; act 9 full saturation.
~~~~~

~~~~~text
=== VISUAL STYLE (riêng của kênh này — không dùng style của các kênh cũ) ===
- Soft pseudo-3D flat cartoon, rounded shapes, no harsh outlines.
- Characters: large glossy black round head (~45% body height), subtle radial gradient, thin warm cream rim light; face = two white oval eyes only, no mouth. Expressions only via eye shapes: normal ovals, "> <" squint, half-closed lids, wide ovals (shock), curved arcs (happy), downturned lids (sad). Blink every 3–5s.
- Body: hoodie with drawstrings, thin black tube arms/legs, round mitten hands. Kids smaller, same proportions. Subtle idle breathing bob.
- Palette: environments and side characters muted and desaturated (blue-gray, dusty purple, olive, beige). Main character ALWAYS in a saturated ORANGE hoodie.
- Depth: ≥3 layers; blur foreground and background (filter blur 4–10px), focal character sharp; slow parallax.
- Lighting: soft ambient, one warm glow source per scene, soft shadows, light vignette.
- Vietnamese settings, furnished with real detail: lớp học, nhà ống có lịch xé treo tường và mâm cơm, sân xóm, hẻm Sài Gòn, chợ đêm, đường lớn có xe buýt, cây cầu, cổng cấp cứu bệnh viện, phòng bệnh.
- Camera: change framing every 1–3s (wide / medium / close-up / extreme close-up); slow push-in on emotional beats. Trong thời gian đứng yên, camera vẫn di chuyển chậm quanh cảnh để thấy thế giới đông cứng.
- Color grade by act: acts 1–5 bright; act 6 desaturate to ~60%; act 7 warm dinner light turning harsh; act 8 night city, frozen blue-gray with the orange hoodie as the only saturated color; act 9 soft morning hospital light, full saturation.
~~~~~

~~~~~text
=== HIỆU ỨNG RIÊNG TẬP NÀY ===
- VỖ TAY → FREEZE: ECU hai bàn tay vỗ vào nhau, một gợn sóng tròn lan từ tay ra toàn khung (~10 frame); cả thế giới chuyển sang tông xanh xám, đứng yên tuyệt đối (người, chim, nước, bụi phấn, xe cộ); CHỈ nhân vật chính (áo cam) giữ màu và chuyển động, và những thứ bạn đang cầm/đẩy. Bụi nhỏ treo lơ lửng khắp không khí. Component FreezeWorld dùng lại được.
- UNFREEZE: hết 30 giây, gợn sóng thu ngược về, màu và âm thanh bật lại, chuyển động tiếp tục đúng từ khung đã dừng.
- ĐỒNG HỒ 30 GIÂY: trong thời gian dừng, một vòng đếm ngược nhỏ ở góc trên trái, số giây ở giữa (30 → 0), chuyển đỏ ở 5 giây cuối.
- BỘ ĐẾM TUỔI: ngay dưới đồng hồ, một dòng "+N NGÀY" tăng 1 mỗi lần vỗ tay, nảy nhẹ. Ở cao trào (act 8), bộ đếm to dần và nhảy nhanh dần tới "+63 NGÀY".
- Lão hóa nhân vật chính phải thấy được nhưng nhẹ: qua các act, bạn cao lên một chút so với bạn bè, ống tay áo hoodie ngắn lại, có vài sợi tóc dài lởm chởm trên đỉnh đầu. Không làm già đi quá mức.
- Ông nội dùng xe lăn chỉ từ act 8 trở đi (trước đó ông đi lại bình thường; xe lăn để ở góc nhà từ đầu như một đồ vật cũ).
- Cảnh đột quỵ: chỉ thể hiện chén rơi, tay run, một bên mí mắt oval sụp xuống, lời nói không ra tiếng. Không có hình ảnh đáng sợ.
- Captions từ captions.json: 2–4 từ/cụm, chữ trắng đậm viền đen, từ đang đọc tô CAM, ở dải dưới ~82% chiều cao, căn giữa; ẩn trong các hold.
- BigText: chữ to đậm nảy nhẹ cho chỗ ghi "TEXT".
~~~~~

---

## 5. Script & storyboard — EP5 complete

### 5.1 Narration script (verbatim, as supplied by the user in the EP5 brief)

The bracketed tags are delivery directions belonging to the user's voice production. They are not read aloud. The recorded MP3 + SRT are the authoritative timing source.

~~~~~text
EP5 — Nếu bạn dừng được thời gian 30 giây — nhưng mỗi lần dừng bạn già thêm 1 ngày?
VOICE
[punchy] Nếu bạn dừng được thời gian ba mươi giây — nhưng mỗi lần dừng, bạn già thêm một ngày… thì cuộc đời bạn sẽ ra sao?
[short pause] [tense] Tiết Toán. Cô gọi tên bạn lên bảng.
Bạn đứng trước bảng. Phấn trên tay. Đầu trống trơn.
Cả lớp nhìn. Cô khoanh tay.
Bạn hoảng. Bạn vỗ tay một cái. Theo phản xạ.
[short pause] Và cả lớp… đứng hình.
Cô giáo khựng giữa cái chớp mắt. Thằng Đạt ngáp dở. Bụi phấn treo lơ lửng như tuyết.
Ở góc mắt bạn, có một con số. Ba mươi. Hai mươi chín. Hai mươi tám.
Bạn không hiểu chuyện gì. Nhưng bạn hiểu mình đang có hai mươi tám giây.
Bạn chạy xuống bàn Vy — đứa giỏi Toán nhất lớp. Lật vở. Đọc đáp án. Chạy về bảng.
Ba. Hai. Một.
Cả lớp chạy lại. Bạn viết đáp án lên bảng. Đẹp. Gọn.
Cô nhìn bảng. Rồi nhìn bạn.
[as Teacher, flat] Đúng. Nhưng cô gọi em giải bài ba. Em giải bài bốn.
[short pause] [deadpan] Bạn vừa đổi một ngày tuổi thọ… để giải sai bài.

[explaining] Luật thế này.
Vỗ tay một cái — cả thế giới dừng lại. Đúng ba mươi giây. Không hơn một giây.
Chỉ mình bạn cử động. Bạn mang được đồ vật. Bạn mang được cả người — nếu bạn đủ sức.
Nhưng mỗi lần dừng, cơ thể bạn già thêm một ngày. Không ai thấy. Chỉ bạn biết.
[short pause] [serious] Và ngày đã mất thì không bao giờ lấy lại được. Nhớ chi tiết đó. Lát nữa quan trọng.
[informative] Chuyện này là thật: trong một ngày, tim bạn đập khoảng một trăm nghìn lần.
Nghĩa là mỗi lần vỗ tay, bạn tiêu một trăm nghìn nhịp tim. Cho ba mươi giây.
Ông nội bạn thì có một thói quen. Sáng nào ông cũng xé một tờ lịch treo tường. Rồi gật gù:
[as Grandpa, cheerful] Thêm một ngày lời.

[light] Đầu tiên, bạn phải học lại mọi thứ.
Ba mươi giây ngắn lắm.
Đủ để chép một câu trả lời. Không đủ để hiểu nó.
Đủ để đi từ bàn này qua bàn kia. Không đủ để ra khỏi trường.
Giờ ra chơi, Vy hỏi bạn mượn cây bút. Bạn muốn nói một câu thật hay. Bạn vỗ tay. Nghĩ. Ba mươi giây hết. Vỗ tay. Nghĩ tiếp.
Mười lần.
[as you, finally] …Nè.
[deadpan] Bạn già thêm mười ngày. Để nói một chữ "nè".

[upbeat] Nhưng rồi nó bắt đầu vui thật sự.
Mẹ làm rơi rổ trứng. Vỗ tay. Bạn đi tới, nhặt từng quả trứng đang lơ lửng, xếp lại vào rổ.
Mẹ chớp mắt. Nhìn rổ trứng. Mười quả. Không sứt một vỏ.
Đá bóng sân xóm. Bóng bay về phía khung thành bạn. Vỗ tay. Bạn đi tới, ôm bóng, đứng chờ.
Ba mươi giây sau, bạn bắt bóng như thủ môn đội tuyển. Thằng Đạt quỳ xuống sân.
Bạn chụp ảnh cả hẻm đứng hình. Một con bồ câu treo giữa trời. Ly cà phê đá đổ dở, tung ra như pháo hoa.
Một tháng. Ba mươi lần vỗ tay. Bạn bắt đầu thấy… mình lớn nhanh hơn bình thường.
Chuyện này là thật: tóc người mọc khoảng một xăng-ti-mét mỗi tháng.
Tóc bạn thì mọc nhanh hơn tóc bạn bè. Áo đồng phục chật hơn áo bạn bè. Giọng bạn bắt đầu vỡ sớm.
Ông nội nhìn bạn. Xoa đầu.
[as Grandpa, laughing] Thằng này lớn nhanh quá ta.

[slower] Nhưng có một cái giá.
Bạn bắt đầu đếm.
Bốn tháng. Một trăm hai mươi lần vỗ tay. Bạn đã già thêm bốn tháng.
Không ai biết. Không ai thấy. Nhưng bạn biết.
Bạn nhìn ông nội xé tờ lịch mỗi sáng. Tám mươi mốt tuổi. Ông quý từng ngày như vàng.
Còn bạn — bạn đã ném đi một trăm hai mươi ngày. Để đỡ trứng. Để chép bài. Để nói chữ "nè".
Vậy là có một luật.
[firm] Không dừng nữa. Không bao giờ nữa.
Ly nước rơi — kệ nó rơi. Bóng bay qua đầu — kệ nó bay. Câu trả lời không biết — thì không biết.
Bạn giữ từng ngày của mình. Chặt hơn bao giờ hết.
Mỗi sáng, ông xé lịch. Bạn đứng nhìn.
[as Grandpa, softly] Con biết sao ông vui mỗi lần xé lịch không? Vì ông còn ở đây để xé.

[tense] Tối thứ Sáu. Cả nhà đang ăn cơm.
Ông nội đưa chén lên. Rồi tay ông run.
Cái chén rơi xuống mâm. Ông nói gì đó. Nhưng chữ không ra thành tiếng. Một bên mắt ông sụp xuống.
[as Dad, panicking] Ba! Ba ơi!
Ba gọi một một lăm. Giọng ba run.
[as Dad] Kẹt xe hả? Hai mươi lăm phút?
Chuyện này là thật: với đột quỵ, mỗi phút trôi qua, não có thể mất gần hai triệu tế bào thần kinh.
Hai mươi lăm phút.
Bệnh viện cách nhà bạn hai cây số.
[short pause] Bạn nhìn ông. Ông nhìn bạn. Mắt ông sợ.
Bạn biết chính xác mình phải làm gì. Và bạn biết nó sẽ tốn bao nhiêu.
Bạn vỗ tay.

[intense] Cả nhà đứng hình. Ba với cái điện thoại. Mẹ với cái khăn. Ông với bàn tay đang buông xuống.
Bạn kéo cái xe lăn của ông ra. Bạn bế ông lên. Ông nặng hơn bạn tưởng.
Bạn đẩy ông ra cửa. Ra hẻm.
Hai mươi giây. Mười giây. Ba. Hai. Một.
Thời gian chạy lại. Tiếng xe. Tiếng còi.
Vỗ tay. Dừng.
Thêm một ngày.
Bạn đẩy tiếp. Qua đầu hẻm. Qua chợ đêm đứng hình. Qua những dòng xe máy đông cứng như tượng.
Vỗ tay. Thêm một ngày.
Ra đường lớn. Bạn lách xe lăn giữa hai chiếc xe buýt đứng yên.
Vỗ tay. Vỗ tay. Vỗ tay.
Mười ngày. Hai mươi ngày.
Chân bạn bắt đầu run. Tay bạn phồng rộp.
Bạn không cảm được mình già đi. Nhưng bạn cảm được mình mệt.
Bốn mươi ngày. Cây cầu. Bạn đẩy ông lên dốc. Từng bước.
Năm mươi ngày. Bạn thấy biển hiệu đỏ: "Cấp cứu".
Sáu mươi ngày.
Bạn đẩy ông qua cửa. Tới trước mặt một bác sĩ đang đứng hình giữa hành lang.
Bạn vỗ tay lần cuối. Không phải để dừng.
Mà để thả.
[short pause] Thời gian chạy lại.
Bác sĩ giật mình. Trước mặt cô là một ông cụ trên xe lăn. Và một thằng nhóc áo cam, ướt đẫm mồ hôi, quỳ dưới sàn.
[as you, breathless] Ông con… đột quỵ. Mới… vài phút.
Cô bác sĩ nhìn ông. Rồi hét lên:
[as Doctor] Đột quỵ! Kíp cấp cứu!
Cánh cửa phòng cấp cứu mở ra. Rồi đóng lại.
Bạn ngồi bệt xuống sàn hành lang. Bạn đếm.
Sáu mươi ba lần vỗ tay.
Sáu mươi ba ngày.
Tính từ lúc chén cơm rơi xuống mâm… mới trôi qua có bốn phút.

[gentle] Hai tuần sau. Bệnh viện.
Ông ngồi dựa gối. Nói còn chậm. Tay trái còn yếu. Nhưng ông cười được.
Bác sĩ nói ông tới kịp "giờ vàng". Chậm thêm chút nữa thôi là khác.
Ba vẫn không hiểu ông tới bệnh viện bằng cách nào. Ba hỏi cả chục lần. Bạn chỉ nói:
[as you] Con đẩy ông đi. Hơi lâu.
Ông nhìn bạn. Rất lâu.
Rồi ông xoa đầu bạn. Bằng bàn tay còn khỏe.
[as Grandpa, slow, warm] Thằng này… lớn nhanh quá ta.
[short pause] Trên tường phòng bệnh, bạn treo một cuốn lịch mới.
Sáng hôm đó, ông chỉ tay. Bạn xé một tờ.
[as Grandpa] Thêm một ngày lời.
Bạn đã cho đi sáu mươi ba ngày của mình.
Và ông có thêm rất nhiều tờ lịch nữa để xé.
Có những ngày không phải để giữ.
Mà để cho.
[short pause]
[warm] Còn bạn — nếu mỗi lần dừng thời gian tốn một ngày tuổi, bạn sẽ dùng nó cho điều gì? Kể cho mình nghe trong phần bình luận.
Bấm like và đăng ký để xem thêm những chữ "nếu" khác.
Một chữ nếu… một cuộc đời khác.
~~~~~

### 5.2 Shot list (verbatim from the brief)

~~~~~text
=== DANH SÁCH SHOT (SFX/foley trong ngoặc) ===
[1. HOOK]
1.1 MỐC "Nếu bạn dừng được thời gian": ECU hai bàn tay vỗ vào nhau → wide hẻm Sài Gòn đứng hình: chim bồ câu treo giữa trời, ly cà phê đá tung giữa không trung; đồng hồ 30 giây và "+1 NGÀY" hiện góc trên. TEXT trên cùng "NẾU MỖI LẦN DỪNG THỜI GIAN, BẠN GIÀ THÊM 1 NGÀY?" (vỗ tay, vút, tách)

[2. COLD OPEN – tiết Toán]
2.1 "Tiết Toán": cô gọi tên, bạn đi lên bảng. (ambience lớp, bước chân)
2.2 "Bạn đứng trước bảng": close-up bạn cầm phấn, mắt "> <".
2.3 "Cả lớp nhìn": wide cả lớp nhìn lên; cô khoanh tay.
2.4 "Bạn vỗ tay một cái": ECU vỗ tay → FreezeWorld. Giữ cho đọng. (vỗ tay, vút, im lặng)
2.5 "Cô giáo khựng giữa cái chớp mắt": cận cô mí mắt khép dở; Đạt ngáp dở; bụi phấn treo như tuyết.
2.6 "Ở góc mắt bạn, có một con số": đồng hồ 30 → 28. (tích tắc)
2.7 "Bạn chạy xuống bàn Vy": bạn chạy giữa các bàn đông cứng, lật vở Vy, đọc. (bước chạy, lật vở)
2.8 "Ba. Hai. Một": đồng hồ đỏ, bạn chạy về bảng → UNFREEZE. (âm thanh bật lại)
2.9 "Bạn viết đáp án": ECU phấn viết nhanh. (phấn)
2.10 "Cô nhìn bảng": close-up cô nhìn bảng, nhìn bạn, mắt nửa mí.
2.11 "Đúng. Nhưng cô gọi": cận bảng: chữ "BÀI 3" trên đề, bạn ghi "BÀI 4". Giữ cho gag. TEXT "-1 NGÀY TUỔI. GIẢI SAI BÀI."

[3. LUẬT CHƠI – nền tối giản]
3.1 "Luật thế này": bạn ở giữa, icon nổi lên. (whoosh UI)
3.2 "Vỗ tay một cái": vỗ tay → đồng hồ 30 giây. (vỗ tay)
3.3 "Chỉ mình bạn cử động": bạn đi giữa các bóng người đông cứng, nhấc một cái ghế; rồi cõng thử một bóng người, mắt "> <".
3.4 "Nhưng mỗi lần dừng": bộ đếm "+1 NGÀY" bật ra trên đầu bạn. (tách)
3.5 "Và ngày đã mất": tờ lịch bay đi, không quay lại; dấu khóa. TEXT "NHỚ CHI TIẾT NÀY". (buzz)
3.6 "trong một ngày, tim bạn đập": icon trái tim đập, TEXT "~100.000 NHỊP / NGÀY".
3.7 "Ông nội bạn thì có một thói quen": nhà buổi sáng, ông xé một tờ lịch treo tường. Giới thiệu "ÔNG NỘI – 81 TUỔI". (xé lịch)
3.8 "Thêm một ngày lời": close-up ông mắt cong, gật gù.

[4. HỌC LẠI MỌI THỨ]
4.1 "Ba mươi giây ngắn lắm": đồng hồ 30 giây chạy nhanh.
4.2 "Đủ để chép một câu trả lời": chia đôi khung: chép xong / không hiểu gì (mắt nửa mí).
4.3 "Đủ để đi từ bàn này qua bàn kia": bạn chạy tới cổng trường, đồng hồ hết khi còn cách cổng một đoạn.
4.4 "Giờ ra chơi, Vy hỏi bạn mượn": Vy đưa tay; bạn vỗ tay liên tục — mười nhịp cắt nhanh, bộ đếm +1 → +10; mỗi lần bạn đứng nghĩ trong thế giới đông cứng với tư thế khác nhau. (vỗ tay x10, tách x10)
4.5 "…Nè": bạn đưa cây bút, Vy nhận. Close-up bạn mắt "> <".
4.6 "Bạn già thêm mười ngày": TEXT "+10 NGÀY = 'NÈ'".

[5. BẮT ĐẦU VUI]
5.1 "Mẹ làm rơi rổ trứng": slow motion trứng bay ra → vỗ tay, freeze; bạn nhặt từng quả trứng lơ lửng bỏ lại rổ → unfreeze. (vỗ tay, vút, trứng đặt vào rổ)
5.2 "Mẹ chớp mắt": close-up Mẹ nhìn rổ trứng nguyên vẹn, mắt tròn.
5.3 "Đá bóng sân xóm": bóng bay tới khung thành → freeze; bạn đi tới, ôm bóng, đứng chờ; unfreeze → bạn bắt bóng như thủ môn đội tuyển; Đạt quỳ xuống. Giữ cho gag. (sút, vỗ tay, ôm bóng, reo)
5.4 "Bạn chụp ảnh cả hẻm đứng hình": montage ảnh: bồ câu treo giữa trời, ly cà phê đá tung như pháo hoa. (tiếng chụp ảnh x2)
5.5 "Một tháng. Ba mươi lần vỗ tay": bộ đếm nhảy tới "+30 NGÀY".
5.6 "tóc người mọc khoảng": TEXT "~1 CM / THÁNG".
5.7 "Tóc bạn thì mọc nhanh hơn": bạn đứng cạnh Đạt, cao hơn một chút; ống tay áo ngắn lại; vài sợi tóc lởm chởm trên đầu.
5.8 "Ông nội nhìn bạn. Xoa đầu": ông xoa đầu bạn, mắt cong. (cười)

[6. CÁI GIÁ – giảm bão hòa dần]
6.1 "Nhưng có một cái giá": slow push vào bạn.
6.2 "Bạn bắt đầu đếm": bạn ngồi ở bàn học, đếm vạch trên một tờ giấy.
6.3 "Bốn tháng": bộ đếm to giữa khung "+120 NGÀY".
6.4 "Không ai biết": bạn đứng giữa lớp, mọi người cười nói bình thường.
6.5 "Bạn nhìn ông nội xé tờ lịch": ông xé lịch. (xé lịch)
6.6 "Còn bạn — bạn đã ném đi": hàng loạt tờ lịch bay ra khỏi tay bạn, tan biến; flash nhanh: trứng, vở chép bài, chữ "nè". Giữ lâu.
6.7 "Vậy là có một luật": TEXT "KHÔNG DỪNG NỮA. KHÔNG BAO GIỜ NỮA."
6.8 "Ly nước rơi — kệ nó rơi": ba cắt nhanh: ly vỡ, bóng bay qua đầu, bạn đứng ở bảng nói "Em không biết". Tay bạn nắm chặt trong túi. (ly vỡ, bóng)
6.9 "Con biết sao ông vui": close-up ông đang xé lịch, ánh nắng sáng sớm. Giữ lâu. (xé lịch)

[7. ĐÊM THỨ SÁU]
7.1 "Tối thứ Sáu": wide mâm cơm cả nhà, đèn vàng ấm; xe lăn cũ để ở góc nhà. (quạt, chén đũa)
7.2 "Ông nội đưa chén lên": ECU tay ông run.
7.3 "Cái chén rơi xuống mâm": chén rơi; một bên mí mắt ông sụp. (chén rơi)
7.4 "Ba! Ba ơi!": Ba bật dậy, mắt tròn.
7.5 "Ba gọi một một lăm": close-up Ba cầm điện thoại.
7.6 "Kẹt xe hả? Hai mươi lăm phút": TEXT "XE CẤP CỨU: 25 PHÚT".
7.7 "với đột quỵ, mỗi phút": TEXT "MỖI PHÚT: ~2 TRIỆU TẾ BÀO NÃO".
7.8 "Bệnh viện cách nhà bạn hai cây số": bản đồ đơn giản: nhà → bệnh viện "2 KM". Giữ lâu.
7.9 "Bạn nhìn ông. Ông nhìn bạn": close-up mắt ông sợ; close-up bạn.
7.10 "Bạn vỗ tay": ECU vỗ tay. (vỗ tay)

[8. CAO TRÀO – 63 ngày]
8.1 "Cả nhà đứng hình": FreezeWorld: Ba với điện thoại, Mẹ với khăn, tay ông buông dở. (vút, im lặng)
8.2 "Bạn kéo cái xe lăn": bạn kéo xe lăn từ góc nhà, bế ông lên, mắt "> <". (bánh xe lăn trên gạch, hơi thở)
8.3 "Bạn đẩy ông ra cửa": ra hẻm đông cứng.
8.4 "Hai mươi giây. Mười giây": đồng hồ đỏ → unfreeze ngắn: âm thanh đường phố ập vào. (còi, xe)
8.5 "Vỗ tay. Dừng": freeze lại. Bộ đếm +2. (vỗ tay, tách)
8.6 "Bạn đẩy tiếp. Qua đầu hẻm": chợ đêm đông cứng, dòng xe máy như tượng; camera bám theo xe lăn.
8.7 "Ra đường lớn": lách xe lăn giữa hai xe buýt đứng yên.
8.8 "Vỗ tay. Vỗ tay. Vỗ tay": chuỗi cắt nhanh tăng tốc, mỗi nhịp một bối cảnh mới, bộ đếm nhảy +10, +20. (vỗ tay dồn dập, tách)
8.9 "Chân bạn bắt đầu run": ECU tay phồng đỏ trên tay cầm xe lăn; chân run.
8.10 "Bốn mươi ngày. Cây cầu": góc thấp, bạn đẩy xe lăn lên dốc cầu từng bước, đèn đường đông cứng. Bộ đếm +40, +50.
8.11 "Bạn thấy biển hiệu đỏ": biển "CẤP CỨU" phát sáng phía xa.
8.12 "Sáu mươi ngày": bộ đếm +60; bạn đẩy ông qua cửa bệnh viện đông cứng, tới trước một bác sĩ đứng giữa hành lang.
8.13 "Bạn vỗ tay lần cuối": ECU vỗ tay → UNFREEZE. (vỗ tay, âm thanh bệnh viện bật lại)
8.14 "Bác sĩ giật mình": bác sĩ mắt tròn; bạn quỳ dưới sàn, mồ hôi. Giữ lâu.
8.15 "Đột quỵ! Kíp cấp cứu!": kíp cấp cứu chạy tới, đẩy xe lăn đi. (bước chân dồn, cửa mở)
8.16 "Cánh cửa phòng cấp cứu": cửa đóng lại. (cửa đóng)
8.17 "Bạn ngồi bệt xuống sàn": bạn ngồi dựa tường hành lang. Bộ đếm to giữa khung "+63 NGÀY". Giữ lâu.
8.18 "Tính từ lúc chén cơm rơi": đồng hồ treo tường hành lang: chỉ mới qua 4 phút. TEXT "4 PHÚT".

[9. KẾT – phòng bệnh]
9.1 "Hai tuần sau. Bệnh viện": phòng bệnh sáng sớm, ông ngồi dựa gối. (máy đo nhịp tim nhẹ)
9.2 "Bác sĩ nói ông tới kịp": bác sĩ gật đầu với Ba Mẹ. TEXT "GIỜ VÀNG".
9.3 "Ba vẫn không hiểu": Ba gãi đầu, hỏi bạn.
9.4 "Con đẩy ông đi. Hơi lâu": close-up bạn, mắt cong nhẹ.
9.5 "Ông nhìn bạn. Rất lâu": close-up ông.
9.6 "Rồi ông xoa đầu bạn": ông xoa đầu bạn bằng tay phải; "Thằng này… lớn nhanh quá ta." Giữ lâu.
9.7 "Trên tường phòng bệnh": bạn treo cuốn lịch mới. (đinh, giấy)
9.8 "Sáng hôm đó, ông chỉ tay": bạn xé một tờ lịch. (xé lịch)
9.9 "Thêm một ngày lời": close-up ông mắt cong. Giữ lâu.
9.10 "Bạn đã cho đi sáu mươi ba ngày": wide phòng bệnh ấm, nắng sớm, bạn ngồi cạnh giường ông. Slow push out.
9.11 "Có những ngày không phải để giữ": TEXT hai dòng "Có những ngày không phải để giữ." / "Mà để cho."
9.12 "Còn bạn": end card: TEXT câu hỏi bình luận, rồi "Một chữ nếu… một cuộc đời khác."
~~~~~

### 5.3 Final timing as rendered (generated from `src/tiktok2/ep5/data/timing.json`)

Camera framing for each shot is in code (`src/tiktok2/ep5/shots/act*.tsx`, `cutCam(...)` keyframes anchored to `L(...)`/`at(...)`). The table gives set/action through the MỐC line, and duration through start/end.

| Shot | Act | MỐC (shot anchor) | Lines | Start | End | Dur (s) |
|---|---|---|---|---|---|---|
| 1.1 | 1 | Nếu bạn dừng được thời gian | L001–L002 | 0:00.00 | 0:07.07 | 7.07 |
| 2.1 | 2 | Tiết Toán | L003–L004 | 0:07.07 | 0:09.67 | 2.60 |
| 2.2 | 2 | Bạn đứng trước bảng | L005–L007 | 0:09.67 | 0:13.53 | 3.87 |
| 2.3 | 2 | Cả lớp nhìn | L008–L010 | 0:13.53 | 0:16.77 | 3.23 |
| 2.4 | 2 | Bạn vỗ tay một cái | L011–L014 | 0:16.77 | 0:21.97 | 5.20 |
| 2.5 | 2 | Cô giáo khựng giữa cái chớp mắt | L015–L017 | 0:21.97 | 0:26.80 | 4.83 |
| 2.6 | 2 | Ở góc mắt bạn | L018–L023 | 0:26.80 | 0:35.60 | 8.80 |
| 2.7 | 2 | Bạn chạy xuống bàn Vy | L024–L027 | 0:35.60 | 0:41.40 | 5.80 |
| 2.8 | 2 | Ba | L028–L031 | 0:41.40 | 0:44.87 | 3.47 |
| 2.9 | 2 | Bạn viết đáp án | L032–L034 | 0:44.87 | 0:47.83 | 2.97 |
| 2.10 | 2 | Cô nhìn bảng | L035–L036 | 0:47.83 | 0:49.90 | 2.07 |
| 2.11 | 2 | Đúng | L037–L041 | 0:49.90 | 0:56.93 | 7.03 |
| 3.1 | 3 | Luật thế này | L042–L042 | 0:56.93 | 0:57.90 | 0.97 |
| 3.2 | 3 | Vỗ tay một cái | L043–L045 | 0:57.90 | 1:03.60 | 5.70 |
| 3.3 | 3 | Chỉ mình bạn cử động | L046–L048 | 1:03.60 | 1:09.30 | 5.70 |
| 3.4 | 3 | Nhưng mỗi lần dừng | L049–L051 | 1:09.30 | 1:14.43 | 5.13 |
| 3.5 | 3 | Và ngày đã mất | L052–L054 | 1:14.43 | 1:19.67 | 5.23 |
| 3.6 | 3 | trong một ngày tim bạn đập | L055–L058 | 1:19.67 | 1:28.37 | 8.70 |
| 3.7 | 3 | Ông nội bạn thì có một thói quen | L059–L061 | 1:28.37 | 1:33.67 | 5.30 |
| 3.8 | 3 | Thêm một ngày lời | L062–L062 | 1:33.67 | 1:35.57 | 1.90 |
| 4.1 | 4 | Ba mươi giây ngắn lắm | L063–L064 | 1:35.57 | 1:39.27 | 3.70 |
| 4.2 | 4 | Đủ để chép một câu trả lời | L065–L066 | 1:39.27 | 1:42.17 | 2.90 |
| 4.3 | 4 | Đủ để đi từ bàn này | L067–L068 | 1:42.17 | 1:46.00 | 3.83 |
| 4.4 | 4 | Giờ ra chơi Vy hỏi bạn mượn | L069–L076 | 1:46.00 | 1:56.20 | 10.20 |
| 4.5 | 4 | Nè | L077–L077 | 1:56.20 | 1:57.33 | 1.13 |
| 4.6 | 4 | Bạn già thêm mười ngày | L078–L079 | 1:57.33 | 2:00.80 | 3.47 |
| 5.1 | 5 | Mẹ làm rơi rổ trứng | L080–L083 | 2:00.80 | 2:08.23 | 7.43 |
| 5.2 | 5 | Mẹ chớp mắt | L084–L087 | 2:08.23 | 2:12.47 | 4.23 |
| 5.3 | 5 | Đá bóng sân xóm | L088–L093 | 2:12.47 | 2:23.17 | 10.70 |
| 5.4 | 5 | Bạn chụp ảnh cả hẻm | L094–L096 | 2:23.17 | 2:29.53 | 6.37 |
| 5.5 | 5 | Một tháng | L097–L100 | 2:29.53 | 2:34.27 | 4.73 |
| 5.6 | 5 | tóc người mọc khoảng | L101–L102 | 2:34.27 | 2:37.97 | 3.70 |
| 5.7 | 5 | Tóc bạn thì mọc nhanh hơn | L103–L105 | 2:37.97 | 2:44.40 | 6.43 |
| 5.8 | 5 | Ông nội nhìn bạn | L106–L108 | 2:44.40 | 2:48.93 | 4.53 |
| 6.1 | 6 | Nhưng có một cái giá | L109–L109 | 2:48.93 | 2:50.37 | 1.43 |
| 6.2 | 6 | Bạn bắt đầu đếm | L110–L110 | 2:50.37 | 2:51.70 | 1.33 |
| 6.3 | 6 | Bốn tháng | L111–L113 | 2:51.70 | 2:56.47 | 4.77 |
| 6.4 | 6 | Không ai biết | L114–L116 | 2:56.47 | 2:59.77 | 3.30 |
| 6.5 | 6 | Bạn nhìn ông nội xé tờ lịch | L117–L119 | 2:59.77 | 3:04.90 | 5.13 |
| 6.6 | 6 | Còn bạn | L120–L123 | 3:04.90 | 3:12.47 | 7.57 |
| 6.7 | 6 | Vậy là có một luật | L124–L126 | 3:12.47 | 3:16.37 | 3.90 |
| 6.8 | 6 | Ly nước rơi | L127–L131 | 3:16.37 | 3:26.27 | 9.90 |
| 6.9 | 6 | Con biết sao ông vui | L132–L135 | 3:26.27 | 3:34.60 | 8.33 |
| 7.1 | 7 | Tối thứ Sáu | L136–L137 | 3:34.60 | 3:37.40 | 2.80 |
| 7.2 | 7 | Ông nội đưa chén lên | L138–L139 | 3:37.40 | 3:40.37 | 2.97 |
| 7.3 | 7 | Cái chén rơi xuống mâm | L140–L143 | 3:40.37 | 3:47.00 | 6.63 |
| 7.4 | 7 | Ba | L144–L145 | 3:47.00 | 3:48.13 | 1.13 |
| 7.5 | 7 | Ba gọi một một lăm | L146–L147 | 3:48.13 | 3:50.70 | 2.57 |
| 7.6 | 7 | Kẹt xe hả | L148–L149 | 3:50.70 | 3:53.17 | 2.47 |
| 7.7 | 7 | với đột quỵ mỗi phút | L150–L152 | 3:53.17 | 3:59.93 | 6.77 |
| 7.8 | 7 | Bệnh viện cách nhà bạn hai cây số | L153–L153 | 3:59.93 | 4:03.17 | 3.23 |
| 7.9 | 7 | Bạn nhìn ông | L154–L158 | 4:03.17 | 4:10.17 | 7.00 |
| 7.10 | 7 | Bạn vỗ tay | L159–L159 | 4:10.17 | 4:11.67 | 1.50 |
| 8.1 | 8 | Cả nhà đứng hình | L160–L163 | 4:11.67 | 4:17.30 | 5.63 |
| 8.2 | 8 | Bạn kéo cái xe lăn | L164–L166 | 4:17.30 | 4:22.07 | 4.77 |
| 8.3 | 8 | Bạn đẩy ông ra cửa | L167–L168 | 4:22.07 | 4:24.33 | 2.27 |
| 8.4 | 8 | Hai mươi giây | L169–L176 | 4:24.33 | 4:30.30 | 5.97 |
| 8.5 | 8 | Vỗ tay | L177–L179 | 4:30.30 | 4:32.27 | 1.97 |
| 8.6 | 8 | Bạn đẩy tiếp | L180–L185 | 4:32.27 | 4:38.37 | 6.10 |
| 8.7 | 8 | Ra đường lớn | L186–L187 | 4:38.37 | 4:41.70 | 3.33 |
| 8.8 | 8 | Vỗ tay | L188–L192 | 4:41.70 | 4:45.70 | 4.00 |
| 8.9 | 8 | Chân bạn bắt đầu run | L193–L196 | 4:45.70 | 4:50.90 | 5.20 |
| 8.10 | 8 | Bốn mươi ngày | L197–L201 | 4:50.90 | 4:55.17 | 4.27 |
| 8.11 | 8 | Bạn thấy biển hiệu đỏ | L202–L203 | 4:55.17 | 4:57.87 | 2.70 |
| 8.12 | 8 | Sáu mươi ngày | L204–L206 | 4:57.87 | 5:03.23 | 5.37 |
| 8.13 | 8 | Bạn vỗ tay lần cuối | L207–L210 | 5:03.23 | 5:08.43 | 5.20 |
| 8.14 | 8 | Bác sĩ giật mình | L211–L217 | 5:08.43 | 5:19.87 | 11.43 |
| 8.15 | 8 | Đột quỵ Kíp cấp cứu | L218–L221 | 5:19.87 | 5:24.47 | 4.60 |
| 8.16 | 8 | Cánh cửa phòng cấp cứu | L222–L223 | 5:24.47 | 5:28.03 | 3.57 |
| 8.17 | 8 | Bạn ngồi bệt xuống sàn | L224–L227 | 5:28.03 | 5:35.23 | 7.20 |
| 8.18 | 8 | Tính từ lúc chén cơm rơi | L228–L229 | 5:35.23 | 5:39.77 | 4.53 |
| 9.1 | 9 | Hai tuần sau | L230–L235 | 5:39.77 | 5:46.93 | 7.17 |
| 9.2 | 9 | Bác sĩ nói ông tới kịp | L236–L237 | 5:46.93 | 5:51.37 | 4.43 |
| 9.3 | 9 | Ba vẫn không hiểu | L238–L240 | 5:51.37 | 5:56.40 | 5.03 |
| 9.4 | 9 | Con đẩy ông đi | L241–L242 | 5:56.40 | 5:58.97 | 2.57 |
| 9.5 | 9 | Ông nhìn bạn | L243–L244 | 5:58.97 | 6:01.43 | 2.47 |
| 9.6 | 9 | Rồi ông xoa đầu bạn | L245–L248 | 6:01.43 | 6:07.83 | 6.40 |
| 9.7 | 9 | Trên tường phòng bệnh | L249–L249 | 6:07.83 | 6:10.93 | 3.10 |
| 9.8 | 9 | Sáng hôm đó ông chỉ tay | L250–L251 | 6:10.93 | 6:14.73 | 3.80 |
| 9.9 | 9 | Thêm một ngày lời | L252–L252 | 6:14.73 | 6:17.53 | 2.80 |
| 9.10 | 9 | Bạn đã cho đi sáu mươi ba ngày | L253–L254 | 6:17.53 | 6:22.83 | 5.30 |
| 9.11 | 9 | Có những ngày không phải để giữ | L255–L256 | 6:22.83 | 6:26.73 | 3.90 |
| 9.12 | 9 | Còn bạn | L257–L261 | 6:26.73 | 6:40.00 | 13.27 |

Total: 12000 frames = 6:40.00; end card from frame 11955; 261 narration lines.

Narration lines as cut (id · source trim frames in the original MP3 · absolute frames · text):

~~~~~text
L001  src 1–138  at 3–140  Nếu bạn dừng được thời gian ba mươi giây — nhưng mỗi lần dừng, bạn già thêm một ngày …
L002  src 149–194  at 146–191  thì cuộc đời bạn sẽ ra sao?
L003  src 203–224  at 214–235  Tiết Toán.
L004  src 235–274  at 241–280  Cô gọi tên bạn lên bảng.
L005  src 284–313  at 292–321  Bạn đứng trước bảng.
L006  src 321–349  at 327–355  Phấn trên tay.
L007  src 353–387  at 359–393  Đầu trống trơn.
L008  src 393–418  at 408–433  Cả lớp nhìn.
L009  src 429–453  at 439–463  Cô khoanh tay.
L010  src 464–485  at 469–490  Bạn hoảng.
L011  src 496–531  at 505–540  Bạn vỗ tay một cái.
L012  src 541–564  at 546–569  Theo phản xạ.
L013  src 576–599  at 575–598  Và cả lớp …
L014  src 607–628  at 604–625  đứng hình.
L015  src 639–680  at 661–702  Cô giáo khựng giữa cái chớp mắt.
L016  src 694–724  at 708–738  Thằng Đạt ngáp dở.
L017  src 733–781  at 745–793  Bụi phấn treo lơ lửng như tuyết.
L018  src 782–839  at 806–863  Ở góc mắt bạn, có một con số.
L019  src 858–880  at 869–891  Ba mươi.
L020  src 895–920  at 897–922  Hai mươi chín.
L021  src 929–953  at 928–952  Hai mươi tám.
L022  src 953–996  at 952–995  Bạn không hiểu chuyện gì.
L023  src 1000–1060  at 999–1059  Nhưng bạn hiểu mình đang có hai mươi tám giây.
L024  src 1062–1141  at 1070–1149  Bạn chạy xuống bàn Vy — đứa giỏi Toán nhất lớp.
L025  src 1149–1170  at 1155–1176  Lật vở.
L026  src 1173–1198  at 1179–1204  Đọc đáp án.
L027  src 1204–1227  at 1209–1232  Chạy về bảng.
L028  src 1241–1256  at 1244–1259  Ba.
L029  src 1267–1283  at 1265–1281  Hai.
L030  src 1291–1308  at 1287–1304  Một.
L031  src 1311–1337  at 1307–1333  Cả lớp chạy lại.
L032  src 1345–1385  at 1348–1388  Bạn viết đáp án lên bảng.
L033  src 1392–1405  at 1394–1407  Đẹp.
L034  src 1414–1427  at 1413–1426  Gọn.
L035  src 1436–1458  at 1437–1459  Cô nhìn bảng.
L036  src 1462–1484  at 1463–1485  Rồi nhìn bạn.
L037  src 1497–1513  at 1499–1515  Đúng.
L038  src 1522–1560  at 1521–1559  Nhưng cô gọi em giải bài ba.
L039  src 1564–1591  at 1563–1590  Em giải bài bốn.
L040  src 1591–1633  at 1590–1632  Bạn vừa đổi một ngày tuổi thọ …
L041  src 1647–1678  at 1639–1670  để giải sai bài.
L042  src 1697–1720  at 1710–1733  Luật thế này.
L043  src 1735–1815  at 1739–1819  Vỗ tay một cái — cả thế giới dừng lại.
L044  src 1828–1861  at 1825–1858  Đúng ba mươi giây.
L045  src 1868–1900  at 1864–1896  Không hơn một giây.
L046  src 1909–1942  at 1910–1943  Chỉ mình bạn cử động.
L047  src 1954–1986  at 1949–1981  Bạn mang được đồ vật.
L048  src 1995–2075  at 1988–2068  Bạn mang được cả người — nếu bạn đủ sức.
L049  src 2076–2154  at 2081–2159  Nhưng mỗi lần dừng, cơ thể bạn già thêm một ngày.
L050  src 2169–2195  at 2165–2191  Không ai thấy.
L051  src 2205–2227  at 2197–2219  Chỉ bạn biết.
L052  src 2246–2310  at 2235–2299  Và ngày đã mất thì không bao giờ lấy lại được.
L053  src 2327–2359  at 2305–2337  Nhớ chi tiết đó.
L054  src 2369–2397  at 2343–2371  Lát nữa quan trọng.
L055  src 2414–2437  at 2392–2415  Chuyện này là thật:
L056  src 2453–2535  at 2421–2503  trong một ngày, tim bạn đập khoảng một trăm nghìn lần.
L057  src 2549–2639  at 2509–2599  Nghĩa là mỗi lần vỗ tay, bạn tiêu một trăm nghìn nhịp tim.
L058  src 2654–2684  at 2605–2635  Cho ba mươi giây.
L059  src 2695–2743  at 2653–2701  Ông nội bạn thì có một thói quen.
L060  src 2755–2817  at 2707–2769  Sáng nào ông cũng xé một tờ lịch treo tường.
L061  src 2819–2844  at 2771–2796  Rồi gật gù:
L062  src 2856–2883  at 2812–2839  Thêm một ngày lời.
L063  src 2893–2952  at 2869–2928  Đầu tiên, bạn phải học lại mọi thứ.
L064  src 2961–2995  at 2934–2968  Ba mươi giây ngắn lắm.
L065  src 3003–3044  at 2980–3021  Đủ để chép một câu trả lời.
L066  src 3053–3093  at 3027–3067  joinNext  Không đủ để hiểu nó.
L067  src 3093–3141  at 3067–3115  Đủ để đi từ bàn này qua bàn kia.
L068  src 3148–3188  at 3121–3161  Không đủ để ra khỏi trường.
L069  src 3197–3261  at 3182–3246  Giờ ra chơi, Vy hỏi bạn mượn cây bút.
L070  src 3277–3321  at 3251–3295  Bạn muốn nói một câu thật hay.
L071  src 3333–3357  at 3301–3325  Bạn vỗ tay.
L072  src 3375–3390  at 3332–3347  Nghĩ.
L073  src 3400–3427  at 3353–3380  Ba mươi giây hết.
L074  src 3433–3451  at 3386–3404  Vỗ tay.
L075  src 3460–3478  at 3410–3428  Nghĩ tiếp.
L076  src 3490–3509  at 3434–3453  Mười lần.
L077  src 3514–3527  at 3488–3501  Nè.
L078  src 3536–3573  at 3522–3559  Bạn già thêm mười ngày.
L079  src 3578–3619  at 3564–3605  Để nói một chữ "nè".
L080  src 3622–3670  at 3626–3674  Nhưng rồi nó bắt đầu vui thật sự.
L081  src 3681–3719  at 3674–3712  Mẹ làm rơi rổ trứng.
L082  src 3729–3750  at 3712–3733  Vỗ tay.
L083  src 3758–3868  at 3733–3843  Bạn đi tới, nhặt từng quả trứng đang lơ lửng, xếp lại vào rổ.
L084  src 3878–3904  at 3849–3875  Mẹ chớp mắt.
L085  src 3915–3945  at 3875–3905  Nhìn rổ trứng.
L086  src 3954–3979  at 3905–3930  Mười quả.
L087  src 3986–4017  at 3930–3961  Không sứt một vỏ.
L088  src 4027–4060  at 3976–4009  Đá bóng sân xóm.
L089  src 4062–4106  at 4009–4053  Bóng bay về phía khung thành bạn.
L090  src 4125–4148  at 4053–4076  Vỗ tay.
L091  src 4149–4219  at 4076–4146  Bạn đi tới, ôm bóng, đứng chờ.
L092  src 4235–4315  at 4146–4226  Ba mươi giây sau, bạn bắt bóng như thủ môn đội tuyển.
L093  src 4327–4365  at 4226–4264  Thằng Đạt quỳ xuống sân.
L094  src 4365–4415  at 4297–4347  Bạn chụp ảnh cả hẻm đứng hình.
L095  src 4430–4480  at 4347–4397  Một con bồ câu treo giữa trời.
L096  src 4491–4570  at 4397–4476  Ly cà phê đá đổ dở, tung ra như pháo hoa.
L097  src 4589–4612  at 4488–4511  Một tháng.
L098  src 4616–4652  at 4511–4547  Ba mươi lần vỗ tay.
L099  src 4671–4702  at 4547–4578  Bạn bắt đầu thấy …
L100  src 4714–4757  at 4578–4621  mình lớn nhanh hơn bình thường.
L101  src 4776–4800  at 4630–4654  Chuyện này là thật:
L102  src 4803–4869  at 4657–4723  tóc người mọc khoảng một xăng-ti-mét mỗi tháng.
L103  src 4883–4943  at 4741–4801  Tóc bạn thì mọc nhanh hơn tóc bạn bè.
L104  src 4947–5007  at 4805–4865  Áo đồng phục chật hơn áo bạn bè.
L105  src 5017–5062  at 4871–4916  Giọng bạn bắt đầu vỡ sớm.
L106  src 5069–5097  at 4934–4962  Ông nội nhìn bạn.
L107  src 5110–5132  at 4968–4990  Xoa đầu.
L108  src 5145–5189  at 4996–5040  Thằng này lớn nhanh quá ta.
L109  src 5200–5236  at 5070–5106  Nhưng có một cái giá.
L110  src 5247–5275  at 5113–5141  Bạn bắt đầu đếm.
L111  src 5285–5309  at 5153–5177  Bốn tháng.
L112  src 5318–5361  at 5183–5226  Một trăm hai mươi lần vỗ tay.
L113  src 5371–5418  at 5232–5279  Bạn đã già thêm bốn tháng.
L114  src 5424–5448  at 5296–5320  Không ai biết.
L115  src 5455–5480  at 5326–5351  Không ai thấy.
L116  src 5489–5512  at 5357–5380  Nhưng bạn biết.
L117  src 5520–5579  at 5395–5454  Bạn nhìn ông nội xé tờ lịch mỗi sáng.
L118  src 5582–5609  at 5457–5484  Tám mươi mốt tuổi.
L119  src 5618–5663  at 5489–5534  Ông quý từng ngày như vàng.
L120  src 5673–5754  at 5549–5630  Còn bạn — bạn đã ném đi một trăm hai mươi ngày.
L121  src 5758–5783  at 5634–5659  Để đỡ trứng.
L122  src 5793–5818  at 5665–5690  Để chép bài.
L123  src 5826–5862  at 5696–5732  Để nói chữ "nè".
L124  src 5872–5899  at 5776–5803  Vậy là có một luật.
L125  src 5909–5935  at 5810–5836  Không dừng nữa.
L126  src 5940–5968  at 5841–5869  Không bao giờ nữa.
L127  src 5975–6030  at 5893–5948  Ly nước rơi — kệ nó rơi.
L128  src 6038–6096  at 5954–6012  Bóng bay qua đầu — kệ nó bay.
L129  src 6099–6168  at 6015–6084  Câu trả lời không biết — thì không biết.
L130  src 6168–6215  at 6086–6133  Bạn giữ từng ngày của mình.
L131  src 6225–6258  at 6139–6172  Chặt hơn bao giờ hết.
L132  src 6265–6315  at 6190–6240  Mỗi sáng, ông xé lịch.
L133  src 6326–6354  at 6247–6275  Bạn đứng nhìn.
L134  src 6366–6426  at 6281–6341  Con biết sao ông vui mỗi lần xé lịch không?
L135  src 6435–6474  at 6347–6386  Vì ông còn ở đây để xé.
L136  src 6491–6515  at 6440–6464  Tối thứ Sáu.
L137  src 6533–6572  at 6470–6509  Cả nhà đang ăn cơm.
L138  src 6579–6613  at 6524–6558  Ông nội đưa chén lên.
L139  src 6613–6654  at 6558–6599  Rồi tay ông run.
L140  src 6659–6706  at 6613–6660  Cái chén rơi xuống mâm.
L141  src 6706–6744  at 6660–6698  Ông nói gì đó.
L142  src 6753–6794  at 6703–6744  Nhưng chữ không ra thành tiếng.
L143  src 6797–6848  at 6747–6798  Một bên mắt ông sụp xuống.
L144  src 6848–6864  at 6812–6828  joinNext  Ba!
L145  src 6864–6882  at 6828–6846  joinNext  Ba ơi!
L146  src 6882–6917  at 6846–6881  Ba gọi một một lăm.
L147  src 6919–6948  at 6883–6912  Giọng ba run.
L148  src 6953–6978  at 6923–6948  Kẹt xe hả?
L149  src 6987–7011  at 6955–6979  Hai mươi lăm phút?
L150  src 7020–7042  at 6997–7019  Chuyện này là thật:
L151  src 7049–7176  at 7025–7152  với đột quỵ, mỗi phút trôi qua, não có thể mất gần hai triệu tế bào thần kinh.
L152  src 7181–7209  at 7157–7185  Hai mươi lăm phút.
L153  src 7212–7263  at 7200–7251  Bệnh viện cách nhà bạn hai cây số.
L154  src 7271–7294  at 7297–7320  Bạn nhìn ông.
L155  src 7301–7323  at 7326–7348  Ông nhìn bạn.
L156  src 7330–7354  at 7354–7378  Mắt ông sợ.
L157  src 7362–7412  at 7384–7434  Bạn biết chính xác mình phải làm gì.
L158  src 7421–7471  at 7439–7489  Và bạn biết nó sẽ tốn bao nhiêu.
L159  src 7478–7504  at 7507–7533  Bạn vỗ tay.
L160  src 7516–7544  at 7552–7580  Cả nhà đứng hình.
L161  src 7551–7590  at 7585–7624  Ba với cái điện thoại.
L162  src 7599–7626  at 7631–7658  Mẹ với cái khăn.
L163  src 7626–7672  at 7660–7706  Ông với bàn tay đang buông xuống.
L164  src 7682–7730  at 7721–7769  Bạn kéo cái xe lăn của ông ra.
L165  src 7741–7770  at 7775–7804  Bạn bế ông lên.
L166  src 7781–7820  at 7810–7849  Ông nặng hơn bạn tưởng.
L167  src 7829–7865  at 7864–7900  Bạn đẩy ông ra cửa.
L168  src 7876–7897  at 7905–7926  Ra hẻm.
L169  src 7912–7938  at 7932–7958  Hai mươi giây.
L170  src 7955–7979  at 7958–7982  Mười giây.
L171  src 7991–8009  at 7982–8000  Ba.
L172  src 8019–8038  at 8000–8019  Hai.
L173  src 8046–8064  at 8019–8037  Một.
L174  src 8072–8101  at 8037–8066  Thời gian chạy lại.
L175  src 8115–8139  at 8066–8090  Tiếng xe.
L176  src 8148–8169  at 8090–8111  Tiếng còi.
L177  src 8169–8189  at 8111–8131  Vỗ tay.
L178  src 8198–8214  at 8131–8147  Dừng.
L179  src 8230–8253  at 8147–8170  Thêm một ngày.
L180  src 8261–8287  at 8170–8196  Bạn đẩy tiếp.
L181  src 8298–8320  at 8196–8218  Qua đầu hẻm.
L182  src 8332–8367  at 8218–8253  Qua chợ đêm đứng hình.
L183  src 8379–8436  at 8253–8310  Qua những dòng xe máy đông cứng như tượng.
L184  src 8447–8467  at 8310–8330  Vỗ tay.
L185  src 8477–8500  at 8330–8353  Thêm một ngày.
L186  src 8507–8536  at 8353–8382  Ra đường lớn.
L187  src 8539–8610  at 8382–8453  Bạn lách xe lăn giữa hai chiếc xe buýt đứng yên.
L188  src 8618–8638  at 8453–8473  Vỗ tay.
L189  src 8646–8671  at 8473–8498  Vỗ tay.
L190  src 8675–8700  at 8498–8523  Vỗ tay.
L191  src 8704–8729  at 8523–8548  Mười ngày.
L192  src 8734–8759  at 8548–8573  Hai mươi ngày.
L193  src 8765–8797  at 8573–8605  Chân bạn bắt đầu run.
L194  src 8797–8832  at 8607–8642  Tay bạn phồng rộp.
L195  src 8838–8888  at 8642–8692  Bạn không cảm được mình già đi.
L196  src 8889–8926  at 8692–8729  Nhưng bạn cảm được mình mệt.
L197  src 8930–8958  at 8729–8757  Bốn mươi ngày.
L198  src 8963–8986  at 8757–8780  Cây cầu.
L199  src 8986–9017  at 8780–8811  Bạn đẩy ông lên dốc.
L200  src 9029–9048  at 8811–8830  Từng bước.
L201  src 9060–9087  at 8830–8857  Năm mươi ngày.
L202  src 9091–9126  at 8857–8892  Bạn thấy biển hiệu đỏ:
L203  src 9149–9174  at 8898–8923  "Cấp cứu".
L204  src 9195–9222  at 8938–8965  Sáu mươi ngày.
L205  src 9230–9267  at 8971–9008  Bạn đẩy ông qua cửa.
L206  src 9278–9351  at 9015–9088  Tới trước mặt một bác sĩ đang đứng hình giữa hành lang.
L207  src 9360–9397  at 9099–9136  Bạn vỗ tay lần cuối.
L208  src 9409–9439  at 9142–9172  Không phải để dừng.
L209  src 9450–9476  at 9179–9205  Mà để thả.
L210  src 9492–9521  at 9212–9241  Thời gian chạy lại.
L211  src 9532–9563  at 9255–9286  Bác sĩ giật mình.
L212  src 9574–9629  at 9292–9347  Trước mặt cô là một ông cụ trên xe lăn.
L213  src 9641–9739  at 9353–9451  Và một thằng nhóc áo cam, ướt đẫm mồ hôi, quỳ dưới sàn.
L214  src 9751–9772  at 9457–9478  Ông con …
L215  src 9781–9803  at 9484–9506  đột quỵ.
L216  src 9819–9839  at 9512–9532  Mới …
L217  src 9850–9870  at 9538–9558  vài phút.
L218  src 9871–9905  at 9598–9632  Cô bác sĩ nhìn ông.
L219  src 9909–9936  at 9636–9663  Rồi hét lên:
L220  src 9942–9965  at 9669–9692  Đột quỵ!
L221  src 9971–9999  at 9698–9726  Kíp cấp cứu!
L222  src 10000–10056  at 9736–9792  Cánh cửa phòng cấp cứu mở ra.
L223  src 10059–10083  at 9795–9819  Rồi đóng lại.
L224  src 10095–10147  at 9843–9895  Bạn ngồi bệt xuống sàn hành lang.
L225  src 10150–10173  at 9898–9921  Bạn đếm.
L226  src 10183–10227  at 9927–9971  Sáu mươi ba lần vỗ tay.
L227  src 10236–10267  at 9977–10008  Sáu mươi ba ngày.
L228  src 10270–10322  at 10059–10111  Tính từ lúc chén cơm rơi xuống mâm …
L229  src 10325–10365  at 10114–10154  mới trôi qua có bốn phút.
L230  src 10375–10402  at 10195–10222  Hai tuần sau.
L231  src 10411–10431  at 10228–10248  Bệnh viện.
L232  src 10438–10472  at 10254–10288  Ông ngồi dựa gối.
L233  src 10476–10502  at 10292–10318  Nói còn chậm.
L234  src 10511–10546  at 10325–10360  Tay trái còn yếu.
L235  src 10555–10585  at 10366–10396  Nhưng ông cười được.
L236  src 10590–10656  at 10410–10476  Bác sĩ nói ông tới kịp "giờ vàng".
L237  src 10660–10706  at 10480–10526  Chậm thêm chút nữa thôi là khác.
L238  src 10711–10775  at 10543–10607  Ba vẫn không hiểu ông tới bệnh viện bằng cách nào.
L239  src 10777–10817  at 10609–10649  Ba hỏi cả chục lần.
L240  src 10821–10850  at 10653–10682  Bạn chỉ nói:
L241  src 10856–10887  at 10694–10725  Con đẩy ông đi.
L242  src 10890–10911  at 10728–10749  Hơi lâu.
L243  src 10915–10936  at 10771–10792  Ông nhìn bạn.
L244  src 10944–10964  at 10799–10819  Rất lâu.
L245  src 10964–11000  at 10845–10881  Rồi ông xoa đầu bạn.
L246  src 11001–11037  at 10882–10918  Bằng bàn tay còn khỏe.
L247  src 11046–11067  at 10924–10945  Thằng này …
L248  src 11078–11110  at 10951–10983  lớn nhanh quá ta.
L249  src 11125–11200  at 11037–11112  Trên tường phòng bệnh, bạn treo một cuốn lịch mới.
L250  src 11213–11267  at 11130–11184  Sáng hôm đó, ông chỉ tay.
L251  src 11279–11313  at 11190–11224  Bạn xé một tờ.
L252  src 11324–11354  at 11244–11274  Thêm một ngày lời.
L253  src 11370–11426  at 11328–11384  Bạn đã cho đi sáu mươi ba ngày của mình.
L254  src 11443–11507  at 11390–11454  Và ông có thêm rất nhiều tờ lịch nữa để xé.
L255  src 11525–11567  at 11487–11529  Có những ngày không phải để giữ.
L256  src 11582–11605  at 11536–11559  Mà để cho.
L257  src 11625–11764  at 11604–11743  Còn bạn — nếu mỗi lần dừng thời gian tốn một ngày tuổi, bạn sẽ dùng nó cho điều gì?
L258  src 11768–11810  at 11747–11789  Kể cho mình nghe trong phần bình luận.
L259  src 11830–11922  at 11795–11887  Bấm like và đăng ký để xem thêm những chữ "nếu" khác.
L260  src 11933–11960  at 11893–11920  Một chữ nếu …
L261  src 11969–11998  at 11926–11955  một cuộc đời khác.
~~~~~

---

## 6. Audio

**Voice** [CONFIRMED]:
- The source is the user's MP3 (`public/kênh tiktok 2/Voice/epN/epN tiktok2.mp3`). The generating service, voice ID and settings are [UNKNOWN].
- Each sentence is a separate `<Html5Audio src={staticFile(VOICE)} trimBefore={l.src[0]} trimAfter={l.src[1]} volume={1.0}>`, inside a `<Sequence from={l.from} durationInFrames={l.to-l.from} layout="none">` at an **absolute frame**.
- No `playbackRate` and no pitch change.
- `staticFile()` handles the spaces and Vietnamese diacritics in the path.

**Sync:**
- Sentence boundaries come from silence detection (`build_timing.py`, 10 ms energy envelope on the 16 kHz Whisper wav).
- Captions use Whisper word times, re-based to each line's new position.
- Picture events anchor to words: `at("L011", "vỗ tay")`, `L("L025")`, `line(id).holdFrom`, etc.
- `check_cuts.py` verifies that every cut lies in silence.

**Music:** none [CONFIRMED]. The brief forbade copyrighted music.

**SFX / foley / ambience** [CONFIRMED]:
- All are synthesized by `scripts/tiktok2/epN/generate-sfx.mjs`. They are deterministic and seeded, mono 44.1 kHz 16-bit WAV. No sample libraries are used.
- Helpers: `scripts/sfx-lib.mjs` (pre-existing: `buffer`, `rng`, `biquad`, `smoothstep`, `writeWav`, `SR`) and the EP1 synth functions (`add, babble, clink, creak, crinkle, filt, heartbeat, hum, loopify, passby, pop, room, scrape, steps, thud, verb, whoosh`, …).
- Lessons from the noise complaints (now channel rules): avoid pure high sines and long broadband noise, avoid birds, and low-pass distant crowd babble.

EP5 file list (verbatim names):
~~~~~text
amb_alley_loop.wav
amb_class_soft_loop.wav
amb_dinner_loop.wav
amb_er_loop.wav
amb_home_loop.wav
amb_quiet_loop.wav
amb_room_tone_loop.wav
amb_street_night_loop.wav
amb_ward_loop.wav
amb_yard_soft_loop.wav
ball_hug.wav
ball_kick.wav
basket_drop.wav
bowl_drop.wav
breath.wav
breath_loop.wav
buzz.wav
calendar_tear.wav
camera_shutter.wav
chair_lift.wav
chair_scrape.wav
chalk.wav
cheer.wav
clap.wav
clock_tick.wav
cloth.wav
day_tick.wav
door_close_heavy.wav
door_swing.wav
egg_place.wav
freeze_hum_loop.wav
freeze_stem.wav
freeze_whoosh.wav
glass_break.wav
grandpa_chuckle.wav
heartbeat_loop.wav
horn.wav
monitor_beep.wav
nail_tap.wav
page_flip.wav
paper.wav
paper_flutter.wav
pencil_marks.wav
phone_dial.wav
startle.wav
steps_run_loop.wav
steps_tile_loop.wav
street_burst.wav
thaw.wav
ting.wav
wheel_hospital.wav
wheel_road.wav
wheel_tile.wav
whoosh.wav
whoosh_ui.wav
~~~~~

**Mix** (`src/tiktok2/epN/audio.tsx`; values approved by the user after the "SFX too loud" feedback) [CONFIRMED]:
- Gains: `VOICE_GAIN = 1.0`, `FX_GAIN = 0.45`, `BED_GAIN = 0.56`.
- Ducking near voice: beds `DUCK_BED = 10^(−12/20)`, FX `DUCK_FX = 10^(−15/20)`, with a 5-frame ramp computed from the distance to the nearest sentence (12-frame look-around).
- Beds are merged runs of shots with the same ambience key, ±6/+10 frame overlap, 12-frame fades. Each key maps to 1–2 loops, e.g. `class: amb_class_soft_loop 0.6 + amb_room_tone_loop 0.35`.
- Ambience removed by the user: `amb_bedroom_morning_loop` and `amb_class_loop`.
- EP5 special:
  - beds × `(1 − freezeK)`, so the ambience is off during a freeze;
  - `freeze_hum_loop` (0.5) during each freeze and `thaw` at each unfreeze;
  - claps, whooshes, day-ticks and clock-ticks (red last-5-s ticks at 0.6, others 0.4) baked into `freeze_stem.wav`, played once and ducked;
  - beds split around freezes.

**Loudness/QA:** `check_mix.py` measures peak dBFS, dead windows and quiet lines. No LUFS normalisation was done [CONFIRMED: none performed].

**Encoding:**
- Remotion's default AAC when rendering the MP4 directly; the bitrate is [UNKNOWN] (the Remotion default).
- 256 kb/s AAC when muxed with ffmpeg (all final files were muxed at least once).

---

## 7. Editing & post-production

**Assembly** [CONFIRMED]:
- One composition per episode (`Tiktok2EpN`, 1920×1080, 30 fps, `durationInFrames = timing.totalFrames`).
- Each shot is a `<Sequence from={shot.from} durationInFrames={shot.to-shot.from}>` at absolute frames, rendering its `ShotDef.C` component.
- The audio layer is separate (not inside scene components).
- No `<Series>`/`TransitionSeries`; cuts are hard.
- Effects are scene components: `Ripple`, `FrozenDust`, `ClapECU`, flashes, `Pow` pops, `BigText` bounce.
- End card about 1.5 s (`endCard`).

**Captions** (`Captions` in `src/tiktok2/ep1/ui.tsx`) [CONFIRMED]:
- Words come from `captions.json` / the timing lines, chunked 2–4 words, breaking at punctuation; a single trailing word merges into the previous chunk.
- Font Baloo 2 weight 800, **50 px** (user feedback), uppercase, white `#ffffff`, active word orange `#ff7a1a`.
- Black stroke `size*0.16` and text shadow `0 4px 0 rgba(0,0,0,0.4)`. Pop-in scale 0.82→1.06→1 over 6 frames.
- Y position 950 px by default; EP5 uses `yAt={() => 886}`. Width is the safe area (5% side margins).
- Hidden during holds (only shown while a line is spoken, plus optional `sticky`).

**On-screen text:**
- `BigText` (Baloo 2 800, default 96 px × 0.8, bounce spring, accent lines orange).
- `Pow` (Baloo 2 800, rotated, spring).
- HUDs: `BreathRing` (EP1), `RewindCounter` (EP3), `ClockHUD` + "+N NGÀY" (EP5).
- Chalk/handwriting uses Patrick Hand.

**Colour grading:** per act, via CSS filters and overlays (see §1.1).

**Export:**
- `--codec=h264 --crf=18`.
- In final files the audio is AAC 256k via ffmpeg `-c:v copy -c:a aac -b:a 256k -shortest`; EP1/EP2 also used `-movflags +faststart`.

All repository scripts used in the pipeline are reproduced verbatim in Appendix C. The scene/set/character code (~10k lines of TSX) is not duplicated here; it lives at the repository paths in §3.0. Small inline edits made during the session (Python/sed patches to TSX) are already reflected in that final source.

---

## 8. Cost & time

**Money:**
- LLM usage cost: [UNKNOWN] (Claude Code plan, not metered in-session).
- Every other tool is local and free.
- No paid API was called [CONFIRMED].
- Voice-over production cost: [UNKNOWN].

**Measured wall-clock times** (from transcript timestamps, Apple Silicon Mac, `hw.ncpu` printed in the session; renders often competed with other sessions' renders):

| Step | Time |
|---|---|
| Whisper large-v3-turbo transcription (EP1, ~7 min audio) | 0.8 min |
| EP1 90-frame benchmark (heavy shots, concurrency 8) | 12.45 s |
| EP1 first full render | 8.9 min |
| EP1 audio-only WAV render | 5.0 min |
| EP1 re-render (killed) | 64.9 min |
| EP1 re-render (50 px captions, concurrency 6) | 12.6 min |
| EP2 full render | 5.8 min |
| EP1+EP2 audio re-render + mux | 8.8 min |
| EP3 full render | 8.8 min |
| EP5 full render (failed at audio merge) | 8.1 min |
| EP5 muted video render + mux | 7.6 min |
| EP5 text-bounds QA (1,200 sampled frames) | 11.0 min |
| EP1+EP2+EP3 text-bounds QA | 8.7 min |
| All 4 episodes text-bounds QA | 14.5 min |

Brief → first delivered MP4 (session wall-clock, from timestamps): EP1 05:57→06:53 (56 min, before the feedback rounds); EP2 11:21→11:48 (27 min); EP3 04:26→04:51 (25 min); EP5 09:32→10:20 (48 min, including the disk-full failure). Feedback rounds afterwards added roughly 0.5–2 h per episode.

**Limits hit** [CONFIRMED]:
- Disk full (98%, about 9 GB free) during the Remotion audio merge.
- Low RAM (~2 GB free) crashed Chrome in long QA runs.
- Another session's concurrent renders slowed or broke renders (seek timeout / `ERR_NETWORK_CHANGED` / browser closed).
- No API quotas were involved.

---

## 9. Manual steps

| Who | Step | Criteria |
|---|---|---|
| User | Wrote each episode brief (Appendix A), including shot list, MỐC lines, holds, SFX list, characters, checks | — |
| User | Produced and dropped the voice MP3 + SRT per episode; supplied reference screenshots | [UNKNOWN] how produced |
| User | Changed aspect ratio to 16:9 | preference |
| User | Watched renders and reported issues: transparency, caption size, SFX loudness, "e e"/"xè xè" noise at 5:25 and in the EP2 intro, text out of frame | listening/viewing |
| User | Chose to delete `amb_bedroom_morning_loop` and `amb_class_loop` entirely | listened to the file |
| User | Deleted a mis-saved file on their own ("mình đã tự xóa") | — |
| Claude (LLM, judgment) | Translated briefs into shotlists, MỐC anchors, holds, `joinNext`, `atHold` | follow brief pacing hints; every cut in silence |
| Claude (LLM, judgment) | Visually reviewed storyboard JPEG pages and stills (Read tool on images), then fixed framing, poses and layer order | one focal point per shot, rule of thirds, no transparency on visible characters, no two consecutive shots with the same size+angle, text inside the frame |
| Claude | Picked frames to inspect (`pick` 0.2 / 0.55 / 0.85; specific frames flagged by QA) | coverage of shot start/middle/end |
| Claude | Tuned mix constants and noise fixes by measurement (`check_mix`, HF scans) | 0 dead windows; HF outside voice ≤ about −55 dB; no clipping |
| Claude | Accepted the L143/L144 cut | the cut sits in a 40 ms silence |
| Nobody yet | Re-render EP2/EP3/EP5 after the text-bounds fixes | awaiting the user's request |

---

## 10. Licensing & terms (NOT verified in this session)

- **Remotion 4.x:** source-available under the Remotion license. It is free for individuals and small companies, and larger companies need a paid company license. **Not verified** for this user's situation.
- **whisper.cpp** (MIT) and **Whisper large-v3-turbo weights** (OpenAI, MIT): **not verified** in session.
- **ffmpeg** binaries bundled by Remotion (LGPL/GPL depending on build): **not verified**.
- **Fonts:** Baloo 2 and Patrick Hand are served by Google Fonts (generally SIL OFL). **Not verified** in session.
- **Reference screenshots** (`Ref cho kênh tiktok 2`): their source is [UNKNOWN]. They were used only as style reference and are not in the video. The brief states "Chỉ tham khảo … không đưa ảnh vào video".
- **Voice-over:** commercial-use terms depend on the unknown TTS/voice source ([UNKNOWN]).
- **SFX:** synthesized from scratch in this repository, so there are no third-party samples [CONFIRMED].
- **Music:** none.
- **LLM output** (code): subject to the user's Anthropic terms ([UNKNOWN] plan).

---

## 11. Open issues & suggestions

1. **The delivered MP4s are stale.** EP2/EP3/EP5 need a re-render to include the text-bounds camera fixes. Use the split path (`--codec=wav`, then `--muted` video, then mux) to save disk.
2. **Disk/RAM fragility.**
   - Remotion leaves `remotion-webpack-bundle-*` temp folders (each a copy of `public/`, ~700 MB) in `$TMPDIR`. About 8.5 GB had accumulated. A pipeline should clean temp folders after each render, or bundle once and pass `serveUrl`.
   - Keep the per-composition `<Audio>` count to about 400 or fewer: bake repeated cues into stems.
3. **Remotion silent-bed issue** (looped audio with a long zero-volume stretch). The workaround (splitting beds) is EP5-only. Port `pieces()` into a shared bed builder.
4. **Non-reproducible inputs.** The voice MP3/SRT and their generator are unknown. A pipeline needs the TTS step specified (service, voice, settings, the meaning of the script tags).
5. **The hard parts to automate are LLM judgment:**
   - writing ~10k lines of scene TSX per episode;
   - choosing camera keyframes;
   - visual storyboard review.

   These were done by Claude with human feedback. Candidates for automation:
   - QA gates that already exist: `check_cuts`, `check_mix`, `check-text-bounds`, `tsc`;
   - QA gates still to add: an overlap detector for characters hidden behind set pieces, and a caption/safe-area collision check.
6. **The noise QA scripts live in the session scratch folder** (`hiss.py`, `noisy.py`, `hf.py`, `hf2.py`, `hiss_mid.py`, verbatim in Appendix C). Move them into `scripts/tiktok2/`.
7. **The text-bounds check treats blurred-background text as informational.** If any edge-cut text is unacceptable, make "blur" hits fail too.
8. **The ffmpeg bundled with Remotion lacks some filters** (`volumedetect`, `fps`, `tile`). Analysis was done in Python instead; a pipeline may prefer a full ffmpeg build.
9. **Concurrency with other projects.** Renders from other sessions in the same repo contended for CPU and network ports. Run the pipeline in isolation.
10. **No loudness normalisation** (LUFS) for TikTok/YouTube delivery. Consider an `ebur128`-based check and target.

---

## Appendix A — Every prompt sent to the LLM (verbatim)

These are the user's messages to Claude. Long briefs were pasted, and the content is reproduced exactly.

### A.1 EP1 brief — 2026-10-24T05:57:00Z (two reference images, 2186×1264 and 2228×1260, were attached to this message; the same 2186×1264 image placeholder was re-sent at the end of the session)

~~~~~text
Dựng HOÀN CHỈNH tập EP1 kênh TikTok mới bằng Remotion và render thành phẩm: "Nếu bạn tàng hình được — nhưng chỉ khi nín thở?"
Làm trọn: dựng tất cả cảnh, đồng bộ voice, tạo SFX + foley, mix, ghép thành MỘT composition, render MP4. Không dừng giữa chừng để hỏi, trừ khi không tìm thấy file voice.

=== THÔNG SỐ ===
- Dọc 9:16, 1080x1920, 30fps, H.264.
- Code: src/tiktok2/ep1/ (không dấu). Composition id: Tiktok2Ep1.
- Thành phẩm: "out/tiktok 2/tiktok2-ep1.mp4" (tạo thư mục nếu chưa có).
- Safe zone TikTok: không đặt chữ/chi tiết quan trọng ở 20% dưới cùng và 15% mép phải.

=== THAM KHẢO ===
- Xem ảnh trong "public/kênh tiktok 2/Ref cho kênh tiktok 2" để nắm phong cách. Chỉ tham khảo: tạo nhân vật, bối cảnh riêng, không vẽ lại khung hình, không đưa ảnh vào video.

=== VOICE & NHỊP DỰNG ===
- Voice: file trong "public/kênh tiktok 2/voice/ ep1/" (tên bắt đầu "voice ep1 tiktok2"; đường dẫn có khoảng trắng và dấu — encode đúng khi dùng staticFile).
- Phiên âm tiếng Việt bằng @remotion/install-whisper-cpp (model large-v3, nặng quá thì medium), lấy timestamp từng từ → src/tiktok2/ep1/captions.json.
- KHÔNG để nguyên file voice chạy liền một mạch. Cắt voice thành từng câu theo timestamp, mỗi câu là một <Audio> riêng (startFrom/endAt) đặt trên timeline.
- Độ dài video do NỘI DUNG HÌNH quyết định, voice chỉ là xương sống:
  • Hình cần thêm thời gian (hành động, khoảnh khắc cảm xúc, gag hài cần đọng) → chèn khoảng lặng (hold) sau câu.
  • Voice có khoảng nghỉ thừa mà hình không cần → cắt ngắn, giữ tối thiểu ~0.15s giữa các câu.
  • Không bao giờ đổi tốc độ hay cao độ giọng.
  • Trong các hold, ambience và foley vẫn chạy, không để khoảng chết.
- Gợi ý nhịp: hook giữ đủ ~3s; kéo dài 2.6, 2.11, 4.4, 5.5, 5.6, 6.3; im lặng ~1s ở 8.12 trước tiếng hét; giữ lâu 8.14, 8.19, 9.6; cắt nhanh dồn dập ở 4.3, 5.7, 6.1, 8.7–8.10.
- Mỗi shot có "MỐC" = vài chữ đầu câu thoại; so khớp gần đúng (bỏ dấu câu, không phân biệt hoa thường) trong transcript để gắn shot với câu.
- Ghi timeline cuối (câu voice, hold, shot, giây bắt đầu/kết thúc) vào timing.json; tạo timing-overrides.json để tôi chỉnh tay. Tổng độ dài = các câu + các hold + end card ~1.5s.

=== VISUAL STYLE (kênh mới — không dùng lại style hay component hình ảnh của các kênh cũ) ===
- Soft pseudo-3D flat cartoon, rounded shapes, no harsh outlines.
- Characters: large glossy black round head (~45% body height), subtle radial gradient, thin warm cream rim light; face = two white oval eyes only, no mouth. Expressions only via eye shapes: normal ovals, "> <" squint (straining / holding breath), half-closed lids (bored/suspicious), wide ovals (shock), curved arcs (happy). Blink every 3–5s.
- Body: hoodie with drawstrings, thin black tube arms/legs, round mitten hands. Kids smaller, same proportions. Subtle idle breathing bob.
- Palette: environments and side characters muted and desaturated (blue-gray, dusty purple, olive, beige). Main character ALWAYS in a saturated ORANGE hoodie.
- Depth: ≥3 layers (foreground/midground/background); blur foreground and background (filter blur 4–10px), focal character sharp; slow parallax on camera moves.
- Lighting: soft ambient, one warm glow source per scene, soft shadows under feet, light vignette.
- INVISIBLE STATE: body and everything worn/held fully transparent, shown only as a thin faint white outline (~35% opacity) with gentle shimmer. Vanish = 8-frame fade to outline + small sparkle; reappear = 4-frame "pop" with squash-and-stretch.
- Vietnamese settings, furnished with real detail.
- Camera: change framing every 1–3s (wide / medium / close-up / extreme close-up); slow push-in on emotional beats; light handheld shake on tense beats.
- Color grade by act: acts 1–6 normal; act 7 gradually desaturate to ~60%; act 8 warm lantern glow; act 9 full saturation.

=== COMPONENT DÙNG CHUNG ===
- Character (props: hoodieColor, size, eyes, invisible, accessories, pose).
- BreathRing: vòng hơi thở góc trên trái, hiện khi nhân vật nín thở, số giây ở giữa, vòng cạn dần; xanh → vàng → đỏ khi quá 2 phút; biến mất khi thở ra.
- Captions kiểu TikTok từ captions.json: 2–4 từ/cụm, chữ trắng đậm viền đen, từ đang đọc tô CAM, đặt ở ~62% chiều cao; ẩn trong các hold.
- BigText: chữ to đậm nảy nhẹ cho chỗ ghi "TEXT".

=== NHÂN VẬT ===
- BẠN: thiếu niên, hoodie CAM.
- MẸ: hoodie tím phấn, búi tóc nhỏ.
- BIN: em trai 5 tuổi, nhỏ, hoodie xanh da trời nhạt.
- HUY: hoodie xanh rêu.
- CÔ GIÁO: áo dài xám xanh, kính tròn.
- THẦY HIỆU TRƯỞNG: hoodie xám, kính vuông, cầm ấm trà.
- NHÓM BẠN: 3 người hoodie be, xám, tím.
- KẺ BẮT CÓC: hoodie đen xám, mũ lưỡi trai sẫm, mắt nửa mí.
- ĐÁM ĐÔNG: nhiều nhân vật màu trầm, cỡ khác nhau.

=== SFX & FOLEY ===
- Tạo SFX và foley theo đúng cách các tập cũ trong dự án đã làm: tìm trong src/ các file/script sfx, foley, audio của các tập trước và dùng lại pipeline đó. Lưu âm thanh tập này ở "public/kênh tiktok 2/sfx/ep1/".
- Foley cho mọi hành động trên hình: bước chân (gạch, hành lang, vỉa hè), giấy sột soạt, cửa tủ lạnh, ghế kéo, cửa mở, chén đĩa, tách trà, nước bắn và bong bóng, vải áo khi chạy/ôm, lồng đèn đung đưa.
- SFX chữ ký kênh: hít vào khi bắt đầu nín (kèm whoosh nhỏ), shimmer khi biến mất, "pop" khi hiện ra, tick mỗi giây của BreathRing (to và nhanh dần khi đỏ), nhịp tim trầm khi quá 2 phút.
- Ambience: phòng khách (quạt trần, xe xa ngoài hẻm), sân trường, căng tin, phòng ngủ đêm (dế), phố lồng đèn (đám đông + trống lân).
- Mix: voice luôn ưu tiên; giảm SFX/ambience khoảng -15 đến -18 dB khi có giọng; không dùng nhạc có bản quyền.

=== DANH SÁCH SHOT (SFX/foley trong ngoặc) ===
[1. HOOK]
1.1 MỐC "Nếu bạn tàng hình được": ECU Bạn hít vào, mắt "> <", BreathRing hiện → wide: Bạn tan thành viền trắng giữa phòng khách. TEXT trên cùng "NẾU BẠN TÀNG HÌNH KHI NÍN THỞ?" (hít vào, shimmer)

[2. COLD OPEN – phòng khách]
2.1 "Mẹ cầm bài kiểm tra": close-up bài, số 3 đỏ khoanh tròn. (giấy)
2.2 "Lại. Đây": medium Mẹ, mắt nửa mí. (gõ giấy xuống bàn)
2.3 "Bạn sợ": ECU mắt Bạn run → hít sâu, BreathRing đếm. (hít vào, tick)
2.4 "Mẹ ngẩng lên": over-shoulder Mẹ, chỗ Bạn chỉ còn viền mờ. (shimmer)
2.5 "Mười giây": Mẹ cúi nhìn gầm bàn, góc thấp. (ghế xê dịch)
2.6 "Hai mươi giây": Mẹ mở tủ lạnh, ánh sáng tủ hắt ra. (cửa tủ, tiếng ù)
2.7 "Ba mươi giây": ECU viền mờ phồng má, rung nhẹ. (tick nhanh)
2.8 "Bốn mươi giây": Mẹ quay lại nhìn thẳng ống kính. (bước chân)
2.9 "Bạn thở ra": Bạn pop hiện sát mặt Mẹ, chữ "PHÙ". (pop)
2.10 "Á": Mẹ mắt tròn, rung khung hình. (giật mình, đồ rơi)
2.11 "Mẹ không đánh bạn": wide, Mẹ cầm chổi lông gà đuổi Bạn quanh bàn, hài, không bạo lực. (dép chạy, whoosh)

[3. LUẬT CHƠI – nền tối giản màu trầm]
3.1 "Luật thế này": Bạn đứng giữa, icon nổi lên. (whoosh UI)
3.2 "Nín thở là bạn biến mất": Bạn thành viền, cặp và dép biến theo. (shimmer)
3.3 "Thở ra một cái": pop hiện lại. (pop)
3.4 "Khi tàng hình, bạn không thể nói": bong bóng thoại bị gạch chéo. TEXT "NHỚ CHI TIẾT NÀY". (buzz)
3.5 "người bình thường nín thở": thanh thời gian 30s–60s. (tick)
3.6 "cảm giác muốn thở": phổi đơn giản, bong bóng CO2 dâng, đèn cảnh báo nhấp nháy. (bong bóng, beep)
3.7 "có hạn sử dụng": BreathRing to giữa màn hình, số 40. (tick)

[4. HỌC LẠI MỌI THỨ]
4.1 "Cười là thở ra": sân trường, Huy làm rơi bịch bánh tráng trộn; viền mờ phía sau rung vì nhịn cười. (bịch nilon rơi)
4.2 "Bạn hiện ra": Bạn pop sau Huy, Huy nhảy dựng. (pop, giật mình)
4.3 "Hắt xì": 2 cắt nhanh hắt xì / ngáp, mỗi lần pop. (pop x2)
4.4 "nấc cục": Bạn nhấp nháy hiện/mất theo nhịp cùng dây đèn nháy Tết phía sau. (pop/shimmer xen kẽ)
4.5 "Chỉ có một người": phòng khách, giới thiệu Bin. TEXT "BIN – 5 TUỔI".
4.6 "Chơi trốn tìm": Bin bịt mắt đếm, đi thẳng tới viền mờ, túm áo. (bước chân nhỏ, vải)
4.7 "Em đâu có thấy": close-up Bin cười tự hào.

[5. BẮT ĐẦU VUI]
5.1 "Ngày rằm": bàn thờ, mâm trái cây, đĩa bánh bò, chè, khói nhang. (ambience yên)
5.2 "Bạn ăn một cái bánh bò": từng cái bánh bò biến khỏi đĩa. (nhai nhẹ)
5.3 "Mẹ thắp thêm": close-up Mẹ chắp tay, khói nhang. (bật lửa)
5.4 "Bạn lẻn vào phòng giáo viên": BreathRing đếm, đề Văn trên bàn. (tick)
5.5 "Câu ba dài quá": tờ đề cuộn dài xuống tận sàn. (giấy cuộn)
5.6 "Thầy hiệu trưởng": Bạn pop; thầy cầm ấm trà quay đầu thật chậm. TEXT "3 BUỔI TRỰC NHÀ VỆ SINH". (rót trà, pop)
5.7 "Nên bạn tập": montage BreathRing 0:40 → 1:00 → 1:30 → 2:00. (tick nhanh)
5.8 "phản xạ lặn": úp mặt vào thau nước đá, bong bóng; icon tim đập chậm lại. (nước, bong bóng, nhịp tim)
5.9 "Mẹ tưởng": Mẹ ló đầu ở cửa, mắt nửa mí.
5.10 "Kỷ lục thế giới": hai thanh so sánh "11+ PHÚT" và "3 PHÚT".

[6. LỜI ĐỒN]
6.1 "trường bạn bắt đầu có lời đồn": clip điện thoại dọc nhiễu hạt, rung: cửa lớp tự mở, ghế tự kéo ra, ổ bánh mì biến khỏi khay (không dùng logo app thật). (cửa kẹt, ghế kéo)
6.2 "Hai triệu lượt xem": số view đếm vọt lên. (ting ting)
6.3 "Một nhóm săn ma": hai người cầm máy đo, viền mờ của Bạn đứng ngay cạnh, kim máy đo đứng im. (máy rè nhẹ)
6.4 "Họ kết luận": hai người gật gù nghiêm túc.

[7. CÁI GIÁ – giảm bão hòa dần]
7.1 "Nhưng có một cái giá": màu trầm xuống, slow push.
7.2 "Giờ ra chơi": hành lang, nhóm 3 bạn đứng vòng tròn, viền mờ bên cạnh. (ambience giờ ra chơi)
7.3 "Có rủ nó không": close-up từng người nói.
7.4 "Bạn thở ra": Bạn hiện ra một mình giữa hành lang, nhóm đã đi xa, wide nhiều khoảng trống.
7.5 "Vậy là có một luật": TEXT "KHÔNG CẦN AI THẤY MÌNH".
7.6 "Bạn ăn trưa một mình": căng tin, bàn trống, viền mờ; rồi đường về nhà. (ambience căng tin xa)
7.7 "Kể cả khi bạn đang thở": Bạn hiện nhưng màu áo cam nhạt đi 50%.
7.8 "Cô điểm danh": Bạn giơ tay, cô giáo nhìn quanh lướt qua Bạn.
7.9 "Sinh nhật bạn": màn hình nhóm chat chung chung, không thương hiệu, im lặng, đồng hồ trôi.
7.10 "Chỉ có Bin": phòng ngủ tối, đèn ngủ vàng, Bin trèo lên giường. (dế, chăn sột soạt)

[8. CAO TRÀO – phố lồng đèn, đêm, rất đông]
8.1 "Rằm tháng Tám": wide phố lồng đèn: đèn ông sao, cá chép, kéo quân treo kín, lân phía xa. (đám đông, trống lân)
8.2 "Bạn dắt Bin": close-up hai bàn tay nắm, một tay cầm đèn ông sao.
8.3 "đám đông xô": rung mạnh, chen lấn. (xô đẩy)
8.4 "Tay bạn trống không": ECU bàn tay trống; âm thanh nhỏ lại.
8.5 "Bạn quay lại": wide, kẻ đội mũ bế Bin đi xa, Bin giãy.
8.6 "Không ai để ý": các khuôn mặt đám đông quay đi chỗ khác.
8.7 "Bạn hít một hơi": BreathRing bắt đầu; viền mờ len qua đám đông, camera bám theo. (hít vào, shimmer, tick)
8.8 "Bạn chụp được tay Bin": close-up hai tay chạm → tuột ra.
8.9 "Một chiếc xe máy": xe máy nổ máy ở đầu phố. (nổ máy)
8.10 "Hai phút": BreathRing đỏ; viền khung hình tối dần, blur tăng. (nhịp tim, tick dồn dập, âm thanh bị bóp nghẹt)
8.11 "Bạn có thể tiếp tục bám theo": slow push vào viền mờ đứng yên giữa đám đông chuyển động.
8.12 "Bạn phải hiện ra": cắt gần như im lặng ~1s.
8.13 "BẮT CÓC": Bạn pop hiện giữa phố, chữ "BẮT CÓC!" to, rung khung; BreathRing biến mất. (pop mạnh, âm thanh phố bật trở lại)
8.14 "tất cả mọi người đều nhìn bạn": dãy mắt đám đông quay lại cùng lúc.
8.15 "Tiếng trống lân dừng": con lân khựng lại. (trống tắt hẳn)
8.16 "Chú bán đèn kéo quân": chú chắn trước xe; hai anh xe ôm giữ tay kẻ đội mũ; cô bán bắp nướng bế Bin ra. Không có cảnh đánh nhau. (bước chân dồn, la hét xa)
8.17 "công an phường": ánh đèn xanh đỏ nhấp nháy ở mép khung. (còi xa)
8.18 "Bin chạy về phía bạn": Bin ôm chân Bạn.
8.19 "Bạn ngồi bệt": Bạn ngồi lề đường thở mạnh, đám đông vây quanh nhìn ấm áp; áo cam rực trở lại. (thở, ambience dịu)

[9. KẾT]
9.1 "Thứ Hai": lớp học sáng, cô điểm danh. (ambience lớp)
9.2 "Dạ, có": Bạn đứng dậy, rõ nét, cả lớp quay lại; Huy giơ ngón cái. (ghế kéo)
9.3 "Tàng hình thì dễ": TEXT hai dòng "Tàng hình thì dễ." / "Để người ta thấy mình mới khó."
9.4 "Đĩa bánh bò": mâm cúng, đĩa vơi nửa; Mẹ nhìn đĩa → nhìn Bạn → close-up vụn bánh trên áo cam.
9.5 "Tối đó, Bin trèo lên giường": phòng ngủ ấm, Bin áp tai vào ngực Bạn. (dế, nhịp tim nhẹ đều)
9.6 "Bin ngủ": wide tĩnh, Bạn thở đều, slow push out.
9.7 "Còn bạn": end card: TEXT câu hỏi bình luận, rồi "Một chữ nếu… một cuộc đời khác."

=== KIỂM TRA TRƯỚC KHI RENDER ===
- Không cảnh nào trống hoặc nhân vật đứng yên quá 2s mà không có chuyển động nhẹ.
- Captions khớp lời, không đè lên chi tiết chính, nằm trong safe zone.
- Nghe lại toàn bộ: không đoạn nào voice bị cắt lẹm, không khoảng chết.
- Render ra "out/tiktok 2/tiktok2-ep1.mp4", in bảng timeline và tổng thời lượng.
~~~~~

### A.2 Brief pasted by mistake (belongs to another channel, "Sổ Tay Sự Kiện") — 2026-10-24T07:29:10Z

The user stopped it immediately ("dừng", "dựng lại", "tôi nhầm chat"). It was **not used** for these clips and is included only because the export rules require every prompt.

~~~~~text
======================================================================
2. PROMPT
======================================================================

PHONG CÁCH: SƠ ĐỒ MẶT CẮT TỐI GIẢN (kiểu infographic điều tra)
- Nền đen tuyền, đất đá chỉ là texture đá tối mờ.
- Đường hầm, phòng trú ẩn = mảng màu PHẲNG phát sáng nhẹ (màu hổ phách cam), giống dòng nước xanh trong ảnh mẫu.
- Nhân vật = bóng đen nhỏ, VIỀN NEON màu (mỗi nhân vật một màu cố định), đèn mũ tạo luồng sáng hình nón.
- Điểm nguy hiểm / chi tiết quan trọng = viền ĐỎ phát sáng.
- Không vẽ mặt, không chi tiết thừa; người xem hiểu ngay ai ở đâu, chuyện gì xảy ra.

HẬU TỐ DÙNG CHUNG – dán vào cuối MỌI prompt cảnh:
minimalist cross-section infographic illustration, pure black background, dark subtle rock texture, flat glowing colour shapes for tunnels and chambers, human figures as dark silhouettes with thin glowing neon outlines and soft rim light, headlamp beams as soft light cones, high contrast, clean and readable, documentary explainer style, no faces visible, no text, no logos, 16:9

BẢNG MÀU CỐ ĐỊNH (dùng xuyên suốt, cả trong prompt lẫn Remotion):
- Đường hầm / khoảng trống dưới đất: hổ phách cam phát sáng (#E08A2E, viền sáng #FFB45C)
- Đá sập / nguy hiểm / chi tiết then chốt: đỏ neon (#FF3B3B)
- Lỗ khoan, ống tiếp tế, khoang Fénix: xanh cyan neon (#3FD8FF)
- Mặt đất, gia đình, đội cứu hộ: trắng ấm / xanh lá neon (#5CFF8A)
- C01 Don Lucho (chỉ huy ca): viền VÀNG GOLD (#FFD24A)
- C02 thợ mỏ trẻ: viền CAM (#FF8A3D)
- C03 thợ mỏ lớn tuổi: viền XANH CYAN (#3FD8FF)
- C05 kỹ sư cứu hộ: viền XANH LÁ (#5CFF8A)
- 30 thợ mỏ còn lại: viền TRẮNG mờ

======================================================================
A. ASSET RỜI (tạo một lần, dùng cho cả video – dựng cảnh trong Remotion)
======================================================================
Tạo trên nền đen (hoặc nền trong suốt nếu công cụ hỗ trợ), mỗi asset một file PNG. Hậu tố cho asset:
single isolated figure, side view, full body, dark silhouette with thin glowing neon outline, centered on pure black background, no faces, no text

Nhân vật – thay [MÀU] bằng màu của nhân vật (gold / orange / cyan / white):
A01 miner silhouette with hard hat and headlamp, walking, headlamp beam forward, [MÀU] neon outline
A02 miner silhouette operating a pneumatic rock drill against a wall, [MÀU] neon outline
A03 miner silhouette pushing an ore cart, [MÀU] neon outline
A04 miner silhouette turning back in shock with arm raised to shield his face, [MÀU] neon outline
A05 miner silhouette sitting on the ground hugging his knees, [MÀU] neon outline
A06 miner silhouette lying down asleep on flat cardboard, [MÀU] neon outline
A07 miner silhouette kneeling and holding a tiny spoon, [MÀU] neon outline
A08 miner silhouette pressing his ear against a rock wall, [MÀU] neon outline
A09 miner silhouette striking a vertical pipe with a wrench, [MÀU] neon outline
A10 miner silhouette shovelling rubble, [MÀU] neon outline
A11 miner silhouette writing in a small notebook by headlamp, [MÀU] neon outline
A12 miner silhouette standing with both arms raised in joy, [MÀU] neon outline
A13 shift leader silhouette holding up a lamp and pointing forward, gold neon outline
A14 shift leader silhouette drawing a map on a wall with chalk, gold neon outline
A15 woman silhouette holding a candle with a small boy wearing an oversized hard hat beside her, warm white neon outline
A16 rescue engineer silhouette in helmet holding a radio, green neon outline
A17 rescue engineer silhouette throwing his helmet down in frustration, green neon outline

Vật thể:
A20 tall narrow cylindrical rescue capsule, side view, cyan neon outline, small red, white and blue bands
A21 drilling rig tower, side view silhouette, green neon outline, floodlight glow at the top
A22 drill bit with a long drill pipe, vertical, cyan neon outline
A23 slim metal supply tube (paloma), vertical, cyan neon outline
A24 folded small paper note taped to a drill bit, red neon glow
A25 mining pickup truck, side view silhouette, white neon outline, headlights on
A26 tent with a small campfire, silhouette, warm white neon outline

Nền:
A30 dark rock texture, seamless, almost black, subtle cracks and grain
A31 lone mountain silhouette in a desert at dusk, black mountain against a deep blue sky with faint stars, flat dark ground, wide
A32 same lone mountain as A31 in full cross-section, interior pure black with subtle rock texture, only the outer contour of the mountain faintly outlined in white

======================================================================
B. PROMPT TỪNG CẢNH (tạo ảnh hoàn chỉnh – hoặc dựng lại từ asset A trong Remotion)
======================================================================
Gợi ý Remotion ghi sau [RM].

--- PHẦN 1 – HOOK ---

H01 | 0:00–0:07 | Mặt đất: sa mạc Atacama
Wide view of a lone black mountain in a dark desert at dusk, deep blue sky with faint stars, a tiny mine entrance on the slope glowing amber, a small pickup truck with white neon outline driving toward it on a thin road
[RM] Fade in từ đen. Camera trôi xuống chậm. Chữ "05.08.2010 — SA MẠC ATACAMA, CHILE" kiểu máy đánh chữ.

H02 | 0:07–0:11 | Bóc lớp sang mặt cắt
The same mountain from the same angle shown as a cross-section: black interior with subtle rock texture, a glowing amber spiral ramp tunnel winding from the entrance down deep into the mountain, small amber chambers at the very bottom
[RM] Mặt núi H01 mờ dần để lộ mặt cắt; đường hầm xoắn ốc tự "vẽ" dần từ cửa xuống đáy (SVG path, strokeDashoffset). Thước độ sâu bên phải: 0 → −700 m.

H03 | 0:11–0:15 | Zoom xuống đáy mỏ
Close cross-section of the deepest tunnels: flat glowing amber galleries in the black rock, a miner with orange neon outline drilling a wall, a miner with cyan neon outline pushing an ore cart, a few more miners with white outlines, headlamp light cones
[RM] Zoom mạnh vào đáy (scale 1 → 4). Nhân vật đặt từ asset A02, A03, A01. Hiện "−700 m".

H04 | 0:15–0:17 | Vết nứt
Same deep tunnel cross-section, a thin bright red glowing crack spreading across the rock just above the amber tunnel, the miners below still working, unaware
[RM] Vết nứt đỏ vẽ dần bằng SVG; tiếng răng rắc.

H05 | 0:17–0:22 | Khối đá sập
Full mountain cross-section, a huge block of rock in the middle of the mountain outlined in glowing red neon breaking loose and sliding down, crushing and sealing a section of the amber spiral tunnel, dust bursting out along the tunnel
[RM] Zoom ra nhanh. Khối đá đỏ là lớp riêng trượt xuống (spring), rung màn hình, hạt bụi. Đoạn đường hầm bị bịt chuyển từ cam sang xám. Chữ "~700.000 tấn".

H06 | 0:22–0:25 | Dưới hầm
Deep tunnel cross-section filling with grey dust, the orange-outlined miner turning back with arm raised to shield his face, the cyan-outlined miner crouching, light cones scattering in the dust
[RM] Cắt nhanh vào cảnh (A04). Bụi xám phủ dần mảng hầm cam.

H07 | 0:25–0:30 | Trở lại mặt đất
The same wide view of the black mountain at dusk as H01, a column of grey dust rising from the glowing mine entrance, the pickup truck stopped
[RM] Kéo lùi chậm. Chữ phụ đề như voice off.

H08 | 0:30–0:35 | Tên video
Mountain cross-section almost entirely black, at the very bottom a tiny cluster of 33 small glowing amber dots, the spiral tunnel above them broken by a red-outlined block of rock
[RM] 33 chấm nhấp nháy rồi mờ thành dấu "?". Tên video "69 NGÀY DƯỚI 700 MÉT".

--- PHẦN 2 – MỎ SAN JOSÉ VÀ KHOẢNH KHẮC SỤP ĐỔ ---

P06 | 0:35–0:50 | Vị trí mỏ
Minimal dark map of northern Chile, black land with thin white coastline, a glowing white dot for the city of Copiapó and a glowing amber dot for the San José mine to the north, a thin line between them
[RM] Dựng hoàn toàn trong Remotion (SVG bản đồ). Chữ "45 km".

P07 | 0:50–1:05 | Thế hệ thợ mỏ
Row of small desert houses as black silhouettes with warm white outlines, a woman and boy silhouette waving at a miner silhouette with orange outline walking toward a truck, dawn sky
[RM] Asset A15, A01 (cam), A25.

P08 | 1:05–1:15 | Mỏ thiếu an toàn
Cross-section close-up of an amber tunnel with cracked support beams outlined in red, loose rocks above them glowing faintly red, a gold-outlined shift leader below shining his headlamp at them
[RM] Nhấp nháy viền đỏ trên các điểm yếu; chữ "Nhiều tai nạn chết người", "Bị phạt hàng chục lần".

P09 | 1:05–1:25 | Đường hầm xoắn ốc
Mountain cross-section with the glowing amber spiral ramp, a tiny truck with white headlights descending along it, depth markers implied by thin horizontal lines
[RM] Xe A25 chạy dọc path xoắn ốc (getPointAtLength). Nhiệt kế tăng đến "30°C+".

P10 | 1:25–1:35 | Nóng và ẩm
Deep amber tunnel cross-section with faint heat-haze glow, miner silhouettes with orange and cyan outlines working slowly, drops falling from the ceiling as tiny cyan dots
[RM] Hiệu ứng hơi nóng (displacement nhẹ).

P11 | 1:35–1:50 | Tiếng đá nứt
Deep tunnel cross-section, thin red cracks spreading in the rock above, the orange-outlined miner stopping and looking up, small falling stones
[RM] Vết nứt vẽ dần; zoom chậm.

P12 | 1:50–2:00 | Luồng gió nổ
Long horizontal amber tunnel cross-section, a white shockwave and dust blast rushing through it from right to left, miner silhouettes knocked over, light cones flying
[RM] Sóng xung kích trắng chạy ngang (mask), rung màn hình.

P13 | 2:00–2:15 | Khối đá 700.000 tấn
Full mountain cross-section with a massive red-outlined block of rock resting where it fell, plugging the spiral tunnel, tiny glowing dots of miners far below it, a skyscraper silhouette drawn beside the block for scale
[RM] Hình tòa nhà mờ đặt cạnh khối đá để so sánh; chữ "~700.000 tấn".

P14 | 2:15–2:30 | Trong làn bụi
Amber tunnel cross-section almost filled with grey dust, only faint glowing outlines of miners visible, one with cyan outline coughing, one with orange outline feeling along the wall
[RM] Bụi tan dần theo đồng hồ "+3 giờ".

P15 | 2:30–2:45 | Không có lối ra
Close cross-section where the amber tunnel ends abruptly at a wall of rubble outlined in red, three miner silhouettes (gold, orange, cyan outlines) standing before it, one touching it
[RM] Chữ "Không có lối ra" (đỏ).

--- PHẦN 3 – 17 NGÀY TRONG BÓNG TỐI ---

P16 | 2:45–2:55 | Don Lucho tập hợp mọi người
Network of amber tunnels in cross-section, the gold-outlined leader holding up a lamp at a junction, white-outlined miner silhouettes moving toward him from several tunnels, small arrows of movement implied by light trails
[RM] Asset A13; các chấm trắng chạy theo path về điểm tập trung. Chú thích "Luis Urzúa – Chỉ huy ca".

P17 | 2:55–3:10 | Phòng trú ẩn
Cross-section of a small rectangular refuge chamber glowing amber at the bottom of the mine, benches drawn as simple lines, an oxygen tank outlined in cyan, 33 small miner silhouettes sitting and standing inside
[RM] Thu nhỏ vị trí phòng trú ẩn trên mặt cắt tổng (mini-map góc màn hình).

P18 | 3:10–3:20 | Kiểm kê lương thực
Top-down minimal view on black: a few cans, small milk cartons, cracker packets and a can of peaches laid out in a row, each with a thin white neon outline
[RM] Đếm từng món; chữ "Đủ cho ~48 giờ" → "33 người" (đỏ).

P19 | 3:20–3:40 | Khẩu phần 48 giờ
Close side view on black: the gold-outlined leader kneeling and passing a tiny spoon to the orange-outlined miner, behind them a line of white-outlined silhouettes waiting
[RM] Asset A07, A13. Bộ đếm "48 giờ" quay vòng.

P20 | 3:40–3:55 | Nước vị dầu, đèn yếu dần
Refuge chamber cross-section, a cyan-outlined miner drinking from a bottle near a tank outlined in red, several headlamp cones switching off one by one, the amber glow of the chamber dimming
[RM] Độ sáng mảng hầm giảm dần; chỉ báo pin.

P21 | 3:55–4:10 | Chia ca, bản đồ, biểu quyết
Refuge chamber cross-section divided into three zones: miners working (A10), miners sleeping (A06), miners keeping watch; in the centre the gold-outlined leader drawing a map on the wall
[RM] Ba vùng sáng lần lượt; vòng tròn "3 ca × 8 tiếng".

P22 | 4:10–4:20 | Giữ tinh thần
Refuge chamber cross-section, miner silhouettes sitting in a circle around a single lamp, warm glow, one cyan-outlined figure with arms open as if telling a story
[RM] Ánh sáng ấm dần.

P23 | 4:20–4:45 | Trại Hy Vọng
Split view: top half the dark desert surface at night with small tents and campfires (A26) and a woman with a boy holding a candle (A15); bottom half the black rock with the tiny amber refuge chamber far below
[RM] Camera lia dọc từ dưới lên trên; nối hai thế giới bằng một đường chấm mảnh.

P24 | 4:45–5:00 | Giàn khoan thăm dò
Mountain cross-section with a green-outlined drilling rig on the surface, a thin cyan drill line descending into the black rock toward the amber refuge
[RM] Đường khoan cyan vẽ dần xuống.

P25 | 5:00–5:20 | Bảy lần trượt
Mountain cross-section with seven thin cyan drill lines descending from the surface, each ending in the black rock just missing the amber refuge chamber, each tip marked with a small red X
[RM] Từng đường khoan đi xuống rồi hiện dấu X đỏ; đồng hồ ngày 1 → 16. Asset A17 trên mặt đất.

P26 | 5:20–5:35 | Tiếng khoan xa xăm
Close cross-section of the refuge, an orange-outlined miner pressing his ear to the rock wall (A08), faint concentric cyan sound ripples spreading through the black rock from a drill line nearby
[RM] Vòng sóng âm lan ra theo nhịp.

P27 | 5:35–5:45 | Thư từ biệt
Small amber pocket of light in total darkness, a lone orange-outlined miner sitting and writing in a notebook (A11), everything else black
[RM] Thu hẹp vignette; im lặng.

--- PHẦN 4 – MẨU GIẤY TRÊN MŨI KHOAN ---

P28 | 5:45–6:00 | Mũi khoan thứ tám
Mountain cross-section, an eighth cyan drill line descending and breaking into an amber tunnel right next to the refuge chamber, a burst of light at the point of contact
[RM] Đường khoan số 8 vẽ xuống, chớp sáng khi chạm; chữ "688 m – Ngày 17".

P29 | 6:00–6:15 | Buộc giấy
Close side view: a cyan-outlined drill bit poking through the ceiling of an amber tunnel, gold- and orange-outlined miners taping a small red-glowing paper note to it (A24)
[RM] Mẩu giấy phát sáng đỏ nhấp nháy.

P30 | 6:15–6:30 | Gõ vào cần khoan
Cross-section: a cyan-outlined miner striking the drill pipe with a wrench (A09), bright cyan pulse rings travelling up the long drill pipe through the black rock toward the surface
[RM] Xung sáng chạy dọc ống lên mặt đất theo nhịp "cộc cộc".

P31 | 6:30–6:45 | Kéo lên
Surface view at night: a green-outlined engineer (A16) beside the drilling rig, the drill bit just pulled up with a small note glowing red attached
[RM] Zoom vào mẩu giấy.

P32 | 6:45–6:55 | Mẩu giấy đỏ
Close-up on black: a small unfolded paper note glowing with red neon light, held by two hands drawn as thin green outlines
[RM] Chữ viết tay "Estamos bien en el refugio los 33" hiện dần (đỏ) + phụ đề tiếng Việt. Nhãn "Tái hiện minh họa".

P33 | 6:55–7:05 | Trại Hy Vọng vỡ òa
Dark desert surface with many tents and figures with warm white outlines jumping and raising arms, small bursts of light above the camp
[RM] Hạt sáng bay lên như pháo hoa.

--- PHẦN 5 – CUỘC ĐUA CỦA BA MŨI KHOAN ---

P34 | 7:05–7:20 | Palomas tiếp tế
Mountain cross-section with a thin cyan borehole from surface to refuge, a small cyan-outlined tube (A23) travelling down inside it, miner silhouettes waiting below with raised hands
[RM] Ống chạy dọc lỗ khoan nhiều lần; danh sách đồ tiếp tế hiện bên cạnh.

P35 | 7:20–7:35 | Lần đầu nhìn thấy họ
Refuge chamber cross-section, a tiny cyan camera hanging at the end of a line, many miner silhouettes gathered in front of it waving, one raising a thumb
[RM] Khung viền kiểu màn hình camera; nhiễu tín hiệu nhẹ.

P36 | 7:35–8:00 | Ba kế hoạch A – B – C
Mountain cross-section with three green-outlined drilling rigs on the surface, three drill lines descending: A straight down, B at a slight angle, C straight down from further away, each a different shade of cyan, all aimed at the amber refuge area
[RM] Ba thanh tiến độ chạy song song có nhãn A / B / C; B khoan chéo ~80°.

P37 | 8:00–8:15 | Dọn đá
Amber workshop cavern in cross-section, gravel falling as grey dots from a drill hole above, orange- and cyan-outlined miners shovelling (A10)
[RM] Hạt sỏi rơi liên tục; biểu tượng ca xoay vòng.

P38 | 8:15–8:30 | Mũi khoan vỡ
Close cross-section of drill line B stopped in the rock, its tip outlined in red with broken fragments around it, a warning glow
[RM] Thanh tiến độ B dừng, nhấp nháy đỏ, rồi chạy tiếp.

P39 | 8:30–8:45 | Ngày thứ 66
Mountain cross-section, drill line B almost touching the amber workshop near the refuge, everything else dimmed, a green-outlined engineer on the surface holding a radio
[RM] Đếm ngược mét cuối; im lặng căng thẳng.

P40 | 8:45–9:00 | Xuyên thủng
Mountain cross-section, drill line B breaking into the amber workshop with a bright cyan flash, miner silhouettes below and rescuer silhouettes above both raising their arms
[RM] Chớp sáng, chữ "623 m – Ngày 66".

--- PHẦN 6 – ĐÊM GIẢI CỨU VÀ KHOANG FÉNIX 2 ---

P41 | 9:00–9:15 | Khoang Fénix 2
Side view on black: a tall narrow cyan-outlined rescue capsule (A20) next to a human silhouette for scale, thin measurement lines showing its height and narrow width
[RM] Kích thước "~4 m" và "~53 cm" hiện dần.

P42 | 9:15–9:30 | Bên trong khoang
Cutaway of the narrow capsule with a single silhouette standing upright inside, harness lines, a small cyan oxygen tank, walls almost touching the shoulders
[RM] Zoom chậm vào khoang.

P43 | 9:30–9:45 | Người cứu hộ xuống trước
Mountain cross-section with the cyan rescue shaft, the capsule with a green-outlined rescuer inside descending toward the amber workshop
[RM] Khoang trượt xuống dọc shaft; thước độ sâu tăng.

P44 | 9:45–10:05 | Người đầu tiên đi lên
Mountain cross-section, the capsule rising up the cyan shaft with an orange-outlined miner inside, a bright white circle of light waiting at the surface
[RM] Thước độ sâu đếm ngược −623 m → 0.

P45 | 10:05–10:20 | Khoảnh khắc đầu tiên
Surface at night with bright floodlights, the orange-outlined miner stepping out of the capsule, a small boy silhouette running toward him, a woman silhouette with hands to her face
[RM] Asset A12, A15. Chữ "13.10.2010 – sau nửa đêm".

P46 | 10:20–10:40 | Từng người một
Mountain cross-section, the capsule travelling up and down the shaft repeatedly, the cluster of glowing dots in the refuge shrinking one by one while dots on the surface grow
[RM] Bộ đếm "1/33 … 10/33 … 32/33".

P47 | 10:40–11:00 | Người cuối cùng
Mountain cross-section, the last gold-outlined figure rising in the capsule, the refuge below now empty and dark, the surface glowing with many white-outlined figures
[RM] Bộ đếm "33/33"; chữ "Không ai bị bỏ lại".

--- PHẦN 7 – KẾT ---

P48 | 11:00–11:15 | Mỏ đóng cửa
Wide view of the black mountain at dawn as in H01, the mine entrance now dark and sealed with a red-outlined gate, the spiral tunnel inside faintly visible and unlit
[RM] Dòng thời gian tóm tắt: 05/08 → 22/08 → 09/10 → 13/10.

P49 | 11:15–11:35 | Chia nhau từng thìa
Refuge chamber cross-section glowing warm amber, all miner silhouettes sitting shoulder to shoulder, a single small glowing can passing from hand to hand
[RM] Màu ấm hơn bình thường (flashback).

P50 | 11:35–11:50 | Thông điệp cuối
Mountain cross-section in total darkness, a single amber headlamp beam rising straight up from the bottom through the black rock to a faint white light at the surface
[RM] Chữ "69 ngày. 700 mét. 33 người." → logo kênh, nút đăng ký.
~~~~~

### A.3 EP2 brief — 2026-10-24T11:21:20Z

~~~~~text
Dựng HOÀN CHỈNH tập EP2 kênh TikTok mới bằng Remotion và render thành phẩm: "Nếu bạn nhân bản được chính mình?"
Làm trọn: dựng tất cả cảnh, đồng bộ voice, tạo SFX + foley, mix, ghép thành MỘT composition, render MP4. Không dừng giữa chừng để hỏi, trừ khi không tìm thấy file voice.

=== THÔNG SỐ ===
- Ngang 16:9, 1920x1080, 30fps, H.264.
- Code: src/tiktok2/ep2/ (không dấu). Composition id: Tiktok2Ep2.
- Thành phẩm: "out/tiktok 2/tiktok2-ep2.mp4" (tạo thư mục nếu chưa có).
- Khung ngang 16:9: giữ chữ và chi tiết quan trọng trong vùng an toàn 90% giữa khung; bố cục tận dụng chiều rộng (nhân vật theo quy tắc 1/3, chừa không gian bối cảnh hai bên, two-shot đặt hai nhân vật ở hai phía khung).
- Nếu đã có component dùng chung từ EP1 (Character, BreathRing-style UI, Captions, BigText) trong src/tiktok2/, dùng lại để giữ đồng nhất phong cách kênh.

=== THAM KHẢO ===
- Xem ảnh trong "public/kênh tiktok 2/Ref cho kênh tiktok 2" để nắm phong cách. Chỉ tham khảo: tạo nhân vật, bối cảnh riêng, không vẽ lại khung hình, không đưa ảnh vào video.

=== VOICE & NHỊP DỰNG ===
- Voice: file audio trong "public/kênh tiktok 2/voice/ep2/" (encode đúng đường dẫn có dấu và khoảng trắng khi dùng staticFile).
- Phiên âm tiếng Việt bằng @remotion/install-whisper-cpp (model large-v3, nặng quá thì medium), lấy timestamp từng từ → src/tiktok2/ep2/captions.json.
- KHÔNG để nguyên file voice chạy liền một mạch. Cắt voice thành từng câu theo timestamp, mỗi câu là một <Audio> riêng (startFrom/endAt) đặt trên timeline.
- Độ dài video do NỘI DUNG HÌNH quyết định, voice chỉ là xương sống:
  • Hình cần thêm thời gian (hành động, cảm xúc, gag hài cần đọng) → chèn khoảng lặng (hold) sau câu.
  • Voice có khoảng nghỉ thừa mà hình không cần → cắt ngắn, giữ tối thiểu ~0.15s giữa các câu.
  • Không bao giờ đổi tốc độ hay cao độ giọng.
  • Trong các hold, ambience và foley vẫn chạy, không để khoảng chết.
- Gợi ý nhịp: hook giữ đủ ~3s; kéo dài 2.4, 3.6, 3.8, 4.5, 4.8; giữ lâu 6.8, 7.10, 7.12, 8.6, 8.8; cắt nhanh dồn dập ở 3.3, 4.1–4.4, 5.2–5.4.
- Mỗi shot có "MỐC" = vài chữ đầu câu thoại; so khớp gần đúng (bỏ dấu câu, không phân biệt hoa thường) để gắn shot với câu.
- Ghi timeline cuối (câu voice, hold, shot, giây bắt đầu/kết thúc) vào timing.json; tạo timing-overrides.json để tôi chỉnh tay. Tổng độ dài = các câu + các hold + end card ~1.5s.

=== VISUAL STYLE (riêng của kênh này — không dùng style của các kênh cũ) ===
- Soft pseudo-3D flat cartoon, rounded shapes, no harsh outlines.
- Characters: large glossy black round head (~45% body height), subtle radial gradient, thin warm cream rim light; face = two white oval eyes only, no mouth. Expressions only via eye shapes: normal ovals, "> <" squint, half-closed lids (bored/lazy), wide ovals (shock), curved arcs (happy/soft). Blink every 3–5s.
- Body: hoodie with drawstrings, thin black tube arms/legs, round mitten hands. Subtle idle breathing bob.
- Palette: environments and side characters muted and desaturated (blue-gray, dusty purple, olive, beige). Main character ALWAYS in a saturated ORANGE hoodie.
- Depth: ≥3 layers; blur foreground and background (filter blur 4–10px), focal character sharp; slow parallax.
- Lighting: soft ambient, one warm glow source per scene, soft shadows, light vignette.
- Vietnamese settings, furnished with real detail.
- Camera: change framing every 1–3s (wide / medium / close-up / extreme close-up); slow push-in on emotional beats.
- Color grade by act: acts 1–5 normal bright; act 6 gradually desaturate to ~60% except the orange hoodies; act 7 night blue with warm city lights; act 8 warm kitchen light, full saturation.

=== HIỆU ỨNG RIÊNG TẬP NÀY ===
- Búng tay: ECU ngón tay, tia sáng trắng nhỏ, bản sao "pop" ra với squash-and-stretch kèm vòng sáng lan trên sàn.
- Bản sao giống hệt bạn gốc (áo cam). Khi nhiều bản sao cùng khung, dùng dàn dựng và chuyển động để người xem theo dõi bạn gốc; không thêm ký hiệu phân biệt.
- Bộ đếm bản sao góc trên trái: "x1, x2, x3…" nảy lên mỗi lần búng tay (component ClonerCounter).
- Tan biến lúc nửa đêm: cơ thể vỡ thành hạt sáng ấm bay lên như bụi đèn trong ~2s.
- Captions kiểu TikTok từ captions.json: 2–4 từ/cụm, chữ trắng đậm viền đen, từ đang đọc tô CAM, ở dải dưới ~82% chiều cao, căn giữa; ẩn trong các hold.
- BigText: chữ to đậm nảy nhẹ cho chỗ ghi "TEXT".

=== NHÂN VẬT ===
- BẠN và các BẢN SAO: thiếu niên, hoodie CAM, tóc rối (vài sợi tóc trên đỉnh đầu).
- MẸ: hoodie tím phấn, búi tóc nhỏ.
- BA: áo sơ mi xanh nhạt bên ngoài hoodie xám, hơi to con.
- CÔ DẠY THÊM / CÔ CHỦ NHIỆM: áo dài xám xanh, kính tròn.
- ĐỘI BÓNG XÓM: các bạn hoodie màu trầm.
- HỌ HÀNG: các nhân vật lớn tuổi màu trầm.

=== SFX & FOLEY ===
- Tạo SFX và foley theo đúng cách các tập cũ trong dự án đã làm: tìm trong src/ các file/script sfx, foley, audio của các tập trước (kể cả EP1 của kênh này) và dùng lại pipeline đó. Lưu âm thanh tập này ở "public/kênh tiktok 2/sfx/ep2/".
- Foley cho mọi hành động: chuông báo thức, chăn sột soạt, bước chân, cửa phòng, tủ quần áo, chổi quét, bóng lăn và sút, phong bao lì xì, chuột máy tính, chén đĩa, nước chảy, ghế nhựa.
- SFX chữ ký tập: tiếng "tách" búng tay + "pop" bản sao xuất hiện (tông cao dần khi nhiều bản sao liên tiếp), chuông nhẹ lấp lánh khi tan biến.
- Ambience: phòng ngủ sáng sớm (chim, xe xa), lớp học, sân xóm, ngày Tết (pháo giấy, tiếng chúc), ban công đêm (thành phố xa, dế), bếp đêm (tủ lạnh ù, nước).
- Mix: voice luôn ưu tiên; giảm SFX/ambience khoảng -15 đến -18 dB khi có giọng; không dùng nhạc có bản quyền.

=== DANH SÁCH SHOT (SFX/foley trong ngoặc) ===
[1. HOOK]
1.1 MỐC "Nếu bạn nhân bản được": ECU búng tay → wide: phòng ngủ, bạn gốc và 5 bản sao áo cam đứng thành hàng, ClonerCounter nhảy x6. TEXT trên cùng "NẾU BẠN NHÂN BẢN ĐƯỢC CHÍNH MÌNH?" (tách, pop x5 dồn dập)

[2. COLD OPEN – phòng ngủ sáng sớm]
2.1 "Sáu giờ sáng": close-up đồng hồ báo thức rung trên bàn. (chuông báo thức)
2.2 "Hôm nay bạn có": danh sách việc hiện ra từng dòng cạnh đầu bạn nằm. (tick UI mỗi dòng)
2.3 "Bạn nằm đó": top-down bạn nằm nhìn trần, mắt nửa mí.
2.4 "Ước gì có thêm": ECU ngón tay búng. (tách)
2.5 "Ở cuối giường": medium, một người áo cam ngồi dậy từ cuối giường. (pop, chăn sột soạt)
2.6 "Nó nhìn bạn": cắt qua lại hai khuôn mặt giống hệt, mắt tròn.
2.7 "Ủa… ai đi học": close-up bản sao ngái ngủ.
2.8 "Hai bạn oẳn tù tì": close-up hai bàn tay oẳn tù tì; bạn gốc thua, bản sao chui lại vào chăn. (tiếng vỗ tay nhịp, chăn)

[3. LUẬT CHƠI – nền tối giản màu trầm]
3.1 "Luật thế này": bạn đứng giữa, icon nổi lên. (whoosh UI)
3.2 "Mỗi lần búng tay": búng → bản sao pop ra cạnh bên. ClonerCounter x2. (tách, pop)
3.3 "Từ cọng tóc": so sánh cận cọng tóc, vết sẹo đầu gối giống hệt.
3.4 "Đúng mười hai giờ đêm": đồng hồ chỉ 12:00, bản sao vỡ thành hạt sáng. (chuông lấp lánh)
3.5 "Và những gì bản sao trải qua": mũi tên ký ức từ bản sao về bạn bị gạch chéo. TEXT "NHỚ CHI TIẾT NÀY". (buzz)
3.6 "ngay cả cặp song sinh": hai vân tay đặt cạnh nhau, khác nhau; rồi hai vân tay của bạn và bản sao chồng khít.
3.7 "Cả cái tật rung chân": hai bàn chân rung cùng nhịp.
3.8 "Mẹ bạn không phân biệt được": Mẹ nhìn hai đứa, mắt nhìn qua lại.

[4. HỌC LẠI MỌI THỨ]
4.1 "Bản sao giống bạn": bản sao nằm dài, mắt nửa mí.
4.2 "Bạn sai nó đi học thêm": chuỗi búng tay liên tiếp, mỗi đứa chỉ tay sang đứa mới. ClonerCounter tăng x2 → x6. (tách-pop dồn dập)
4.3 "Tới bản sao thứ năm": wide sáu đứa nằm chồng trên một giường lướt điện thoại. (lướt màn hình)
4.4 "Cô dạy thêm nhắn tin": màn hình tin nhắn chung chung, không thương hiệu. (ting)
4.5 "Sáu cái đầu quay ra": Mẹ ở cửa, POV Mẹ thấy sáu cái đầu quay ra cùng lúc. (cửa mở, im lặng)
4.6 "Mẹ đóng cửa lại": Mẹ đóng cửa, đi pha trà ở bếp, quay lại. (cửa, rót trà, bước chân)
4.7 "Chỉ còn một đứa": phòng chỉ còn một đứa; cửa tủ quần áo khép hờ rung nhẹ.
4.8 "Chắc mẹ thiếu ngủ": close-up Mẹ, mắt nửa mí, cầm ly trà.
4.9 "Vậy là bạn lập một hệ thống": bảng phân công vẽ tay trên tường. TEXT "ĐỨA NÀO CÃI — RỬA CHÉN".

[5. BẮT ĐẦU VUI]
5.1 "Nhưng rồi nó bắt đầu vui": nhịp nhanh, màu tươi.
5.2 "Trực nhật lớp": năm bạn quét, lau bảng, kê bàn time-lapse. (chổi, giẻ, bàn ghế)
5.3 "Cô chủ nhiệm": cô ở cửa, kính tuột xuống mũi.
5.4 "Đá bóng ở sân xóm": wide 11 áo cam vs đội màu trầm; bảng tỉ số lật nhanh tới 12–0. (bóng, còi, reo)
5.5 "Thủ môn đội kia": thủ môn nhỏ đi về, mắt cụp.
5.6 "Mùng một Tết": màn hình chia 6 ô, mỗi ô một bạn chúc Tết một nhà họ hàng. (tiếng chúc Tết, pháo giấy)
5.7 "Tối đó, sáu đứa về": sáu đứa xếp hàng nộp bao lì xì; đếm thiếu một. TEXT "THIẾU 1 BAO". (giấy bao lì xì)
5.8 "Không đứa nào nhận": sáu đứa nhìn nhau, mắt nửa mí, nhìn sang bạn gốc.
5.9 "Rồi tới bài thuyết trình": ba bản sao làm việc: sách, laptop, tập nói trước gương; bạn gốc ngủ trưa. (gõ phím, lật sách)
5.10 "Bài thuyết trình hay nhất": lớp vỗ tay, slide sáng. (vỗ tay)
5.11 "Rồi cô hỏi một câu": im lặng, close-up bạn mắt tròn, mồ hôi. (tiếng ve, im)
5.12 "nếu không ôn lại": đường cong trí nhớ tụt xuống 50% sau 1 ngày; TEXT "-50% SAU 1 NGÀY".

[6. CÁI GIÁ – giảm bão hòa dần, chỉ áo cam giữ màu]
6.1 "Nhưng có một cái giá": slow push vào bạn trên giường lướt điện thoại.
6.2 "Học thêm. Chán": bạn búng tay, bản sao đi ra cửa. (tách-pop nhẹ, âm lượng nhỏ dần qua mỗi lần)
6.3 "Ăn cơm tối": bản sao ngồi mâm cơm cạnh Ba Mẹ; bạn gốc trên lầu với điện thoại.
6.4 "Chủ nhật ba dạy chạy xe": bãi đất trống, bản sao chạy xe, Ba chạy theo.
6.5 "Vậy là có một luật": TEXT "VIỆC GÌ CHÁN — ĐỂ BẢN SAO LÀM".
6.6 "Bạn có thêm rất nhiều thời gian": time-lapse bạn gốc lướt điện thoại, ánh màn hình xanh trên mặt, ngày đêm đổi.
6.7 "Rồi một tối, ba đưa điện thoại": mâm cơm, Ba đưa điện thoại.
6.8 "Trong ảnh": ảnh trên điện thoại: bạn áo cam cười, Ba chạy theo giơ tay. Slow push vào ảnh.
6.9 "Bạn không nhớ": close-up bạn, mắt trống.
6.10 "Mẹ gắp cho bạn": Mẹ gắp cá vào chén. (đũa, chén)
6.11 "Câu gì? Bạn không biết": bạn cúi xuống chén cơm.
6.12 "Bạn có thêm bao nhiêu là thời gian": wide, bạn ngồi một mình trong phòng tối, qua khe cửa thấy ánh đèn ấm phòng ăn.

[7. CAO TRÀO – ban công đêm]
7.1 "Sinh nhật mẹ năm nay": dưới nhà có bánh kem, nến; bạn trên lầu đang chơi game, búng tay. (tách-pop, tiếng game xa)
7.2 "Mười một giờ năm mươi": đồng hồ 23:50. Bạn mở cửa ra ban công. (cửa trượt)
7.3 "Bản sao đã ngồi đó": wide từ phía sau: bản sao ngồi ghế nhựa, đèn thành phố mờ phía xa. (ambience thành phố đêm, dế)
7.4 "Còn mười phút": close-up bản sao, mắt bình thản.
7.5 "Tối nay mẹ nấu canh chua": flash ấm (tông vàng, hơi mờ viền): mâm cơm, Mẹ gắp cá cho bản sao.
7.6 "Ba kể hồi bằng tuổi mình": flash: Ba khoa tay kể chuyện, bản sao chống cằm nghe.
7.7 "Sao mày kể tao nghe": two-shot hai người ngồi cạnh nhau.
7.8 "Vì mười phút nữa": slow push vào bản sao.
7.9 "Mình đã sống mấy chục buổi tối": dàn flash nhanh các buổi tối các bản sao đã sống thay, mỗi cái vỡ thành hạt sáng.
7.10 "Năm phút": đồng hồ 23:55.
7.11 "Tự đi mà hỏi mẹ": close-up bản sao mắt cong cười.
7.12 "Tay nó bắt đầu sáng lên": hạt sáng ấm bay ra từ tay, lan dần lên người. (lấp lánh nhẹ, kéo dài)
7.13 "Mười hai giờ": đồng hồ 00:00; bản sao tan hết, hạt sáng bay lên trời. (chuông lấp lánh, rồi im)
7.14 "Chỉ còn cái ghế nhựa": close-up ghế nhựa trống; bạn đặt tay lên ghế.
7.15 "Lần đầu tiên, bạn hiểu": wide bạn đứng một mình ở ban công, thành phố phía xa.

[8. KẾT – bếp đêm, đèn vàng ấm]
8.1 "Bạn đi xuống bếp": bạn đi xuống cầu thang, ánh đèn bếp hắt lên. (bước chân cầu thang)
8.2 "Mẹ để con rửa": Mẹ quay lại, mắt tròn ngạc nhiên. (nước chảy)
8.3 "Bạn rửa chén": two-shot từ phía sau, hai người đứng cạnh bồn rửa. (nước, chén chạm)
8.4 "Mẹ ơi. Sinh nhật mẹ": close-up bạn hỏi, không nhìn Mẹ.
8.5 "Mẹ cười": close-up Mẹ, mắt cong.
8.6 "Mẹ cứ già từ từ thôi": slow push vào hai người, giữ lâu. Caption giữ nguyên câu này lâu hơn bình thường.
8.7 "Sáng hôm sau": đồng hồ báo thức. (chuông)
8.8 "Bạn búng tay. Một lần": một bản sao pop ra; ClonerCounter chỉ x1. (tách, pop)
8.9 "Tao. Mày làm bài tập": bạn khoác cặp ra cửa, bản sao ngồi vào bàn học.
8.10 "Còn bạn": end card: TEXT câu hỏi bình luận, rồi "Một chữ nếu… một cuộc đời khác."

=== KIỂM TRA TRƯỚC KHI RENDER ===
- Không cảnh nào trống hoặc nhân vật đứng yên quá 2s mà không có chuyển động nhẹ.
- Captions khớp lời, không đè lên chi tiết chính, nằm trong safe zone.
- Nghe lại toàn bộ: không đoạn nào voice bị cắt lẹm, không khoảng chết.
- Render ra "out/tiktok 2/tiktok2-ep2.mp4", in bảng timeline và tổng thời lượng.
~~~~~

### A.4 EP3 brief — 2026-10-25T04:26:23Z

~~~~~text
Dựng HOÀN CHỈNH tập EP3 kênh Chíp Siêu Năng bằng Remotion và render thành phẩm: "Nếu bạn quay lại được 30 giây — nhưng chỉ 3 lần mỗi ngày?"
Làm trọn: dựng tất cả cảnh, đồng bộ voice, tạo SFX + foley, mix, ghép thành MỘT composition, render MP4. Không dừng giữa chừng để hỏi, trừ khi không tìm thấy file voice.

=== THÔNG SỐ ===
- Ngang 16:9, 1920x1080, 30fps, H.264.
- Code: src/tiktok2/ep3/ (không dấu). Composition id: Tiktok2Ep3.
- Thành phẩm: "out/tiktok 2/tiktok2-ep3.mp4" (tạo thư mục nếu chưa có).
- Khung ngang 16:9: giữ chữ và chi tiết quan trọng trong vùng an toàn 90% giữa khung; bố cục tận dụng chiều rộng (nhân vật theo quy tắc 1/3, chừa không gian bối cảnh hai bên, two-shot đặt hai nhân vật ở hai phía khung).
- Dùng lại component dùng chung của kênh trong src/tiktok2/shared/ (Character, Captions, BigText) nếu đã có, để giữ đồng nhất phong cách.

=== THAM KHẢO ===
- Xem ảnh trong "public/kênh tiktok 2/Ref cho kênh tiktok 2" để nắm phong cách. Chỉ tham khảo: tạo nhân vật, bối cảnh riêng, không vẽ lại khung hình, không đưa ảnh vào video.

=== VOICE & NHỊP DỰNG ===
- Voice: file audio trong "public/kênh tiktok 2/voice/ep3/" (encode đúng đường dẫn có dấu và khoảng trắng khi dùng staticFile).
- Phiên âm tiếng Việt bằng @remotion/install-whisper-cpp (model large-v3, nặng quá thì medium), lấy timestamp từng từ → src/tiktok2/ep3/captions.json.
- KHÔNG để nguyên file voice chạy liền một mạch. Cắt voice thành từng câu theo timestamp, mỗi câu là một <Audio> riêng (startFrom/endAt) đặt trên timeline.
- Độ dài video do NỘI DUNG HÌNH quyết định, voice chỉ là xương sống:
  • Hình cần thêm thời gian (hành động, cảm xúc, gag hài cần đọng) → chèn khoảng lặng (hold) sau câu.
  • Voice có khoảng nghỉ thừa mà hình không cần → cắt ngắn, giữ tối thiểu ~0.15s giữa các câu.
  • Không bao giờ đổi tốc độ hay cao độ giọng.
  • Trong các hold, ambience và foley vẫn chạy, không để khoảng chết.
- Gợi ý nhịp: hook giữ đủ ~3s; kéo dài 2.5, 2.10, 5.4, 5.8; giữ lâu 6.10, 7.9 (im lặng ~1s sau khi nắm tay mà không có gì xảy ra), 8.8, 8.10, 9.6, 9.10; cắt nhanh dồn dập ở 4.1–4.3, 7.1–7.3, 8.3.
- Mỗi shot có "MỐC" = vài chữ đầu câu thoại; so khớp gần đúng (bỏ dấu câu, không phân biệt hoa thường) để gắn shot với câu.
- Ghi timeline cuối (câu voice, hold, shot, giây bắt đầu/kết thúc) vào timing.json; tạo timing-overrides.json để tôi chỉnh tay. Tổng độ dài = các câu + các hold + end card ~1.5s.

=== VISUAL STYLE (riêng của kênh này — không dùng style của các kênh cũ) ===
- Soft pseudo-3D flat cartoon, rounded shapes, no harsh outlines.
- Characters: large glossy black round head (~45% body height), subtle radial gradient, thin warm cream rim light; face = two white oval eyes only, no mouth. Expressions only via eye shapes: normal ovals, "> <" squint, half-closed lids, wide ovals (shock), curved arcs (happy), downturned lids (sad). Blink every 3–5s.
- Body: hoodie with drawstrings, thin black tube arms/legs, round mitten hands. Subtle idle breathing bob.
- Palette: environments and side characters muted and desaturated (blue-gray, dusty purple, olive, beige). Main character ALWAYS in a saturated ORANGE hoodie.
- Depth: ≥3 layers; blur foreground and background (filter blur 4–10px), focal character sharp; slow parallax.
- Lighting: soft ambient, one warm glow source per scene, soft shadows, light vignette.
- Vietnamese settings, furnished with real detail.
- Camera: change framing every 1–3s (wide / medium / close-up / extreme close-up); slow push-in on emotional beats; handheld on the running sequence.
- Color grade by act: acts 1–5 bright morning; act 6 desaturate to ~60%; act 7 afternoon gray; act 8 golden late-afternoon light at the bus station; act 9 fresh morning, full saturation.

=== HIỆU ỨNG RIÊNG TẬP NÀY ===
- REWIND: khi tua, toàn cảnh ngả xanh lam nhạt, có các vệt chuyển động ngang mờ; mọi vật chuyển động ngược nhanh (người đi lùi, lá bay ngược lên cành, xe chạy lùi); một kim đồng hồ mờ quay ngược ở giữa khung; kéo dài ~1.2s rồi bật về màu bình thường. Nhân vật chính KHÔNG đi lùi (chỉ mình bạn nhớ). Component RewindFX dùng lại được.
- Nắm tay đếm ba: ECU bàn tay nắm chặt, ba vòng sáng nhỏ co lại theo nhịp "3–2–1" trước khi RewindFX.
- REWIND COUNTER: ba chấm tròn ở góc trên trái (giống ba ô trong sổ). Mỗi lần dùng, một chấm được tô đặc màu cam kèm nảy nhẹ. Hết lượt: cả ba chấm cam đậm, hơi rung khi nhân vật cố nắm tay.
- "Nắm tay mà không có gì xảy ra" (7.9): vòng sáng không xuất hiện, ba chấm rung nhẹ rồi im, âm thanh bị bóp nhỏ lại.
- Cuốn sổ ba ô tròn: vẽ tay, xuất hiện ở 4.4 và 9.11.
- Captions từ captions.json: 2–4 từ/cụm, chữ trắng đậm viền đen, từ đang đọc tô CAM, ở dải dưới ~82% chiều cao, căn giữa; ẩn trong các hold.
- BigText: chữ to đậm nảy nhẹ cho chỗ ghi "TEXT".

=== NHÂN VẬT ===
- BẠN: thiếu niên, hoodie CAM.
- LINH: bạn lớp bên, hoodie hồng phấn trầm, tóc buộc đuôi ngựa ngắn, kẹp tóc nhỏ.
- PHONG: bạn thân từ mẫu giáo, hoodie xanh navy, tóc lởm chởm, cao hơn bạn một chút.
- MẸ: hoodie tím phấn, búi tóc nhỏ.
- CÔ GIÁO: áo dài xám xanh, kính tròn.
- THỦ MÔN SÂN XÓM: hoodie xám, găng tay to.
- BẠN CÙNG LỚP, HỌC SINH Ở CỔNG TRƯỜNG, HÀNH KHÁCH BẾN XE: nhiều nhân vật màu trầm.

=== SFX & FOLEY ===
- Tạo SFX và foley theo đúng cách các tập cũ trong dự án đã làm: tìm trong src/ các file/script sfx, foley, audio của các tập trước (kể cả các tập trước của kênh này) và dùng lại pipeline đó. Lưu âm thanh tập này ở "public/kênh tiktok 2/sfx/ep3/".
- SFX chữ ký tập: ba tiếng "tick" nhỏ cho nhịp 3–2–1, rồi tiếng tua ngược (âm thanh đảo chiều, vút xuống) khi RewindFX; tiếng "bụp" nhẹ khi tô một chấm counter; tiếng tick rỗng, tắt lịm khi nắm tay mà hết lượt.
- Foley: bước chân cổng trường, ly sữa đổ, vấp cầu thang, sút bóng và lưới rung, khay cơm, chén chè, cửa sổ xe khách kéo xuống, gõ lên kính, tay đập nhau, điện thoại rung, bút tô vào sổ.
- Ambience: cổng trường buổi sáng, lớp học, sân xóm, phòng ngủ chiều, đường phố kẹt xe (còi, xe máy), bến xe (loa thông báo chung chung, động cơ xe khách nổ máy), phòng ngủ đêm.
- Mix: voice luôn ưu tiên; giảm SFX/ambience khoảng -15 đến -18 dB khi có giọng; không dùng nhạc có bản quyền.

=== DANH SÁCH SHOT (SFX/foley trong ngoặc) ===
[1. HOOK]
1.1 MỐC "Nếu bạn quay lại được": ECU bàn tay nắm chặt, ba vòng sáng co lại → RewindFX trên cổng trường: học sinh đi lùi, lá bay ngược. Rewind counter hiện ba chấm. TEXT trên cùng "NẾU BẠN QUAY LẠI ĐƯỢC 30 GIÂY?" (tick x3, tua ngược)

[2. COLD OPEN – cổng trường buổi sáng]
2.1 "Bảy giờ sáng": wide cổng trường, Linh đi từ xa về phía bạn. (ambience cổng trường)
2.2 "Bạn đã tập câu chào": flash ngắn: bạn tập trước gương tối qua.
2.3 "Linh nhìn bạn. Cười": close-up Linh mắt cong.
2.4 "Chào… cô": close-up bạn, mắt "> <".
2.5 "Linh khựng lại": Linh dừng bước, mắt tròn. Giữ lâu. (im lặng)
2.6 "Bạn vừa gọi": TEXT "GỌI BẠN CÙNG TUỔI LÀ 'CÔ'".
2.7 "Bạn nhắm mắt": ECU tay nắm lại → RewindFX lần đầu. Counter tô chấm 1. (tick x3, tua ngược, bụp)
2.8 "CHÀO LINH": bạn hét to, cả cổng trường quay lại. (nhiều đầu quay, xe phanh)
2.9 "Tua lại": RewindFX. Counter tô chấm 2. (tua ngược, bụp)
2.10 "Lần thứ ba": bạn chỉ giơ tay vẫy; Linh vẫy lại, đi qua. Counter tô chấm 3. (bước chân)
2.11 "Bảy giờ năm phút": đồng hồ trên tường 7:05, bạn đứng một mình, ba chấm cam đặc. Giữ cho gag.

[3. LUẬT CHƠI – nền tối giản]
3.1 "Luật thế này": bạn đứng giữa, icon nổi lên. (whoosh UI)
3.2 "Nắm chặt tay": bàn tay nắm, 3–2–1, đồng hồ quay ngược 30 giây. (tick x3, tua)
3.3 "Chỉ mình bạn nhớ": bạn có bóng ký ức sáng; người xung quanh không có.
3.4 "Mỗi ngày ba lần": ba chấm; đồng hồ 00:00 → ba chấm trắng lại.
3.5 "Và khi đã dùng hết lượt thứ ba": ba chấm cam đặc, dấu khóa. TEXT "NHỚ CHI TIẾT NÀY". (buzz)
3.6 "trung bình mỗi người nói": TEXT "16.000 TỪ / NGÀY" vs "3 LẦN SỬA".
3.7 "ấn tượng đầu tiên": TEXT "0,1 GIÂY", flash ảnh mặt bạn nói "Chào… cô".

[4. HỌC LẠI MỌI THỨ]
4.1 "Ngày thứ hai": đồng hồ 8:00, ly sữa đổ → tua. (ly đổ, tua, bụp)
4.2 "Tám giờ mười": vấp cầu thang → tua. (vấp, tua, bụp)
4.3 "Tám giờ mười lăm": giơ tay "dạ có" sai tên; cả lớp quay lại. Counter đã đầy. (bụp, cả lớp cười)
4.4 "Thế là bạn mua một cuốn sổ": ECU cuốn sổ vẽ tay, mỗi trang ba ô tròn. (bút)
4.5 "Bạn bắt đầu tiêu": bạn đếm ba chấm như đếm tiền xu.

[5. BẮT ĐẦU VUI]
5.1 "Đá phạt đền": sân xóm, bạn đặt bóng. (ambience sân)
5.2 "Bạn sút. Thủ môn bay sang trái": slow motion, bóng ra ngoài. (sút, bóng đập rào)
5.3 "Tua lại": RewindFX, thủ môn bay ngược về giữa. (tua)
5.4 "Vào": bóng vào lưới bên phải, lưới rung. (lưới, reo)
5.5 "Thủ môn đứng nhìn": close-up thủ môn mắt nửa mí nghi ngờ. Giữ cho gag.
5.6 "Giờ sinh hoạt": lớp học, bạn đứng kể chuyện cười.
5.7 "Câu thứ nhất: im lặng": cả lớp im → tua; "có đứa ho" → tua. (ho, tua x2)
5.8 "Câu thứ ba": cả lớp cười lăn lộn. (cả lớp cười)
5.9 "Và Linh. Ngày thứ năm": cổng trường, lần một nói lắp → tua.
5.10 "Lần hai: hoàn hảo": bạn và Linh đi cạnh nhau tới cửa lớp, cả hai mắt cong. (bước chân, ambience nhẹ)
5.11 "Bạn trở thành người hoàn hảo": TEXT "HOÀN HẢO… TRONG 30 GIÂY".

[6. CÁI GIÁ – giảm bão hòa dần]
6.1 "Nhưng có một cái giá": slow push vào bạn.
6.2 "Một câu nói hớ? Tua": ba cắt nhanh liên tiếp RewindFX, mỗi lần nhỏ hơn. (tua x3)
6.3 "Và khi đã hết lượt": ba chấm cam đặc; bạn lùi vào góc.
6.4 "Vậy là có một luật": TEXT "HẾT LƯỢT THÌ IM LẶNG".
6.5 "Từ trưa tới tối": bạn chỉ gật đầu trong nhóm bạn, đứng hơi xa.
6.6 "Phong — thằng bạn thân": giới thiệu Phong. TEXT "PHONG – BẠN TỪ MẪU GIÁO".
6.7 "Dạo này mày nói chuyện": close-up Phong mắt nửa mí.
6.8 "Mẹ cũng nói y vậy": Mẹ ở bàn ăn nhìn bạn, mắt lo lắng.
6.9 "Bạn hoàn hảo hơn bao giờ hết": wide bạn đứng giữa sân trường, mọi người xung quanh mờ.

[7. CAO TRÀO 1 – thứ Sáu]
7.1 "Lượt một": giờ kiểm tra miệng → tua, chấm 1. (tua, bụp)
7.2 "Lượt hai": khay cơm sắp rơi trước Linh → tua, chấm 2. (tua, bụp)
7.3 "Lượt ba": oẳn tù tì giành chè → tua, chấm 3. (tua, bụp)
7.4 "Bốn giờ chiều": ECU cuốn sổ, ba ô tô kín.
7.5 "Phong chạy tới": Phong thở dốc, mắt lạ. (bước chạy)
7.6 "Ba tao chuyển công tác": close-up Phong.
7.7 "Phong là đứa duy nhất biết": flash nhanh ba kỷ niệm: bạn sợ chó, khóc xem hoạt hình, hai đứa lớp hai.
7.8 "Sao giờ mày mới nói": close-up bạn, mắt "> <" giận.
7.9 "Bạn nắm chặt tay": ECU tay nắm — KHÔNG có vòng sáng; ba chấm rung rồi im; âm thanh bị bóp nhỏ. Giữ lâu ~1s. (tick rỗng)
7.10 "Phong nhìn bạn": Phong quay lưng đi xa, wide, bạn đứng lại.
7.11 "Ba ô tròn đã tô kín": ECU sổ.

[8. CAO TRÀO 2 – chạy tới bến xe]
8.1 "Bốn giờ bốn mươi": phòng ngủ, đồng hồ 4:40, bạn ngồi trên giường.
8.2 "Bạn có thể đợi tới nửa đêm": đồng hồ chia đôi: 00:00 và tấm bản đồ đường xe khách xa dần.
8.3 "Bạn chạy": montage handheld: hẻm, đường lớn, len giữa hai hàng xe máy kẹt. (bước chạy, còi xe)
8.4 "Bến xe": đồng hồ bến xe 4:58, xe khách nổ máy. (động cơ, loa bến xe)
8.5 "Phong ngồi cạnh cửa sổ": Phong sau kính, mắt cụp.
8.6 "Bạn gõ lên kính": ECU nắm tay gõ. Phong kéo cửa sổ xuống. (gõ kính, cửa sổ)
8.7 "Bạn đã chạy suốt quãng đường": close-up bạn thở dốc, đầu trống trơn.
8.8 "Tao… tao xin lỗi": two-shot bạn dưới cửa sổ, Phong trên xe; bạn nói lộn xộn, tay khua khoắng. Giữ lâu.
8.9 "Phong nhìn bạn. Rồi bật cười": close-up Phong mắt cong, có giọt nước nhỏ.
8.10 "Nhưng tao biết mày nói thật": rim light Phong sáng ấm, giữ lâu.
8.11 "Xe lăn bánh": xe chạy, Phong thò tay ra; bạn chạy theo, hai tay đập nhau, rồi bạn dừng lại. Wide xe đi xa trong nắng chiều. (động cơ, tay đập)
8.12 "Câu nói hoàn hảo": TEXT hai dòng "Câu nói hoàn hảo cần ba lần." / "Câu nói thật chỉ cần một."

[9. KẾT]
9.1 "Thứ Hai. Cổng trường": Linh đi tới.
9.2 "Ba ô tròn trong sổ": ECU sổ, ba ô trắng.
9.3 "Chào… cô": close-up bạn, mắt "> <".
9.4 "Linh khựng lại. Rồi bật cười": Linh cười to, mắt cong.
9.5 "Bạn kỳ ghê": two-shot.
9.6 "Tay bạn đã nắm lại": ECU tay nắm, vòng sáng đầu tiên bắt đầu co lại… rồi tay thả ra, vòng sáng tan. Giữ lâu.
9.7 "Lần này, bạn để nguyên": bạn và Linh cùng cười, đi vào trường.
9.8 "Tối đó, điện thoại rung": phòng ngủ, điện thoại sáng. (rung)
9.9 "Phong gửi một tấm ảnh": ảnh Phong ở bờ hồ, mặc ba lớp áo, trời xám lạnh.
9.10 "Tao tới rồi": màn hình tin nhắn chung chung, không thương hiệu; bạn mắt cong cười.
9.11 "Nửa đêm. Ba ô tròn mới": đồng hồ 00:00; sổ lật trang mới, ba ô trắng; trang trước vẫn trắng. Slow push out.
9.12 "Còn nếu lời bạn nói không cần sửa": màn hình tối dần, một làn hơi thì thầm mờ trắng bay ngang khung; TEXT "TẬP SAU: NẾU BẠN NÓI GÌ CŨNG THÀNH SỰ THẬT?" (tiếng thì thầm rất nhỏ, gió nhẹ)
9.13 "Còn bạn": end card: TEXT câu hỏi bình luận, rồi "Một chữ nếu… một cuộc đời khác."

=== KIỂM TRA TRƯỚC KHI RENDER ===
- Mỗi lần tua: counter tô đúng chấm, RewindFX và SFX khớp nhau; nhân vật chính không bao giờ đi lùi.
- Không cảnh nào trống hoặc nhân vật đứng yên quá 2s mà không có chuyển động nhẹ.
- Captions khớp lời, không đè lên chi tiết chính, nằm trong vùng an toàn.
- Nghe lại toàn bộ: không đoạn nào voice bị cắt lẹm, không khoảng chết.
- Render ra "out/tiktok 2/tiktok2-ep3.mp4", in bảng timeline và tổng thời lượng.
~~~~~

### A.5 EP5 brief (voice script + prompt) — 2026-10-25T09:32:45Z

~~~~~text
EP5 — Nếu bạn dừng được thời gian 30 giây — nhưng mỗi lần dừng bạn già thêm 1 ngày?
VOICE
[punchy] Nếu bạn dừng được thời gian ba mươi giây — nhưng mỗi lần dừng, bạn già thêm một ngày… thì cuộc đời bạn sẽ ra sao?
[short pause] [tense] Tiết Toán. Cô gọi tên bạn lên bảng.
Bạn đứng trước bảng. Phấn trên tay. Đầu trống trơn.
Cả lớp nhìn. Cô khoanh tay.
Bạn hoảng. Bạn vỗ tay một cái. Theo phản xạ.
[short pause] Và cả lớp… đứng hình.
Cô giáo khựng giữa cái chớp mắt. Thằng Đạt ngáp dở. Bụi phấn treo lơ lửng như tuyết.
Ở góc mắt bạn, có một con số. Ba mươi. Hai mươi chín. Hai mươi tám.
Bạn không hiểu chuyện gì. Nhưng bạn hiểu mình đang có hai mươi tám giây.
Bạn chạy xuống bàn Vy — đứa giỏi Toán nhất lớp. Lật vở. Đọc đáp án. Chạy về bảng.
Ba. Hai. Một.
Cả lớp chạy lại. Bạn viết đáp án lên bảng. Đẹp. Gọn.
Cô nhìn bảng. Rồi nhìn bạn.
[as Teacher, flat] Đúng. Nhưng cô gọi em giải bài ba. Em giải bài bốn.
[short pause] [deadpan] Bạn vừa đổi một ngày tuổi thọ… để giải sai bài.

[explaining] Luật thế này.
Vỗ tay một cái — cả thế giới dừng lại. Đúng ba mươi giây. Không hơn một giây.
Chỉ mình bạn cử động. Bạn mang được đồ vật. Bạn mang được cả người — nếu bạn đủ sức.
Nhưng mỗi lần dừng, cơ thể bạn già thêm một ngày. Không ai thấy. Chỉ bạn biết.
[short pause] [serious] Và ngày đã mất thì không bao giờ lấy lại được. Nhớ chi tiết đó. Lát nữa quan trọng.
[informative] Chuyện này là thật: trong một ngày, tim bạn đập khoảng một trăm nghìn lần.
Nghĩa là mỗi lần vỗ tay, bạn tiêu một trăm nghìn nhịp tim. Cho ba mươi giây.
Ông nội bạn thì có một thói quen. Sáng nào ông cũng xé một tờ lịch treo tường. Rồi gật gù:
[as Grandpa, cheerful] Thêm một ngày lời.

[light] Đầu tiên, bạn phải học lại mọi thứ.
Ba mươi giây ngắn lắm.
Đủ để chép một câu trả lời. Không đủ để hiểu nó.
Đủ để đi từ bàn này qua bàn kia. Không đủ để ra khỏi trường.
Giờ ra chơi, Vy hỏi bạn mượn cây bút. Bạn muốn nói một câu thật hay. Bạn vỗ tay. Nghĩ. Ba mươi giây hết. Vỗ tay. Nghĩ tiếp.
Mười lần.
[as you, finally] …Nè.
[deadpan] Bạn già thêm mười ngày. Để nói một chữ "nè".

[upbeat] Nhưng rồi nó bắt đầu vui thật sự.
Mẹ làm rơi rổ trứng. Vỗ tay. Bạn đi tới, nhặt từng quả trứng đang lơ lửng, xếp lại vào rổ.
Mẹ chớp mắt. Nhìn rổ trứng. Mười quả. Không sứt một vỏ.
Đá bóng sân xóm. Bóng bay về phía khung thành bạn. Vỗ tay. Bạn đi tới, ôm bóng, đứng chờ.
Ba mươi giây sau, bạn bắt bóng như thủ môn đội tuyển. Thằng Đạt quỳ xuống sân.
Bạn chụp ảnh cả hẻm đứng hình. Một con bồ câu treo giữa trời. Ly cà phê đá đổ dở, tung ra như pháo hoa.
Một tháng. Ba mươi lần vỗ tay. Bạn bắt đầu thấy… mình lớn nhanh hơn bình thường.
Chuyện này là thật: tóc người mọc khoảng một xăng-ti-mét mỗi tháng.
Tóc bạn thì mọc nhanh hơn tóc bạn bè. Áo đồng phục chật hơn áo bạn bè. Giọng bạn bắt đầu vỡ sớm.
Ông nội nhìn bạn. Xoa đầu.
[as Grandpa, laughing] Thằng này lớn nhanh quá ta.

[slower] Nhưng có một cái giá.
Bạn bắt đầu đếm.
Bốn tháng. Một trăm hai mươi lần vỗ tay. Bạn đã già thêm bốn tháng.
Không ai biết. Không ai thấy. Nhưng bạn biết.
Bạn nhìn ông nội xé tờ lịch mỗi sáng. Tám mươi mốt tuổi. Ông quý từng ngày như vàng.
Còn bạn — bạn đã ném đi một trăm hai mươi ngày. Để đỡ trứng. Để chép bài. Để nói chữ "nè".
Vậy là có một luật.
[firm] Không dừng nữa. Không bao giờ nữa.
Ly nước rơi — kệ nó rơi. Bóng bay qua đầu — kệ nó bay. Câu trả lời không biết — thì không biết.
Bạn giữ từng ngày của mình. Chặt hơn bao giờ hết.
Mỗi sáng, ông xé lịch. Bạn đứng nhìn.
[as Grandpa, softly] Con biết sao ông vui mỗi lần xé lịch không? Vì ông còn ở đây để xé.

[tense] Tối thứ Sáu. Cả nhà đang ăn cơm.
Ông nội đưa chén lên. Rồi tay ông run.
Cái chén rơi xuống mâm. Ông nói gì đó. Nhưng chữ không ra thành tiếng. Một bên mắt ông sụp xuống.
[as Dad, panicking] Ba! Ba ơi!
Ba gọi một một lăm. Giọng ba run.
[as Dad] Kẹt xe hả? Hai mươi lăm phút?
Chuyện này là thật: với đột quỵ, mỗi phút trôi qua, não có thể mất gần hai triệu tế bào thần kinh.
Hai mươi lăm phút.
Bệnh viện cách nhà bạn hai cây số.
[short pause] Bạn nhìn ông. Ông nhìn bạn. Mắt ông sợ.
Bạn biết chính xác mình phải làm gì. Và bạn biết nó sẽ tốn bao nhiêu.
Bạn vỗ tay.

[intense] Cả nhà đứng hình. Ba với cái điện thoại. Mẹ với cái khăn. Ông với bàn tay đang buông xuống.
Bạn kéo cái xe lăn của ông ra. Bạn bế ông lên. Ông nặng hơn bạn tưởng.
Bạn đẩy ông ra cửa. Ra hẻm.
Hai mươi giây. Mười giây. Ba. Hai. Một.
Thời gian chạy lại. Tiếng xe. Tiếng còi.
Vỗ tay. Dừng.
Thêm một ngày.
Bạn đẩy tiếp. Qua đầu hẻm. Qua chợ đêm đứng hình. Qua những dòng xe máy đông cứng như tượng.
Vỗ tay. Thêm một ngày.
Ra đường lớn. Bạn lách xe lăn giữa hai chiếc xe buýt đứng yên.
Vỗ tay. Vỗ tay. Vỗ tay.
Mười ngày. Hai mươi ngày.
Chân bạn bắt đầu run. Tay bạn phồng rộp.
Bạn không cảm được mình già đi. Nhưng bạn cảm được mình mệt.
Bốn mươi ngày. Cây cầu. Bạn đẩy ông lên dốc. Từng bước.
Năm mươi ngày. Bạn thấy biển hiệu đỏ: "Cấp cứu".
Sáu mươi ngày.
Bạn đẩy ông qua cửa. Tới trước mặt một bác sĩ đang đứng hình giữa hành lang.
Bạn vỗ tay lần cuối. Không phải để dừng.
Mà để thả.
[short pause] Thời gian chạy lại.
Bác sĩ giật mình. Trước mặt cô là một ông cụ trên xe lăn. Và một thằng nhóc áo cam, ướt đẫm mồ hôi, quỳ dưới sàn.
[as you, breathless] Ông con… đột quỵ. Mới… vài phút.
Cô bác sĩ nhìn ông. Rồi hét lên:
[as Doctor] Đột quỵ! Kíp cấp cứu!
Cánh cửa phòng cấp cứu mở ra. Rồi đóng lại.
Bạn ngồi bệt xuống sàn hành lang. Bạn đếm.
Sáu mươi ba lần vỗ tay.
Sáu mươi ba ngày.
Tính từ lúc chén cơm rơi xuống mâm… mới trôi qua có bốn phút.

[gentle] Hai tuần sau. Bệnh viện.
Ông ngồi dựa gối. Nói còn chậm. Tay trái còn yếu. Nhưng ông cười được.
Bác sĩ nói ông tới kịp "giờ vàng". Chậm thêm chút nữa thôi là khác.
Ba vẫn không hiểu ông tới bệnh viện bằng cách nào. Ba hỏi cả chục lần. Bạn chỉ nói:
[as you] Con đẩy ông đi. Hơi lâu.
Ông nhìn bạn. Rất lâu.
Rồi ông xoa đầu bạn. Bằng bàn tay còn khỏe.
[as Grandpa, slow, warm] Thằng này… lớn nhanh quá ta.
[short pause] Trên tường phòng bệnh, bạn treo một cuốn lịch mới.
Sáng hôm đó, ông chỉ tay. Bạn xé một tờ.
[as Grandpa] Thêm một ngày lời.
Bạn đã cho đi sáu mươi ba ngày của mình.
Và ông có thêm rất nhiều tờ lịch nữa để xé.
Có những ngày không phải để giữ.
Mà để cho.
[short pause]
[warm] Còn bạn — nếu mỗi lần dừng thời gian tốn một ngày tuổi, bạn sẽ dùng nó cho điều gì? Kể cho mình nghe trong phần bình luận.
Bấm like và đăng ký để xem thêm những chữ "nếu" khác.
Một chữ nếu… một cuộc đời khác.
PROMPT
Dựng HOÀN CHỈNH tập EP5 kênh Chíp Siêu Năng bằng Remotion và render thành phẩm: "Nếu bạn dừng được thời gian 30 giây — nhưng mỗi lần dừng bạn già thêm 1 ngày?"
Làm trọn: dựng tất cả cảnh, đồng bộ voice, tạo SFX + foley, mix, ghép thành MỘT composition, render MP4. Không dừng giữa chừng để hỏi, trừ khi không tìm thấy file voice.
Tập này độc lập: không nhắc, không nhá hàng và không dùng nhân vật của tập khác.

=== THÔNG SỐ ===
- Ngang 16:9, 1920x1080, 30fps, H.264.
- Code: src/tiktok2/ep5/ (không dấu). Composition id: Tiktok2Ep5.
- Thành phẩm: "out/tiktok 2/tiktok2-ep5.mp4" (tạo thư mục nếu chưa có).
- Khung ngang 16:9: giữ chữ và chi tiết quan trọng trong vùng an toàn 90% giữa khung; bố cục tận dụng chiều rộng (nhân vật theo quy tắc 1/3, chừa không gian bối cảnh hai bên, two-shot đặt hai nhân vật ở hai phía khung).
- Dùng lại component dùng chung của kênh trong src/tiktok2/shared/ (Character, Captions, BigText) nếu đã có, để giữ đồng nhất phong cách.

=== THAM KHẢO ===
- Xem ảnh trong "public/kênh tiktok 2/Ref cho kênh tiktok 2" để nắm phong cách. Chỉ tham khảo: tạo nhân vật, bối cảnh riêng, không vẽ lại khung hình, không đưa ảnh vào video.

=== VOICE & NHỊP DỰNG ===
- Voice: file audio trong "public/kênh tiktok 2/voice/ep5/" (encode đúng đường dẫn có dấu và khoảng trắng khi dùng staticFile).
- Phiên âm tiếng Việt bằng @remotion/install-whisper-cpp (model large-v3, nặng quá thì medium), lấy timestamp từng từ → src/tiktok2/ep5/captions.json.
- KHÔNG để nguyên file voice chạy liền một mạch. Cắt voice thành từng câu theo timestamp, mỗi câu là một <Audio> riêng (startFrom/endAt) đặt trên timeline.
- Độ dài video do NỘI DUNG HÌNH quyết định, voice chỉ là xương sống:
  • Hình cần thêm thời gian (hành động, cảm xúc, gag hài cần đọng) → chèn khoảng lặng (hold) sau câu.
  • Voice có khoảng nghỉ thừa mà hình không cần → cắt ngắn, giữ tối thiểu ~0.15s giữa các câu.
  • Không bao giờ đổi tốc độ hay cao độ giọng.
  • Trong các hold, ambience và foley vẫn chạy (trừ lúc thời gian đứng yên — xem bên dưới), không để khoảng chết.
- Gợi ý nhịp: hook giữ đủ ~3s; kéo dài 2.4, 2.11, 4.4, 5.3; giữ lâu 6.6, 6.9, 7.8, 8.14, 8.17, 9.6, 9.9; cắt nhanh dồn dập ở 5.1–5.5, 8.4–8.10 (mỗi lần vỗ tay là một nhịp cắt, tăng tốc dần).
- Mỗi shot có "MỐC" = vài chữ đầu câu thoại; so khớp gần đúng (bỏ dấu câu, không phân biệt hoa thường) để gắn shot với câu.
- Ghi timeline cuối (câu voice, hold, shot, giây bắt đầu/kết thúc) vào timing.json; tạo timing-overrides.json để tôi chỉnh tay. Tổng độ dài = các câu + các hold + end card ~1.5s.

=== VISUAL STYLE (riêng của kênh này — không dùng style của các kênh cũ) ===
- Soft pseudo-3D flat cartoon, rounded shapes, no harsh outlines.
- Characters: large glossy black round head (~45% body height), subtle radial gradient, thin warm cream rim light; face = two white oval eyes only, no mouth. Expressions only via eye shapes: normal ovals, "> <" squint, half-closed lids, wide ovals (shock), curved arcs (happy), downturned lids (sad). Blink every 3–5s.
- Body: hoodie with drawstrings, thin black tube arms/legs, round mitten hands. Kids smaller, same proportions. Subtle idle breathing bob.
- Palette: environments and side characters muted and desaturated (blue-gray, dusty purple, olive, beige). Main character ALWAYS in a saturated ORANGE hoodie.
- Depth: ≥3 layers; blur foreground and background (filter blur 4–10px), focal character sharp; slow parallax.
- Lighting: soft ambient, one warm glow source per scene, soft shadows, light vignette.
- Vietnamese settings, furnished with real detail: lớp học, nhà ống có lịch xé treo tường và mâm cơm, sân xóm, hẻm Sài Gòn, chợ đêm, đường lớn có xe buýt, cây cầu, cổng cấp cứu bệnh viện, phòng bệnh.
- Camera: change framing every 1–3s (wide / medium / close-up / extreme close-up); slow push-in on emotional beats. Trong thời gian đứng yên, camera vẫn di chuyển chậm quanh cảnh để thấy thế giới đông cứng.
- Color grade by act: acts 1–5 bright; act 6 desaturate to ~60%; act 7 warm dinner light turning harsh; act 8 night city, frozen blue-gray with the orange hoodie as the only saturated color; act 9 soft morning hospital light, full saturation.

=== HIỆU ỨNG RIÊNG TẬP NÀY ===
- VỖ TAY → FREEZE: ECU hai bàn tay vỗ vào nhau, một gợn sóng tròn lan từ tay ra toàn khung (~10 frame); cả thế giới chuyển sang tông xanh xám, đứng yên tuyệt đối (người, chim, nước, bụi phấn, xe cộ); CHỈ nhân vật chính (áo cam) giữ màu và chuyển động, và những thứ bạn đang cầm/đẩy. Bụi nhỏ treo lơ lửng khắp không khí. Component FreezeWorld dùng lại được.
- UNFREEZE: hết 30 giây, gợn sóng thu ngược về, màu và âm thanh bật lại, chuyển động tiếp tục đúng từ khung đã dừng.
- ĐỒNG HỒ 30 GIÂY: trong thời gian dừng, một vòng đếm ngược nhỏ ở góc trên trái, số giây ở giữa (30 → 0), chuyển đỏ ở 5 giây cuối.
- BỘ ĐẾM TUỔI: ngay dưới đồng hồ, một dòng "+N NGÀY" tăng 1 mỗi lần vỗ tay, nảy nhẹ. Ở cao trào (act 8), bộ đếm to dần và nhảy nhanh dần tới "+63 NGÀY".
- Lão hóa nhân vật chính phải thấy được nhưng nhẹ: qua các act, bạn cao lên một chút so với bạn bè, ống tay áo hoodie ngắn lại, có vài sợi tóc dài lởm chởm trên đỉnh đầu. Không làm già đi quá mức.
- Ông nội dùng xe lăn chỉ từ act 8 trở đi (trước đó ông đi lại bình thường; xe lăn để ở góc nhà từ đầu như một đồ vật cũ).
- Cảnh đột quỵ: chỉ thể hiện chén rơi, tay run, một bên mí mắt oval sụp xuống, lời nói không ra tiếng. Không có hình ảnh đáng sợ.
- Captions từ captions.json: 2–4 từ/cụm, chữ trắng đậm viền đen, từ đang đọc tô CAM, ở dải dưới ~82% chiều cao, căn giữa; ẩn trong các hold.
- BigText: chữ to đậm nảy nhẹ cho chỗ ghi "TEXT".

=== NHÂN VẬT ===
- BẠN: thiếu niên, hoodie CAM.
- ÔNG NỘI: 81 tuổi, áo sơ mi ca rô nâu bạc màu ngoài hoodie xám, kính lão, dáng hơi còng, chống gậy nhẹ.
- BA: sơ mi xanh nhạt ngoài hoodie xám. MẸ: hoodie tím phấn, búi tóc nhỏ.
- CÔ GIÁO TOÁN: áo dài xám xanh, kính tròn.
- VY: bạn cùng lớp giỏi Toán, hoodie xanh mint trầm, tóc ngắn ngang vai.
- ĐẠT: bạn cùng lớp, hoodie xanh rêu, tóc dựng.
- BÁC SĨ CẤP CỨU: áo blouse trắng ngoài hoodie xanh y tế, đeo ống nghe.
- HỌC SINH, NGƯỜI ĐI ĐƯỜNG, KÍP CẤP CỨU: nhiều nhân vật màu trầm.

=== SFX & FOLEY ===
- Tạo SFX và foley theo đúng cách các tập cũ trong dự án đã làm: tìm trong src/ các file/script sfx, foley, audio của các tập trước (kể cả các tập trước của kênh này) và dùng lại pipeline đó. Lưu âm thanh tập này ở "public/kênh tiktok 2/sfx/ep5/".
- SFX chữ ký tập: tiếng vỗ tay khô + tiếng "vút" trầm kéo dài khi freeze; trong lúc dừng, TẮT toàn bộ ambience, chỉ còn tiếng ù rất nhỏ, tiếng tích tắc của đồng hồ 30 giây, tiếng bước chân và hơi thở của nhân vật chính; tiếng "tách" nhỏ khi bộ đếm "+1 NGÀY" nhảy; âm thanh thế giới bật lại đột ngột khi unfreeze.
- Foley: phấn trên bảng, lật vở, rổ trứng rơi, trứng đặt vào rổ, sút bóng và ôm bóng, máy ảnh điện thoại, ly cà phê đá, tiếng xé lịch giấy (quan trọng — dùng ở 3.6, 6.9, 9.8), chén rơi xuống mâm, điện thoại, bánh xe lăn trên gạch/nhựa đường/sàn bệnh viện, hơi thở dốc, cửa cấp cứu mở-đóng, máy đo nhịp tim bệnh viện.
- Ambience: lớp học, nhà buổi sáng (chim, xe xa), sân xóm, hẻm, bữa tối (quạt, chén đũa), đường phố đêm (còi, xe buýt), hành lang cấp cứu, phòng bệnh buổi sáng yên tĩnh.
- Mix: voice luôn ưu tiên; giảm SFX/ambience khoảng -15 đến -18 dB khi có giọng; không dùng nhạc có bản quyền.

=== DANH SÁCH SHOT (SFX/foley trong ngoặc) ===
[1. HOOK]
1.1 MỐC "Nếu bạn dừng được thời gian": ECU hai bàn tay vỗ vào nhau → wide hẻm Sài Gòn đứng hình: chim bồ câu treo giữa trời, ly cà phê đá tung giữa không trung; đồng hồ 30 giây và "+1 NGÀY" hiện góc trên. TEXT trên cùng "NẾU MỖI LẦN DỪNG THỜI GIAN, BẠN GIÀ THÊM 1 NGÀY?" (vỗ tay, vút, tách)

[2. COLD OPEN – tiết Toán]
2.1 "Tiết Toán": cô gọi tên, bạn đi lên bảng. (ambience lớp, bước chân)
2.2 "Bạn đứng trước bảng": close-up bạn cầm phấn, mắt "> <".
2.3 "Cả lớp nhìn": wide cả lớp nhìn lên; cô khoanh tay.
2.4 "Bạn vỗ tay một cái": ECU vỗ tay → FreezeWorld. Giữ cho đọng. (vỗ tay, vút, im lặng)
2.5 "Cô giáo khựng giữa cái chớp mắt": cận cô mí mắt khép dở; Đạt ngáp dở; bụi phấn treo như tuyết.
2.6 "Ở góc mắt bạn, có một con số": đồng hồ 30 → 28. (tích tắc)
2.7 "Bạn chạy xuống bàn Vy": bạn chạy giữa các bàn đông cứng, lật vở Vy, đọc. (bước chạy, lật vở)
2.8 "Ba. Hai. Một": đồng hồ đỏ, bạn chạy về bảng → UNFREEZE. (âm thanh bật lại)
2.9 "Bạn viết đáp án": ECU phấn viết nhanh. (phấn)
2.10 "Cô nhìn bảng": close-up cô nhìn bảng, nhìn bạn, mắt nửa mí.
2.11 "Đúng. Nhưng cô gọi": cận bảng: chữ "BÀI 3" trên đề, bạn ghi "BÀI 4". Giữ cho gag. TEXT "-1 NGÀY TUỔI. GIẢI SAI BÀI."

[3. LUẬT CHƠI – nền tối giản]
3.1 "Luật thế này": bạn ở giữa, icon nổi lên. (whoosh UI)
3.2 "Vỗ tay một cái": vỗ tay → đồng hồ 30 giây. (vỗ tay)
3.3 "Chỉ mình bạn cử động": bạn đi giữa các bóng người đông cứng, nhấc một cái ghế; rồi cõng thử một bóng người, mắt "> <".
3.4 "Nhưng mỗi lần dừng": bộ đếm "+1 NGÀY" bật ra trên đầu bạn. (tách)
3.5 "Và ngày đã mất": tờ lịch bay đi, không quay lại; dấu khóa. TEXT "NHỚ CHI TIẾT NÀY". (buzz)
3.6 "trong một ngày, tim bạn đập": icon trái tim đập, TEXT "~100.000 NHỊP / NGÀY".
3.7 "Ông nội bạn thì có một thói quen": nhà buổi sáng, ông xé một tờ lịch treo tường. Giới thiệu "ÔNG NỘI – 81 TUỔI". (xé lịch)
3.8 "Thêm một ngày lời": close-up ông mắt cong, gật gù.

[4. HỌC LẠI MỌI THỨ]
4.1 "Ba mươi giây ngắn lắm": đồng hồ 30 giây chạy nhanh.
4.2 "Đủ để chép một câu trả lời": chia đôi khung: chép xong / không hiểu gì (mắt nửa mí).
4.3 "Đủ để đi từ bàn này qua bàn kia": bạn chạy tới cổng trường, đồng hồ hết khi còn cách cổng một đoạn.
4.4 "Giờ ra chơi, Vy hỏi bạn mượn": Vy đưa tay; bạn vỗ tay liên tục — mười nhịp cắt nhanh, bộ đếm +1 → +10; mỗi lần bạn đứng nghĩ trong thế giới đông cứng với tư thế khác nhau. (vỗ tay x10, tách x10)
4.5 "…Nè": bạn đưa cây bút, Vy nhận. Close-up bạn mắt "> <".
4.6 "Bạn già thêm mười ngày": TEXT "+10 NGÀY = 'NÈ'".

[5. BẮT ĐẦU VUI]
5.1 "Mẹ làm rơi rổ trứng": slow motion trứng bay ra → vỗ tay, freeze; bạn nhặt từng quả trứng lơ lửng bỏ lại rổ → unfreeze. (vỗ tay, vút, trứng đặt vào rổ)
5.2 "Mẹ chớp mắt": close-up Mẹ nhìn rổ trứng nguyên vẹn, mắt tròn.
5.3 "Đá bóng sân xóm": bóng bay tới khung thành → freeze; bạn đi tới, ôm bóng, đứng chờ; unfreeze → bạn bắt bóng như thủ môn đội tuyển; Đạt quỳ xuống. Giữ cho gag. (sút, vỗ tay, ôm bóng, reo)
5.4 "Bạn chụp ảnh cả hẻm đứng hình": montage ảnh: bồ câu treo giữa trời, ly cà phê đá tung như pháo hoa. (tiếng chụp ảnh x2)
5.5 "Một tháng. Ba mươi lần vỗ tay": bộ đếm nhảy tới "+30 NGÀY".
5.6 "tóc người mọc khoảng": TEXT "~1 CM / THÁNG".
5.7 "Tóc bạn thì mọc nhanh hơn": bạn đứng cạnh Đạt, cao hơn một chút; ống tay áo ngắn lại; vài sợi tóc lởm chởm trên đầu.
5.8 "Ông nội nhìn bạn. Xoa đầu": ông xoa đầu bạn, mắt cong. (cười)

[6. CÁI GIÁ – giảm bão hòa dần]
6.1 "Nhưng có một cái giá": slow push vào bạn.
6.2 "Bạn bắt đầu đếm": bạn ngồi ở bàn học, đếm vạch trên một tờ giấy.
6.3 "Bốn tháng": bộ đếm to giữa khung "+120 NGÀY".
6.4 "Không ai biết": bạn đứng giữa lớp, mọi người cười nói bình thường.
6.5 "Bạn nhìn ông nội xé tờ lịch": ông xé lịch. (xé lịch)
6.6 "Còn bạn — bạn đã ném đi": hàng loạt tờ lịch bay ra khỏi tay bạn, tan biến; flash nhanh: trứng, vở chép bài, chữ "nè". Giữ lâu.
6.7 "Vậy là có một luật": TEXT "KHÔNG DỪNG NỮA. KHÔNG BAO GIỜ NỮA."
6.8 "Ly nước rơi — kệ nó rơi": ba cắt nhanh: ly vỡ, bóng bay qua đầu, bạn đứng ở bảng nói "Em không biết". Tay bạn nắm chặt trong túi. (ly vỡ, bóng)
6.9 "Con biết sao ông vui": close-up ông đang xé lịch, ánh nắng sáng sớm. Giữ lâu. (xé lịch)

[7. ĐÊM THỨ SÁU]
7.1 "Tối thứ Sáu": wide mâm cơm cả nhà, đèn vàng ấm; xe lăn cũ để ở góc nhà. (quạt, chén đũa)
7.2 "Ông nội đưa chén lên": ECU tay ông run.
7.3 "Cái chén rơi xuống mâm": chén rơi; một bên mí mắt ông sụp. (chén rơi)
7.4 "Ba! Ba ơi!": Ba bật dậy, mắt tròn.
7.5 "Ba gọi một một lăm": close-up Ba cầm điện thoại.
7.6 "Kẹt xe hả? Hai mươi lăm phút": TEXT "XE CẤP CỨU: 25 PHÚT".
7.7 "với đột quỵ, mỗi phút": TEXT "MỖI PHÚT: ~2 TRIỆU TẾ BÀO NÃO".
7.8 "Bệnh viện cách nhà bạn hai cây số": bản đồ đơn giản: nhà → bệnh viện "2 KM". Giữ lâu.
7.9 "Bạn nhìn ông. Ông nhìn bạn": close-up mắt ông sợ; close-up bạn.
7.10 "Bạn vỗ tay": ECU vỗ tay. (vỗ tay)

[8. CAO TRÀO – 63 ngày]
8.1 "Cả nhà đứng hình": FreezeWorld: Ba với điện thoại, Mẹ với khăn, tay ông buông dở. (vút, im lặng)
8.2 "Bạn kéo cái xe lăn": bạn kéo xe lăn từ góc nhà, bế ông lên, mắt "> <". (bánh xe lăn trên gạch, hơi thở)
8.3 "Bạn đẩy ông ra cửa": ra hẻm đông cứng.
8.4 "Hai mươi giây. Mười giây": đồng hồ đỏ → unfreeze ngắn: âm thanh đường phố ập vào. (còi, xe)
8.5 "Vỗ tay. Dừng": freeze lại. Bộ đếm +2. (vỗ tay, tách)
8.6 "Bạn đẩy tiếp. Qua đầu hẻm": chợ đêm đông cứng, dòng xe máy như tượng; camera bám theo xe lăn.
8.7 "Ra đường lớn": lách xe lăn giữa hai xe buýt đứng yên.
8.8 "Vỗ tay. Vỗ tay. Vỗ tay": chuỗi cắt nhanh tăng tốc, mỗi nhịp một bối cảnh mới, bộ đếm nhảy +10, +20. (vỗ tay dồn dập, tách)
8.9 "Chân bạn bắt đầu run": ECU tay phồng đỏ trên tay cầm xe lăn; chân run.
8.10 "Bốn mươi ngày. Cây cầu": góc thấp, bạn đẩy xe lăn lên dốc cầu từng bước, đèn đường đông cứng. Bộ đếm +40, +50.
8.11 "Bạn thấy biển hiệu đỏ": biển "CẤP CỨU" phát sáng phía xa.
8.12 "Sáu mươi ngày": bộ đếm +60; bạn đẩy ông qua cửa bệnh viện đông cứng, tới trước một bác sĩ đứng giữa hành lang.
8.13 "Bạn vỗ tay lần cuối": ECU vỗ tay → UNFREEZE. (vỗ tay, âm thanh bệnh viện bật lại)
8.14 "Bác sĩ giật mình": bác sĩ mắt tròn; bạn quỳ dưới sàn, mồ hôi. Giữ lâu.
8.15 "Đột quỵ! Kíp cấp cứu!": kíp cấp cứu chạy tới, đẩy xe lăn đi. (bước chân dồn, cửa mở)
8.16 "Cánh cửa phòng cấp cứu": cửa đóng lại. (cửa đóng)
8.17 "Bạn ngồi bệt xuống sàn": bạn ngồi dựa tường hành lang. Bộ đếm to giữa khung "+63 NGÀY". Giữ lâu.
8.18 "Tính từ lúc chén cơm rơi": đồng hồ treo tường hành lang: chỉ mới qua 4 phút. TEXT "4 PHÚT".

[9. KẾT – phòng bệnh]
9.1 "Hai tuần sau. Bệnh viện": phòng bệnh sáng sớm, ông ngồi dựa gối. (máy đo nhịp tim nhẹ)
9.2 "Bác sĩ nói ông tới kịp": bác sĩ gật đầu với Ba Mẹ. TEXT "GIỜ VÀNG".
9.3 "Ba vẫn không hiểu": Ba gãi đầu, hỏi bạn.
9.4 "Con đẩy ông đi. Hơi lâu": close-up bạn, mắt cong nhẹ.
9.5 "Ông nhìn bạn. Rất lâu": close-up ông.
9.6 "Rồi ông xoa đầu bạn": ông xoa đầu bạn bằng tay phải; "Thằng này… lớn nhanh quá ta." Giữ lâu.
9.7 "Trên tường phòng bệnh": bạn treo cuốn lịch mới. (đinh, giấy)
9.8 "Sáng hôm đó, ông chỉ tay": bạn xé một tờ lịch. (xé lịch)
9.9 "Thêm một ngày lời": close-up ông mắt cong. Giữ lâu.
9.10 "Bạn đã cho đi sáu mươi ba ngày": wide phòng bệnh ấm, nắng sớm, bạn ngồi cạnh giường ông. Slow push out.
9.11 "Có những ngày không phải để giữ": TEXT hai dòng "Có những ngày không phải để giữ." / "Mà để cho."
9.12 "Còn bạn": end card: TEXT câu hỏi bình luận, rồi "Một chữ nếu… một cuộc đời khác."

=== KIỂM TRA TRƯỚC KHI RENDER ===
- Mỗi lần vỗ tay: FreezeWorld + đồng hồ 30 giây + bộ đếm "+N NGÀY" khớp nhau; bộ đếm cuối cùng đúng "+63 NGÀY".
- Lão hóa nhân vật chính tăng dần, nhẹ, nhất quán.
- Không cảnh nào trống hoặc nhân vật đứng yên quá 2s mà không có chuyển động nhẹ (trừ cảnh đông cứng có chủ đích, nhưng camera vẫn chuyển động).
- Captions khớp lời, không đè lên chi tiết chính, nằm trong vùng an toàn.
- Nghe lại toàn bộ: không đoạn nào voice bị cắt lẹm, không khoảng chết.
- Render ra "out/tiktok 2/tiktok2-ep5.mp4", in bảng timeline và tổng thời lượng.
~~~~~

### A.6 All other user messages (verbatim, chronological)

- `2026-10-24T05:52:12Z` — Kênh tiktok 2
- `2026-10-24T06:35:08Z` — tỷ lệ 16:9
- `2026-10-24T07:05:16Z` — cảnh đầu người mẹ đâu có tàn hình, tại sao k có mặt? lại trong suoors nhỉ
- `2026-10-24T07:06:14Z` — ủa các nhân vật khác luôn, tàn hình mới trong suốt chứ, ai k tàn hình thì hình ảnh như cũ mà
- `2026-10-24T07:29:18Z` — dừng
- `2026-10-24T07:29:23Z` — dựng lại
- `2026-10-24T07:29:26Z` — tôi nhầm chat
- `2026-10-24T08:12:45Z` — kiểm tra subtitle quá to
- `2026-10-24T08:33:59Z` — render xong báo tôi
- `2026-10-24T08:39:45Z` — âm thanh sfx quá to, giảm lại đi, tăng voice off lớn xíu
- `2026-10-24T08:40:21Z` — sau đó render lại
- `2026-10-24T12:56:37Z` — Sai rồi ep2 đó kênh sự kiện là khác mà
- `2026-10-24T12:57:38Z` — à dudusng k nhỉ? mình lưu nhầm à
- `2026-10-24T12:58:28Z` — mình đã tự xóa, tiến độ tới đâu rồi
- `2026-10-24T13:13:23Z` — kiểm tra lại có người đang bị trong suốt
- `2026-10-24T13:14:05Z` — à bản render thì k bị
- `2026-10-24T13:15:01Z` — Có âm thanh sfx nào đó bị giống nư bị noise, e e rất ồn, kiểm tra lạ
- `2026-10-24T13:18:11Z` — 5;25p đấy có tiếng xè xè như bị noise và các đoạn khác cũng có tôi note 1 vị trí cho bạn kiểm tra
- `2026-10-25T04:50:13Z` — ep2 đang bị lỗi âm thanh, cứ có âm thanh xè xè rất ồn và lặp lại nhiều lần?
- `2026-10-25T04:51:06Z` — nằm ngay khúc intro
- `2026-10-25T04:51:46Z` — sfx đó lưu ở đâu tôi nghe và nhắc bạn bỏ luôn
- `2026-10-25T04:53:08Z` — amb_bedroom_morning_loop bỏ hẳn và render lại
- `2026-10-25T04:53:39Z` — amb_class_loop luôn
- `2026-10-25T04:57:00Z` — render lại cả ep3 và ep3
- `2026-10-25T10:32:47Z` — render chưa
- `2026-10-25T10:44:03Z` — các tập gần đây out chữ bị lọt ngoài khung, hãy kiểm tra để tránh bị lỗi sau này
- `2026-10-25T15:37:51Z` — (pasted) the export request that produced this file:

~~~~~text
Export the COMPLETE process you used to make the video clips in this conversation as ONE Markdown file named `video-process-export.md`. Purpose: another engineer who cannot see this chat must be able to reproduce the exact same clips, 
  then automate the process in a pipeline. Write in English, but keep all Vietnamese video content verbatim (script, narration, dialogue, on-screen text).

  Hard rules:
  - Do NOT include API keys, tokens, passwords, cookies or signed URLs. Where one is needed, write a placeholder such as `<FAL_API_KEY>`.
  - Record only what was actually done in this conversation. Label items [CONFIRMED] if done or observed, [UNKNOWN] if unsure. Do not guess versions, model IDs or prices.
  - Quote VERBATIM every prompt sent to an AI tool (image, video, voice, music, LLM), including negative prompts and every revision.

  File structure:

  1. **Overview**: the visual style (art style, palette, lighting, camera framing, editing pace), duration, aspect ratio, resolution and fps. List every clip produced, with its output file path.
  2. **Tools & services**: every tool, platform and model used: service name, exact model ID, version, paid or free tier, how it was called (web UI, API, CLI, MCP) and what it was used for.
  3. **Step-by-step process** (numbered, in the actual order). For each step:
     - input → tool/model → exact parameters (seed, duration, aspect ratio, resolution, motion strength, guidance, style preset, voice ID, speaking rate…) → output (file name, format);
     - the verbatim prompt;
     - the number of retries and why, what failed and how it was fixed.
  4. **Character & consistency**: how characters and sets were kept consistent across shots (reference images, character sheets, seeds, LoRA, image-to-video from a first frame…). Include the character descriptions verbatim.
  5. **Script & storyboard**: the script and shot list (set, action, camera, duration, dialogue) for at least one complete clip.
  6. **Audio**: voice-over (service, model, voice, settings), music, sound effects, and how audio was synced to picture.
  7. **Editing & post-production**: shot assembly, transitions, subtitles and on-screen text (font, position, style), color grading, export settings. Include verbatim every ffmpeg command, script or code that was run, in code blocks.
  8. **Cost & time**: cost and processing time per step and per clip ([UNKNOWN] if not known), and any quota limits hit.
  9. **Manual steps**: every step a human did by hand (picking the best take, manual fixes, uploads…) and the selection criteria used.
  10. **Licensing & terms**: commercial-use terms of each tool and asset (music, fonts, images). Say clearly where this was not verified.
  11. **Open issues & suggestions**: weaknesses of the current process and what would be hard to automate.

  End the file with a JSON block summarizing the steps:
`[{ "step": 1, "name": "...", "tool": "...", "model": "...", "inputs": [...], "params": {...}, "prompt_ref": "...", "outputs": [...], "manual": false }]`

  If you can write files, save it and give me the absolute path. Otherwise, print the whole content in a single code block so I can copy it.
~~~~~

- (after the export request) `[Image: original 2186x1264, displayed at 2000x1156. Multiply coordinates by 1.09 to map to original image.]` — only this placeholder text was received; same size as the first EP1 reference image.

### A.7 Prompts to other AI tools

- **Whisper (whisper.cpp):** no text prompt / initial prompt was used. The full CLI arguments are in `transcribe.mjs` (Appendix C).
- No other AI tools were called.

---

## Appendix B — Session lessons recorded as project rules (verbatim excerpt of `CLAUDE.md`, channel section)

~~~~~markdown
## Kênh TikTok 2 (EP1 “tàng hình khi nín thở”)
- Code trong **`src/tiktok2/ep1/`** (composition `Tiktok2Ep1`, khung **16:9 1920×1080**), script `scripts/tiktok2/ep1/`, tài nguyên `public/kênh tiktok 2/` (voice, sfx/ep1). Thành phẩm `out/tiktok 2/`.
- Style riêng của kênh, không dùng component hình của kênh cũ. Timeline sinh bởi `python3 scripts/tiktok2/ep1/build_timing.py` → `src/tiktok2/ep1/data/timing.json`; chỉnh tay ở `data/timing-overrides.json`. Mốc chỉ qua `src/tiktok2/ep1/time.ts` (`at()`, `sec2f()`).
- EP2 “nhân bản” ở **`src/tiktok2/ep2/`** (composition `Tiktok2Ep2`), dùng lại Character/SetStage/props/ui của ep1 (thay đổi chung chỉ thêm prop có mặc định). Pipeline dùng chung, truyền tên tập: `build_timing.py ep2`, `check_cuts.py ep2`, `transcribe.mjs ep2`; SFX `scripts/tiktok2/ep2/generate-sfx.mjs` → `public/kênh tiktok 2/sfx/ep2/`.
- EP3 “quay lại 30 giây” ở **`src/tiktok2/ep3/`** (composition `Tiktok2Ep3`): RewindFX, FistECU, RewindCounter, Notebook trong `ep3/kit.tsx`; shot chỉ có hình nằm trong hold dùng `"atHold": "Lxxx"` trong shotlist. SFX `scripts/tiktok2/ep3/generate-sfx.mjs` → `sfx/ep3/`. Tránh sine thuần tần cao và nhiễu dải rộng kéo dài (người dùng nghe thành “e e”, “xè xè”).
- **Bản tiếng Anh** (kênh quốc tế): cùng code, đổi ngôn ngữ bằng prop `lang="en"` (composition `Tiktok2Ep1En`, chữ trên hình qua `tr(vi, en)` trong `time.ts`). Giọng `public/Kênh tiktok 2 (tiếng anh)/Voice/epN/`; pipeline `transcribe.mjs ep1 en` → `build_timing.py ep1 en` → `check_cuts.py ep1 en`; tách/gộp câu SRT ở `timing-overrides.en.json`, mốc chữ ở `data/anchors.en.json`. Thành phẩm vào `out/tiktok 2 (tiếng anh)/`. Phụ đề EN 40px.
- Render kênh này qua entry riêng: `npx remotion render src/tiktok2/index.ts Tiktok2Ep2 "out/tiktok 2/tiktok2-ep2.mp4"`. Mix đã duyệt: giọng 1.0, SFX ×0.45, nền ×0.56; phụ đề 50px.
- **Trước khi render mỗi tập: kiểm chữ lọt khung** `node scripts/tiktok2/check-text-bounds.mjs epN` (composition `T2QA<N>` trong Tiktok2Root, đo DOM mỗi 10 frame; chỉ một đoạn: `epN@570-1160`). Phải 0 cụm chữ RÕ lọt khung; chữ nền mờ chỉ tham khảo. Chữ trên bảng/biển/poster vẽ CÙNG LỚP với vật mang nó (vd lớp `far` của set), không vẽ ở lớp diễn viên; chữ trong set phải nằm trọn trong khung hoặc ra hẳn ngoài khung. Tập mới: thêm composition `T2QA<N>` + id trong script.
~~~~~

---

## Appendix C — Scripts and key source files (verbatim, final state)

### `scripts/tiktok2/ep1/transcribe.mjs`

Note: the `en` branch was added outside this session [UNKNOWN].

~~~~~js
// TikTok 2 – phiên âm giọng (mặc định ep1; tập khác: node scripts/tiktok2/ep1/transcribe.mjs ep2) bằng whisper.cpp (cài qua @remotion/install-whisper-cpp 1.7.1, ./whisper.cpp).
// Model large-v3-turbo (bản large-v3 rút gọn, có sẵn), tiếng Việt, mỗi đoạn một từ (-ml 1 -sow), JSON mốc token (-ojf).
// Vào: public/kênh tiktok 2/Voice/ep1/ep1 tiktok2.mp3 → whisper.cpp/tiktok2-ep1-16k.wav · Ra: whisper.cpp/tiktok2-ep1-transcript.json
import { spawnSync } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const ep = process.argv[2] ?? "ep1";
// bản tiếng Anh: node scripts/tiktok2/ep1/transcribe.mjs ep1 en  (giọng ở public/Kênh tiktok 2 (tiếng anh)/Voice/ep1/)
const lang = process.argv[3] ?? "vi";
const tag = lang === "vi" ? ep : `${ep}-${lang}`;
const w = path.join(root, "whisper.cpp");
const ff = path.join(root, "node_modules/@remotion/compositor-darwin-arm64/ffmpeg");
const env = { ...process.env, DYLD_LIBRARY_PATH: path.join(root, "node_modules/@remotion/compositor-darwin-arm64") };
const src = lang === "vi" ? path.join(root, `public/kênh tiktok 2/Voice/${ep}/${ep} tiktok2.mp3`) : path.join(root, `public/Kênh tiktok 2 (tiếng anh)/Voice/${ep}/${ep} tiktok2 ${lang.toUpperCase()}.mp3`);
const wav = path.join(w, `tiktok2-${tag}-16k.wav`);
let r = spawnSync(ff, ["-y", "-v", "error", "-i", src, "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", wav], { stdio: "inherit", env });
if (r.status !== 0) process.exit(r.status ?? 1);
r = spawnSync(path.join(w, "main"), ["-m", path.join(w, "ggml-large-v3-turbo.bin"), "-f", wav, "-l", lang, "-ojf", "-of", path.join(w, `tiktok2-${tag}-transcript`), "-ml", "1", "-sow", "-t", "8", "-np"], { stdio: ["ignore", "inherit", "inherit"] });
if (r.status !== 0) process.exit(r.status ?? 1);
console.log(`OK → whisper.cpp/tiktok2-${tag}-transcript.json`);
~~~~~

### `scripts/tiktok2/ep1/build_timing.py`

Note: the `en` (English) branches in this file were added outside this session [UNKNOWN author/session]; the Vietnamese path is what produced these clips.

~~~~~python
#!/usr/bin/env python3
"""TikTok 2 – dựng timeline từ giọng (mặc định ep1; tập khác: python3 scripts/tiktok2/ep1/build_timing.py ep2).

Vào:  public/kênh tiktok 2/Voice/ep1/ep1 tiktok2.srt   (lời chuẩn + mốc câu thô)
      whisper.cpp/tiktok2-ep1-transcript.json          (whisper large-v3-turbo, mốc từng từ)
      whisper.cpp/tiktok2-ep1-16k.wav                  (đo năng lượng để cắt câu chính xác)
      src/tiktok2/ep1/data/shotlist.json               (shot + MỐC + hold)
      src/tiktok2/ep1/data/timing-overrides.json       (chỉnh tay)
Ra:   src/tiktok2/ep1/captions.json   (mốc từng từ, theo giờ file giọng gốc)
      src/tiktok2/ep1/data/timing.json (câu · hold · shot · frame tuyệt đối)
      out/tiktok 2/ep1-timeline.md     (bảng timeline)

Chạy: python3 scripts/tiktok2/ep1/build_timing.py

Bản tiếng Anh (cùng hình, giọng khác): python3 scripts/tiktok2/ep1/build_timing.py ep1 en
  Vào: public/Kênh tiktok 2 (tiếng anh)/Voice/ep1/ep1 tiktok2 EN.srt + whisper.cpp/tiktok2-ep1-en-*.{wav,json}
       src/tiktok2/ep1/data/timing-overrides.en.json ("split": tách khối SRT gộp nhiều câu Việt)
       câu thứ N tiếng Anh = câu L00N tiếng Việt; shot gắn vào cùng câu như timing.json bản Việt.
  Ra:  src/tiktok2/ep1/captions.en.json · data/timing.en.json · out/tiktok 2 (tiếng anh)/ep1-timeline.md
"""
import array
import difflib
import json
import math
import os
import re
import unicodedata
import wave

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
P = lambda *a: os.path.join(ROOT, *a)
FPS = 30
EP = "ep1"


def sec2f(s):
    return int(round(s * FPS))


def norm(s):
    s = unicodedata.normalize("NFD", s.lower().replace("đ", "d"))
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9 ]", " ", s)


def words_of(s):
    return [w for w in norm(s).split() if w]


# ── 1. SRT ──
def parse_srt(path):
    blocks = open(path, encoding="utf-8").read().strip().split("\n\n")
    ts = lambda x: int(x[:2]) * 3600 + int(x[3:5]) * 60 + float(x[6:].replace(",", "."))
    out = []
    for b in blocks:
        l = b.strip().split("\n")
        a, z = l[1].split(" --> ")
        out.append({"id": f"L{int(l[0]):03d}", "text": " ".join(l[2:]).strip(), "srtStart": ts(a), "srtEnd": ts(z)})
    return out


# ── 2. Năng lượng (10 ms) ──
def envelope(path):
    w = wave.open(path)
    sr = w.getframerate()
    a = array.array("h", w.readframes(w.getnframes()))
    hop = sr // 100
    db = []
    for i in range(0, len(a) - hop, hop):
        seg = a[i : i + hop]
        rms = math.sqrt(sum(x * x for x in seg) / hop) / 32768
        db.append(20 * math.log10(rms + 1e-9))
    return db


def split_blocks(lines, split, merge=()):
    """Tách khối SRT đọc gộp nhiều câu (bản dịch) thành từng câu theo bản Việt; mốc chia theo tỉ lệ ký tự (khoảng lặng thật được dò lại ở bước 3).
    merge = số khối SRT gộp với khối ngay sau (bản dịch tách một câu Việt thành hai)."""
    joined = []
    for l in lines:
        if joined and int(joined[-1]["id"][1:]) in merge and not joined[-1].get("merged"):
            joined[-1].update(text=joined[-1]["text"] + " " + l["text"], srtEnd=l["srtEnd"], merged=True)
        else:
            joined.append(l)
    out = []
    for l in joined:
        parts = split.get(str(int(l["id"][1:])))
        if not parts:
            out.append(l)
            continue
        tot = sum(len(t) for t in parts)
        t0, acc = l["srtStart"], 0
        for t in parts:
            a = t0 + (l["srtEnd"] - t0) * acc / tot
            acc += len(t)
            out.append({"id": "", "text": t, "srtStart": a, "srtEnd": t0 + (l["srtEnd"] - t0) * acc / tot})
    for k, l in enumerate(out):
        l["id"] = f"L{k + 1:03d}"
    return out


def main(ep="ep1", lang="vi"):
    global EP
    EP = ep
    vi = lang == "vi"
    sfx = "" if vi else f".{lang}"
    tag = EP if vi else f"{EP}-{lang}"
    VOICE_SRC = f"kênh tiktok 2/Voice/{ep}/{ep} tiktok2.mp3" if vi else f"Kênh tiktok 2 (tiếng anh)/Voice/{ep}/{ep} tiktok2 {lang.upper()}.mp3"
    OUT_DIR = "tiktok 2" if vi else "tiktok 2 (tiếng anh)"
    ov = json.load(open(P(f"src/tiktok2/{EP}/data/timing-overrides{sfx}.json"), encoding="utf-8"))
    shots_in = json.load(open(P(f"src/tiktok2/{EP}/data/shotlist.json"), encoding="utf-8"))["shots"]
    if vi:
        lines = parse_srt(P("public", "kênh tiktok 2", "Voice", EP, f"{EP} tiktok2.srt"))
    else:
        lines = split_blocks(parse_srt(P("public", "Kênh tiktok 2 (tiếng anh)", "Voice", EP, f"{EP} tiktok2 {lang.upper()}.srt")), ov.get("split", {}), set(ov.get("merge", [])))
        ref = json.load(open(P(f"src/tiktok2/{EP}/data/timing.json"), encoding="utf-8"))
        assert len(lines) == len(ref["lines"]), f"{len(lines)} câu {lang} ≠ {len(ref['lines'])} câu Việt – sửa \"split\" trong timing-overrides{sfx}.json"
        # shot gắn đúng câu như bản Việt (MỐC tiếng Việt không dùng được)
        ov["anchors"] = {**{s["id"]: s["firstLine"] for s in ref["shots"] if s["firstLine"]}, **ov.get("anchors", {})}
    db = envelope(P("whisper.cpp", f"tiktok2-{tag}-16k.wav"))
    srt_sorted = sorted(db)
    floor = srt_sorted[int(len(db) * 0.12)]
    thr = max(floor + ov.get("thrAbove", 14), -52)  # thrAbove: ngưỡng có tiếng so với nền (dB); giọng thu sạch + tiếng thở rõ → nâng lên
    voiced = lambda k: 0 <= k < len(db) and db[k] > thr
    print(f"nền {floor:.1f} dB · ngưỡng {thr:.1f} dB")

    # ── 3. Ranh giới câu = khoảng lặng thật gần mốc SRT nhất ──
    n = len(lines)

    def silences(a, b, minlen=6):
        out, s = [], None
        for k in range(max(0, int(a * 100)), min(len(db), int(b * 100))):
            if not voiced(k):
                s = k if s is None else s
            else:
                if s is not None and k - s >= minlen:
                    out.append((s / 100, k / 100))
                s = None
        if s is not None and int(b * 100) - s >= minlen:
            out.append((s / 100, int(b * 100) / 100))
        return out

    lines[0]["onset"] = next(k for k in range(len(db)) if voiced(k) and voiced(k + 1)) / 100
    lines[-1]["offset"] = (max(k for k in range(int(lines[-1]["srtStart"] * 100), len(db)) if voiced(k)) + 1) / 100

    for i in range(n - 1):
        a, b = lines[i], lines[i + 1]
        mid = (a["srtEnd"] + b["srtStart"]) / 2
        lo, hi = a["srtEnd"] - 0.35, b["srtStart"] + 0.35
        cand = silences(lo, hi)
        if cand:
            s = min(cand, key=lambda r: abs((r[0] + r[1]) / 2 - mid) - 0.5 * (r[1] - r[0]))
            a["offset"], b["onset"] = s[0], s[1]
        else:
            k = min(range(int(lo * 100), int(hi * 100)), key=lambda k: db[k])
            a["offset"], b["onset"] = k / 100, (k + 1) / 100
            a["joinNext"] = k / 100  # đọc liền một hơi: hai câu nối khít trong file gốc, không chèn khoảng nghỉ
            print(f"  ! không có khoảng lặng giữa {a['id']}–{b['id']}, cắt ở điểm nhỏ nhất {k / 100:.2f}s")
    for i, l in enumerate(lines):
        t0, t1 = ov.get("trim", {}).get(l["id"], [0, 0])
        a = l["onset"] - 0.06 + t0
        b = l["offset"] + 0.09 + t1
        if i:
            a = max(a, lines[i - 1]["offset"] + 0.02)
        if i + 1 < n:
            b = min(b, lines[i + 1]["onset"] - 0.03)
        l["trimBefore"] = math.floor(a * FPS)
        l["trimAfter"] = math.ceil(b * FPS)
    for i in range(n - 1):
        if "joinNext" in lines[i]:
            lines[i]["trimAfter"] = lines[i + 1]["trimBefore"] = round(lines[i]["joinNext"] * FPS)
        if lines[i]["trimAfter"] > lines[i + 1]["trimBefore"]:
            m = lines[i + 1]["trimBefore"]
            if ov.get("cutAtMin") and "joinNext" not in lines[i]:
                # khoảng hở ngắn: cắt ở frame êm nhất giữa hai câu (tránh lẹm tiếng hít vào / đuôi chữ)
                lvl = lambda fr: max(db[max(0, int(fr / FPS * 100) - 2) : int(fr / FPS * 100) + 3])
                m = min(range(math.floor(lines[i]["offset"] * FPS), math.ceil(lines[i + 1]["onset"] * FPS) + 1), key=lvl)
                lines[i + 1]["trimBefore"] = m
            lines[i]["trimAfter"] = m

    # ── 4. Mốc từng từ: căn whisper ↔ lời SRT ──
    raw = json.loads(open(P("whisper.cpp", f"tiktok2-{tag}-transcript.json"), "rb").read().decode("utf-8", "replace"))
    ww = []
    for s in raw["transcription"]:
        for t in words_of(s["text"]):
            ww.append((t, s["offsets"]["from"] / 1000, s["offsets"]["to"] / 1000))
    sw = []  # (line idx, word idx, norm)
    for i, l in enumerate(lines):
        l["disp"] = l["text"].replace("—", " ").replace("…", " ").split()
        l["disp"] = [d for d in l["disp"] if words_of(d)]
        for j, d in enumerate(l["disp"]):
            sw.append((i, j, " ".join(words_of(d))))
    sm = difflib.SequenceMatcher(None, [x[2] for x in sw], [x[0] for x in ww], autojunk=False)
    wtime = {}
    for a, b, size in sm.get_matching_blocks():
        for k in range(size):
            wtime[(sw[a + k][0], sw[a + k][1])] = ww[b + k][1]
    caps = []
    for i, l in enumerate(lines):
        m = len(l["disp"])
        on, off = l["onset"], l["offset"]
        weights = [max(1, len(words_of(d)[0]) if words_of(d) else 1) + 2 for d in l["disp"]]
        prop = [on + (off - on) * sum(weights[:j]) / sum(weights) for j in range(m)]
        known = [(j, wtime[(i, j)]) for j in range(m) if (i, j) in wtime]
        st = prop[:]
        if len(known) >= 2 and known[-1][1] > known[0][1]:
            (ja, ta), (jb, tb) = known[0], known[-1]
            wa, wb = prop[ja], prop[jb]
            for j in range(m):
                if (i, j) in wtime:
                    v = wa + (wtime[(i, j)] - ta) * (wb - wa) / (tb - ta)
                    st[j] = min(max(v, on), off - 0.05)
            for j in range(1, m):  # đơn điệu
                st[j] = max(st[j], st[j - 1] + 0.06)
        l["words"] = []
        for j, d in enumerate(l["disp"]):
            a = st[j]
            b = st[j + 1] if j + 1 < m else off
            b = max(b, a + 0.08)
            l["words"].append({"text": d, "start": round(a, 3), "end": round(b, 3)})
            caps.append({"line": l["id"], "text": d, "startMs": round(a * 1000), "endMs": round(b * 1000), "timestampMs": round((a + b) * 500), "confidence": 1 if (i, j) in wtime else 0.5})

    # ── 5. Shot ↔ câu theo MỐC (theo thứ tự) ──
    flat = [" ".join(words_of(l["text"])) for l in lines]
    cur = 0
    for s in shots_in:
        if "atHold" in s:
            # shot chỉ có hình, nằm trong khoảng hold sau một câu (không có thoại riêng)
            s["first"] = None
            s["holdLine"] = next(k for k, l in enumerate(lines) if l["id"] == s["atHold"])
            continue
        if s["id"] in ov.get("anchors", {}):
            idx = next(k for k, l in enumerate(lines) if l["id"] == ov["anchors"][s["id"]])
        else:
            key = " ".join(words_of(s["moc"]))
            idx = next((k for k in range(cur, n) if (" " + flat[k] + " ").find(" " + key + " ") >= 0), None)
            if idx is None:
                best = max(range(cur, n), key=lambda k: difflib.SequenceMatcher(None, key, flat[k][: len(key) + 8]).ratio())
                print(f"  ! MỐC gần đúng {s['id']} “{s['moc']}” → {lines[best]['id']} “{lines[best]['text']}”")
                idx = best
        s["first"] = idx
        cur = idx + 1
    voiced = [s for s in shots_in if s["first"] is not None]
    for k, s in enumerate(voiced):
        s["last"] = (voiced[k + 1]["first"] - 1) if k + 1 < len(voiced) else n - 1
    hold = {}
    fast = set()
    for s in voiced:
        if s.get("hold"):
            hold[lines[s["last"]]["id"]] = s["hold"]
        for lid, h in s.get("lineHolds", {}).items():
            hold[lid] = h
        if s.get("fast"):
            for k in range(s["first"], s["last"] + 1):
                fast.add(lines[k]["id"])
    hold.update(ov.get("holds", {}))

    # ── 6. Đặt câu lên timeline (frame tuyệt đối) ──
    cursor = 3
    for i, l in enumerate(lines):
        dur = l["trimAfter"] - l["trimBefore"]
        l["from"], l["to"] = cursor, cursor + dur
        l["hold"] = hold.get(l["id"], 0)
        if i + 1 < n:
            nx = lines[i + 1]
            natural = nx["onset"] - l["offset"]
            pads = (l["trimAfter"] / FPS - l["offset"]) + (nx["onset"] - nx["trimBefore"] / FPS)
            lo = ov.get("minGap", 0.15)
            target = lo if l["id"] in fast else min(max(natural, lo), ov.get("maxGap", 0.38))
            target = ov.get("gaps", {}).get(l["id"], target)
            gapf = max(sec2f(max(0.0, target - pads)), 0)
            if "joinNext" in l:
                gapf = 0
                if l["hold"]:
                    print(f"  ! bỏ hold sau {l['id']} vì câu đọc liền với câu sau")
                l["hold"] = 0
            l["gap"] = round(gapf / FPS, 3)
            l["holdFrom"], l["holdTo"] = l["to"] + gapf, l["to"] + gapf + sec2f(l["hold"])
            cursor = l["holdTo"]
        else:
            l["gap"] = 0
            l["holdFrom"], l["holdTo"] = l["to"], l["to"] + sec2f(l["hold"])
    end_from = lines[-1]["holdTo"]
    total = end_from + sec2f(ov.get("endCard", 1.5))
    for l in lines:
        off = l["from"] - l["trimBefore"]
        l["wordFrames"] = [[w["text"], " ".join(words_of(w["text"])), round(w["start"] * FPS) + off, round(w["end"] * FPS) + off] for w in l["words"]]

    shots = []
    startOf = lambda s: lines[s["holdLine"]]["holdFrom"] if s["first"] is None else lines[s["first"]]["from"] - 2
    for k, s in enumerate(shots_in):
        a = 0 if k == 0 else startOf(s)
        b = startOf(shots_in[k + 1]) if k + 1 < len(shots_in) else total
        fl = lines[s["first"]]["id"] if s["first"] is not None else None
        ll = lines[s["last"]]["id"] if s["first"] is not None else None
        shots.append({"id": s["id"], "act": s["act"], "moc": s["moc"], "firstLine": fl, "lastLine": ll, "from": a, "to": b, "start": round(a / FPS, 3), "end": round(b / FPS, 3)})

    anchors = {}
    if not vi:
        # mốc at(câu, chữ Việt) → frame của cụm tiếng Anh tương ứng (data/anchors.<lang>.json)
        amap = json.load(open(P(f"src/tiktok2/{EP}/data/anchors{sfx}.json"), encoding="utf-8"))["map"]
        by = {l["id"]: l for l in lines}
        for key, spec in amap.items():
            lid, phrase, nth = spec[0], spec[1], spec[2] if len(spec) > 2 else 1
            toks = [(k, t) for k, w in enumerate(by[lid]["wordFrames"]) for t in w[1].split()]
            tgt = words_of(phrase)
            hits = [i for i in range(len(toks) - len(tgt) + 1) if [t for _, t in toks[i : i + len(tgt)]] == tgt]
            assert len(hits) >= nth, f"không thấy “{phrase}” (lần {nth}) trong {lid} “{by[lid]['text']}” (mốc {key})"
            i = hits[nth - 1]
            wf = by[lid]["wordFrames"]
            anchors[key] = [wf[toks[i][0]][2], wf[toks[i + len(tgt) - 1][0]][3]]

    timing = {
        "_doc": "SINH TỰ ĐỘNG bởi scripts/tiktok2/ep1/build_timing.py – không sửa tay; chỉnh ở timing-overrides.json.",
        "fps": FPS,
        "voice": VOICE_SRC,
        "totalFrames": total,
        "totalSec": round(total / FPS, 3),
        "endCardFrom": end_from,
        "lines": [
            {
                "id": l["id"], "text": l["text"],
                "src": [l["trimBefore"], l["trimAfter"]],
                "from": l["from"], "to": l["to"],
                "start": round(l["from"] / FPS, 3), "end": round(l["to"] / FPS, 3),
                "gap": l["gap"], "hold": l["hold"], "holdFrom": l["holdFrom"], "holdTo": l["holdTo"], "joinNext": "joinNext" in l,
                "words": l["wordFrames"],
            }
            for l in lines
        ],
        "shots": shots,
        "acts": [
            {"act": a, "from": min(s["from"] for s in shots if s["act"] == a), "to": max(s["to"] for s in shots if s["act"] == a)}
            for a in sorted({s["act"] for s in shots})
        ],
    }
    if not vi:
        timing["lang"] = lang
        timing["anchors"] = anchors
    json.dump(timing, open(P(f"src/tiktok2/{EP}/data/timing{sfx}.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    json.dump({"_doc": "Mốc từng từ (ms theo file giọng gốc), whisper large-v3-turbo căn với lời SRT.", "voice": VOICE_SRC, "captions": caps}, open(P(f"src/tiktok2/{EP}/captions{sfx}.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=0)

    os.makedirs(P("out", OUT_DIR), exist_ok=True)
    md = [f"# TikTok 2 · {EP.upper()}{'' if vi else ' ' + lang.upper()} – timeline", "", f"Tổng: **{total} frame = {total / FPS:.2f} s** ({int(total / FPS // 60)}:{total / FPS % 60:05.2f}) · thẻ cuối từ {end_from / FPS:.2f} s", "", "| Shot | Câu | Bắt đầu | Kết thúc | Lời | Hold |", "|---|---|---|---|---|---|"]
    for s in shots:
        if not s["firstLine"]:
            md.append(f"| {s['id']} | – | {s['start']:.2f} | {s['end']:.2f} | (chỉ hình, trong hold) | |")
            continue
        for k in range(int(s["firstLine"][1:]) - 1, int(s["lastLine"][1:])):
            l = lines[k]
            md.append(f"| {s['id'] if k + 1 == int(s['firstLine'][1:]) else ''} | {l['id']} | {l['from'] / FPS:.2f} | {l['to'] / FPS:.2f} | {l['text']} | {l['hold'] or ''} |")
    open(P("out", OUT_DIR, f"{EP}-timeline.md"), "w", encoding="utf-8").write("\n".join(md) + "\n")
    nh = sum(1 for l in lines if l["hold"])
    print(f"{n} câu · {len(shots)} shot · {nh} hold · tổng {total} frame = {total / FPS:.2f} s · khớp từ whisper {len(wtime)}/{len(sw)}")


if __name__ == "__main__":
    import sys
    main(sys.argv[1] if len(sys.argv) > 1 else "ep1", sys.argv[2] if len(sys.argv) > 2 else "vi")
~~~~~

### `scripts/tiktok2/ep1/check_cuts.py`

~~~~~python
#!/usr/bin/env python3
"""Kiểm tra điểm cắt câu (mặc định ep1; tập khác: python3 scripts/tiktok2/ep1/check_cuts.py ep2; bản tiếng Anh: … ep1 en): mức âm (dB) quanh trimBefore/trimAfter trong file giọng gốc phải là lặng (không lẹm chữ)."""
import json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from build_timing import envelope, P, FPS
EP = sys.argv[1] if len(sys.argv) > 1 else "ep1"
LANG = sys.argv[2] if len(sys.argv) > 2 else "vi"
SFX, TAG = ("", EP) if LANG == "vi" else (f".{LANG}", f"{EP}-{LANG}")
t = json.load(open(P(f"src/tiktok2/{EP}/data/timing{SFX}.json"), encoding="utf-8"))
db = envelope(P("whisper.cpp", f"tiktok2-{TAG}-16k.wav"))
floor = sorted(db)[int(len(db) * 0.12)]
bad = 0
for l in t["lines"]:
    a, b = l["src"]
    ka, kb = int(a / FPS * 100), int(b / FPS * 100)
    ea = max(db[max(0, ka - 2):ka + 2]); eb = max(db[max(0, kb - 2):kb + 2])
    prev = t["lines"][t["lines"].index(l) - 1] if t["lines"].index(l) else None
    if prev and prev.get("joinNext"):
        ea = floor  # nối khít với câu trước (đọc liền) – không phải điểm cắt
    if l.get("joinNext"):
        eb = floor
    if ea > floor + 20 or eb > floor + 20:
        bad += 1
        print(f"{l['id']} đầu {ea - floor:+.1f} dB · cuối {eb - floor:+.1f} dB (so với nền) · {l['text']}")
print(f"{len(t['lines'])} câu · {bad} điểm cắt có tiếng (> nền +20 dB)")
~~~~~

### `scripts/tiktok2/ep1/check_mix.py`

~~~~~python
#!/usr/bin/env python3
"""Kiểm tra mix thành phẩm EP1: khoảng chết (cửa sổ 250 ms quá nhỏ), đỉnh âm (clip), và mức giọng trong từng câu.
Chạy: python3 scripts/tiktok2/ep1/check_mix.py "out/tiktok 2/tiktok2-ep1.mp4" [ep1|ep2] """
import array, json, math, os, subprocess, sys, tempfile, wave
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
EP = sys.argv[2] if len(sys.argv) > 2 else "ep1"
src = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "out", "tiktok 2", f"tiktok2-{EP}.mp4")
lib = os.path.join(ROOT, "node_modules/@remotion/compositor-darwin-arm64")
tmp = os.path.join(tempfile.mkdtemp(), "mix.wav")
subprocess.run([os.path.join(lib, "ffmpeg"), "-v", "error", "-y", "-i", src, "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", tmp], check=True, env={**os.environ, "DYLD_LIBRARY_PATH": lib})
w = wave.open(tmp); a = array.array("h", w.readframes(w.getnframes())); sr = w.getframerate()
peak = max(abs(x) for x in a) / 32768
hop = sr // 4
db = [20 * math.log10(math.sqrt(sum(x * x for x in a[i:i + hop]) / hop) / 32768 + 1e-9) for i in range(0, len(a) - hop, hop)]
t = json.load(open(os.path.join(ROOT, f"src/tiktok2/{EP}/data/timing.json"), encoding="utf-8"))
dead = [(i / 4, d) for i, d in enumerate(db) if d < -55 and i / 4 < t["totalSec"] - 0.5]
print(f"Độ dài {len(a) / sr:.2f} s (timeline {t['totalSec']} s) · đỉnh {20 * math.log10(peak):.1f} dBFS · RMS min {min(db):.1f} dB")
print(f"Khoảng chết (< −55 dBFS / 250 ms): {len(dead)}" + ("" if not dead else " → " + ", ".join(f"{s:.2f}s" for s, _ in dead[:20])))
quiet = []
for l in t["lines"]:
    seg = db[int(l["start"] * 4):max(int(l["start"] * 4) + 1, int(l["end"] * 4))]
    if max(seg) < -30:
        quiet.append(l["id"])
print(f"Câu có mức giọng thấp bất thường: {len(quiet)} {quiet[:10]}")
~~~~~

### `scripts/sfx-lib.mjs`

Pre-existing in the repository (mtime 2026-10-20), imported unchanged.

~~~~~js
// Tiện ích tổng hợp âm thanh dùng chung cho các script generate-*.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export const SR = 44100;

/** PRNG xác định: cùng seed → cùng âm thanh mỗi lần chạy. */
export const rng = (seed) => () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};

/** Ghi WAV mono 16-bit, chuẩn hoá đỉnh về `peak` (mặc định -6 dBFS). */
export const writeWav = (path, samples, peak = 0.5) => {
  mkdirSync(dirname(path), { recursive: true });
  let max = 0;
  for (const s of samples) max = Math.max(max, Math.abs(s));
  const gain = max > 0 ? peak / max : 1;
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + samples.length * 2, 4);
  buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((s, i) => buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s * gain)) * 32767), 44 + i * 2));
  writeFileSync(path, buf);
  console.log(`${path.split("/public/")[1] ?? path}: ${(samples.length / SR).toFixed(2)}s`);
};

/** Biquad RBJ. Có thể đổi tần số theo thời gian bằng .set(f, q). */
export const biquad = (type, f, q) => {
  let b0, b1, b2, a0, a1, a2;
  const set = (freq, qq) => {
    const w = (2 * Math.PI * Math.min(freq, SR * 0.45)) / SR;
    const alpha = Math.sin(w) / (2 * qq);
    const c = Math.cos(w);
    if (type === "lp") [b0, b1, b2] = [(1 - c) / 2, 1 - c, (1 - c) / 2];
    else if (type === "hp") [b0, b1, b2] = [(1 + c) / 2, -(1 + c), (1 + c) / 2];
    else [b0, b1, b2] = [alpha, 0, -alpha];
    [a0, a1, a2] = [1 + alpha, -2 * c, 1 - alpha];
  };
  set(f, q);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  const run = (x) => {
    const y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    return y;
  };
  run.set = set;
  return run;
};

export const buffer = (seconds) => new Float32Array(Math.floor(seconds * SR));
export const smoothstep = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
~~~~~

### `scripts/tiktok2/ep5/generate-sfx.mjs`

Shown as the example SFX generator; EP1/EP2/EP3 generators are at scripts/tiktok2/ep{1,2,3}/generate-sfx.mjs (EP1's exports the shared synth functions).

~~~~~js
// TikTok 2 · EP5 "Dừng thời gian 30 giây" – SFX + foley + ambience tổng hợp (xác định theo seed), cùng pipeline EP1–EP3.
// Dùng lại hàm tổng hợp của EP1 (scripts/tiktok2/ep1/generate-sfx.mjs). Rút kinh nghiệm: không tiếng chim, không babble dải rộng
// (người dùng nghe thành "xè xè"), không sine thuần tần cao; tiếng người xa lọc thông thấp.
// Chạy: node scripts/tiktok2/ep5/generate-sfx.mjs → public/kênh tiktok 2/sfx/ep5/*.wav
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { biquad, buffer, rng, SR, smoothstep, writeWav } from "../../sfx-lib.mjs";
import { add, babble, clink, creak, crinkle, filt, gen as ep1, heartbeat, hum, loopify, passby, pop, room, scrape, steps, thud, verb, whoosh } from "../ep1/generate-sfx.mjs";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "public", "kênh tiktok 2", "sfx", "ep5");
const out = (name, s, peak = 0.6) => writeWav(join(OUT, `${name}.wav`), s, peak);
const nz = (r) => r() * 2 - 1;
const TAU = 2 * Math.PI;
const env = (t, a, d, dur) => smoothstep(t / a) * smoothstep((dur - t) / d);
const soft = (s, f = 3500) => filt(filt(s, "lp", f), "lp", f);

/** Vỗ tay khô. */
const clap = () => add(soft(filt(crinkle(0.12, 1, 0.6, 700), "bp", 1400), 4000), thud(0.12, 180, 2, 0.3, 2500), 0, 0.5);
/** "Vút" trầm kéo dài khi thế giới đứng hình. */
const freezeWhoosh = () => {
  const dur = 1.4;
  const s = buffer(dur);
  let ph = 0;
  for (let i = 0; i < s.length; i++) {
    const t = i / SR;
    ph += (180 * Math.pow(0.4, t / dur)) / SR;
    s[i] = Math.sin(TAU * ph) * env(t, 0.03, 0.6, dur) * 0.6;
  }
  return verb(add(s, soft(whoosh(1.0, 3, 200, 900), 1500), 0, 0.8), 0.4, 1.4);
};
/** "Bụp" thả thời gian: tiếng hút ngược ngắn. */
const thaw = () => verb(Float32Array.from(soft(whoosh(0.5, 4, 300, 1500), 2000)).reverse(), 0.2);
const dayTick = () => pop(0.18, 1400, 700, 5);
const clockTick = () => {
  const s = buffer(0.06);
  for (let i = 0; i < s.length; i++) {
    const t = i / SR;
    s[i] = Math.sin(TAU * 1200 * t) * Math.exp(-t * 90) + Math.sin(TAU * 600 * t) * Math.exp(-t * 70) * 0.5;
  }
  return s;
};
const freezeHum = (d) => add(hum(d, 55, 6), filt(room(d, 7, 150, 1), "lp", 150), 0, 0.5);
const breath = (dur = 0.9, seed = 8) => {
  const r = rng(seed);
  const s = buffer(dur);
  const bp = biquad("bp", 600, 0.9);
  for (let i = 0; i < s.length; i++) {
    const t = i / SR;
    s[i] = bp(nz(r)) * Math.sin((Math.PI * t) / dur) ** 2;
  }
  return soft(s, 1500);
};
const breathLoop = (d) => {
  const s = buffer(d);
  for (let t = 0, k = 0; t < d - 0.5; t += 0.75, k++) add(s, breath(0.6, 20 + k), t, k % 2 ? 0.7 : 1);
  return s;
};
const chalk = () => soft(filt(crinkle(0.8, 9, 0.05, 1500), "bp", 2200), 4000);
const tear = () => {
  const s = buffer(0.7);
  add(s, soft(crinkle(0.45, 10, 0.08, 900), 3200), 0, 1);
  add(s, thud(0.08, 300, 11, 0.4, 2000), 0.42, 0.5);
  return s;
};
const flutter = () => soft(filt(crinkle(1.2, 12, 0.01, 600), "bp", 1200), 2500);
const eggPlace = () => clink(0.15, [1300, 2100], 13, 30);
const basketDrop = () => add(thud(0.3, 120, 14, 0.5, 1500), creak(0.3, 15, 500).map((x) => x * 0.3), 0.02, 0.6);
const kick = () => add(thud(0.3, 90, 16, 0.9, 2500), crinkle(0.06, 17, 0.2, 2000), 0, 0.5);
const hug = () => soft(add(crinkle(0.3, 18, 0.03, 500), thud(0.2, 90, 19, 0.4, 900), 0.02, 0.8), 2000);
const cheer = () => {
  const s = soft(babble(2.2, 10, 20, { lp: 1800, rate: 3, verbMix: 0.4 }), 1800);
  for (let i = 0; i < s.length; i++) s[i] *= env(i / SR, 0.2, 0.8, 2.2);
  return s;
};
const shutter = () => add(clink(0.05, [2400], 21, 80), thud(0.06, 400, 22, 0.4, 2500), 0.06, 0.6);
const chuckle = () => {
  const s = buffer(1);
  for (let k = 0; k < 4; k++) {
    const b = buffer(0.14);
    const bp = biquad("bp", 500, 3);
    let ph = 0;
    for (let i = 0; i < b.length; i++) {
      ph += 140 / SR;
      b[i] = bp(2 * (ph % 1) - 1) * Math.sin((Math.PI * i) / b.length);
    }
    add(s, b, 0.05 + k * 0.17, 1 - k * 0.15);
  }
  return soft(s, 2000);
};
const pencil = () => {
  const s = buffer(2);
  for (let t = 0.05, k = 0; t < 1.9; t += 0.16, k++) add(s, soft(crinkle(0.08, 30 + k, 0.2, 1000), 3000), t, 0.8);
  return s;
};
const glassBreak = () => add(soft(clink(0.8, [1800, 2700, 3600], 23, 7), 5000), soft(crinkle(0.5, 24, 0.05, 1500), 4500), 0.02, 0.5);
const bowlDrop = () => add(add(buffer(1.2), clink(0.9, [900, 1500, 2300], 25, 6), 0, 0.8), thud(0.3, 140, 26, 0.6, 1500), 0, 0.8);
const chairScrape = () => scrape(0.6, 27, 500);
const phoneDial = () => {
  const s = buffer(1.2);
  [[697, 1209], [697, 1209], [770, 1336]].forEach(([a, b], k) => {
    for (let i = 0; i < SR * 0.12; i++) {
      const t = i / SR;
      const kk = Math.floor((0.1 + k * 0.3 + t) * SR);
      if (kk < s.length) s[kk] += (Math.sin(TAU * a * t) + Math.sin(TAU * b * t)) * 0.4;
    }
  });
  return s;
};
const wheel = (d, f0, seed) => {
  const r = rng(seed);
  const s = buffer(d);
  const lp = biquad("lp", f0, 0.7);
  for (let i = 0; i < s.length; i++) {
    const t = i / SR;
    s[i] = lp(nz(r)) * (0.7 + 0.3 * Math.sin(TAU * 2.2 * t)) + (r() < 0.0006 ? 0.8 : 0);
  }
  return soft(s, 1200);
};
const horn = () => {
  const s = buffer(0.6);
  for (let i = 0; i < s.length; i++) {
    const t = i / SR;
    s[i] = (Math.sin(TAU * 420 * t) + 0.6 * Math.sin(TAU * 530 * t)) * env(t, 0.02, 0.08, 0.45) * (t < 0.45 ? 1 : 0);
  }
  return filt(s, "lp", 2000);
};
const streetBurst = (d) => {
  const s = add(add(passby(2.5, 31), passby(3, 32), 1, 0.8), filt(room(d, 33, 200, 1), "lp", 200), 0, 0.7);
  [0.3, 1.8].forEach((t) => add(s, horn(), t, 0.6));
  return s;
};
const doorSwing = () => add(creak(0.6, 34, 300).map((x) => x * 0.5), whoosh(0.4, 35, 300, 900), 0, 0.6);
const doorClose = () => add(thud(0.4, 80, 36, 0.6, 900), clink(0.2, [700], 37, 20), 0.02, 0.3);
const monitorBeep = (d) => {
  const s = buffer(d);
  for (let t = 0.1; t < d - 0.2; t += 1.0) {
    for (let i = 0; i < SR * 0.12; i++) {
      const u = i / SR;
      const k = Math.floor((t + u) * SR);
      if (k < s.length) s[k] += Math.sin(TAU * 880 * u) * env(u, 0.005, 0.04, 0.12) * 0.6;
    }
  }
  return s;
};
const nailTap = () => add(add(buffer(0.8), thud(0.1, 300, 38, 0.3, 2500), 0, 1), thud(0.1, 320, 39, 0.3, 2500), 0.3, 0.9);

const gen = {
  clap: () => clap(),
  freeze_whoosh: () => freezeWhoosh(),
  thaw: () => thaw(),
  day_tick: () => dayTick(),
  clock_tick: () => clockTick(),
  freeze_hum_loop: () => loopify((d) => freezeHum(d), 4),
  breath: () => breath(),
  breath_loop: () => loopify((d) => breathLoop(d), 3),
  steps_tile_loop: ep1.steps_tile_loop,
  steps_run_loop: () => loopify((d) => steps(d, 0.2, 40, { f: 1400, low: 100, hard: 0.7, jitter: 0.04 }), 2, 0.05),
  page_flip: () => soft(filt(whoosh(0.45, 41, 700, 2200), "hp", 400), 3000),
  chalk: () => chalk(),
  whoosh_ui: ep1.whoosh_ui,
  whoosh: ep1.whoosh,
  buzz: ep1.buzz,
  startle: ep1.startle,
  cloth: ep1.cloth,
  paper: () => soft(ep1.paper(), 3000),
  ting: ep1.ting,
  chair_lift: () => add(scrape(0.3, 42, 400), thud(0.2, 120, 43, 0.3, 1200), 0.25, 0.5),
  paper_flutter: () => flutter(),
  heartbeat_loop: () => heartbeat(1.0, 1.0),
  calendar_tear: () => tear(),
  basket_drop: () => basketDrop(),
  egg_place: () => eggPlace(),
  ball_kick: () => kick(),
  ball_hug: () => hug(),
  cheer: () => cheer(),
  camera_shutter: () => shutter(),
  grandpa_chuckle: () => chuckle(),
  pencil_marks: () => pencil(),
  glass_break: () => glassBreak(),
  bowl_drop: () => bowlDrop(),
  chair_scrape: () => chairScrape(),
  phone_dial: () => phoneDial(),
  wheel_tile: () => loopify((d) => wheel(d, 500, 44), 2),
  wheel_road: () => loopify((d) => wheel(d, 300, 45), 2),
  wheel_hospital: () => loopify((d) => wheel(d, 700, 46), 2),
  horn: () => horn(),
  street_burst: () => loopify((d) => streetBurst(d), 3),
  door_swing: () => doorSwing(),
  door_close_heavy: () => doorClose(),
  monitor_beep: () => loopify((d) => monitorBeep(d), 3, 0.05),
  nail_tap: () => nailTap(),
  // ambience (không chim, tiếng người xa lọc thấp)
  amb_class_soft_loop: () => loopify((d) => add(soft(babble(d, 6, 50, { lp: 1200, rate: 4, verbMix: 0.4 }), 1100).map((x) => x * 0.5), room(d, 51, 260, 1), 0, 0.8), 10),
  amb_home_loop: () => loopify((d) => add(add(room(d, 52, 260, 1), passby(4, 53), 3, 0.35), hum(d, 98, 54), 0, 0.03), 10),
  amb_yard_soft_loop: () => loopify((d) => add(soft(babble(d, 10, 55, { lp: 1400, rate: 5, verbMix: 0.4 }), 1300), room(d, 56, 300, 1), 0, 0.6), 10),
  amb_alley_loop: () => loopify((d) => add(add(add(room(d, 57, 280, 1), passby(3, 58), 2, 0.6), passby(3.5, 59), 6, 0.5), soft(babble(d, 4, 60, { lp: 1000, rate: 4, verbMix: 0.5 }), 900), 0, 0.3), 10),
  amb_dinner_loop: () =>
    loopify((d) => {
      const s = add(room(d, 61, 300, 1), (() => { const r = rng(62); const b = buffer(d); const bp = biquad("bp", 380, 0.8); for (let i = 0; i < b.length; i++) b[i] = bp(nz(r)) * (0.7 + 0.3 * Math.sin((TAU * 3.2 * i) / SR)); return b; })(), 0, 0.5);
      [1.5, 4.2, 7.1].forEach((t, k) => add(s, add(clink(0.25, [2300, 3600], 63 + k, 25), clink(0.25, [2500, 3800], 66 + k, 25), 0.12, 0.7), t, 0.3));
      return s;
    }, 9),
  amb_street_night_loop: () => loopify((d) => streetBurst(d).map((x) => x * 0.6), 6),
  amb_er_loop: () => loopify((d) => add(add(room(d, 70, 300, 1), soft(babble(d, 5, 71, { lp: 1000, rate: 4, verbMix: 0.6 }), 900), 0, 0.35), hum(d, 60, 72), 0, 0.05), 10),
  amb_ward_loop: () => loopify((d) => add(room(d, 73, 220, 1), passby(4, 74), 4, 0.15), 10),
  amb_room_tone_loop: ep1.amb_room_tone_loop,
  amb_quiet_loop: ep1.amb_quiet_loop,
};

for (const [name, make] of Object.entries(gen)) out(name, make(), name.includes("_loop") ? 0.45 : 0.6);
~~~~~

### `scripts/tiktok2/ep5/bake-freeze-stem.ts`

~~~~~ts
// TikTok 2 · EP5 – gộp các cue lặp nhiều của cơ chế dừng thời gian (vỗ tay + "vút" + "tách" mỗi lần dừng, tích tắc mỗi giây đồng hồ)
// thành MỘT file stem dài đúng bằng tập. Remotion tiền xử lý mỗi <Audio> thành file dài cả tập, nên ~500 cue riêng làm đầy ổ đĩa khi render.
// Mốc lấy từ freeze.ts/time.ts (cùng logic với AudioLayer5 cũ), không gõ số giây bằng tay.
// Chạy: npx tsx scripts/tiktok2/ep5/bake-freeze-stem.ts → public/kênh tiktok 2/sfx/ep5/freeze_stem.wav
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ALL_CLAPS, clockSec, FREEZES } from "../../../src/tiktok2/ep5/freeze";
import { TOTAL } from "../../../src/tiktok2/ep5/time";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "public", "kênh tiktok 2", "sfx", "ep5");
const SR = 44100;
const FPS = 30;

const readWav = (name: string): Float32Array => {
  const b = readFileSync(join(DIR, `${name}.wav`));
  let p = 12;
  while (p < b.length) {
    const id = b.toString("ascii", p, p + 4);
    const len = b.readUInt32LE(p + 4);
    if (id === "fmt ") {
      const ch = b.readUInt16LE(p + 10), sr = b.readUInt32LE(p + 12), bits = b.readUInt16LE(p + 22);
      if (ch !== 1 || sr !== SR || bits !== 16) throw new Error(`${name}: cần mono 44.1k 16-bit`);
    }
    if (id === "data") {
      const n = len / 2, s = new Float32Array(n);
      for (let i = 0; i < n; i++) s[i] = b.readInt16LE(p + 8 + i * 2) / 32768;
      return s;
    }
    p += 8 + len + (len & 1);
  }
  throw new Error(`${name}: không có data`);
};

/** Đã nhân sẵn FX_GAIN của audio.tsx (0.45) để chồng tiếng không vượt biên; trong tập stem chỉ còn nhân hệ số né giọng. */
const FX_GAIN = 0.45;
const out = new Float32Array(Math.ceil((TOTAL / FPS) * SR));
const place = (s: Float32Array, frame: number, vol: number) => {
  const o = Math.round((frame / FPS) * SR);
  for (let i = 0; i < s.length && o + i < out.length; i++) if (o + i >= 0) out[o + i] += s[i] * vol * FX_GAIN;
};

const clap = readWav("clap"), whoosh = readWav("freeze_whoosh"), day = readWav("day_tick"), tick = readWav("clock_tick");
for (const c of ALL_CLAPS) {
  place(clap, c, 0.85);
  place(whoosh, c + 1, 0.7);
  place(day, c + 8, 0.55);
}
let ticks = 0;
for (const z of FREEZES) {
  let last = Math.ceil(clockSec(z, z.from));
  for (let a = z.from + 1; a < z.to; a++) {
    const sec = Math.ceil(clockSec(z, a));
    if (sec !== last) {
      place(tick, a, sec <= 5 ? 0.6 : 0.4);
      ticks++;
    }
    last = sec;
  }
}

let peak = 0;
for (const v of out) peak = Math.max(peak, Math.abs(v));
const pcm = Buffer.alloc(44 + out.length * 2);
pcm.write("RIFF", 0);
pcm.writeUInt32LE(36 + out.length * 2, 4);
pcm.write("WAVEfmt ", 8);
pcm.writeUInt32LE(16, 16);
pcm.writeUInt16LE(1, 20);
pcm.writeUInt16LE(1, 22);
pcm.writeUInt32LE(SR, 24);
pcm.writeUInt32LE(SR * 2, 28);
pcm.writeUInt16LE(2, 32);
pcm.writeUInt16LE(16, 34);
pcm.write("data", 36);
pcm.writeUInt32LE(out.length * 2, 40);
// Không chuẩn hoá: giữ đúng mức như cue riêng; chỉ hạn biên phòng hờ.
for (let i = 0; i < out.length; i++) pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, out[i])) * 32767), 44 + i * 2);
writeFileSync(join(DIR, "freeze_stem.wav"), pcm);
console.log(`freeze_stem.wav · ${ALL_CLAPS.length} lần vỗ · ${ticks} tích tắc · ${(out.length / SR).toFixed(2)}s · đỉnh ${peak.toFixed(2)}`);
~~~~~

### `scripts/tiktok2/check-text-bounds.mjs`

~~~~~js
// Kênh TikTok 2 – kiểm tra chữ lọt ngoài khung 1920×1080 cho từng tập (dùng composition T2QA* + src/tiktok2/qa/TextBoundsQA.tsx).
// Lấy mẫu mỗi 10 frame, không chụp ảnh (imageFormat "none"), gom các chữ có phần nằm ngoài khung theo nội dung chữ.
// Chạy: node scripts/tiktok2/check-text-bounds.mjs ep5 [ep1 ep1en ep2 ep3 …]   (mặc định: tất cả); chỉ một đoạn: ep5@570-1160 (frame của tập)
// Kết quả: out/tiktok 2/qa/text-bounds-<tập>.txt ; mã thoát 1 nếu có chữ RÕ (không thuộc lớp nền nhoè) lọt khung.
import { bundle } from "@remotion/bundler";
import { renderFrames, selectComposition } from "@remotion/renderer";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const IDS = { ep1: "T2QA1", ep1en: "T2QA1En", ep2: "T2QA2", ep3: "T2QA3", ep5: "T2QA5" };
const EVERY = 10;
const CHUNK = 100;
const eps = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(IDS);
const mmss = (f) => `${Math.floor(f / 30 / 60)}:${(f / 30 % 60).toFixed(1).padStart(4, "0")}`;

const serveUrl = await bundle({ entryPoint: join(ROOT, "src/tiktok2/index.ts") });
mkdirSync(join(ROOT, "out/tiktok 2/qa"), { recursive: true });
let bad = 0;
for (const arg of eps) {
  const [ep, range] = arg.split("@");
  const id = IDS[ep];
  if (!id) throw new Error(`không biết tập ${ep}`);
  const composition = await selectComposition({ serveUrl, id });
  const hits = [];
  let pings = 0;
  // chia đoạn 100 frame, mỗi đoạn một trình duyệt mới (máy ít RAM: chạy liền 1000+ frame làm Chrome sập)
  const [r0, r1] = range ? range.split("-").map((v) => Math.round(+v / EVERY)) : [0, composition.durationInFrames - 1];
  const end = Math.min(composition.durationInFrames, r1 + 1);
  for (let a = r0; a < end; a += CHUNK) {
    await renderFrames({
      composition,
      serveUrl,
      inputProps: {},
      imageFormat: "none",
      frameRange: [a, Math.min(end, a + CHUNK) - 1],
      concurrency: 3,
      timeoutInMilliseconds: 120000,
      onStart: () => {},
      onFrameUpdate: () => {},
      outputDir: null,
      onBrowserLog: (log) => {
        const t = log.text;
        if (t.startsWith("TEXTQA-PING")) pings++;
        else if (t.startsWith("TEXTQA|")) {
          const [, at, kind, side, box, ...txt] = t.split("|");
          hits.push({ at: +at, kind, side, box, txt: txt.join("|") });
        }
      },
    });
    process.stdout.write(`\r${ep}: ${Math.min(end, a + CHUNK)}/${end}`);
  }
  process.stdout.write("\n");
  // gom theo chữ + loại: một dòng cho mỗi cụm frame liên tiếp
  const open = new Map();
  const rows = [];
  for (const h of hits.sort((a, b) => a.at - b.at)) {
    const k = `${h.kind}|${h.txt}`;
    const g = open.get(k);
    if (g && h.at - g.to <= EVERY) {
      g.to = h.at;
      g.n++;
    } else {
      const ng = { ...h, from: h.at, to: h.at, n: 1 };
      open.set(k, ng);
      rows.push(ng);
    }
  }
  rows.sort((a, b) => a.from - b.from);
  const lines = rows.map((g) => `${mmss(g.from)}–${mmss(g.to)}  f${g.from}–${g.to}  ${g.kind.padEnd(4)} lọt ${g.side.padEnd(12)} [${g.box}]  "${g.txt}"`);
  const sharp = rows.filter((g) => g.kind !== "blur").length;
  const head = `${ep} (${id}) · ${pings} frame đã đo (mỗi ${EVERY} frame) · ${sharp} cụm chữ RÕ lọt khung · ${rows.length - sharp} cụm chữ nền mờ (tham khảo)`;
  writeFileSync(join(ROOT, `out/tiktok 2/qa/text-bounds-${ep}${range ? "@" + range : ""}.txt`), [head, ...lines].join("\n") + "\n");
  console.log(head);
  for (const l of lines) console.log("  " + l);
  bad += sharp;
}
process.exit(bad ? 1 : 0);
~~~~~

### `src/tiktok2/qa/TextBoundsQA.tsx`

~~~~~tsx
import React, { useEffect, useRef, useState } from "react";
import { AbsoluteFill, continueRender, delayRender, Freeze, useCurrentFrame, useVideoConfig } from "remotion";

/**
 * QA chữ lọt khung: frame i của composition này = frame i × every của tập. Sau khi dựng xong frame, đo mọi chữ đang hiện
 * (thẻ HTML có chữ trực tiếp + <text> SVG, độ mờ thực > 5%) và in ra console những chữ có phần nằm ngoài 1920×1080.
 * Chữ nằm HẲN ngoài khung (không thấy) thì bỏ qua. Chữ ở lớp nền đang nhoè (blur > 2px) ghi loại "blur" (tham khảo). Chạy: node scripts/tiktok2/check-text-bounds.mjs <tập>.
 */
const MARGIN = 2;

const effectiveOpacity = (el: Element) => {
  let o = 1;
  for (let e: Element | null = el; e; e = e.parentElement) {
    const cs = getComputedStyle(e);
    if (cs.display === "none" || cs.visibility === "hidden") return 0;
    o *= parseFloat(cs.opacity || "1");
    if (e instanceof SVGElement) o *= parseFloat(e.getAttribute("opacity") ?? "1") * parseFloat(e.getAttribute("fill-opacity") ?? "1");
  }
  return o;
};

/** Độ nhoè CSS lớn nhất trên đường lên gốc (lớp nền xa/gần của Stage có blur theo độ sâu). */
const blurOf = (el: Element) => {
  let b = 0;
  for (let e: Element | null = el; e; e = e.parentElement) {
    const m = /blur\(([\d.]+)px\)/.exec(getComputedStyle(e).filter);
    if (m) b = Math.max(b, parseFloat(m[1]));
  }
  return b;
};

const ownText = (el: Element) =>
  el instanceof SVGTextElement
    ? (el.textContent ?? "").trim()
    : Array.from(el.childNodes)
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent ?? "")
        .join("")
        .trim();

const measure = (root: HTMLElement, W: number, H: number) => {
  const box = root.getBoundingClientRect();
  const sx = box.width / W;
  const sy = box.height / H;
  const hits: string[] = [];
  root.querySelectorAll("*").forEach((el) => {
    if (el instanceof SVGTSpanElement) return;
    const txt = ownText(el);
    if (!txt || !/[\p{L}\p{N}]/u.test(txt)) return;
    if (effectiveOpacity(el) < 0.05) return;
    const r = el.getBoundingClientRect();
    const x0 = (r.left - box.left) / sx, x1 = (r.right - box.left) / sx, y0 = (r.top - box.top) / sy, y1 = (r.bottom - box.top) / sy;
    if (x1 - x0 < 1 || y1 - y0 < 1) return;
    if (x1 <= 0 || x0 >= W || y1 <= 0 || y0 >= H) return;
    const out = { l: -x0, r: x1 - W, t: -y0, b: y1 - H };
    const worst = Math.max(out.l, out.r, out.t, out.b);
    if (worst <= MARGIN) return;
    const side = (Object.keys(out) as (keyof typeof out)[]).filter((k) => out[k] > MARGIN).map((k) => `${k}${Math.round(out[k])}`).join(",");
    // "blur" = chữ thuộc lớp nền đang nhoè (cắt mép như mọi vật nền khi quay cận) – chỉ để tham khảo
    const kind = blurOf(el) > 2 ? "blur" : el instanceof SVGElement ? "svg" : "html";
    hits.push(`${kind}|${side}|${Math.round(x0)},${Math.round(y0)},${Math.round(x1)},${Math.round(y1)}|${txt.slice(0, 40)}`);
  });
  return hits;
};

const Probe: React.FC<{ at: number; children: React.ReactNode }> = ({ at, children }) => {
  const ref = useRef<HTMLDivElement>(null);
  const { width, height } = useVideoConfig();
  const [handle] = useState(() => delayRender(`text-bounds ${at}`));
  useEffect(() => {
    let alive = true;
    // chờ font + các delayRender khác của cảnh, rồi đo ở frame kế tiếp của trình duyệt
    document.fonts.ready.then(() =>
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (!alive || !ref.current) return;
          console.log(`TEXTQA-PING ${at}`);
          for (const h of measure(ref.current, width, height)) console.log(`TEXTQA|${at}|${h}`);
          continueRender(handle);
        }),
      ),
    );
    return () => {
      alive = false;
    };
  }, [at, handle, width, height]);
  return (
    <AbsoluteFill ref={ref} style={{ overflow: "hidden" }}>
      {children}
    </AbsoluteFill>
  );
};

export const TextBoundsQA: React.FC<{ every: number; children: React.ReactNode }> = ({ every, children }) => {
  const at = useCurrentFrame() * every;
  return (
    <Probe key={at} at={at}>
      <Freeze frame={at}>{children}</Freeze>
    </Probe>
  );
};
~~~~~

### `src/tiktok2/index.ts`

~~~~~ts
// Entry riêng cho kênh TikTok 2 – render độc lập, không phụ thuộc các series khác trong src/Root.tsx.
import { registerRoot } from "remotion";
import { Tiktok2Compositions } from "./Tiktok2Root";

registerRoot(Tiktok2Compositions);
~~~~~

### `src/tiktok2/Tiktok2Root.tsx`

~~~~~tsx
import React from "react";
import { Composition, Folder, Still } from "remotion";
import { BOARD_PER, T2E1Board, Tiktok2Ep1 } from "./ep1/Episode";
import { T2E1CharacterSheet, T2E1SetSheet } from "./ep1/Sheets";
import { shotsOf, totalOf } from "./ep1/time";
import { BOARD2_PER, T2E2Board, Tiktok2Ep2 } from "./ep2/Episode";
import { SHOTS as SHOTS2, TOTAL as TOTAL2 } from "./ep2/time";
import { BOARD3_PER, T2E3Board, Tiktok2Ep3 } from "./ep3/Episode";
import { SHOTS as SHOTS3, TOTAL as TOTAL3 } from "./ep3/time";
import { BOARD5_PER, T2E5Board, Tiktok2Ep5 } from "./ep5/Episode";
import { SHOTS as SHOTS5, TOTAL as TOTAL5 } from "./ep5/time";
import { TextBoundsQA } from "./qa/TextBoundsQA";

/** QA chữ lọt khung (scripts/tiktok2/check-text-bounds.mjs): lấy mẫu mỗi QA_EVERY frame của tập. */
const QA_EVERY = 10;
const qa = (Ep: React.FC<Record<string, unknown>>, props: Record<string, unknown> = {}): React.FC => () => (
  <TextBoundsQA every={QA_EVERY}>
    <Ep {...props} />
  </TextBoundsQA>
);
const QA_N = (total: number) => Math.ceil(total / QA_EVERY);

/** Kênh TikTok 2 – 16:9, 1920×1080, 30 fps (người dùng đổi từ 9:16). */
export const Tiktok2Compositions: React.FC = () => (
  <Folder name="Tiktok2">
    <Composition id="Tiktok2Ep1" component={Tiktok2Ep1} durationInFrames={totalOf("vi")} fps={30} width={1920} height={1080} />
    <Composition id="Tiktok2Ep1En" component={Tiktok2Ep1} durationInFrames={totalOf("en")} fps={30} width={1920} height={1080} defaultProps={{ lang: "en" as const }} />
    <Composition id="Tiktok2Ep2" component={Tiktok2Ep2} durationInFrames={TOTAL2} fps={30} width={1920} height={1080} />
    <Composition id="T2E2Board" component={T2E2Board} durationInFrames={Math.ceil(SHOTS2.length / BOARD2_PER)} fps={30} width={1920} height={1500} defaultProps={{ pick: 0.55 }} />
    <Composition id="Tiktok2Ep3" component={Tiktok2Ep3} durationInFrames={TOTAL3} fps={30} width={1920} height={1080} />
    <Composition id="T2E3Board" component={T2E3Board} durationInFrames={Math.ceil(SHOTS3.length / BOARD3_PER)} fps={30} width={1920} height={1500} defaultProps={{ pick: 0.55 }} />
    <Composition id="Tiktok2Ep5" component={Tiktok2Ep5} durationInFrames={TOTAL5} fps={30} width={1920} height={1080} />
    <Composition id="T2E5Board" component={T2E5Board} durationInFrames={Math.ceil(SHOTS5.length / BOARD5_PER)} fps={30} width={1920} height={1500} defaultProps={{ pick: 0.55 }} />
    <Folder name="Tiktok2-QA">
      <Composition id="T2QA1" component={qa(Tiktok2Ep1 as React.FC<Record<string, unknown>>)} durationInFrames={QA_N(totalOf("vi"))} fps={30} width={1920} height={1080} />
      <Composition id="T2QA1En" component={qa(Tiktok2Ep1 as React.FC<Record<string, unknown>>, { lang: "en" })} durationInFrames={QA_N(totalOf("en"))} fps={30} width={1920} height={1080} />
      <Composition id="T2QA2" component={qa(Tiktok2Ep2 as React.FC<Record<string, unknown>>)} durationInFrames={QA_N(TOTAL2)} fps={30} width={1920} height={1080} />
      <Composition id="T2QA3" component={qa(Tiktok2Ep3 as React.FC<Record<string, unknown>>)} durationInFrames={QA_N(TOTAL3)} fps={30} width={1920} height={1080} />
      <Composition id="T2QA5" component={qa(Tiktok2Ep5 as React.FC<Record<string, unknown>>)} durationInFrames={QA_N(TOTAL5)} fps={30} width={1920} height={1080} />
    </Folder>
    <Folder name="Tiktok2Ep1-Sheets">
      <Composition id="T2E1Board" component={T2E1Board} durationInFrames={Math.ceil(shotsOf("vi").length / BOARD_PER)} fps={30} width={1920} height={1500} defaultProps={{ pick: 0.55 }} />
      <Composition id="T2E1BoardEn" component={T2E1Board} durationInFrames={Math.ceil(shotsOf("en").length / BOARD_PER)} fps={30} width={1920} height={1500} defaultProps={{ pick: 0.55, lang: "en" as const }} />
      <Still id="T2E1CharacterSheet" component={T2E1CharacterSheet} width={1080} height={1920} />
      <Still id="T2E1SetLiving" component={T2E1SetSheet} width={1920} height={1080} defaultProps={{ which: 0 }} />
      <Still id="T2E1SetLantern" component={T2E1SetSheet} width={1920} height={1080} defaultProps={{ which: 1 }} />
    </Folder>
  </Folder>
);
~~~~~

### `src/tiktok2/ep1/theme.ts`

~~~~~ts
import { loadFont } from "@remotion/google-fonts/Baloo2";

/** Kênh TikTok 2 – bảng màu & chữ. Môi trường + nhân vật phụ: trầm, khử bão hoà. Nhân vật chính: hoodie CAM rực. */
export const { fontFamily: FONT } = loadFont("normal", { weights: ["600", "800"], subsets: ["vietnamese", "latin"] });

/** Khung 16:9 (người dùng đổi từ 9:16 sang 16:9). */
export const W = 1920;
export const H = 1080;
/** Điểm trên màn hình mà tâm camera rơi vào. */
export const ANCHOR = { x: 960, y: 540 } as const;
/** Hệ số phóng chung: cảnh dựng trong toạ độ thế giới (người lớn cao 600), khung ngang thấy rộng hơn. */
export const CAM_K = 0.85;
/** Vùng an toàn chữ (lề 5%). */
export const SAFE = { left: W * 0.05, right: W * 0.95, bottom: H * 0.92 } as const;
/** Đổi toạ độ màn hình thiết kế dọc cũ (1080×1920) sang khung ngang – cho chữ/hiệu ứng đặt theo màn hình. */
export const PX = (x: number, y: number) => ({ x: 960 + (x - 500) * 1.2, y: y * 0.5625 });

export const C = {
  ink: "#15121a",
  ink2: "#2a2530",
  rim: "#f3e2c2",
  white: "#ffffff",
  orange: "#ff7a1a",
  mom: "#b59ac2",
  bin: "#9cc6e4",
  huy: "#7b8a58",
  aodai: "#8797a6",
  principal: "#8e8e94",
  friendBeige: "#cbb699",
  friendGray: "#9a9aa2",
  friendPurple: "#8c7a9c",
  kidnap: "#45434a",
  // môi trường
  wall: "#cdbfa6",
  wallShade: "#b3a58e",
  floor: "#a99a86",
  wood: "#8a6a4f",
  woodDark: "#6b5140",
  blueGray: "#7d8b99",
  dustyPurple: "#8a7b92",
  olive: "#8a8a62",
  beige: "#d6c9b1",
  warm: "#ffcf8a",
  night: "#2a2840",
  red: "#c4553f",
  gold: "#e0b45a",
} as const;

/** Trộn hai màu hex. */
export const mix = (a: string, b: string, t: number) => {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return "#" + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, "0")).join("");
};
export const shade = (c: string, t: number) => (t >= 0 ? mix(c, "#ffffff", t) : mix(c, "#1a1420", -t));
/** Giảm bão hoà một màu (t = 0…1). */
export const desat = (c: string, t: number) => {
  const p = [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const g = Math.round(p[0] * 0.3 + p[1] * 0.59 + p[2] * 0.11);
  return mix(c, `#${[g, g, g].map((v) => v.toString(16).padStart(2, "0")).join("")}`, t);
};
export const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

import { loadFont as loadHand } from "@remotion/google-fonts/PatrickHand";
/** Chữ viết tay (lời phê đỏ). */
export const { fontFamily: HAND } = loadHand("normal", { weights: ["400"], subsets: ["vietnamese", "latin"] });
~~~~~

### `src/tiktok2/ep5/time.ts`

~~~~~ts
import { useCurrentFrame } from "remotion";
import TIMING from "./data/timing.json";

/**
 * Truy vấn timeline EP5. MỌI mốc sinh từ giọng (python3 scripts/tiktok2/ep1/build_timing.py ep5 → data/timing.json) – KHÔNG gõ số giây trong cảnh.
 * at("L57","thương") = frame tuyệt đối lúc đọc chữ đó.
 */
export const FPS = 30;
/** Hàm DUY NHẤT quy đổi giây → frame. */
export const sec2f = (s: number) => Math.round(s * FPS);

export type Line = (typeof TIMING.lines)[number];
export type Shot = (typeof TIMING.shots)[number];
export const LINES: readonly Line[] = TIMING.lines;
export const SHOTS: readonly Shot[] = TIMING.shots;
export const TOTAL = TIMING.totalFrames;
export const END_CARD_FROM = TIMING.endCardFrom;
export const VOICE = TIMING.voice;
export { TIMING };

const strip = (s: string) =>
  s.toLowerCase().replace(/đ/g, "d").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

const BY_ID = new Map(LINES.map((l) => [l.id, l]));
export const line = (id: string) => {
  const l = BY_ID.get(id);
  if (!l) throw new Error(`Không có câu ${id}`);
  return l;
};
/** Frame tuyệt đối đầu / cuối câu. */
export const L = (id: string) => line(id).from;
export const Lend = (id: string) => line(id).to;
/** Frame tuyệt đối lúc đọc từ/cụm từ trong câu (so khớp bỏ dấu). */
export const at = (id: string, word: string, nth = 1, edge: "start" | "end" = "start") => {
  const l = line(id);
  const target = strip(word).split(" ");
  const ws = l.words.map((w) => w[1] as string);
  let seen = 0;
  for (let i = 0; i + target.length <= ws.length; i++) {
    if (target.every((t, k) => ws[i + k] === t) && ++seen === nth) return edge === "start" ? (l.words[i][2] as number) : (l.words[i + target.length - 1][3] as number);
  }
  throw new Error(`Không thấy "${word}" trong ${id}`);
};
export const shot = (id: string) => {
  const s = SHOTS.find((x) => x.id === id);
  if (!s) throw new Error(`Không có shot ${id}`);
  return s;
};
/** Câu đang được đọc ở frame tuyệt đối (null trong khoảng lặng / hold). */
export const speakingAt = (abs: number) => LINES.find((l) => abs >= l.from && abs < l.to) ?? null;
export const actAt = (abs: number) => TIMING.acts.find((a) => abs >= a.from && abs < a.to)?.act ?? 9;

/** Mốc cục bộ của một shot (dùng được ngoài React – cho cue âm thanh). */
export const shotHelpers = (id: string) => {
  const s = shot(id);
  return {
    id,
    dur: s.to - s.from,
    from: s.from,
    L: (lid: string) => L(lid) - s.from,
    E: (lid: string) => Lend(lid) - s.from,
    at: (lid: string, w: string, nth = 1, edge: "start" | "end" = "start") => at(lid, w, nth, edge) - s.from,
    /** frame cục bộ bắt đầu / kết thúc hold sau câu */
    H: (lid: string) => line(lid).holdFrom - s.from,
    HE: (lid: string) => line(lid).holdTo - s.from,
  };
};
export type ShotH = ReturnType<typeof shotHelpers>;
/** Trong một shot: frame cục bộ + mốc cục bộ. */
export const useShot = (id: string) => {
  const f = useCurrentFrame();
  const h = shotHelpers(id);
  return { ...h, f, abs: h.from + f };
};
~~~~~

### `src/tiktok2/ep5/freeze.ts`

~~~~~ts
import { interpolate } from "remotion";
import { clamp } from "../ep1/theme";
import { at, L, shot } from "./time";

/**
 * Các lần DỪNG THỜI GIAN (frame TUYỆT ĐỐI, neo vào chữ thoại). from = lúc vỗ tay, to = lúc thời gian chạy lại.
 * clock = [frame, giây còn lại] (đồng hồ 30 giây; giữa các mốc nội suy; `cycle` = đồng hồ quay vòng mỗi lần vỗ tay).
 * days = [frame, số ngày] (bộ đếm "+N NGÀY"). Âm: trong khoảng from…to tắt ambience, chỉ còn ù nhỏ + tích tắc (audio.tsx).
 */
export type Freeze = {
  readonly from: number;
  readonly to: number;
  readonly clock?: readonly (readonly [number, number])[];
  readonly claps?: readonly number[];
  readonly days: readonly (readonly [number, number])[];
  readonly big?: readonly [number, number];
  readonly hud?: boolean;
};

const s = (id: string) => shot(id);
const spread = (a: number, b: number, n: number) => Array.from({ length: n }, (_, i) => Math.round(a + ((b - a) * i) / Math.max(1, n - 1)));

const hookClap = s("1.1").from + 14;
const c1 = at("L011", "vỗ tay");
const cRules = at("L043", "vỗ tay");
const cVy = [L("L071"), L("L074"), ...spread(L("L075") + 10, L("L077") - 8, 8)];
const cEgg = at("L082", "vỗ tay");
const cBall = at("L090", "vỗ tay");
const cBig = at("L159", "vỗ tay");
const cRush = [L("L177"), L("L184"), L("L188"), L("L189"), L("L190"), ...spread(L("L191"), L("L207"), 12)];

export const FREEZES: readonly Freeze[] = [
  { from: hookClap, to: s("1.1").to, clock: [[hookClap, 30], [s("1.1").to, 26]], days: [[hookClap, 1]], hud: true },
  {
    from: c1,
    to: L("L031"),
    clock: [[c1, 30], [L("L019"), 30], [L("L020"), 29], [L("L021"), 28], [L("L024"), 20], [L("L027"), 6], [L("L028"), 3], [L("L029"), 2], [L("L030"), 1], [L("L031"), 0]],
    days: [[c1, 1]],
    hud: true,
  },
  { from: cRules, to: s("3.3").to, clock: [[cRules, 30], [s("3.3").to, 20]], days: [[cRules, 1]], hud: true },
  { from: cVy[0], to: L("L077"), claps: cVy, days: cVy.map((c, i) => [c, i + 1] as const), hud: true },
  { from: cEgg, to: L("L084"), clock: [[cEgg, 30], [L("L084"), 1]], days: [[cEgg, 1]], hud: true },
  { from: cBall, to: L("L092"), clock: [[cBall, 30], [L("L092"), 0]], days: [[cBall, 1]], hud: true },
  { from: cBig, to: L("L174"), clock: [[cBig, 30], [L("L169"), 20], [L("L170"), 10], [L("L171"), 3], [L("L172"), 2], [L("L173"), 1], [L("L174"), 0]], days: [[cBig, 1]], hud: true },
  {
    from: cRush[0],
    to: L("L210"),
    claps: cRush,
    days: [[L("L177"), 2], [L("L184"), 3], [L("L188"), 4], [L("L189"), 5], [L("L190"), 6], [L("L191"), 10], [L("L192"), 20], [L("L197"), 40], [L("L201"), 50], [L("L204"), 60], [at("L207", "vỗ tay"), 63]],
    big: [L("L188"), L("L207")],
    hud: true,
  },
];
/** Bộ đếm ngày hiện cả ngoài lúc dừng (không có đồng hồ). */
export const DAY_ONLY: readonly { from: number; to: number; days: readonly (readonly [number, number])[] }[] = [
  { from: s("3.4").from, to: s("3.4").to, days: [[s("3.4").from + 20, 1]] },
  { from: L("L097"), to: s("5.5").to, days: Array.from({ length: 30 }, (_, i) => [L("L097") + Math.round(i * 2.2), i + 1] as const) },
  { from: L("L174"), to: L("L177"), days: [[L("L174"), 1]] },
];

export const freezeAt = (abs: number) => FREEZES.find((z) => abs >= z.from && abs < z.to) ?? null;
/** Mức đứng hình 0…1 tại frame tuyệt đối (vỗ: chuyển ~10 frame; thả: bật lại ~6 frame). */
export const freezeK = (abs: number) => {
  for (const z of FREEZES) {
    if (abs >= z.from - 1 && abs < z.to + 8) return interpolate(abs, [z.from, z.from + 10], [0, 1], clamp) * interpolate(abs, [z.to, z.to + 6], [1, 0], clamp);
  }
  return 0;
};
export const clockSec = (z: Freeze, abs: number) => {
  if (z.claps) {
    const last = [...z.claps].reverse().find((c) => abs >= c) ?? z.from;
    const next = z.claps.find((c) => c > abs) ?? z.to;
    return interpolate(abs, [last, next], [30, Math.max(0, 30 - (next - last) / 4)], clamp);
  }
  const k = z.clock!;
  if (abs <= k[0][0]) return k[0][1];
  for (let i = 0; i + 1 < k.length; i++) if (abs <= k[i + 1][0]) return interpolate(abs, [k[i][0], k[i + 1][0]], [k[i][1], k[i + 1][1]]);
  return k[k.length - 1][1];
};
export const daysAt = (list: readonly (readonly [number, number])[], abs: number) => {
  let d = 0;
  let pop = -99;
  for (const [t, n] of list) if (abs >= t) {
    d = n;
    pop = t;
  }
  return { d, pop };
};
/** Mọi lần vỗ tay (để gắn tiếng vỗ + "vút" + "tách"). */
export const ALL_CLAPS: readonly number[] = FREEZES.flatMap((z) => (z.claps ? z.claps : [z.from]));
~~~~~

### `src/tiktok2/ep5/audio.tsx`

~~~~~tsx
import React from "react";
import { Html5Audio, interpolate, Sequence, staticFile } from "remotion";
import { clamp } from "../ep1/theme";
import { Amb, Cue, ShotDef } from "./kit";
import { FREEZES, freezeK } from "./freeze";
import { at, L, line, LINES, SHOTS, TOTAL, VOICE } from "./time";

/**
 * Âm thanh EP5 – mọi mốc là frame TUYỆT ĐỐI. Giọng: mỗi câu một <Html5Audio> cắt từ file gốc bằng trimBefore/trimAfter
 * (= startFrom/endAt), không đổi tốc độ/cao độ. Mức mix giống bản EP1 người dùng đã duyệt: giọng 1.0, SFX ×0.45, nền ×0.56;
 * khi có giọng nền giảm thêm −12 dB, tiếng động −15 dB; trong hold nền/foley chạy đủ.
 */
export const SFX = (n: string) => `kênh tiktok 2/sfx/ep5/${n}.wav`;
const VOICE_GAIN = 1.0;
const FX_GAIN = 0.45;
const BED_GAIN = 0.56;
const DUCK_BED = Math.pow(10, -12 / 20);
const DUCK_FX = Math.pow(10, -15 / 20);

const NEAR = (() => {
  const d = new Float32Array(TOTAL + 1).fill(9999);
  for (const l of LINES) for (let k = Math.max(0, l.from - 12); k < Math.min(TOTAL, l.to + 12); k++) d[k] = Math.min(d[k], k < l.from ? l.from - k : k >= l.to ? k - l.to + 1 : 0);
  return d;
})();
const duck = (abs: number, depth: number) => interpolate(NEAR[Math.max(0, Math.min(TOTAL, Math.round(abs)))], [0, 5], [depth, 1], clamp);

const AMB: Record<Exclude<Amb, "none">, readonly (readonly [string, number])[]> = {
  class: [["amb_class_soft_loop", 0.6], ["amb_room_tone_loop", 0.35]],
  home: [["amb_home_loop", 0.65], ["amb_room_tone_loop", 0.3]],
  yard: [["amb_yard_soft_loop", 0.6], ["amb_room_tone_loop", 0.3]],
  alley: [["amb_alley_loop", 0.65]],
  dinner: [["amb_dinner_loop", 0.65], ["amb_room_tone_loop", 0.3]],
  street: [["amb_street_night_loop", 0.6], ["amb_room_tone_loop", 0.3]],
  er: [["amb_er_loop", 0.65], ["amb_room_tone_loop", 0.3]],
  ward: [["amb_ward_loop", 0.65], ["amb_room_tone_loop", 0.35]],
  rules: [["amb_room_tone_loop", 0.5], ["amb_quiet_loop", 0.25]],
  quiet: [["amb_quiet_loop", 0.55], ["amb_room_tone_loop", 0.35]],
};type Bed = { src: string; from: number; to: number; vol: number };
const buildBeds = (defs: Record<string, ShotDef>): Bed[] => {
  const runs: { amb: Amb; from: number; to: number }[] = [];
  for (const s of SHOTS) {
    const amb = defs[s.id]?.amb ?? "none";
    const last = runs[runs.length - 1];
    if (last && last.amb === amb) last.to = s.to;
    else runs.push({ amb, from: s.from, to: s.to });
  }
  // Cắt mỗi đoạn nền ra quanh các lần dừng (nền tắt trong lúc dừng): một <Audio> vắt qua khoảng âm lượng 0 dài
  // bị Remotion render câm luôn phần sau đó (đã gặp ở 3.4–3.6 và 8.14–8.18).
  const pieces = (from: number, to: number) => {
    const out: { from: number; to: number }[] = [];
    let a = from;
    for (const z of FREEZES) {
      if (z.to <= a || z.from >= to) continue;
      if (z.from + 10 > a) out.push({ from: a, to: z.from + 10 });
      a = Math.max(a, z.to - 2);
    }
    if (to > a) out.push({ from: a, to });
    return out.filter((p) => p.to - p.from > 4);
  };
  return runs
    .filter((r) => r.amb !== "none")
    .flatMap((r) => pieces(Math.max(0, r.from - 6), Math.min(TOTAL, r.to + 10)).flatMap((p) => AMB[r.amb as Exclude<Amb, "none">].map(([src, vol]) => ({ src, ...p, vol }))));
};

export const AudioLayer5: React.FC<{ defs: Record<string, ShotDef> }> = ({ defs }) => {
  const beds = buildBeds(defs);
  const cues: { c: Cue; abs: number }[] = [];
  for (const s of SHOTS) {
    const fx = defs[s.id]?.fx;
    if (!fx) continue;
    const h = { id: s.id, dur: s.to - s.from, from: s.from, L: (l: string) => L(l) - s.from, E: (l: string) => line(l).to - s.from, at: (l: string, w: string, n = 1, e: "start" | "end" = "start") => at(l, w, n, e) - s.from, H: (l: string) => line(l).holdFrom - s.from, HE: (l: string) => line(l).holdTo - s.from };
    for (const c of fx(h)) cues.push({ c, abs: s.from + c.at });
  }
  // Dừng thời gian: vỗ tay + "vút" + "tách" và tích tắc mỗi giây đồng hồ đã gộp sẵn vào freeze_stem.wav
  // (scripts/tiktok2/ep5/bake-freeze-stem.ts, cùng mốc ALL_CLAPS/clockSec) – ~500 <Audio> riêng làm đầy ổ đĩa khi render.
  // Ở đây chỉ còn: ù nhỏ trong lúc dừng; thả: âm thế giới bật lại.
  for (const z of FREEZES) {
    cues.push({ c: { src: "freeze_hum_loop", at: 0, vol: 0.5, dur: z.to - z.from, loop: true, fadeIn: 10, fadeOut: 4 }, abs: z.from });
    if (z !== FREEZES[0]) cues.push({ c: { src: "thaw", at: 0, vol: 0.6 }, abs: z.to - 2 });
  }
  return (
    <>
      {LINES.map((l) => (
        <Sequence key={l.id} name={`🗣 ${l.id} ${l.text.slice(0, 24)}`} from={l.from} durationInFrames={l.to - l.from} layout="none">
          <Html5Audio src={staticFile(VOICE)} trimBefore={l.src[0]} trimAfter={l.src[1]} volume={VOICE_GAIN} />
        </Sequence>
      ))}
      <Sequence name="🔊 freeze_stem (vỗ tay + tích tắc)" from={0} durationInFrames={TOTAL} layout="none">
        <Html5Audio src={staticFile(SFX("freeze_stem"))} volume={(f) => duck(f, DUCK_FX)} />
      </Sequence>
      {beds.map((b, i) => (
        <Sequence key={`bed${i}`} name={`🌫 ${b.src}`} from={b.from} durationInFrames={Math.max(1, b.to - b.from)} layout="none">
          <Html5Audio src={staticFile(SFX(b.src))} loop volume={(f) => (1 - freezeK(b.from + f)) * BED_GAIN * b.vol * duck(b.from + f, DUCK_BED) * interpolate(f, [0, 12], [0, 1], clamp) * interpolate(f, [b.to - b.from - 12, b.to - b.from], [1, 0], clamp)} />
        </Sequence>
      ))}
      {cues
        .filter(({ abs }) => abs >= 0 && abs < TOTAL)
        .map(({ c, abs }, i) => (
          <Sequence key={`fx${i}`} name={`🔊 ${c.src}`} from={Math.round(abs)} durationInFrames={c.dur ?? 150} layout="none">
            <Html5Audio
              src={staticFile(SFX(c.src))}
              loop={c.loop}
              volume={(f) => FX_GAIN * (c.vol ?? 0.7) * duck(abs + f, DUCK_FX) * (c.fadeIn ? interpolate(f, [0, c.fadeIn], [0, 1], clamp) : 1) * (c.fadeOut && c.dur ? interpolate(f, [c.dur - c.fadeOut, c.dur], [1, 0], clamp) : 1)}
            />
          </Sequence>
        ))}
    </>
  );
};
~~~~~

### `src/tiktok2/ep5/Episode.tsx`

~~~~~tsx
import React from "react";
import { AbsoluteFill, interpolate, Sequence, useCurrentFrame } from "remotion";
import { clamp, FONT } from "../ep1/theme";
import { Captions } from "../ep1/ui";
import { AudioLayer5 } from "./audio";
import { ALL_CLAPS, clockSec, DAY_ONLY, daysAt, FREEZES, freezeAt, freezeK } from "./freeze";
import { ClockHUD, FrozenDust, GradeCtx, Ripple, ShotDef } from "./kit";
import { ACT123 } from "./shots/act123";
import { ACT45 } from "./shots/act45";
import { ACT67 } from "./shots/act67";
import { ACT89 } from "./shots/act89";
import { shot, SHOTS, speakingAt, TIMING } from "./time";

/**
 * TikTok 2 · EP5 "Nếu bạn dừng được thời gian 30 giây — nhưng mỗi lần dừng bạn già thêm 1 ngày?" – MỘT composition (Tiktok2Ep5), 16:9 1920×1080, 30 fps.
 * Mọi shot là <Sequence> ở frame TUYỆT ĐỐI lấy từ data/timing.json (sinh từ giọng); dừng thời gian lấy từ freeze.ts.
 */
export const DEFS5: Record<string, ShotDef> = { ...ACT123, ...ACT45, ...ACT67, ...ACT89 };

const ACT = (n: number) => TIMING.acts.find((a) => a.act === n)!;
/** Màu theo hồi: 1–5 sáng · 6 giảm bão hoà dần ~60% (trừ áo cam) · 7 đèn bữa tối ấm chuyển gắt · 8 đêm thành phố đông cứng xanh xám · 9 nắng sớm bệnh viện, bão hoà đầy đủ. */
const grade = (abs: number) => {
  const a6 = ACT(6);
  const a7 = ACT(7);
  const a8 = ACT(8);
  if (abs >= a6.from && abs < a6.to) {
    const s = interpolate(abs, [a6.from, a6.to - 60], [1, 0.6], clamp);
    return { ctx: { set: `saturate(${s})`, side: `saturate(${s})` }, overlay: undefined, filter: undefined };
  }
  if (abs >= a7.from && abs < a7.to) {
    const k = interpolate(abs, [a7.from, a7.to], [0, 1], clamp);
    return { ctx: {}, overlay: `radial-gradient(ellipse at 50% 30%, rgba(255,190,100,${0.2 - 0.1 * k}), rgba(40,20,10,${0.1 + 0.25 * k}))`, filter: `contrast(${1 + 0.15 * k})` };
  }
  if (abs >= a8.from && abs < a8.to) return { ctx: {}, overlay: "linear-gradient(rgba(20,30,60,0.12), rgba(10,15,40,0.2))", filter: undefined };
  if (abs >= ACT(9).from) return { ctx: {}, overlay: undefined, filter: "saturate(1.12) brightness(1.04)" };
  return { ctx: {}, overlay: undefined, filter: "brightness(1.03)" };
};

const Missing: React.FC<{ id: string }> = ({ id }) => (
  <AbsoluteFill style={{ background: "#333", color: "#fff", fontFamily: FONT, fontSize: 80, alignItems: "center", justifyContent: "center" }}>shot {id}</AbsoluteFill>
);
export const ShotView5: React.FC<{ id: string }> = ({ id }) => {
  const C = DEFS5[id]?.C;
  return C ? <C /> : <Missing id={id} />;
};

/** Đồng hồ 30 giây + bộ đếm "+N NGÀY" + gợn sóng + bụi lơ lửng (theo freeze.ts). */
const FreezeLayer: React.FC = () => {
  const abs = useCurrentFrame();
  const z = freezeAt(abs);
  const k = freezeK(abs);
  const lastClap = [...ALL_CLAPS].reverse().find((c) => abs >= c && abs < c + 16);
  const thaw = FREEZES.find((x) => x !== FREEZES[0] && abs >= x.to - 2 && abs < x.to + 14);
  let hud: React.ReactNode = null;
  if (z && z.hud) {
    const { d, pop } = daysAt(z.days, abs);
    const big = z.big ? interpolate(abs, z.big, [0, 1], clamp) : 0;
    hud = <ClockHUD f={abs} sec={clockSec(z, abs)} show={interpolate(abs, [z.from + 4, z.from + 10], [0, 1], clamp)} days={d} dayPop={pop} big={big} />;
  } else {
    const o = DAY_ONLY.find((x) => abs >= x.from && abs < x.to);
    if (o) {
      const { d, pop } = daysAt(o.days, abs);
      hud = <ClockHUD f={abs} days={d} dayPop={pop} />;
    }
  }
  return (
    <>
      <FrozenDust k={k} f={abs} />
      {lastClap !== undefined && <Ripple f={abs} at={lastClap} />}
      {thaw && <Ripple f={abs} at={thaw.to - 2} reverse />}
      {hud}
    </>
  );
};

export const Tiktok2Ep5: React.FC = () => {
  const abs = useCurrentFrame();
  const g = grade(abs);
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <GradeCtx.Provider value={g.ctx}>
        <AbsoluteFill style={{ filter: g.filter }}>
          {SHOTS.map((s) => (
            <Sequence key={s.id} name={`${s.id} · ${s.moc}`} from={s.from} durationInFrames={s.to - s.from}>
              <ShotView5 id={s.id} />
            </Sequence>
          ))}
          {g.overlay && <AbsoluteFill style={{ background: g.overlay, mixBlendMode: "soft-light" }} />}
        </AbsoluteFill>
      </GradeCtx.Provider>
      <FreezeLayer />
      <Captions speaking={speakingAt} yAt={() => 886} size={50} />
      <AudioLayer5 defs={DEFS5} />
    </AbsoluteFill>
  );
};

/** Storyboard duyệt EP5: mỗi frame = một trang 3×4 ảnh shot. */
export const BOARD5_PER = 12;
export const T2E5Board: React.FC<{ pick?: number }> = ({ pick = 0.55 }) => {
  const page = useCurrentFrame();
  const list = SHOTS.slice(page * BOARD5_PER, page * BOARD5_PER + BOARD5_PER);
  return (
    <AbsoluteFill style={{ background: "#1a1820", flexDirection: "row", flexWrap: "wrap", padding: 12, gap: 12, alignContent: "flex-start" }}>
      {list.map((s) => {
        const local = Math.round((s.to - s.from) * pick);
        const g = grade(s.from + local);
        return (
          <div key={s.id} style={{ width: 624, height: 351, position: "relative", overflow: "hidden", borderRadius: 10 }}>
            <div style={{ width: 1920, height: 1080, transform: "scale(0.325)", transformOrigin: "0 0", position: "absolute", filter: g.filter }}>
              <GradeCtx.Provider value={g.ctx}>
                <Sequence from={page - local} layout="none">
                  <ShotView5 id={s.id} />
                </Sequence>
              </GradeCtx.Provider>
              {g.overlay && <AbsoluteFill style={{ background: g.overlay, mixBlendMode: "soft-light" }} />}
              <Sequence from={page - s.from - local} layout="none">
                <FreezeLayer />
              </Sequence>
            </div>
            <div style={{ position: "absolute", left: 6, bottom: 4, color: "#fff", fontFamily: FONT, fontWeight: 800, fontSize: 26, textShadow: "0 2px 4px #000" }}>
              {s.id} · {shot(s.id).start.toFixed(1)}s
            </div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
~~~~~

### `src/tiktok2/ep5/data/timing-overrides.json`

~~~~~json
{
  "_doc": "Chỉnh tay timeline EP5 rồi chạy lại: python3 scripts/tiktok2/ep1/build_timing.py ep5. Đơn vị giây. holds: giữ hình sau câu. gaps: khoảng lặng sau câu. anchors: gắn shot vào câu khác. trim: nới/thu đầu-cuối câu [đầu, cuối]. endCard: độ dài thẻ cuối.",
  "holds": {},
  "gaps": {},
  "anchors": {
    "3.6": "L055",
    "4.1": "L063",
    "5.1": "L080",
    "5.6": "L101",
    "6.9": "L132",
    "7.7": "L150",
    "8.15": "L218"
  },
  "trim": {},
  "endCard": 1.5,
  "maxGap": 0.38,
  "minGap": 0.15
}
~~~~~

### `src/tiktok2/ep5/data/shotlist.json`

~~~~~json
{
 "_doc": "Danh sách shot EP5. moc = vài chữ đầu câu (so khớp gần đúng, theo thứ tự). hold = giây giữ hình sau câu cuối của shot. lineHolds = giữ sau một câu cụ thể. fast = cắt dồn dập.",
 "shots": [
  {
   "id": "1.1",
   "act": 1,
   "moc": "Nếu bạn dừng được thời gian",
   "hold": 0.6
  },
  {
   "id": "2.1",
   "act": 2,
   "moc": "Tiết Toán",
   "hold": 0.2
  },
  {
   "id": "2.2",
   "act": 2,
   "moc": "Bạn đứng trước bảng",
   "hold": 0.3
  },
  {
   "id": "2.3",
   "act": 2,
   "moc": "Cả lớp nhìn",
   "hold": 0.3
  },
  {
   "id": "2.4",
   "act": 2,
   "moc": "Bạn vỗ tay một cái",
   "hold": 1.0
  },
  {
   "id": "2.5",
   "act": 2,
   "moc": "Cô giáo khựng giữa cái chớp mắt",
   "hold": 0.4
  },
  {
   "id": "2.6",
   "act": 2,
   "moc": "Ở góc mắt bạn",
   "hold": 0.3
  },
  {
   "id": "2.7",
   "act": 2,
   "moc": "Bạn chạy xuống bàn Vy",
   "hold": 0.2
  },
  {
   "id": "2.8",
   "act": 2,
   "moc": "Ba",
   "hold": 0.3
  },
  {
   "id": "2.9",
   "act": 2,
   "moc": "Bạn viết đáp án",
   "hold": 0.2
  },
  {
   "id": "2.10",
   "act": 2,
   "moc": "Cô nhìn bảng",
   "hold": 0.3
  },
  {
   "id": "2.11",
   "act": 2,
   "moc": "Đúng",
   "hold": 1.1
  },
  {
   "id": "3.1",
   "act": 3,
   "moc": "Luật thế này"
  },
  {
   "id": "3.2",
   "act": 3,
   "moc": "Vỗ tay một cái",
   "hold": 0.3
  },
  {
   "id": "3.3",
   "act": 3,
   "moc": "Chỉ mình bạn cử động",
   "hold": 0.4
  },
  {
   "id": "3.4",
   "act": 3,
   "moc": "Nhưng mỗi lần dừng",
   "hold": 0.3
  },
  {
   "id": "3.5",
   "act": 3,
   "moc": "Và ngày đã mất",
   "hold": 0.5
  },
  {
   "id": "3.6",
   "act": 3,
   "moc": "trong một ngày tim bạn đập",
   "hold": 0.4
  },
  {
   "id": "3.7",
   "act": 3,
   "moc": "Ông nội bạn thì có một thói quen",
   "hold": 0.3
  },
  {
   "id": "3.8",
   "act": 3,
   "moc": "Thêm một ngày lời",
   "hold": 0.8
  },
  {
   "id": "4.1",
   "act": 4,
   "moc": "Ba mươi giây ngắn lắm",
   "hold": 0.2
  },
  {
   "id": "4.2",
   "act": 4,
   "moc": "Đủ để chép một câu trả lời",
   "hold": 0.3
  },
  {
   "id": "4.3",
   "act": 4,
   "moc": "Đủ để đi từ bàn này",
   "hold": 0.5
  },
  {
   "id": "4.4",
   "act": 4,
   "moc": "Giờ ra chơi Vy hỏi bạn mượn",
   "hold": 1.0
  },
  {
   "id": "4.5",
   "act": 4,
   "moc": "Nè",
   "hold": 0.5
  },
  {
   "id": "4.6",
   "act": 4,
   "moc": "Bạn già thêm mười ngày",
   "hold": 0.6
  },
  {
   "id": "5.1",
   "act": 5,
   "moc": "Mẹ làm rơi rổ trứng",
   "fast": true,
   "hold": 0.2
  },
  {
   "id": "5.2",
   "act": 5,
   "moc": "Mẹ chớp mắt",
   "fast": true,
   "hold": 0.5
  },
  {
   "id": "5.3",
   "act": 5,
   "moc": "Đá bóng sân xóm",
   "fast": true,
   "hold": 1.1
  },
  {
   "id": "5.4",
   "act": 5,
   "moc": "Bạn chụp ảnh cả hẻm",
   "fast": true,
   "hold": 0.4
  },
  {
   "id": "5.5",
   "act": 5,
   "moc": "Một tháng",
   "fast": true,
   "hold": 0.3
  },
  {
   "id": "5.6",
   "act": 5,
   "moc": "tóc người mọc khoảng",
   "hold": 0.4
  },
  {
   "id": "5.7",
   "act": 5,
   "moc": "Tóc bạn thì mọc nhanh hơn",
   "hold": 0.4
  },
  {
   "id": "5.8",
   "act": 5,
   "moc": "Ông nội nhìn bạn",
   "hold": 0.8
  },
  {
   "id": "6.1",
   "act": 6,
   "moc": "Nhưng có một cái giá"
  },
  {
   "id": "6.2",
   "act": 6,
   "moc": "Bạn bắt đầu đếm",
   "hold": 0.2
  },
  {
   "id": "6.3",
   "act": 6,
   "moc": "Bốn tháng",
   "hold": 0.4
  },
  {
   "id": "6.4",
   "act": 6,
   "moc": "Không ai biết",
   "hold": 0.3
  },
  {
   "id": "6.5",
   "act": 6,
   "moc": "Bạn nhìn ông nội xé tờ lịch",
   "hold": 0.3
  },
  {
   "id": "6.6",
   "act": 6,
   "moc": "Còn bạn",
   "hold": 1.3
  },
  {
   "id": "6.7",
   "act": 6,
   "moc": "Vậy là có một luật",
   "hold": 0.6
  },
  {
   "id": "6.8",
   "act": 6,
   "moc": "Ly nước rơi",
   "hold": 0.4
  },
  {
   "id": "6.9",
   "act": 6,
   "moc": "Con biết sao ông vui",
   "hold": 1.6
  },
  {
   "id": "7.1",
   "act": 7,
   "moc": "Tối thứ Sáu",
   "hold": 0.3
  },
  {
   "id": "7.2",
   "act": 7,
   "moc": "Ông nội đưa chén lên",
   "hold": 0.3
  },
  {
   "id": "7.3",
   "act": 7,
   "moc": "Cái chén rơi xuống mâm",
   "hold": 0.4
  },
  {
   "id": "7.4",
   "act": 7,
   "moc": "Ba"
  },
  {
   "id": "7.5",
   "act": 7,
   "moc": "Ba gọi một một lăm",
   "hold": 0.2
  },
  {
   "id": "7.6",
   "act": 7,
   "moc": "Kẹt xe hả",
   "hold": 0.4
  },
  {
   "id": "7.7",
   "act": 7,
   "moc": "với đột quỵ mỗi phút",
   "hold": 0.4
  },
  {
   "id": "7.8",
   "act": 7,
   "moc": "Bệnh viện cách nhà bạn hai cây số",
   "hold": 1.3
  },
  {
   "id": "7.9",
   "act": 7,
   "moc": "Bạn nhìn ông",
   "hold": 0.4
  },
  {
   "id": "7.10",
   "act": 7,
   "moc": "Bạn vỗ tay",
   "hold": 0.4
  },
  {
   "id": "8.1",
   "act": 8,
   "moc": "Cả nhà đứng hình",
   "hold": 0.3
  },
  {
   "id": "8.2",
   "act": 8,
   "moc": "Bạn kéo cái xe lăn",
   "hold": 0.3
  },
  {
   "id": "8.3",
   "act": 8,
   "moc": "Bạn đẩy ông ra cửa"
  },
  {
   "id": "8.4",
   "act": 8,
   "moc": "Hai mươi giây",
   "fast": true
  },
  {
   "id": "8.5",
   "act": 8,
   "moc": "Vỗ tay",
   "fast": true
  },
  {
   "id": "8.6",
   "act": 8,
   "moc": "Bạn đẩy tiếp",
   "fast": true
  },
  {
   "id": "8.7",
   "act": 8,
   "moc": "Ra đường lớn",
   "fast": true
  },
  {
   "id": "8.8",
   "act": 8,
   "moc": "Vỗ tay",
   "fast": true
  },
  {
   "id": "8.9",
   "act": 8,
   "moc": "Chân bạn bắt đầu run",
   "fast": true
  },
  {
   "id": "8.10",
   "act": 8,
   "moc": "Bốn mươi ngày",
   "fast": true
  },
  {
   "id": "8.11",
   "act": 8,
   "moc": "Bạn thấy biển hiệu đỏ",
   "hold": 0.3
  },
  {
   "id": "8.12",
   "act": 8,
   "moc": "Sáu mươi ngày",
   "hold": 0.2
  },
  {
   "id": "8.13",
   "act": 8,
   "moc": "Bạn vỗ tay lần cuối",
   "hold": 0.3
  },
  {
   "id": "8.14",
   "act": 8,
   "moc": "Bác sĩ giật mình",
   "hold": 1.3
  },
  {
   "id": "8.15",
   "act": 8,
   "moc": "Đột quỵ Kíp cấp cứu",
   "hold": 0.3
  },
  {
   "id": "8.16",
   "act": 8,
   "moc": "Cánh cửa phòng cấp cứu",
   "hold": 0.6
  },
  {
   "id": "8.17",
   "act": 8,
   "moc": "Bạn ngồi bệt xuống sàn",
   "hold": 1.6
  },
  {
   "id": "8.18",
   "act": 8,
   "moc": "Tính từ lúc chén cơm rơi",
   "hold": 1.2
  },
  {
   "id": "9.1",
   "act": 9,
   "moc": "Hai tuần sau",
   "hold": 0.3
  },
  {
   "id": "9.2",
   "act": 9,
   "moc": "Bác sĩ nói ông tới kịp",
   "hold": 0.4
  },
  {
   "id": "9.3",
   "act": 9,
   "moc": "Ba vẫn không hiểu",
   "hold": 0.2
  },
  {
   "id": "9.4",
   "act": 9,
   "moc": "Con đẩy ông đi",
   "hold": 0.6
  },
  {
   "id": "9.5",
   "act": 9,
   "moc": "Ông nhìn bạn",
   "hold": 0.8
  },
  {
   "id": "9.6",
   "act": 9,
   "moc": "Rồi ông xoa đầu bạn",
   "hold": 1.6
  },
  {
   "id": "9.7",
   "act": 9,
   "moc": "Trên tường phòng bệnh",
   "hold": 0.4
  },
  {
   "id": "9.8",
   "act": 9,
   "moc": "Sáng hôm đó ông chỉ tay",
   "hold": 0.5
  },
  {
   "id": "9.9",
   "act": 9,
   "moc": "Thêm một ngày lời",
   "hold": 1.6
  },
  {
   "id": "9.10",
   "act": 9,
   "moc": "Bạn đã cho đi sáu mươi ba ngày",
   "hold": 0.9
  },
  {
   "id": "9.11",
   "act": 9,
   "moc": "Có những ngày không phải để giữ",
   "hold": 1.3
  },
  {
   "id": "9.12",
   "act": 9,
   "moc": "Còn bạn"
  }
 ]
}
~~~~~

### Session-scratch analysis scripts (run from the scratch folder; not yet in the repo)

#### `hiss.py`

~~~~~python
import array, math, sys, wave, json
w=wave.open(sys.argv[1]); sr=w.getframerate(); a=array.array("h",w.readframes(w.getnframes()))
def bp(lo,hi):
    f0=math.sqrt(lo*hi); q=f0/(hi-lo); ww=2*math.pi*f0/sr; al=math.sin(ww)/(2*q); c=math.cos(ww)
    return al,-al,1+al,-2*c,1-al
b0,b2,a0,a1,a2=bp(4000,9000); x1=x2=y1=y2=0.0
hop=sr//10; e=[]; acc=0.0
for i,s in enumerate(a):
    x=s/32768; y=(b0*x+b2*x2-a1*y1-a2*y2)/a0; x2,x1,y2,y1=x1,x,y1,y; acc+=y*y
    if (i+1)%hop==0: e.append(10*math.log10(acc/hop+1e-12)); acc=0
t=json.load(open(sys.argv[2])); spk=set()
for l in t["lines"]:
    for k in range(int(l["start"]*10)-1,int(l["end"]*10)+2): spk.add(k)
sid=lambda s: next(x["id"] for x in t["shots"] if x["start"]<=s<x["end"]+0.01)
rows=[(e[k],k/10) for k in range(len(e)) if k not in spk]
rows.sort(reverse=True)
seen=set(); out=[]
for v,s in rows:
    key=round(s)
    if key in seen: continue
    seen.add(key); out.append((v,s))
    if len(out)>=25: break
for v,s in sorted(out,key=lambda r:r[1]): print(f"{int(s//60)}:{s%60:05.2f}  shot {sid(s):5s}  dải 4–9 kHz {v:6.1f} dB")
import statistics
q=[v for v,_ in rows]; print("trung vị (không giọng):",round(statistics.median(q),1),"dB")
~~~~~

#### `hiss_mid.py`

~~~~~python
import array, math, sys, wave, json
w=wave.open(sys.argv[1]); sr=w.getframerate(); a=array.array("h",w.readframes(w.getnframes()))
def bp(lo,hi):
    f0=math.sqrt(lo*hi); q=f0/(hi-lo); ww=2*math.pi*f0/sr; al=math.sin(ww)/(2*q); c=math.cos(ww)
    return al,-al,1+al,-2*c,1-al
b0,b2,a0,a1,a2=bp(1200,4000); x1=x2=y1=y2=0.0
hop=sr//10; e=[]; acc=0.0
for i,s in enumerate(a):
    x=s/32768; y=(b0*x+b2*x2-a1*y1-a2*y2)/a0; x2,x1,y2,y1=x1,x,y1,y; acc+=y*y
    if (i+1)%hop==0: e.append(10*math.log10(acc/hop+1e-12)); acc=0
t=json.load(open(sys.argv[2])); spk=set()
for l in t["lines"]:
    for k in range(int(l["start"]*10)-1,int(l["end"]*10)+2): spk.add(k)
sid=lambda s: next(x["id"] for x in t["shots"] if x["start"]<=s<x["end"]+0.01)
rows=[(e[k],k/10) for k in range(len(e)) if k not in spk]
rows.sort(reverse=True)
seen=set(); out=[]
for v,s in rows:
    key=round(s)
    if key in seen: continue
    seen.add(key); out.append((v,s))
    if len(out)>=25: break
for v,s in sorted(out,key=lambda r:r[1]): print(f"{int(s//60)}:{s%60:05.2f}  shot {sid(s):5s}  dải 1,2–4 kHz {v:6.1f} dB")
import statistics
q=[v for v,_ in rows]; print("trung vị (không giọng):",round(statistics.median(q),1),"dB")
~~~~~

#### `hf.py`

~~~~~python
import array, math, sys, wave, json
def bp(lo, hi, sr):
    # biquad bandpass center/Q from lo..hi
    f0 = math.sqrt(lo*hi); q = f0/(hi-lo); w = 2*math.pi*f0/sr; al = math.sin(w)/(2*q); c = math.cos(w)
    b0, b1, b2, a0, a1, a2 = al, 0, -al, 1+al, -2*c, 1-al
    return [b0/a0, b1/a0, b2/a0, a1/a0, a2/a0]
for ep in ["ep1", "ep2"]:
    w = wave.open(sys.argv[1] + f"/hf_{ep}.wav"); sr = w.getframerate()
    a = array.array("h", w.readframes(w.getnframes()))
    b0, b1, b2, a1, a2 = bp(3500, 7500, sr)
    x1 = x2 = y1 = y2 = 0.0
    hop = sr // 2; acc = 0.0; tot = 0.0; out = []
    for i, s in enumerate(a):
        x = s / 32768
        y = b0*x + b1*x1 + b2*x2 - a1*y1 - a2*y2
        x2, x1, y2, y1 = x1, x, y1, y
        acc += y*y; tot += x*x
        if (i+1) % hop == 0:
            out.append((i/sr, 10*math.log10(acc/hop+1e-12), 10*math.log10(tot/hop+1e-12))); acc = tot = 0
    t = json.load(open(f"src/tiktok2/{ep}/data/timing.json"))
    loud = [(s, h, b) for s, h, b in out if h > -42]
    print(ep, "cửa sổ 0,5 s có dải cao > −42 dB:", len(loud))
    shots = t["shots"]
    agg = {}
    for s, h, b in loud:
        sid = next(x["id"] for x in shots if x["start"] <= s < x["end"] + 0.01)
        agg.setdefault(sid, []).append(h)
    for sid, hs in sorted(agg.items(), key=lambda kv: -max(kv[1]))[:15]:
        print(f"  shot {sid}: {len(hs)} cửa sổ, đỉnh dải cao {max(hs):.1f} dB")
~~~~~

#### `hf2.py`

~~~~~python
import array, math, sys, wave, json
def filt(a, sr, lo, hi):
    f0 = math.sqrt(lo*hi); q = f0/(hi-lo); w = 2*math.pi*f0/sr; al = math.sin(w)/(2*q); c = math.cos(w)
    b0, b2, a0, a1, a2 = al, -al, 1+al, -2*c, 1-al
    x1=x2=y1=y2=0.0; out=array.array("f")
    for s in a:
        x=s/32768; y=(b0*x+b2*x2-a1*y1-a2*y2)/a0; x2,x1,y2,y1=x1,x,y1,y; out.append(y)
    return out
for ep in ["ep1","ep2"]:
    w=wave.open(f"{sys.argv[1]}/hf_{ep}.wav"); sr=w.getframerate(); a=array.array("h",w.readframes(w.getnframes()))
    hf=filt(a,sr,3500,7500)
    t=json.load(open(f"src/tiktok2/{ep}/data/timing.json"))
    speak=bytearray(len(a)//(sr//10)+2)
    for l in t["lines"]:
        for k in range(int(l["start"]*10)-1,int(l["end"]*10)+2):
            if 0<=k<len(speak): speak[k]=1
    hop=sr//10; res={}
    for k in range(len(a)//hop):
        if speak[k]: continue
        seg=hf[k*hop:(k+1)*hop]; full=a[k*hop:(k+1)*hop]
        h=10*math.log10(sum(v*v for v in seg)/hop+1e-12); b=10*math.log10(sum((v/32768)**2 for v in full)/hop+1e-12)
        s=k/10; sid=next(x["id"] for x in t["shots"] if x["start"]<=s<x["end"]+0.01)
        res.setdefault(sid,[]).append((h,b))
    rows=sorted(((sid,max(h for h,_ in v),sum(h for h,_ in v)/len(v),max(b for _,b in v)) for sid,v in res.items()),key=lambda r:-r[2])
    print(ep,"– shot có dải cao lớn nhất khi KHÔNG có giọng (TB dB, đỉnh dB, toàn dải đỉnh dB):")
    for sid,mx,av,bmax in rows[:10]: print(f"  {sid:5s} TB {av:6.1f}  đỉnh {mx:6.1f}  toàn dải {bmax:6.1f}")
~~~~~

#### `noisy.py`

~~~~~python
# Xếp hạng file SFX/ambience theo "độ xè" = năng lượng dải 2–8 kHz dạng nhiễu (không có cao độ), để tìm nguồn tiếng xè xè.
import array, glob, math, os, sys, wave
def band(a, sr, lo, hi):
    f0 = math.sqrt(lo*hi); q = f0/(hi-lo); w = 2*math.pi*f0/sr; al = math.sin(w)/(2*q); c = math.cos(w)
    b0, b2, a0, a1, a2 = al, -al, 1+al, -2*c, 1-al; x1=x2=y1=y2=0.0; e=0.0
    for s in a:
        x=s/32768; y=(b0*x+b2*x2-a1*y1-a2*y2)/a0; x2,x1,y2,y1=x1,x,y1,y; e+=y*y
    return e/len(a)
rows=[]
for p in sorted(glob.glob(sys.argv[1]+"/*_loop.wav")):
    w=wave.open(p); a=array.array("h",w.readframes(min(w.getnframes(), w.getframerate()*3)))
    tot=sum((s/32768)**2 for s in a)/len(a); hf=band(a,w.getframerate(),2000,8000)
    rows.append((10*math.log10(hf/tot+1e-12), 10*math.log10(hf+1e-12), os.path.basename(p)))
for r in sorted(rows, reverse=True)[:10]: print(f"  {r[2]:34s} tỉ lệ dải cao {r[0]:6.1f} dB · mức dải cao {r[1]:6.1f} dB")
~~~~~


---

## Appendix D — Every render / ffmpeg / pipeline command run in the session (verbatim)

The format is `timestamp (UTC) · result · description`, followed by the exact shell command. `S` and paths under `/private/tmp/claude-501/...` are the session scratch folder. Commands that only patched source code are omitted (their result is the final source in Appendix C / the repository).

140 commands.

**D1** `2026-10-24T05:57:13Z` · ok · Inspect voice files, whisper models, ep6 scripts

~~~~~bash
cd /Users/thanhphu/my-video; ls -la "public/kênh tiktok 2/Voice/ep1"; ls -la whisper.cpp/models/*.bin 2>/dev/null; ls whisper.cpp/build/bin 2>/dev/null | head; ls whisper.cpp/main whisper.cpp/whisper-cli 2>/dev/null; cat scripts/ep6/transcribe.mjs; cat scripts/ep6/generate-sfx.mjs | head -150
~~~~~

**D2** `2026-10-24T05:57:21Z` · ok · Check whisper models, sfx-lib, SRT, audio info

~~~~~bash
cd /Users/thanhphu/my-video; ls -la whisper.cpp/*.bin whisper.cpp/*.wav 2>/dev/null; cat scripts/sfx-lib.mjs | head -80; head -60 "public/kênh tiktok 2/Voice/ep1/ep1 tiktok2.srt"; grep -c -- "-->" "public/kênh tiktok 2/Voice/ep1/ep1 tiktok2.srt"; DYLD_LIBRARY_PATH=node_modules/@remotion/compositor-darwin-arm64 node_modules/@remotion/compositor-darwin-arm64/ffprobe -hide_banner "public/kênh tiktok 2/Voice/ep1/ep1 tiktok2.mp3" 2>&1 | tail -3
~~~~~

**D3** `2026-10-24T06:01:27Z` · ok · See whisper install/transcribe scripts

~~~~~bash
cd /Users/thanhphu/my-video; cat scripts/tap4/install-whisper.mjs; cat scripts/tap4/transcribe.mjs | head -30
~~~~~

**D4** `2026-10-24T06:01:38Z` · ok · background · Write transcribe script and run whisper

~~~~~bash
cd /Users/thanhphu/my-video; mkdir -p scripts/tiktok2/ep1 src/tiktok2/ep1/data "out/tiktok 2" "public/kênh tiktok 2/sfx/ep1"
cat > scripts/tiktok2/ep1/transcribe.mjs <<'EOF'
// TikTok 2 · EP1 – phiên âm giọng bằng whisper.cpp (cài qua @remotion/install-whisper-cpp 1.7.1, ./whisper.cpp).
// Model large-v3-turbo (bản large-v3 rút gọn, có sẵn), tiếng Việt, mỗi đoạn một từ (-ml 1 -sow), JSON mốc token (-ojf).
// Vào: public/kênh tiktok 2/Voice/ep1/ep1 tiktok2.mp3 → whisper.cpp/tiktok2-ep1-16k.wav · Ra: whisper.cpp/tiktok2-ep1-transcript.json
import { spawnSync } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const w = path.join(root, "whisper.cpp");
const ff = path.join(root, "node_modules/@remotion/compositor-darwin-arm64/ffmpeg");
const env = { ...process.env, DYLD_LIBRARY_PATH: path.join(root, "node_modules/@remotion/compositor-darwin-arm64") };
const src = path.join(root, "public/kênh tiktok 2/Voice/ep1/ep1 tiktok2.mp3");
const wav = path.join(w, "tiktok2-ep1-16k.wav");
let r = spawnSync(ff, ["-y", "-v", "error", "-i", src, "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", wav], { stdio: "inherit", env });
if (r.status !== 0) process.exit(r.status ?? 1);
r = spawnSync(path.join(w, "main"), ["-m", path.join(w, "ggml-large-v3-turbo.bin"), "-f", wav, "-l", "vi", "-ojf", "-of", path.join(w, "tiktok2-ep1-transcript"), "-ml", "1", "-sow", "-t", "8", "-np"], { stdio: ["ignore", "inherit", "inherit"] });
if (r.status !== 0) process.exit(r.status ?? 1);
console.log("OK → whisper.cpp/tiktok2-ep1-transcript.json");
EOF
node scripts/tiktok2/ep1/transcribe.mjs > "/private/tmp/claude-501/-Users-thanhphu-my-video/f0388be0-3a67-4763-a32e-a8c763508214/scratchpad/whisper.log" 2>&1
~~~~~

**D5** `2026-10-24T06:05:36Z` · ok · Check transcript and generate SFX

~~~~~bash
cd /Users/thanhphu/my-video; tail -3 "/private/tmp/claude-501/-Users-thanhphu-my-video/f0388be0-3a67-4763-a32e-a8c763508214/scratchpad/whisper.log"; python3 -c "
import json;d=json.load(open('whisper.cpp/tiktok2-ep1-transcript.json'))
tr=d['transcription'];print(len(tr));
for s in tr[:12]: print(s['offsets'],repr(s['text']))
"; time node scripts/tiktok2/ep1/generate-sfx.mjs 2>&1 | tail -5
~~~~~

**D6** `2026-10-24T06:06:26Z` · ok · Write shotlist and overrides JSON

~~~~~bash
cd /Users/thanhphu/my-video; cat > src/tiktok2/ep1/data/shotlist.json <<'EOF'
{
  "_doc": "Danh sách shot EP1. moc = vài chữ đầu câu (so khớp gần đúng với SRT/transcript, theo thứ tự). hold = giây giữ hình sau câu cuối của shot. lineHolds = giữ hình sau một câu cụ thể trong shot. fast = cắt dồn dập (khoảng lặng giữa câu 0,15 s).",
  "shots": [
    { "id": "1.1", "act": 1, "moc": "Nếu bạn tàng hình được", "hold": 0.5, "lineHolds": { "L001": 0.35 } },
    { "id": "2.1", "act": 2, "moc": "Mẹ cầm bài kiểm tra" },
    { "id": "2.2", "act": 2, "moc": "Lại", "hold": 0.2 },
    { "id": "2.3", "act": 2, "moc": "Bạn sợ", "hold": 0.3 },
    { "id": "2.4", "act": 2, "moc": "Mẹ ngẩng lên" },
    { "id": "2.5", "act": 2, "moc": "Mười giây" },
    { "id": "2.6", "act": 2, "moc": "Hai mươi giây", "hold": 1.1 },
    { "id": "2.7", "act": 2, "moc": "Ba mươi giây", "hold": 0.3 },
    { "id": "2.8", "act": 2, "moc": "Bốn mươi giây", "hold": 0.4 },
    { "id": "2.9", "act": 2, "moc": "Bạn thở ra", "lineHolds": { "L027": 0.3 } },
    { "id": "2.10", "act": 2, "moc": "Á", "hold": 0.45 },
    { "id": "2.11", "act": 2, "moc": "Mẹ không đánh bạn", "hold": 1.7 },
    { "id": "3.1", "act": 3, "moc": "Luật thế này" },
    { "id": "3.2", "act": 3, "moc": "Nín thở là bạn biến mất", "hold": 0.3 },
    { "id": "3.3", "act": 3, "moc": "Thở ra một cái", "hold": 0.3 },
    { "id": "3.4", "act": 3, "moc": "Khi tàng hình bạn không thể nói", "hold": 0.6, "lineHolds": { "L041": 0.0 } },
    { "id": "3.5", "act": 3, "moc": "người bình thường nín thở", "hold": 0.3 },
    { "id": "3.6", "act": 3, "moc": "cảm giác muốn thở", "hold": 0.3 },
    { "id": "3.7", "act": 3, "moc": "có hạn sử dụng", "hold": 0.6 },
    { "id": "4.1", "act": 4, "moc": "Cười là thở ra", "hold": 0.2, "lineHolds": { "L052": 0.6 } },
    { "id": "4.2", "act": 4, "moc": "Bạn hiện ra", "hold": 0.8 },
    { "id": "4.3", "act": 4, "moc": "Hắt xì", "fast": true },
    { "id": "4.4", "act": 4, "moc": "nấc cục", "hold": 1.2 },
    { "id": "4.5", "act": 4, "moc": "Chỉ có một người", "hold": 0.4 },
    { "id": "4.6", "act": 4, "moc": "Chơi trốn tìm", "hold": 0.4 },
    { "id": "4.7", "act": 4, "moc": "Em đâu có thấy", "hold": 1.0 },
    { "id": "5.1", "act": 5, "moc": "Ngày rằm", "hold": 0.3 },
    { "id": "5.2", "act": 5, "moc": "Bạn ăn một cái bánh bò", "hold": 0.4, "lineHolds": { "L083": 0.5 } },
    { "id": "5.3", "act": 5, "moc": "Mẹ thắp thêm", "hold": 0.6 },
    { "id": "5.4", "act": 5, "moc": "Bạn lẻn vào phòng giáo viên" },
    { "id": "5.5", "act": 5, "moc": "Câu ba dài quá", "hold": 0.3, "lineHolds": { "L094": 1.2 } },
    { "id": "5.6", "act": 5, "moc": "Thầy hiệu trưởng", "hold": 1.4, "lineHolds": { "L097": 0.6 } },
    { "id": "5.7", "act": 5, "moc": "Nên bạn tập", "fast": true, "hold": 0.2 },
    { "id": "5.8", "act": 5, "moc": "phản xạ lặn", "hold": 0.5 },
    { "id": "5.9", "act": 5, "moc": "Mẹ tưởng", "hold": 0.9 },
    { "id": "5.10", "act": 5, "moc": "Kỷ lục thế giới", "hold": 0.6 },
    { "id": "6.1", "act": 6, "moc": "trường bạn bắt đầu có lời đồn", "fast": true },
    { "id": "6.2", "act": 6, "moc": "Hai triệu lượt xem", "hold": 0.7 },
    { "id": "6.3", "act": 6, "moc": "Một nhóm săn ma", "hold": 1.2 },
    { "id": "6.4", "act": 6, "moc": "Họ kết luận", "hold": 1.0 },
    { "id": "7.1", "act": 7, "moc": "Nhưng có một cái giá", "hold": 0.4 },
    { "id": "7.2", "act": 7, "moc": "Giờ ra chơi" },
    { "id": "7.3", "act": 7, "moc": "Có rủ nó không", "hold": 0.4 },
    { "id": "7.4", "act": 7, "moc": "Bạn thở ra", "hold": 1.2 },
    { "id": "7.5", "act": 7, "moc": "Vậy là có một luật", "hold": 1.0 },
    { "id": "7.6", "act": 7, "moc": "Bạn ăn trưa một mình", "hold": 0.4 },
    { "id": "7.7", "act": 7, "moc": "Kể cả khi bạn đang thở", "hold": 0.6 },
    { "id": "7.8", "act": 7, "moc": "Cô điểm danh", "hold": 0.6 },
    { "id": "7.9", "act": 7, "moc": "Sinh nhật bạn", "hold": 1.2 },
    { "id": "7.10", "act": 7, "moc": "Chỉ có Bin", "hold": 1.4 },
    { "id": "8.1", "act": 8, "moc": "Rằm tháng Tám", "hold": 0.8 },
    { "id": "8.2", "act": 8, "moc": "Bạn dắt Bin", "hold": 0.2 },
    { "id": "8.3", "act": 8, "moc": "đám đông xô" },
    { "id": "8.4", "act": 8, "moc": "Tay bạn trống không", "hold": 0.8 },
    { "id": "8.5", "act": 8, "moc": "Bạn quay lại", "hold": 0.3 },
    { "id": "8.6", "act": 8, "moc": "Không ai để ý", "hold": 0.8 },
    { "id": "8.7", "act": 8, "moc": "Bạn hít một hơi", "fast": true },
    { "id": "8.8", "act": 8, "moc": "Bạn chụp được tay Bin", "fast": true },
    { "id": "8.9", "act": 8, "moc": "Một chiếc xe máy", "fast": true },
    { "id": "8.10", "act": 8, "moc": "Hai phút", "fast": true, "hold": 0.3 },
    { "id": "8.11", "act": 8, "moc": "Bạn có thể tiếp tục bám theo", "hold": 0.3 },
    { "id": "8.12", "act": 8, "moc": "Bạn phải hiện ra", "hold": 1.0 },
    { "id": "8.13", "act": 8, "moc": "BẮT CÓC", "hold": 0.4 },
    { "id": "8.14", "act": 8, "moc": "tất cả mọi người đều nhìn bạn", "hold": 1.5 },
    { "id": "8.15", "act": 8, "moc": "Tiếng trống lân dừng", "hold": 0.7 },
    { "id": "8.16", "act": 8, "moc": "Chú bán đèn kéo quân", "hold": 0.3 },
    { "id": "8.17", "act": 8, "moc": "công an phường", "hold": 0.4 },
    { "id": "8.18", "act": 8, "moc": "Bin chạy về phía bạn", "hold": 0.8, "lineHolds": { "L222": 0.4 } },
    { "id": "8.19", "act": 8, "moc": "Bạn ngồi bệt", "hold": 2.0 },
    { "id": "9.1", "act": 9, "moc": "Thứ Hai" },
    { "id": "9.2", "act": 9, "moc": "Dạ có", "hold": 0.6 },
    { "id": "9.3", "act": 9, "moc": "Tàng hình thì dễ", "hold": 0.6 },
    { "id": "9.4", "act": 9, "moc": "Đĩa bánh bò", "hold": 0.8 },
    { "id": "9.5", "act": 9, "moc": "Tối đó Bin trèo lên giường", "hold": 0.8 },
    { "id": "9.6", "act": 9, "moc": "Bin ngủ", "hold": 2.0 },
    { "id": "9.7", "act": 9, "moc": "Còn bạn", "hold": 0.0 }
  ]
}
EOF
cat > src/tiktok2/ep1/data/timing-overrides.json <<'EOF'
{
  "_doc": "Chỉnh tay timeline EP1 rồi chạy lại: python3 scripts/tiktok2/ep1/build_timing.py. Đơn vị giây. holds: giữ hình sau câu (ghi đè shotlist). gaps: khoảng lặng tối thiểu sau câu (thay mặc định). anchors: gắn shot vào câu khác (vd \"9.4\": \"L246\"). trim: nới/thu đầu-cuối câu trong file giọng [đầu, cuối] (âm = sớm hơn). endCard: độ dài thẻ cuối.",
  "holds": {},
  "gaps": {},
  "anchors": { "9.4": "L246" },
  "trim": {},
  "endCard": 1.5,
  "maxGap": 0.38,
  "minGap": 0.15
}
EOF
~~~~~

**D7** `2026-10-24T06:07:40Z` · ok · Run timing build and inspect

~~~~~bash
cd /Users/thanhphu/my-video; time python3 scripts/tiktok2/ep1/build_timing.py && python3 -c "
import json;t=json.load(open('src/tiktok2/ep1/data/timing.json'))
for l in t['lines'][:30]: print(l['id'],l['src'],l['from'],l['to'],l['gap'],l['hold'],l['text'][:40], [w[0]+'@'+str(w[2]) for w in l['words']][:6])
for s in t['shots']: print(s['id'],s['firstLine'],s['lastLine'],s['start'],s['end'], round(s['end']-s['start'],2))
"
~~~~~

**D8** `2026-10-24T06:07:54Z` · ok · Check cut points land in silence

~~~~~bash
cd /Users/thanhphu/my-video; cat > scripts/tiktok2/ep1/check_cuts.py <<'EOF'
#!/usr/bin/env python3
"""Kiểm tra điểm cắt câu EP1: mức âm (dB) quanh trimBefore/trimAfter trong file giọng gốc phải là lặng (không lẹm chữ)."""
import json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from build_timing import envelope, P, FPS
t = json.load(open(P("src/tiktok2/ep1/data/timing.json"), encoding="utf-8"))
db = envelope(P("whisper.cpp", "tiktok2-ep1-16k.wav"))
floor = sorted(db)[int(len(db) * 0.12)]
bad = 0
for l in t["lines"]:
    a, b = l["src"]
    ka, kb = int(a / FPS * 100), int(b / FPS * 100)
    ea = max(db[max(0, ka - 2):ka + 2]); eb = max(db[max(0, kb - 2):kb + 2])
    if ea > floor + 20 or eb > floor + 20:
        bad += 1
        print(f"{l['id']} đầu {ea - floor:+.1f} dB · cuối {eb - floor:+.1f} dB (so với nền) · {l['text']}")
print(f"{len(t['lines'])} câu · {bad} điểm cắt có tiếng (> nền +20 dB)")
EOF
python3 scripts/tiktok2/ep1/check_cuts.py
~~~~~

**D9** `2026-10-24T06:08:05Z` · ok · Inspect silence runs in problem regions

~~~~~bash
cd /Users/thanhphu/my-video; python3 -c "
import sys;sys.path.insert(0,'scripts/tiktok2/ep1')
from build_timing import envelope,P
db=envelope(P('whisper.cpp','tiktok2-ep1-16k.wav'))
thr=-50.3
def runs(a,b,minlen=8):
  out=[];k=int(a*100);s=None
  while k<int(b*100):
    if db[k]<thr:
      s=k if s is None else s
    else:
      if s is not None and k-s>=minlen: out.append((s/100,k/100))
      s=None
    k+=1
  return out
for a,b in [(126,134),(19.5,22.5),(112,117),(255,268)]: print(a,b,runs(a,b))
"
~~~~~

**D10** `2026-10-24T06:08:21Z` · ok · Rebuild timing and recheck cuts

~~~~~bash
cd /Users/thanhphu/my-video; sed -i '' 's/^    l\["fallback"\] = \[\]$//' scripts/tiktok2/ep1/build_timing.py; python3 scripts/tiktok2/ep1/build_timing.py && python3 scripts/tiktok2/ep1/check_cuts.py
~~~~~

**D11** `2026-10-24T06:10:16Z` · ok · Write theme.ts and time.ts

~~~~~bash
cd /Users/thanhphu/my-video; cat > src/tiktok2/ep1/theme.ts <<'EOF'
import { loadFont } from "@remotion/google-fonts/Baloo2";

/** Kênh TikTok 2 – bảng màu & chữ. Môi trường + nhân vật phụ: trầm, khử bão hoà. Nhân vật chính: hoodie CAM rực. */
export const { fontFamily: FONT } = loadFont("normal", { weights: ["600", "800"], subsets: ["vietnamese", "latin"] });

export const W = 1080;
export const H = 1920;
/** Điểm trên màn hình mà tâm camera rơi vào (lệch trái/lên – tránh vùng UI TikTok bên phải và 20% dưới). */
export const ANCHOR = { x: 500, y: 860 } as const;
/** Vùng an toàn TikTok: không đặt chữ/chi tiết chính ở 20% dưới và 15% mép phải. */
export const SAFE = { right: W * 0.85, bottom: H * 0.8 } as const;

export const C = {
  ink: "#15121a",
  ink2: "#2a2530",
  rim: "#f3e2c2",
  white: "#ffffff",
  orange: "#ff7a1a",
  mom: "#b59ac2",
  bin: "#9cc6e4",
  huy: "#7b8a58",
  aodai: "#8797a6",
  principal: "#8e8e94",
  friendBeige: "#cbb699",
  friendGray: "#9a9aa2",
  friendPurple: "#8c7a9c",
  kidnap: "#45434a",
  // môi trường
  wall: "#cdbfa6",
  wallShade: "#b3a58e",
  floor: "#a99a86",
  wood: "#8a6a4f",
  woodDark: "#6b5140",
  blueGray: "#7d8b99",
  dustyPurple: "#8a7b92",
  olive: "#8a8a62",
  beige: "#d6c9b1",
  warm: "#ffcf8a",
  night: "#2a2840",
  red: "#c4553f",
  gold: "#e0b45a",
} as const;

/** Trộn hai màu hex. */
export const mix = (a: string, b: string, t: number) => {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return "#" + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, "0")).join("");
};
export const shade = (c: string, t: number) => (t >= 0 ? mix(c, "#ffffff", t) : mix(c, "#1a1420", -t));
/** Giảm bão hoà một màu (t = 0…1). */
export const desat = (c: string, t: number) => {
  const p = [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const g = Math.round(p[0] * 0.3 + p[1] * 0.59 + p[2] * 0.11);
  return mix(c, `#${[g, g, g].map((v) => v.toString(16).padStart(2, "0")).join("")}`, t);
};
export const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
EOF
cat > src/tiktok2/ep1/time.ts <<'EOF'
import { useCurrentFrame } from "remotion";
import TIMING from "./data/timing.json";

/**
 * Truy vấn timeline EP1. MỌI mốc sinh từ giọng (scripts/tiktok2/ep1/build_timing.py → data/timing.json) – KHÔNG gõ số giây trong cảnh.
 * at("L57","thương") = frame tuyệt đối lúc đọc chữ đó.
 */
export const FPS = 30;
/** Hàm DUY NHẤT quy đổi giây → frame. */
export const sec2f = (s: number) => Math.round(s * FPS);

export type Line = (typeof TIMING.lines)[number];
export type Shot = (typeof TIMING.shots)[number];
export const LINES: readonly Line[] = TIMING.lines;
export const SHOTS: readonly Shot[] = TIMING.shots;
export const TOTAL = TIMING.totalFrames;
export const END_CARD_FROM = TIMING.endCardFrom;
export const VOICE = TIMING.voice;
export { TIMING };

const strip = (s: string) =>
  s.toLowerCase().replace(/đ/g, "d").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

const BY_ID = new Map(LINES.map((l) => [l.id, l]));
export const line = (id: string) => {
  const l = BY_ID.get(id);
  if (!l) throw new Error(`Không có câu ${id}`);
  return l;
};
/** Frame tuyệt đối đầu / cuối câu. */
export const L = (id: string) => line(id).from;
export const Lend = (id: string) => line(id).to;
/** Frame tuyệt đối lúc đọc từ/cụm từ trong câu (so khớp bỏ dấu). */
export const at = (id: string, word: string, nth = 1, edge: "start" | "end" = "start") => {
  const l = line(id);
  const target = strip(word).split(" ");
  const ws = l.words.map((w) => w[1] as string);
  let seen = 0;
  for (let i = 0; i + target.length <= ws.length; i++) {
    if (target.every((t, k) => ws[i + k] === t) && ++seen === nth) return edge === "start" ? (l.words[i][2] as number) : (l.words[i + target.length - 1][3] as number);
  }
  throw new Error(`Không thấy "${word}" trong ${id}`);
};
export const shot = (id: string) => {
  const s = SHOTS.find((x) => x.id === id);
  if (!s) throw new Error(`Không có shot ${id}`);
  return s;
};
/** Câu đang được đọc ở frame tuyệt đối (null trong khoảng lặng / hold). */
export const speakingAt = (abs: number) => LINES.find((l) => abs >= l.from && abs < l.to) ?? null;
export const actAt = (abs: number) => TIMING.acts.find((a) => abs >= a.from && abs < a.to)?.act ?? 9;

/** Trong một shot: frame cục bộ + mốc cục bộ. */
export const useShot = (id: string) => {
  const s = shot(id);
  const f = useCurrentFrame();
  return {
    f,
    dur: s.to - s.from,
    from: s.from,
    abs: s.from + f,
    L: (lid: string) => L(lid) - s.from,
    E: (lid: string) => Lend(lid) - s.from,
    at: (lid: string, w: string, nth = 1, edge: "start" | "end" = "start") => at(lid, w, nth, edge) - s.from,
    /** frame cục bộ bắt đầu hold sau câu */
    H: (lid: string) => line(lid).holdFrom - s.from,
  };
};
EOF
~~~~~

**D12** `2026-10-24T06:17:33Z` · ok · Update anchors and rebuild timing

~~~~~bash
cd /Users/thanhphu/my-video; python3 - <<'EOF'
import json
p='src/tiktok2/ep1/data/timing-overrides.json'
o=json.load(open(p,encoding='utf-8'))
o['anchors']={"3.5":"L042","4.1":"L050","5.1":"L079","5.8":"L104","9.4":"L246"}
json.dump(o,open(p,'w',encoding='utf-8'),ensure_ascii=False,indent=2)
p='src/tiktok2/ep1/data/shotlist.json'
s=json.load(open(p,encoding='utf-8'))
for sh in s['shots']:
    if sh['id']=='3.4': sh.pop('lineHolds',None)
    if sh['id']=='3.7': sh['hold']=0.6
    if sh['id']=='4.1': sh['lineHolds']={"L052":0.6}
json.dump(s,open(p,'w',encoding='utf-8'),ensure_ascii=False,indent=1)
EOF
python3 scripts/tiktok2/ep1/build_timing.py && python3 scripts/tiktok2/ep1/check_cuts.py | tail -1
~~~~~

**D13** `2026-10-24T06:20:21Z` · ok · Render review stills

~~~~~bash
cd /Users/thanhphu/my-video; sed -i '' '/^const LEG = 150;$/d' src/tiktok2/ep1/Character.tsx; sed -i '' 's/^import { C, shade } from ".\/theme";$/import { shade } from ".\/theme";/' src/tiktok2/ep1/sets.tsx
mkdir -p "out/tiktok 2/review"; for s in T2E1CharacterSheet T2E1SetLiving T2E1SetLantern; do npx remotion still src/index.ts $s "out/tiktok 2/review/$s.png" --log=error 2>&1 | tail -3; done; ls src/index.ts
~~~~~

**D14** `2026-10-24T06:21:29Z` · ok · Re-render review stills

~~~~~bash
cd /Users/thanhphu/my-video; for s in T2E1CharacterSheet T2E1SetLiving T2E1SetLantern; do npx remotion still src/index.ts $s "out/tiktok 2/review/$s.png" --log=error 2>&1 | tail -3; done
~~~~~

**D15** `2026-10-24T06:22:24Z` · ok · Measure voice loudness

~~~~~bash
cd /Users/thanhphu/my-video; sed -i '' '/^    const limbW = line ? lw : 15;$/d' src/tiktok2/ep1/Character.tsx; DYLD_LIBRARY_PATH=node_modules/@remotion/compositor-darwin-arm64 node_modules/@remotion/compositor-darwin-arm64/ffmpeg -hide_banner -i "public/kênh tiktok 2/Voice/ep1/ep1 tiktok2.mp3" -af volumedetect -f null - 2>&1 | grep -E "mean_volume|max_volume"
~~~~~

**D16** `2026-10-24T06:22:28Z` · ok · Debug ffmpeg volumedetect

~~~~~bash
cd /Users/thanhphu/my-video; ls node_modules/@remotion/compositor-darwin-arm64/; DYLD_LIBRARY_PATH=node_modules/@remotion/compositor-darwin-arm64 node_modules/@remotion/compositor-darwin-arm64/ffmpeg -hide_banner -i "public/kênh tiktok 2/Voice/ep1/ep1 tiktok2.mp3" -af volumedetect -f null - 2>&1 | tail -5
~~~~~

**D17** `2026-10-24T06:27:50Z` · ok · Render storyboard page 1

~~~~~bash
cd /Users/thanhphu/my-video; time npx remotion render src/index.ts T2E1Board "out/tiktok 2/review/board" --sequence --frames=0-0 --image-format=png --log=error 2>&1 | tail -5; ls "out/tiktok 2/review/board"
~~~~~

**D18** `2026-10-24T06:28:04Z` · ok · Fix Infinity interpolate and re-render board

~~~~~bash
cd /Users/thanhphu/my-video; python3 - <<'EOF'
p='src/tiktok2/ep1/ui.tsx'
s=open(p,encoding='utf-8').read()
s=s.replace("interpolate(f, [a, a + 6, a + 10], [0, 1.15, 1], clamp) * interpolate(f, [b, b + 7], [1, 0], clamp);","interpolate(f, [a, a + 6, a + 10], [0, 1.15, 1], clamp) * (Number.isFinite(b) ? interpolate(f, [b, b + 7], [1, 0], clamp) : 1);")
s=s.replace("const o = interpolate(f, [out, out + 8], [1, 0], clamp);","const o = Number.isFinite(out) ? interpolate(f, [out, out + 8], [1, 0], clamp) : 1;")
s=s.replace("opacity: interpolate(f, [out, out + 6], [1, 0], clamp),","opacity: Number.isFinite(out) ? interpolate(f, [out, out + 6], [1, 0], clamp) : 1,")
open(p,'w',encoding='utf-8').write(s)
EOF
grep -n "Infinity" src/tiktok2/ep1/*.ts* | head; time npx remotion render src/index.ts T2E1Board "out/tiktok 2/review/board" --sequence --frames=0-0 --image-format=png --log=error 2>&1 | tail -5; ls "out/tiktok 2/review/board"
~~~~~

**D19** `2026-10-24T06:28:27Z` · ok · Render test frames from episode

~~~~~bash
cd /Users/thanhphu/my-video; for fr in 60 120 1010; do npx remotion still src/index.ts Tiktok2Ep1 "out/tiktok 2/review/f$fr.png" --frame=$fr --log=error 2>&1 | tail -3; done
~~~~~

**D20** `2026-10-24T06:41:15Z` · ok · Render all storyboard pages

~~~~~bash
cd /Users/thanhphu/my-video; rm -rf "out/tiktok 2/review/board"; time npx remotion render src/index.ts T2E1Board "out/tiktok 2/review/board" --sequence --image-format=jpeg --log=error 2>&1 | tail -5; ls "out/tiktok 2/review/board"
~~~~~

**D21** `2026-10-24T06:41:32Z` · ok · Fix shake range and re-render boards

~~~~~bash
cd /Users/thanhphu/my-video; python3 - <<'EOF'
p='src/tiktok2/ep1/shots/act8.tsx'; s=open(p,encoding='utf-8').read()
a='shake={interpolate(f, [0, 30, L("L207"), L("L207") + 20], [22, 6, 14, 4], clamp)}'
assert a in s
s=s.replace(a,'shake={f < L("L207") ? interpolate(f, [0, 20], [22, 6], clamp) : interpolate(f, [L("L207"), L("L207") + 20], [14, 4], clamp)}')
open(p,'w',encoding='utf-8').write(s)
EOF
grep -n "interpolate(f, \[[^]]*L(" src/tiktok2/ep1/shots/*.tsx | grep -v "clamp)" | head; rm -rf "out/tiktok 2/review/board"; npx remotion render src/index.ts T2E1Board "out/tiktok 2/review/board" --sequence --image-format=jpeg --log=error 2>&1 | tail -5; ls "out/tiktok 2/review/board"
~~~~~

**D22** `2026-10-24T06:44:11Z` · ok · Reposition lying characters and re-render pages

~~~~~bash
cd /Users/thanhphu/my-video; cd src/tiktok2/ep1/shots; sed -i '' 's/<Lying who="ban" x={900} y={1305}/<Lying who="ban" x={720} y={1305}/g; s/<Lying who="bin" x={870} y={1262}/<Lying who="bin" x={720} y={1262}/g; s/<Lying who="bin" x={840} y={1230}/<Lying who="bin" x={700} y={1230}/g; s/M680 1262 Q860 /M500 1262 Q690 /g; s/ 1040 1262 L1060 1420 L660 1420 Z/ 880 1262 L900 1420 L480 1420 Z/g; s/<Blanket x={600} y={1250} w={440}/<Blanket x={480} y={1250} w={420}/' act7.tsx act9.tsx; grep -n "Lying who\|M500 1262\|Blanket x" act7.tsx act9.tsx | head; cd ../../../..; npx remotion render src/index.ts T2E1Board "out/tiktok 2/review/board" --sequence --frames=4-6 --image-format=jpeg --log=error 2>&1 | tail -3
~~~~~

**D23** `2026-10-24T06:44:33Z` · ok · Benchmark render of 90 heavy frames

~~~~~bash
cd /Users/thanhphu/my-video; sysctl -n hw.ncpu; time npx remotion render src/index.ts Tiktok2Ep1 "/private/tmp/claude-501/-Users-thanhphu-my-video/f0388be0-3a67-4763-a32e-a8c763508214/scratchpad/test.mp4" --frames=8000-8089 --log=error --concurrency=8 2>&1 | tail -3
~~~~~

**D24** `2026-10-24T06:44:53Z` · ok · background · Render final episode MP4

~~~~~bash
cd /Users/thanhphu/my-video; npx remotion render src/index.ts Tiktok2Ep1 "out/tiktok 2/tiktok2-ep1.mp4" --codec=h264 --crf=18 --concurrency=8 --log=error > "/private/tmp/claude-501/-Users-thanhphu-my-video/f0388be0-3a67-4763-a32e-a8c763508214/scratchpad/render.log" 2>&1; echo EXIT $?
~~~~~

**D25** `2026-10-24T06:45:08Z` · ok · Write mix check script

~~~~~bash
cd /Users/thanhphu/my-video; cat > scripts/tiktok2/ep1/check_mix.py <<'EOF'
#!/usr/bin/env python3
"""Kiểm tra mix thành phẩm EP1: khoảng chết (cửa sổ 250 ms quá nhỏ), đỉnh âm (clip), và mức giọng trong từng câu.
Chạy: python3 scripts/tiktok2/ep1/check_mix.py "out/tiktok 2/tiktok2-ep1.mp4" """
import array, json, math, os, subprocess, sys, tempfile, wave
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
src = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "out", "tiktok 2", "tiktok2-ep1.mp4")
lib = os.path.join(ROOT, "node_modules/@remotion/compositor-darwin-arm64")
tmp = os.path.join(tempfile.mkdtemp(), "mix.wav")
subprocess.run([os.path.join(lib, "ffmpeg"), "-v", "error", "-y", "-i", src, "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", tmp], check=True, env={**os.environ, "DYLD_LIBRARY_PATH": lib})
w = wave.open(tmp); a = array.array("h", w.readframes(w.getnframes())); sr = w.getframerate()
peak = max(abs(x) for x in a) / 32768
hop = sr // 4
db = [20 * math.log10(math.sqrt(sum(x * x for x in a[i:i + hop]) / hop) / 32768 + 1e-9) for i in range(0, len(a) - hop, hop)]
t = json.load(open(os.path.join(ROOT, "src/tiktok2/ep1/data/timing.json"), encoding="utf-8"))
dead = [(i / 4, d) for i, d in enumerate(db) if d < -55 and i / 4 < t["totalSec"] - 0.5]
print(f"Độ dài {len(a) / sr:.2f} s (timeline {t['totalSec']} s) · đỉnh {20 * math.log10(peak):.1f} dBFS · RMS min {min(db):.1f} dB")
print(f"Khoảng chết (< −55 dBFS / 250 ms): {len(dead)}" + ("" if not dead else " → " + ", ".join(f"{s:.2f}s" for s, _ in dead[:20])))
quiet = []
for l in t["lines"]:
    seg = db[int(l["start"] * 4):max(int(l["start"] * 4) + 1, int(l["end"] * 4))]
    if max(seg) < -30:
        quiet.append(l["id"])
print(f"Câu có mức giọng thấp bất thường: {len(quiet)} {quiet[:10]}")
EOF
echo ok
~~~~~

**D26** `2026-10-24T06:45:23Z` · ok · Update memory index and CLAUDE.md

~~~~~bash
cd /Users/thanhphu/my-video; echo '- [Kênh TikTok 2](series-tiktok2.md) — src/tiktok2/ep1 tàng hình khi nín thở, 16:9 (đổi từ 9:16), style riêng, out/tiktok 2/' >> /Users/thanhphu/.claude/projects/-Users-thanhphu-my-video/memory/MEMORY.md; cat >> CLAUDE.md <<'EOF'

## Kênh TikTok 2 (EP1 “tàng hình khi nín thở”)
- Code trong **`src/tiktok2/ep1/`** (composition `Tiktok2Ep1`, khung **16:9 1920×1080**), script `scripts/tiktok2/ep1/`, tài nguyên `public/kênh tiktok 2/` (voice, sfx/ep1). Thành phẩm `out/tiktok 2/`.
- Style riêng của kênh, không dùng component hình của kênh cũ. Timeline sinh bởi `python3 scripts/tiktok2/ep1/build_timing.py` → `src/tiktok2/ep1/data/timing.json`; chỉnh tay ở `data/timing-overrides.json`. Mốc chỉ qua `src/tiktok2/ep1/time.ts` (`at()`, `sec2f()`).
EOF
echo ok
~~~~~

**D27** `2026-10-24T06:53:55Z` · ok · Verify render output and check mix

~~~~~bash
cd /Users/thanhphu/my-video; cat "/private/tmp/claude-501/-Users-thanhphu-my-video/f0388be0-3a67-4763-a32e-a8c763508214/tasks/bsamdlhqb.output" | tail -3; tail -5 "/private/tmp/claude-501/-Users-thanhphu-my-video/f0388be0-3a67-4763-a32e-a8c763508214/scratchpad/render.log"; ls -la "out/tiktok 2/"; DYLD_LIBRARY_PATH=node_modules/@remotion/compositor-darwin-arm64 node_modules/@remotion/compositor-darwin-arm64/ffprobe -v error -show_entries stream=codec_name,width,height,r_frame_rate:format=duration -of compact "out/tiktok 2/tiktok2-ep1.mp4"; python3 scripts/tiktok2/ep1/check_mix.py
~~~~~

**D28** `2026-10-24T06:54:15Z` · ERROR · Adjust mix and render audio only

~~~~~bash
cd /Users/thanhphu/my-video; python3 - <<'EOF'
p='src/tiktok2/ep1/audio.tsx'; s=open(p,encoding='utf-8').read()
for a,b in [('const DUCK_BED = Math.pow(10, -18 / 20);','const DUCK_BED = Math.pow(10, -15 / 20);'),
('rules: [["amb_room_tone_loop", 0.35]],','rules: [["amb_room_tone_loop", 0.5], ["amb_quiet_loop", 0.25]],'),
('living: [["amb_living_loop", 0.5]],','living: [["amb_living_loop", 0.62]],'),
('class: [["amb_class_loop", 0.45]],','class: [["amb_class_loop", 0.65], ["amb_quiet_loop", 0.25]],'),
('altar: [["amb_quiet_loop", 0.45]],','altar: [["amb_quiet_loop", 0.6]],'),
(' * Mix: giọng ưu tiên; khi có giọng, âm nền giảm −18 dB, tiếng động −15 dB',' * Mix: giọng ưu tiên; khi có giọng, âm nền và tiếng động giảm −15 dB')]:
    assert a in s, a; s=s.replace(a,b)
open(p,'w',encoding='utf-8').write(s)
EOF
S=/private/tmp/claude-501/-Users-thanhphu-my-video/f0388be0-3a67-4763-a32e-a8c763508214/scratchpad
time npx remotion render src/index.ts Tiktok2Ep1 "$S/mix.wav" --codec=wav --log=error 2>&1 | tail -3; ls -la $S/mix.wav
~~~~~

**D29** `2026-10-24T06:54:38Z` · ok · Render audio via standalone entry

~~~~~bash
cd /Users/thanhphu/my-video; cat > src/tiktok2/index.ts <<'EOF'
// Entry riêng cho kênh TikTok 2 – render độc lập, không phụ thuộc các series khác trong src/Root.tsx.
import { registerRoot } from "remotion";
import { Tiktok2Compositions } from "./Tiktok2Root";

registerRoot(Tiktok2Compositions);
EOF
S=/private/tmp/claude-501/-Users-thanhphu-my-video/f0388be0-3a67-4763-a32e-a8c763508214/scratchpad
time npx remotion render src/tiktok2/index.ts Tiktok2Ep1 "$S/mix.wav" --codec=wav --log=error 2>&1 | tail -3; ls -la $S/mix.wav
~~~~~

**D30** `2026-10-24T06:59:47Z` · ok · Check new mix

~~~~~bash
cd /Users/thanhphu/my-video; S=/private/tmp/claude-501/-Users-thanhphu-my-video/f0388be0-3a67-4763-a32e-a8c763508214/scratchpad; python3 scripts/tiktok2/ep1/check_mix.py $S/mix.wav
~~~~~

**D31** `2026-10-24T06:59:56Z` · ok · Raise night ambience and recheck

~~~~~bash
cd /Users/thanhphu/my-video; sed -i '' 's/  night: \[\["amb_night_loop", 0.5\]\],/  night: [["amb_night_loop", 0.62], ["amb_room_tone_loop", 0.35]],/' src/tiktok2/ep1/audio.tsx; grep -n "night:" src/tiktok2/ep1/audio.tsx; S=/private/tmp/claude-501/-Users-thanhphu-my-video/f0388be0-3a67-4763-a32e-a8c763508214/scratchpad; npx remotion render src/tiktok2/index.ts Tiktok2Ep1 "$S/mix.wav" --codec=wav --log=error 2>&1 | tail -3; python3 scripts/tiktok2/ep1/check_mix.py $S/mix.wav
~~~~~

**D32** `2026-10-24T07:04:48Z` · ok · Mux new audio into final MP4 and verify

~~~~~bash
cd /Users/thanhphu/my-video; S=/private/tmp/claude-501/-Users-thanhphu-my-video/f0388be0-3a67-4763-a32e-a8c763508214/scratchpad; L=node_modules/@remotion/compositor-darwin-arm64; mv "out/tiktok 2/tiktok2-ep1.mp4" $S/video-old.mp4 && DYLD_LIBRARY_PATH=$L $L/ffmpeg -v error -y -i $S/video-old.mp4 -i $S/mix.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 256k -shortest -movflags +faststart "out/tiktok 2/tiktok2-ep1.mp4" && DYLD_LIBRARY_PATH=$L $L/ffprobe -v error -show_entries stream=codec_name,width,height,r_frame_rate,nb_frames:format=duration,size -of compact "out/tiktok 2/tiktok2-ep1.mp4"; python3 scripts/tiktok2/ep1/check_mix.py; python3 scripts/tiktok2/ep1/check_cuts.py | tail -1
~~~~~

**D33** `2026-10-24T07:05:28Z` · ok · Extract early frames featuring Mom

~~~~~bash
cd /Users/thanhphu/my-video; S=/private/tmp/claude-501/-Users-thanhphu-my-video/f0388be0-3a67-4763-a32e-a8c763508214/scratchpad; L=node_modules/@remotion/compositor-darwin-arm64; for t in 6 9.8 15 19.5 22 30.5 33; do DYLD_LIBRARY_PATH=$L $L/ffmpeg -v error -y -ss $t -i "out/tiktok 2/tiktok2-ep1.mp4" -frames:v 1 -vf scale=640:-1 $S/m_$t.png; done; ls $S/m_*
~~~~~

**D34** `2026-10-24T07:06:27Z` · ok · Extract frames with side characters

~~~~~bash
cd /Users/thanhphu/my-video; S=/private/tmp/claude-501/-Users-thanhphu-my-video/f0388be0-3a67-4763-a32e-a8c763508214/scratchpad; L=node_modules/@remotion/compositor-darwin-arm64; for t in 80 104 190 204 272 339 371; do DYLD_LIBRARY_PATH=$L $L/ffmpeg -v error -y -ss $t -i "out/tiktok 2/tiktok2-ep1.mp4" -frames:v 1 -vf scale=640:-1 $S/o_$t.png; done; echo ok
~~~~~

**D35** `2026-10-24T07:07:13Z` · ok · Draw actors in front of furniture; test stills

~~~~~bash
cd /Users/thanhphu/my-video; python3 - <<'EOF'
R='src/tiktok2/ep1/'
def sub(path, pairs):
    p=R+path; s=open(p,encoding='utf-8').read()
    for a,b in pairs:
        assert a in s, (path,a); s=s.replace(a,b)
    open(p,'w',encoding='utf-8').write(s)
sub('SetStage.tsx',[
('/** Ghép bối cảnh + nhân vật thành một shot: mid = back → actors → front. */','/**\n * Ghép bối cảnh + nhân vật thành một shot: mid = back → behind → đồ đạc phía trước (bàn…) → actors → front.\n * Nhân vật mặc định vẽ TRƯỚC đồ đạc (bàn khung hở vẽ đè lên người trông như nhân vật bị trong suốt); chỉ ai thật sự đi ra sau bàn mới dùng `behind`.\n */'),
('  readonly actors?: React.ReactNode;\n','  readonly actors?: React.ReactNode;\n  readonly behind?: React.ReactNode;\n'),
('}> = ({ set, cam, f, actors, front,','}> = ({ set, cam, f, actors, behind, front,'),
('''        {set.back}
        {actors}
        {set.front}
        {front}''','''        {set.back}
        {behind}
        {set.front}
        {actors}
        {front}'''),
])
sub('shots/act12.tsx',[('<SetStage set={{ ...livingRoom(f), back: null }} cam={cam} f={f} shake={1.5} actors={<>{behind}</>} front={<>{inFront}<Sparkles amount={0} seed={1} t={f} /></>} />','<SetStage set={{ ...livingRoom(f), back: null }} cam={cam} f={f} shake={1.5} behind={<>{behind}</>} actors={<>{inFront}<Sparkles amount={0} seed={1} t={f} /></>} />')])
EOF
npx tsc --noEmit -p . 2>&1 | grep tiktok2 | head; S=/private/tmp/claude-501/-Users-thanhphu-my-video/f0388be0-3a67-4763-a32e-a8c763508214/scratchpad; for fr in 170 290 470 700; do npx remotion still src/tiktok2/index.ts Tiktok2Ep1 $S/fix_$fr.png --frame=$fr --scale=0.4 --log=error; done; ls $S/fix_*
~~~~~

**D36** `2026-10-24T07:08:07Z` · ok · Move paper into Mom's hand and check

~~~~~bash
cd /Users/thanhphu/my-video; sed -i '' 's/<PortraitBox s={0.5} dy={30} dx={360}>/<PortraitBox s={0.5} dy={30} dx={60}>/' src/tiktok2/ep1/shots/act12.tsx; S=/private/tmp/claude-501/-Users-thanhphu-my-video/f0388be0-3a67-4763-a32e-a8c763508214/scratchpad; npx remotion still src/tiktok2/index.ts Tiktok2Ep1 $S/fix_170b.png --frame=170 --scale=0.4 --log=error
~~~~~

**D37** `2026-10-24T07:08:19Z` · ok · background · Re-render final episode

~~~~~bash
cd /Users/thanhphu/my-video; npx remotion render src/tiktok2/index.ts Tiktok2Ep1 "out/tiktok 2/tiktok2-ep1.mp4" --codec=h264 --crf=18 --concurrency=8 --log=error > "/private/tmp/claude-501/-Users-thanhphu-my-video/f0388be0-3a67-4763-a32e-a8c763508214/scratchpad/render2.log" 2>&1; echo EXIT $?
~~~~~

**D38** `2026-10-24T08:12:55Z` · ok · Check render status and caption size

~~~~~bash
cd /Users/thanhphu/my-video; cat /private/tmp/claude-501/-Users-thanhphu-my-video/f0388be0-3a67-4763-a32e-a8c763508214/tasks/baxu7absr.output; ls -la "out/tiktok 2/tiktok2-ep1.mp4"; pgrep -fl "remotion render" | head -3; grep -n "fontSize: 76" src/tiktok2/ep1/ui.tsx
~~~~~

**D39** `2026-10-24T08:13:10Z` · ok · Stop render, shrink captions, preview

~~~~~bash
cd /Users/thanhphu/my-video; kill 33293 33276 2>/dev/null; sleep 1; pkill -f "remotion render src/tiktok2" ; python3 - <<'EOF'
p='src/tiktok2/ep1/ui.tsx'; s=open(p,encoding='utf-8').read()
a='''<span key={i} style={{ fontFamily: FONT, fontWeight: 800, fontSize: 76, color: active ? C.orange : "#ffffff", margin: "0 12px", display: "inline-block", textShadow: "0 6px 0 rgba(0,0,0,0.4)", ...stroke(12) }}>'''
b='''<span key={i} style={{ fontFamily: FONT, fontWeight: 800, fontSize: 50, color: active ? C.orange : "#ffffff", margin: "0 8px", display: "inline-block", textShadow: "0 4px 0 rgba(0,0,0,0.4)", ...stroke(8) }}>'''
assert a in s; s=s.replace(a,b)
s=s.replace("const y = yAt?.(abs) ?? 880;","const y = yAt?.(abs) ?? 950;")
open(p,'w',encoding='utf-8').write(s)
p='src/tiktok2/ep1/Episode.tsx'; s=open(p,encoding='utf-8').read()
s=s.replace("?.capY ?? 880} />","?.capY ?? 950} />"); open(p,'w',encoding='utf-8').write(s)
EOF
sed -i '' 's/capY: 900/capY: 950/g' src/tiktok2/ep1/shots/*.tsx; S=/private/tmp/claude-501/-Users-thanhphu-my-video/f0388be0-3a67-4763-a32e-a8c763508214/scratchpad; npx remotion still src/tiktok2/index.ts Tiktok2Ep1 $S/cap.png --frame=60 --log=error; pgrep -fl "remotion render" | wc -l
~~~~~

**D40** `2026-10-24T08:13:30Z` · ok · List remaining render processes

~~~~~bash
pgrep -fl "remotion render" | cut -c1-160
~~~~~

**D41** `2026-10-24T08:13:44Z` · ok · background · Re-render final episode with smaller captions

~~~~~bash
cd /Users/thanhphu/my-video; npx remotion render src/tiktok2/index.ts Tiktok2Ep1 "out/tiktok 2/tiktok2-ep1.mp4" --codec=h264 --crf=18 --concurrency=6 --log=error > "/private/tmp/claude-501/-Users-thanhphu-my-video/f0388be0-3a67-4763-a32e-a8c763508214/scratchpad/render3.log" 2>&1; echo EXIT $?
~~~~~

**D42** `2026-10-24T08:26:30Z` · ok · Verify final MP4 and extract check frames

~~~~~bash
cd /Users/thanhphu/my-video; cat /private/tmp/claude-501/-Users-thanhphu-my-video/f0388be0-3a67-4763-a32e-a8c763508214/tasks/bpoiz5snt.output; L=node_modules/@remotion/compositor-darwin-arm64; DYLD_LIBRARY_PATH=$L $L/ffprobe -v error -show_entries stream=codec_name,width,height,r_frame_rate,nb_frames:format=duration,size -of compact "out/tiktok 2/tiktok2-ep1.mp4"; python3 scripts/tiktok2/ep1/check_mix.py; S=/private/tmp/claude-501/-Users-thanhphu-my-video/f0388be0-3a67-4763-a32e-a8c763508214/scratchpad; for t in 6 15 33; do DYLD_LIBRARY_PATH=$L $L/ffmpeg -v error -y -ss $t -i "out/tiktok 2/tiktok2-ep1.mp4" -frames:v 1 -vf scale=640:-1 $S/final_$t.png; done
~~~~~

**D43** `2026-10-24T08:40:03Z` · ok · Lower SFX/ambience, raise voice, render audio

~~~~~bash
cd /Users/thanhphu/my-video; python3 - <<'EOF'
p='src/tiktok2/ep1/audio.tsx'; s=open(p,encoding='utf-8').read()
for a,b in [('const VOICE_GAIN = 0.92;','const VOICE_GAIN = 1.0;\n/** Hệ số chung (người dùng: SFX quá to, giọng lớn hơn) – SFX/foley −7 dB, âm nền −5 dB. */\nconst FX_GAIN = 0.45;\nconst BED_GAIN = 0.56;'),
('volume={(f) => b.vol * duck(','volume={(f) => BED_GAIN * b.vol * duck('),
('''                (c.vol ?? 0.7) *
                (c.noDuck''','''                FX_GAIN *
                (c.vol ?? 0.7) *
                (c.noDuck''')]:
    assert a in s,a; s=s.replace(a,b)
open(p,'w',encoding='utf-8').write(s)
EOF
npx tsc --noEmit -p . 2>&1 | grep tiktok2; S=/private/tmp/claude-501/-Users-thanhphu-my-video/f0388be0-3a67-4763-a32e-a8c763508214/scratchpad; npx remotion render src/tiktok2/index.ts Tiktok2Ep1 "$S/mix2.wav" --codec=wav --log=error 2>&1 | tail -3; python3 scripts/tiktok2/ep1/check_mix.py $S/mix2.wav
~~~~~

**D44** `2026-10-24T08:46:28Z` · ok · Soften bed ducking and recheck mix

~~~~~bash
cd /Users/thanhphu/my-video; sed -i '' 's#^const DUCK_BED = Math.pow(10, -15 / 20);#const DUCK_BED = Math.pow(10, -12 / 20);#' src/tiktok2/ep1/audio.tsx; grep -n "DUCK_BED =" src/tiktok2/ep1/audio.tsx; S=/private/tmp/claude-501/-Users-thanhphu-my-video/f0388be0-3a67-4763-a32e-a8c763508214/scratchpad; npx remotion render src/tiktok2/index.ts Tiktok2Ep1 "$S/mix2.wav" --codec=wav --log=error 2>&1 | tail -3; python3 scripts/tiktok2/ep1/check_mix.py $S/mix2.wav
~~~~~

**D45** `2026-10-24T08:50:49Z` · ok · Mux new mix into final MP4 and verify

~~~~~bash
cd /Users/thanhphu/my-video; sed -i '' 's# \* Mix: giọng ưu tiên; khi có giọng, âm nền và tiếng động giảm −15 dB# * Mix: giọng ưu tiên (gain 1.0); SFX/foley −7 dB, âm nền −5 dB so với bản đầu; khi có giọng âm nền giảm thêm −12 dB, tiếng động −15 dB#' src/tiktok2/ep1/audio.tsx; S=/private/tmp/claude-501/-Users-thanhphu-my-video/f0388be0-3a67-4763-a32e-a8c763508214/scratchpad; L=node_modules/@remotion/compositor-darwin-arm64; mv "out/tiktok 2/tiktok2-ep1.mp4" $S/video-v3.mp4 && DYLD_LIBRARY_PATH=$L $L/ffmpeg -v error -y -i $S/video-v3.mp4 -i $S/mix2.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 256k -shortest -movflags +faststart "out/tiktok 2/tiktok2-ep1.mp4" && DYLD_LIBRARY_PATH=$L $L/ffprobe -v error -show_entries stream=codec_name,width,height,nb_frames:format=duration,size -of compact "out/tiktok 2/tiktok2-ep1.mp4"; python3 scripts/tiktok2/ep1/check_mix.py
~~~~~

**D46** `2026-10-24T11:22:24Z` · ok · Parameterize transcribe and run for ep2

~~~~~bash
cd /Users/thanhphu/my-video; mkdir -p scripts/tiktok2/ep2 src/tiktok2/ep2/data src/tiktok2/ep2/shots "public/kênh tiktok 2/sfx/ep2"; python3 - <<'EOF'
p='scripts/tiktok2/ep1/transcribe.mjs'; s=open(p,encoding='utf-8').read()
s=s.replace('''// TikTok 2 · EP1 – phiên âm giọng''','''// TikTok 2 – phiên âm giọng (mặc định ep1; tập khác: node scripts/tiktok2/ep1/transcribe.mjs ep2)''')
s=s.replace('''const root = process.cwd();''','''const root = process.cwd();
const ep = process.argv[2] ?? "ep1";''')
s=s.replace('''const src = path.join(root, "public/kênh tiktok 2/Voice/ep1/ep1 tiktok2.mp3");
const wav = path.join(w, "tiktok2-ep1-16k.wav");''','''const src = path.join(root, `public/kênh tiktok 2/Voice/${ep}/${ep} tiktok2.mp3`);
const wav = path.join(w, `tiktok2-${ep}-16k.wav`);''')
s=s.replace('''path.join(w, "tiktok2-ep1-transcript")''','''path.join(w, `tiktok2-${ep}-transcript`)''')
s=s.replace('''console.log("OK → whisper.cpp/tiktok2-ep1-transcript.json");''','''console.log(`OK → whisper.cpp/tiktok2-${ep}-transcript.json`);''')
open(p,'w',encoding='utf-8').write(s)
EOF
grep -n "ep1\|\${ep}" scripts/tiktok2/ep1/transcribe.mjs; node scripts/tiktok2/ep1/transcribe.mjs ep2 > /private/tmp/claude-501/-Users-thanhphu-my-video/f0388be0-3a67-4763-a32e-a8c763508214/scratchpad/whisper2.log 2>&1 &
echo started
~~~~~

**D47** `2026-10-24T11:22:36Z` · ok · Generalize build_timing and verify ep1 unchanged

~~~~~bash
cd /Users/thanhphu/my-video; cp src/tiktok2/ep1/data/timing.json /private/tmp/claude-501/-Users-thanhphu-my-video/f0388be0-3a67-4763-a32e-a8c763508214/scratchpad/ep1-timing-before.json; python3 - <<'EOF'
import re
p='scripts/tiktok2/ep1/build_timing.py'; s=open(p,encoding='utf-8').read()
s=s.replace('"""TikTok 2 · EP1 – dựng timeline từ giọng.','"""TikTok 2 – dựng timeline từ giọng (mặc định ep1; tập khác: python3 scripts/tiktok2/ep1/build_timing.py ep2).')
s=s.replace('VOICE_SRC = "kênh tiktok 2/Voice/ep1/ep1 tiktok2.mp3"','EP = "ep1"')
s=s.replace('def main():','def main(ep="ep1"):\n    global EP\n    EP = ep\n    VOICE_SRC = f"kênh tiktok 2/Voice/{ep}/{ep} tiktok2.mp3"')
s=s.replace('"src/tiktok2/ep1/','f"src/tiktok2/{EP}/')
s=s.replace('P("public", "kênh tiktok 2", "Voice", "ep1", "ep1 tiktok2.srt")','P("public", "kênh tiktok 2", "Voice", EP, f"{EP} tiktok2.srt")')
s=s.replace('P("whisper.cpp", "tiktok2-ep1-16k.wav")','P("whisper.cpp", f"tiktok2-{EP}-16k.wav")')
s=s.replace('P("whisper.cpp", "tiktok2-ep1-transcript.json")','P("whisper.cpp", f"tiktok2-{EP}-transcript.json")')
s=s.replace('P("out", "tiktok 2", "ep1-timeline.md")','P("out", "tiktok 2", f"{EP}-timeline.md")')
s=s.replace('md = ["# TikTok 2 · EP1 – timeline"','md = [f"# TikTok 2 · {EP.upper()} – timeline"')
s=s.replace('if __name__ == "__main__":\n    main()','if __name__ == "__main__":\n    import sys\n    main(sys.argv[1] if len(sys.argv) > 1 else "ep1")')
open(p,'w',encoding='utf-8').write(s)
EOF
grep -n 'ep1' scripts/tiktok2/ep1/build_timing.py; python3 scripts/tiktok2/ep1/build_timing.py && cmp src/tiktok2/ep1/data/timing.json /private/tmp/claude-501/-Users-thanhphu-my-video/f0388be0-3a67-4763-a32e-a8c763508214/scratchpad/ep1-timing-before.json && echo "EP1 timing identical"
~~~~~

**D48** `2026-10-24T11:22:48Z` · ok · Parameterize check scripts; check whisper progress

~~~~~bash
cd /Users/thanhphu/my-video; python3 - <<'EOF'
p='scripts/tiktok2/ep1/check_cuts.py'; s=open(p,encoding='utf-8').read()
s=s.replace('"""Kiểm tra điểm cắt câu EP1:','"""Kiểm tra điểm cắt câu (mặc định ep1; tập khác: python3 scripts/tiktok2/ep1/check_cuts.py ep2):')
s=s.replace('from build_timing import envelope, P, FPS\n','from build_timing import envelope, P, FPS\nEP = sys.argv[1] if len(sys.argv) > 1 else "ep1"\n')
s=s.replace('P("src/tiktok2/ep1/data/timing.json")','P(f"src/tiktok2/{EP}/data/timing.json")').replace('P("whisper.cpp", "tiktok2-ep1-16k.wav")','P("whisper.cpp", f"tiktok2-{EP}-16k.wav")')
open(p,'w',encoding='utf-8').write(s)
p='scripts/tiktok2/ep1/check_mix.py'; s=open(p,encoding='utf-8').read()
s=s.replace('Chạy: python3 scripts/tiktok2/ep1/check_mix.py "out/tiktok 2/tiktok2-ep1.mp4" """','Chạy: python3 scripts/tiktok2/ep1/check_mix.py "out/tiktok 2/tiktok2-ep1.mp4" [ep1|ep2] """')
s=s.replace('src = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "out", "tiktok 2", "tiktok2-ep1.mp4")','EP = sys.argv[2] if len(sys.argv) > 2 else "ep1"\nsrc = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "out", "tiktok 2", f"tiktok2-{EP}.mp4")')
s=s.replace('"src/tiktok2/ep1/data/timing.json"','f"src/tiktok2/{EP}/data/timing.json"')
open(p,'w',encoding='utf-8').write(s)
EOF
python3 scripts/tiktok2/ep1/check_cuts.py | tail -1; tail -2 /private/tmp/claude-501/-Users-thanhphu-my-video/f0388be0-3a67-4763-a32e-a8c763508214/scratchpad/whisper2.log
~~~~~

**D49** `2026-10-24T11:23:35Z` · ok · Write EP2 shotlist and overrides

~~~~~bash
cd /Users/thanhphu/my-video; python3 - <<'EOF'
import json
S=[
("1.1",1,"Nếu bạn nhân bản được",{"hold":0.6,"lineHolds":{"L001":0.3}}),
("2.1",2,"Sáu giờ sáng",{"hold":0.3}),
("2.2",2,"Hôm nay bạn có",{"hold":0.3}),
("2.3",2,"Bạn nằm đó",{"hold":0.4}),
("2.4",2,"Ước gì có thêm",{"hold":0.8}),
("2.5",2,"Ở cuối giường",{"hold":0.5}),
("2.6",2,"Nó nhìn bạn",{"hold":0.4}),
("2.7",2,"Ủa",{"hold":0.5}),
("2.8",2,"Hai bạn oẳn tù tì",{"hold":0.6,"lineHolds":{"L026":0.6}}),
("3.1",3,"Luật thế này",{}),
("3.2",3,"Mỗi lần búng tay",{"hold":0.3}),
("3.3",3,"Từ cọng tóc",{"fast":True}),
("3.4",3,"Đúng mười hai giờ đêm",{"hold":0.4}),
("3.5",3,"Và những gì bản sao trải qua",{"hold":0.6}),
("3.6",3,"ngay cả cặp song sinh",{"hold":0.3}),
("3.7",3,"Cả cái tật rung chân",{"hold":0.5}),
("3.8",3,"Mẹ bạn không phân biệt được",{"hold":1.0}),
("4.1",4,"Bản sao giống bạn",{"fast":True}),
("4.2",4,"Bạn sai nó đi học thêm",{"fast":True}),
("4.3",4,"Tới bản sao thứ năm",{"fast":True,"hold":0.5}),
("4.4",4,"Cô dạy thêm nhắn tin",{"fast":True}),
("4.5",4,"Sáu cái đầu quay ra",{"hold":1.2}),
("4.6",4,"Mẹ đóng cửa lại",{"hold":0.3}),
("4.7",4,"Chỉ còn một đứa",{"hold":0.6}),
("4.8",4,"Chắc mẹ thiếu ngủ",{"hold":1.0}),
("4.9",4,"Vậy là bạn lập một hệ thống",{"hold":0.6}),
("5.1",5,"Nhưng rồi nó bắt đầu vui",{}),
("5.2",5,"Trực nhật lớp",{"fast":True}),
("5.3",5,"Cô chủ nhiệm",{"fast":True,"hold":0.6}),
("5.4",5,"Đá bóng ở sân xóm",{"fast":True}),
("5.5",5,"Thủ môn đội kia",{"hold":0.7}),
("5.6",5,"Mùng một Tết",{"hold":0.3}),
("5.7",5,"Tối đó sáu đứa về",{"hold":0.5}),
("5.8",5,"Không đứa nào nhận",{"hold":0.8}),
("5.9",5,"Rồi tới bài thuyết trình",{"hold":0.4}),
("5.10",5,"Bài thuyết trình hay nhất",{"hold":0.3}),
("5.11",5,"Rồi cô hỏi một câu",{"hold":0.8}),
("5.12",5,"nếu không ôn lại",{"hold":0.6}),
("6.1",6,"Nhưng có một cái giá",{}),
("6.2",6,"Học thêm",{}),
("6.3",6,"Ăn cơm tối",{}),
("6.4",6,"Chủ nhật ba dạy chạy xe",{"hold":0.3}),
("6.5",6,"Vậy là có một luật",{"hold":0.8}),
("6.6",6,"Bạn có thêm rất nhiều thời gian",{"hold":0.6}),
("6.7",6,"Rồi một tối ba đưa điện thoại",{}),
("6.8",6,"Trong ảnh",{"hold":1.4}),
("6.9",6,"Bạn không nhớ",{"hold":0.6}),
("6.10",6,"Mẹ gắp cho bạn",{}),
("6.11",6,"Câu gì",{"hold":0.5}),
("6.12",6,"Bạn có thêm bao nhiêu là thời gian",{"hold":1.2}),
("7.1",7,"Sinh nhật mẹ năm nay",{"hold":0.3}),
("7.2",7,"Mười một giờ năm mươi",{}),
("7.3",7,"Bản sao đã ngồi đó",{"hold":0.6}),
("7.4",7,"Còn mười phút",{"hold":0.3}),
("7.5",7,"Tối nay mẹ nấu canh chua",{}),
("7.6",7,"Ba kể hồi bằng tuổi mình",{"hold":0.4}),
("7.7",7,"Sao mày kể tao nghe",{}),
("7.8",7,"Vì mười phút nữa",{"hold":0.5}),
("7.9",7,"Mình đã sống mấy chục buổi tối",{"hold":0.6}),
("7.10",7,"Năm phút",{"hold":1.2}),
("7.11",7,"Tự đi mà hỏi mẹ",{"hold":0.8}),
("7.12",7,"Tay nó bắt đầu sáng lên",{"hold":1.5,"lineHolds":{"L178":0.6}}),
("7.13",7,"Mười hai giờ",{"hold":1.2,"lineHolds":{"L183":1.2}}),
("7.14",7,"Chỉ còn cái ghế nhựa",{"hold":0.8}),
("7.15",7,"Lần đầu tiên bạn hiểu",{"hold":1.5}),
("8.1",8,"Bạn đi xuống bếp",{}),
("8.2",8,"Mẹ để con rửa",{"hold":0.4}),
("8.3",8,"Bạn rửa chén",{"hold":0.8}),
("8.4",8,"Mẹ ơi",{"hold":0.5}),
("8.5",8,"Mẹ cười",{}),
("8.6",8,"Mẹ cứ già từ từ thôi",{"hold":1.2,"lineHolds":{"L207":1.5}}),
("8.7",8,"Sáng hôm sau",{"hold":0.3}),
("8.8",8,"Bạn búng tay Một lần",{"lineHolds":{"L218":1.0},"hold":0.3}),
("8.9",8,"Tao",{"hold":0.8}),
("8.10",8,"Còn bạn",{"hold":0.0}),
]
shots=[]
for id,act,moc,o in S:
    d={"id":id,"act":act,"moc":moc}; d.update(o); shots.append(d)
json.dump({"_doc":"Danh sách shot EP2. moc = vài chữ đầu câu (so khớp gần đúng, theo thứ tự). hold = giây giữ hình sau câu cuối của shot. lineHolds = giữ sau một câu cụ thể. fast = cắt dồn dập (khoảng lặng 0,15 s).","shots":shots},open('src/tiktok2/ep2/data/shotlist.json','w',encoding='utf-8'),ensure_ascii=False,indent=1)
json.dump({"_doc":"Chỉnh tay timeline EP2 rồi chạy lại: python3 scripts/tiktok2/ep1/build_timing.py ep2. Đơn vị giây. holds: giữ hình sau câu (ghi đè shotlist). gaps: khoảng lặng sau câu. anchors: gắn shot vào câu khác. trim: nới/thu đầu-cuối câu [đầu, cuối]. endCard: độ dài thẻ cuối.",
 "holds":{},"gaps":{},"anchors":{"3.6":"L042","4.1":"L050","4.5":"L061","5.12":"L105","7.11":"L174"},"trim":{},"endCard":1.5,"maxGap":0.38,"minGap":0.15},open('src/tiktok2/ep2/data/timing-overrides.json','w',encoding='utf-8'),ensure_ascii=False,indent=2)
EOF
tail -1 /private/tmp/claude-501/-Users-thanhphu-my-video/f0388be0-3a67-4763-a32e-a8c763508214/scratchpad/whisper2.log
~~~~~

**D50** `2026-10-24T11:23:40Z` · ok · Build EP2 timeline and check cuts

~~~~~bash
cd /Users/thanhphu/my-video; python3 scripts/tiktok2/ep1/build_timing.py ep2 && python3 scripts/tiktok2/ep1/check_cuts.py ep2 | tail -5 && python3 -c "
import json;t=json.load(open('src/tiktok2/ep2/data/timing.json'))
for s in t['shots']: print(s['id'],s['firstLine'],s['lastLine'],s['start'],round(s['end']-s['start'],2))
" | column -c 200
~~~~~

**D51** `2026-10-24T11:24:03Z` · ok · Join breathless lines contiguously; recheck

~~~~~bash
cd /Users/thanhphu/my-video; python3 - <<'EOF'
p='scripts/tiktok2/ep1/build_timing.py'; s=open(p,encoding='utf-8').read()
a='''            k = min(range(int(lo * 100), int(hi * 100)), key=lambda k: db[k])
            a["offset"], b["onset"] = k / 100, (k + 1) / 100'''
b='''            k = min(range(int(lo * 100), int(hi * 100)), key=lambda k: db[k])
            a["offset"], b["onset"] = k / 100, (k + 1) / 100
            a["joinNext"] = k / 100  # đọc liền một hơi: hai câu nối khít trong file gốc, không chèn khoảng nghỉ'''
assert a in s; s=s.replace(a,b)
a='''    for i in range(n - 1):
        if lines[i]["trimAfter"] > lines[i + 1]["trimBefore"]:'''
b='''    for i in range(n - 1):
        if "joinNext" in lines[i]:
            lines[i]["trimAfter"] = lines[i + 1]["trimBefore"] = round(lines[i]["joinNext"] * FPS)
        if lines[i]["trimAfter"] > lines[i + 1]["trimBefore"]:'''
assert a in s; s=s.replace(a,b)
a='''            target = ov.get("gaps", {}).get(l["id"], target)
            gapf = max(sec2f(max(0.0, target - pads)), 0)'''
b='''            target = ov.get("gaps", {}).get(l["id"], target)
            gapf = max(sec2f(max(0.0, target - pads)), 0)
            if "joinNext" in l:
                gapf = 0
                if l["hold"]:
                    print(f"  ! bỏ hold sau {l['id']} vì câu đọc liền với câu sau")
                l["hold"] = 0'''
assert a in s; s=s.replace(a,b)
s=s.replace('''                "gap": l["gap"], "hold": l["hold"], "holdFrom": l["holdFrom"], "holdTo": l["holdTo"],''','''                "gap": l["gap"], "hold": l["hold"], "holdFrom": l["holdFrom"], "holdTo": l["holdTo"], "joinNext": "joinNext" in l,''')
open(p,'w',encoding='utf-8').write(s)
p='scripts/tiktok2/ep1/check_cuts.py'; s=open(p,encoding='utf-8').read()
a='''    if ea > floor + 20 or eb > floor + 20:'''
b='''    prev = t["lines"][t["lines"].index(l) - 1] if t["lines"].index(l) else None
    if prev and prev.get("joinNext"):
        ea = floor  # nối khít với câu trước (đọc liền) – không phải điểm cắt
    if l.get("joinNext"):
        eb = floor
    if ea > floor + 20 or eb > floor + 20:'''
assert a in s; s=s.replace(a,b)
open(p,'w',encoding='utf-8').write(s)
EOF
python3 scripts/tiktok2/ep1/build_timing.py ep2 | tail -3 && python3 scripts/tiktok2/ep1/check_cuts.py ep2 | tail -2; python3 scripts/tiktok2/ep1/build_timing.py >/dev/null && cmp <(python3 -c "import json;d=json.load(open('src/tiktok2/ep1/data/timing.json'));[l.pop('joinNext') for l in d['lines']];print(json.dumps(d))") <(python3 -c "import json;print(json.dumps(json.load(open('/private/tmp/claude-501/-Users-thanhphu-my-video/f0388be0-3a67-4763-a32e-a8c763508214/scratchpad/ep1-timing-before.json'))))") && echo "EP1 timing unchanged (ngoài cờ joinNext=false)"
~~~~~

**D52** `2026-10-24T11:24:45Z` · ok · Export ep1 sfx synth functions; verify identical

~~~~~bash
cd /Users/thanhphu/my-video; python3 - <<'EOF'
p='scripts/tiktok2/ep1/generate-sfx.mjs'; s=open(p,encoding='utf-8').read()
a='''const only = process.argv.slice(2);
for (const [name, make] of Object.entries(gen)) {
  if (only.length && !only.includes(name)) continue;
  out(name, make(), name.includes("_loop") ? 0.45 : 0.6);
}'''
b='''/** Dùng lại cho tập khác (import { gen, … } from "../ep1/generate-sfx.mjs"). */
export { add, babble, birds, bubbles, clink, creak, crickets, crinkle, engine, exhale, filt, flame, gen, heartbeat, hum, inhale, liquid, loopify, passby, pop, room, scrape, shimmer, splash, steps, thud, tick, verb, whoosh };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const only = process.argv.slice(2);
  for (const [name, make] of Object.entries(gen)) {
    if (only.length && !only.includes(name)) continue;
    out(name, make(), name.includes("_loop") ? 0.45 : 0.6);
  }
}'''
assert a in s; s=s.replace(a,b)
open(p,'w',encoding='utf-8').write(s)
EOF
S=/private/tmp/claude-501/-Users-thanhphu-my-video/f0388be0-3a67-4763-a32e-a8c763508214/scratchpad; mkdir -p $S/sfxcheck; cp "public/kênh tiktok 2/sfx/ep1/pop.wav" "public/kênh tiktok 2/sfx/ep1/amb_living_loop.wav" $S/sfxcheck/; node scripts/tiktok2/ep1/generate-sfx.mjs pop amb_living_loop && cmp $S/sfxcheck/pop.wav "public/kênh tiktok 2/sfx/ep1/pop.wav" && cmp $S/sfxcheck/amb_living_loop.wav "public/kênh tiktok 2/sfx/ep1/amb_living_loop.wav" && echo "EP1 sfx identical"
~~~~~

**D53** `2026-10-24T11:25:37Z` · ok · Generate EP2 sfx

~~~~~bash
cd /Users/thanhphu/my-video; time node scripts/tiktok2/ep2/generate-sfx.mjs 2>&1 | tail -4; ls "public/kênh tiktok 2/sfx/ep2" | wc -l
~~~~~

**D54** `2026-10-24T11:26:43Z` · ok · Create EP2 time module

~~~~~bash
cd /Users/thanhphu/my-video; sed -e 's#import TIMING from "./data/timing.json";#import TIMING from "./data/timing.json";#' -e 's#Truy vấn timeline EP1. MỌI mốc sinh từ giọng (scripts/tiktok2/ep1/build_timing.py → data/timing.json)#Truy vấn timeline EP2. MỌI mốc sinh từ giọng (python3 scripts/tiktok2/ep1/build_timing.py ep2 → data/timing.json)#' src/tiktok2/ep1/time.ts > src/tiktok2/ep2/time.ts; head -8 src/tiktok2/ep2/time.ts
~~~~~

**D55** `2026-10-24T11:37:37Z` · ok · Render EP2 storyboard pages

~~~~~bash
cd /Users/thanhphu/my-video; rm -rf "out/tiktok 2/review/board2"; npx remotion render src/tiktok2/index.ts T2E2Board "out/tiktok 2/review/board2" --sequence --image-format=jpeg --log=error 2>&1 | tail -5; ls "out/tiktok 2/review/board2"
~~~~~

**D56** `2026-10-24T11:38:26Z` · ok · Apply fixes and test stills

~~~~~bash
cd /Users/thanhphu/my-video/src/tiktok2/ep2/shots; python3 - <<'EOF'
def fix(p, pairs):
    s=open(p,encoding='utf-8').read()
    for a,b in pairs:
        assert a in s,(p,a); s=s.replace(a,b)
    open(p,'w',encoding='utf-8').write(s)
fix('act123.tsx',[('<BigText lines={["NẾU BẠN NHÂN BẢN ĐƯỢC", "CHÍNH MÌNH?"]} from={2} f={f} accent={[1]} y={120} size={110} />','<BigText lines={["NẾU BẠN NHÂN BẢN ĐƯỢC", "CHÍNH MÌNH?"]} from={2} f={f} accent={[1]} y={300} size={110} />')])
fix('act45.tsx',[('''          <div style={{ width: 1920, height: 1080, transform: "scale(0.3285)", transformOrigin: "0 0", position: "absolute" }}>''','''          <div style={{ width: 1920, height: 1080, transform: "translate(-170px,-10px) scale(0.5)", transformOrigin: "0 0", position: "absolute" }}>''')])
fix('act6.tsx',[('transform: "scale(0.56) translate(-1100px,-80px)"','transform: "scale(0.56) translate(-760px,-140px)"')])
fix('act78.tsx',[('''          <Ban x={1080} y={1440} t={f} back pose="sitChair" handR={{ x: 60, y: -300 }} />''','''          <PlasticChair x={1080} y={1440} color="#4f6a80" />
          <Ban x={1080} y={1440} t={f} back pose="sitChair" handR={{ x: 60, y: -300 }} />'''),
('''          <Clone k={1} x={1080} y={1440} t={f} back pose="sitChair" />''','''          <PlasticChair x={1080} y={1440} color="#4f6a80" />
          <Clone k={1} x={1080} y={1440} t={f} back pose="sitChair" />'''),
('import { Motorbike } from "../../ep1/props";','import { Motorbike, PlasticChair } from "../../ep1/props";')])
EOF
cd /Users/thanhphu/my-video; npx tsc --noEmit -p . 2>&1 | grep tiktok2 | head; S=/private/tmp/claude-501/-Users-thanhphu-my-video/f0388be0-3a67-4763-a32e-a8c763508214/scratchpad; for fr in 4040 6200; do npx remotion still src/tiktok2/index.ts Tiktok2Ep2 $S/e2_$fr.png --frame=$fr --scale=0.4 --log=error; done
~~~~~

**D57** `2026-10-24T11:39:03Z` · ok · Reframe phone photo and check

~~~~~bash
cd /Users/thanhphu/my-video; sed -i '' 's/transform: "scale(0.56) translate(-760px,-140px)"/transform: "scale(0.56) translate(-560px,-40px)"/; s/                    cam={{ x: 520, y: 1160, z: 1.6 }}\n                    f={40}/X/' src/tiktok2/ep2/shots/act6.tsx; python3 - <<'EOF'
p='src/tiktok2/ep2/shots/act6.tsx'; s=open(p,encoding='utf-8').read()
a='''                    set={lot(40)}
                    cam={{ x: 520, y: 1160, z: 1.6 }}'''
assert a in s; s=s.replace(a,'''                    set={lot(40)}
                    cam={{ x: 440, y: 1120, z: 1.15 }}''')
open(p,'w',encoding='utf-8').write(s)
EOF
S=/private/tmp/claude-501/-Users-thanhphu-my-video/f0388be0-3a67-4763-a32e-a8c763508214/scratchpad; npx remotion still src/tiktok2/index.ts Tiktok2Ep2 $S/e2_6200.png --frame=6200 --scale=0.4 --log=error
~~~~~

**D58** `2026-10-24T11:39:15Z` · ok · background · Render final EP2 MP4

~~~~~bash
cd /Users/thanhphu/my-video; sed -i '' 's/transform: "scale(0.56) translate(-560px,-40px)"/transform: "scale(0.56) translate(-640px,-40px)"/' src/tiktok2/ep2/shots/act6.tsx; grep -c "translate(-640px" src/tiktok2/ep2/shots/act6.tsx; npx remotion render src/tiktok2/index.ts Tiktok2Ep2 "out/tiktok 2/tiktok2-ep2.mp4" --codec=h264 --crf=18 --concurrency=8 --log=error > /private/tmp/claude-501/-Users-thanhphu-my-video/f0388be0-3a67-4763-a32e-a8c763508214/scratchpad/render-ep2.log 2>&1; echo EXIT $?
~~~~~

**D59** `2026-10-24T11:39:27Z` · ok · Update CLAUDE.md and memory for EP2

~~~~~bash
cd /Users/thanhphu/my-video; python3 - <<'EOF'
p='CLAUDE.md'; s=open(p,encoding='utf-8').read()
a='''- Style riêng của kênh, không dùng component hình của kênh cũ. Timeline sinh bởi `python3 scripts/tiktok2/ep1/build_timing.py` → `src/tiktok2/ep1/data/timing.json`; chỉnh tay ở `data/timing-overrides.json`. Mốc chỉ qua `src/tiktok2/ep1/time.ts` (`at()`, `sec2f()`).'''
b=a+'''
- EP2 “nhân bản” ở **`src/tiktok2/ep2/`** (composition `Tiktok2Ep2`), dùng lại Character/SetStage/props/ui của ep1 (thay đổi chung chỉ thêm prop có mặc định). Pipeline dùng chung, truyền tên tập: `build_timing.py ep2`, `check_cuts.py ep2`, `transcribe.mjs ep2`; SFX `scripts/tiktok2/ep2/generate-sfx.mjs` → `public/kênh tiktok 2/sfx/ep2/`.
- Render kênh này qua entry riêng: `npx remotion render src/tiktok2/index.ts Tiktok2Ep2 "out/tiktok 2/tiktok2-ep2.mp4"`. Mix đã duyệt: giọng 1.0, SFX ×0.45, nền ×0.56; phụ đề 50px.'''
assert a in s; s=s.replace(a,b); open(p,'w',encoding='utf-8').write(s)
p='/Users/thanhphu/.claude/projects/-Users-thanhphu-my-video/memory/series-tiktok2.md'; s=open(p,encoding='utf-8').read()
s+='''
2026-10-24 · EP1 feedback: user found captions too big (now 50px at 1080p) and SFX too loud vs voice (now voice 1.0, SFX ×0.45, ambience ×0.56, bed duck −12 dB to avoid dead air). Apply these levels to every TikTok 2 episode.
EP2 "nhân bản" built in src/tiktok2/ep2 reusing ep1 components; its voice was dropped by mistake in public/Kênh sự kiện/ep2 and was copied (not moved) to public/kênh tiktok 2/Voice/ep2.
'''
open(p,'w',encoding='utf-8').write(s)
EOF
echo ok
~~~~~

**D60** `2026-10-24T11:45:14Z` · ok · Verify EP2 output and mix

~~~~~bash
cd /Users/thanhphu/my-video; cat /private/tmp/claude-501/-Users-thanhphu-my-video/f0388be0-3a67-4763-a32e-a8c763508214/tasks/btbz9acok.output; tail -3 /private/tmp/claude-501/-Users-thanhphu-my-video/f0388be0-3a67-4763-a32e-a8c763508214/scratchpad/render-ep2.log; L=node_modules/@remotion/compositor-darwin-arm64; DYLD_LIBRARY_PATH=$L $L/ffprobe -v error -show_entries stream=codec_name,width,height,r_frame_rate,nb_frames:format=duration,size -of compact "out/tiktok 2/tiktok2-ep2.mp4"; python3 scripts/tiktok2/ep1/check_mix.py "out/tiktok 2/tiktok2-ep2.mp4" ep2; python3 scripts/tiktok2/ep1/check_cuts.py ep2 | tail -1
~~~~~

**D61** `2026-10-24T11:45:33Z` · ok · Boost dinner ambience and re-render audio

~~~~~bash
cd /Users/thanhphu/my-video; sed -i '' 's/  dinner: \[\["amb_dinner_loop", 0.55\]\],/  dinner: [["amb_dinner_loop", 0.75], ["amb_room_tone_loop", 0.4]],/' src/tiktok2/ep2/audio.tsx; grep -n "dinner:" src/tiktok2/ep2/audio.tsx; S=/private/tmp/claude-501/-Users-thanhphu-my-video/f0388be0-3a67-4763-a32e-a8c763508214/scratchpad; npx remotion render src/tiktok2/index.ts Tiktok2Ep2 "$S/mix-ep2.wav" --codec=wav --log=error 2>&1 | tail -3; python3 scripts/tiktok2/ep1/check_mix.py $S/mix-ep2.wav ep2
~~~~~

**D62** `2026-10-24T11:48:37Z` · ok · Mux final EP2 audio, verify, summarize acts

~~~~~bash
cd /Users/thanhphu/my-video; S=/private/tmp/claude-501/-Users-thanhphu-my-video/f0388be0-3a67-4763-a32e-a8c763508214/scratchpad; L=node_modules/@remotion/compositor-darwin-arm64; mv "out/tiktok 2/tiktok2-ep2.mp4" $S/ep2-video.mp4 && DYLD_LIBRARY_PATH=$L $L/ffmpeg -v error -y -i $S/ep2-video.mp4 -i $S/mix-ep2.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 256k -shortest -movflags +faststart "out/tiktok 2/tiktok2-ep2.mp4" && DYLD_LIBRARY_PATH=$L $L/ffprobe -v error -show_entries stream=codec_name,width,height,nb_frames:format=duration,size -of compact "out/tiktok 2/tiktok2-ep2.mp4"; python3 scripts/tiktok2/ep1/check_mix.py "out/tiktok 2/tiktok2-ep2.mp4" ep2; python3 -c "
import json;t=json.load(open('src/tiktok2/ep2/data/timing.json'))
n={1:'Hook',2:'Cold open – phòng ngủ sáng sớm',3:'Luật chơi',4:'Học lại mọi thứ',5:'Bắt đầu vui',6:'Cái giá',7:'Cao trào – ban công đêm',8:'Kết – bếp đêm'}
f=lambda s:f'{int(s//60)}:{s%60:04.1f}'
for a in t['acts']:
  sh=[s for s in t['shots'] if s['act']==a['act']]
  print(a['act'],n[a['act']],f(a['from']/30),f(a['to']/30),len(sh),sh[0]['firstLine'],sh[-1]['lastLine'])
print('hold',round(sum(l['hold'] for l in t['lines']),1))"
~~~~~

**D63** `2026-10-24T13:13:39Z` · ERROR · Build contact sheets of EP2 frames

~~~~~bash
cd /Users/thanhphu/my-video; S=/private/tmp/claude-501/-Users-thanhphu-my-video/f0388be0-3a67-4763-a32e-a8c763508214/scratchpad; L=node_modules/@remotion/compositor-darwin-arm64; mkdir -p $S/scan2; DYLD_LIBRARY_PATH=$L $L/ffmpeg -v error -y -i "out/tiktok 2/tiktok2-ep2.mp4" -vf "fps=1/4,scale=384:-1,tile=5x5" $S/scan2/sheet_%02d.jpg && ls $S/scan2
~~~~~

**D64** `2026-10-24T13:13:46Z` · ERROR · Render EP2 boards at two time picks

~~~~~bash
cd /Users/thanhphu/my-video; for p in 0.2 0.85; do rm -rf "out/tiktok 2/review/b2_$p"; npx remotion render src/tiktok2/index.ts T2E2Board "out/tiktok 2/review/b2_$p" --sequence --image-format=jpeg --props="{\"pick\":$p}" --log=error 2>&1 | tail -2; done; ls "out/tiktok 2/review/b2_0.2"
~~~~~

**D65** `2026-10-24T13:13:57Z` · ok · Show render error

~~~~~bash
cd /Users/thanhphu/my-video; npx remotion render src/tiktok2/index.ts T2E2Board "out/tiktok 2/review/b2_a" --sequence --image-format=jpeg --props='{"pick":0.2}' --log=error 2>&1 | grep -v "^    at" | head -8
~~~~~

**D66** `2026-10-24T13:14:07Z` · ok · Render board at 85% pick

~~~~~bash
cd /Users/thanhphu/my-video; npx remotion render src/tiktok2/index.ts T2E2Board "out/tiktok 2/review/b2_b" --sequence --image-format=jpeg --props='{"pick":0.85}' --log=error 2>&1 | grep -v "^    at" | head -5; ls "out/tiktok 2/review/b2_a" "out/tiktok 2/review/b2_b"
~~~~~

**D67** `2026-10-24T13:15:20Z` · ok · Find high-frequency noisy segments in mixes

~~~~~bash
cd /Users/thanhphu/my-video; S=/private/tmp/claude-501/-Users-thanhphu-my-video/f0388be0-3a67-4763-a32e-a8c763508214/scratchpad; L=node_modules/@remotion/compositor-darwin-arm64; for e in ep1 ep2; do DYLD_LIBRARY_PATH=$L $L/ffmpeg -v error -y -i "out/tiktok 2/tiktok2-$e.mp4" -ac 1 -ar 16000 -c:a pcm_s16le $S/hf_$e.wav; done; cat > $S/hf.py <<'EOF'
import array, math, sys, wave, json
def bp(lo, hi, sr):
    # biquad bandpass center/Q from lo..hi
    f0 = math.sqrt(lo*hi); q = f0/(hi-lo); w = 2*math.pi*f0/sr; al = math.sin(w)/(2*q); c = math.cos(w)
    b0, b1, b2, a0, a1, a2 = al, 0, -al, 1+al, -2*c, 1-al
    return [b0/a0, b1/a0, b2/a0, a1/a0, a2/a0]
for ep in ["ep1", "ep2"]:
    w = wave.open(sys.argv[1] + f"/hf_{ep}.wav"); sr = w.getframerate()
    a = array.array("h", w.readframes(w.getnframes()))
    b0, b1, b2, a1, a2 = bp(3500, 7500, sr)
    x1 = x2 = y1 = y2 = 0.0
    hop = sr // 2; acc = 0.0; tot = 0.0; out = []
    for i, s in enumerate(a):
        x = s / 32768
        y = b0*x + b1*x1 + b2*x2 - a1*y1 - a2*y2
        x2, x1, y2, y1 = x1, x, y1, y
        acc += y*y; tot += x*x
        if (i+1) % hop == 0:
            out.append((i/sr, 10*math.log10(acc/hop+1e-12), 10*math.log10(tot/hop+1e-12))); acc = tot = 0
    t = json.load(open(f"src/tiktok2/{ep}/data/timing.json"))
    loud = [(s, h, b) for s, h, b in out if h > -42]
    print(ep, "cửa sổ 0,5 s có dải cao > −42 dB:", len(loud))
    shots = t["shots"]
    agg = {}
    for s, h, b in loud:
        sid = next(x["id"] for x in shots if x["start"] <= s < x["end"] + 0.01)
        agg.setdefault(sid, []).append(h)
    for sid, hs in sorted(agg.items(), key=lambda kv: -max(kv[1]))[:15]:
        print(f"  shot {sid}: {len(hs)} cửa sổ, đỉnh dải cao {max(hs):.1f} dB")
EOF
python3 $S/hf.py $S
~~~~~

**D68** `2026-10-24T13:15:45Z` · ok · Measure HF noise when voice is silent

~~~~~bash
cd /Users/thanhphu/my-video; S=/private/tmp/claude-501/-Users-thanhphu-my-video/f0388be0-3a67-4763-a32e-a8c763508214/scratchpad; cat > $S/hf2.py <<'EOF'
import array, math, sys, wave, json
def filt(a, sr, lo, hi):
    f0 = math.sqrt(lo*hi); q = f0/(hi-lo); w = 2*math.pi*f0/sr; al = math.sin(w)/(2*q); c = math.cos(w)
    b0, b2, a0, a1, a2 = al, -al, 1+al, -2*c, 1-al
    x1=x2=y1=y2=0.0; out=array.array("f")
    for s in a:
        x=s/32768; y=(b0*x+b2*x2-a1*y1-a2*y2)/a0; x2,x1,y2,y1=x1,x,y1,y; out.append(y)
    return out
for ep in ["ep1","ep2"]:
    w=wave.open(f"{sys.argv[1]}/hf_{ep}.wav"); sr=w.getframerate(); a=array.array("h",w.readframes(w.getnframes()))
    hf=filt(a,sr,3500,7500)
    t=json.load(open(f"src/tiktok2/{ep}/data/timing.json"))
    speak=bytearray(len(a)//(sr//10)+2)
    for l in t["lines"]:
        for k in range(int(l["start"]*10)-1,int(l["end"]*10)+2):
            if 0<=k<len(speak): speak[k]=1
    hop=sr//10; res={}
    for k in range(len(a)//hop):
        if speak[k]: continue
        seg=hf[k*hop:(k+1)*hop]; full=a[k*hop:(k+1)*hop]
        h=10*math.log10(sum(v*v for v in seg)/hop+1e-12); b=10*math.log10(sum((v/32768)**2 for v in full)/hop+1e-12)
        s=k/10; sid=next(x["id"] for x in t["shots"] if x["start"]<=s<x["end"]+0.01)
        res.setdefault(sid,[]).append((h,b))
    rows=sorted(((sid,max(h for h,_ in v),sum(h for h,_ in v)/len(v),max(b for _,b in v)) for sid,v in res.items()),key=lambda r:-r[2])
    print(ep,"– shot có dải cao lớn nhất khi KHÔNG có giọng (TB dB, đỉnh dB, toàn dải đỉnh dB):")
    for sid,mx,av,bmax in rows[:10]: print(f"  {sid:5s} TB {av:6.1f}  đỉnh {mx:6.1f}  toàn dải {bmax:6.1f}")
EOF
python3 $S/hf2.py $S
~~~~~

**D69** `2026-10-24T13:16:25Z` · ok · Soften crickets, cicadas, alarm; regenerate sfx

~~~~~bash
cd /Users/thanhphu/my-video; python3 - <<'EOF'
def fix(p, pairs):
    s=open(p,encoding='utf-8').read()
    for a,b in pairs:
        assert a in s,(p,a); s=s.replace(a,b)
    open(p,'w',encoding='utf-8').write(s)
fix('scripts/tiktok2/ep1/generate-sfx.mjs',[
('''const crickets = (dur, seed = 16) => {
  const r = rng(seed);
  const s = buffer(dur);
  for (let c = 0; c < 4; c++) {
    const f = 4200 + r() * 900;
    const per = 0.7 + r() * 0.6;
    const g = 0.4 + r() * 0.6;
    const off = r() * per;
    for (let i = 0; i < s.length; i++) {
      const t = i / SR + off;
      const u = t % per;
      const chirp = u < 0.22 ? Math.max(0, Math.sin(TAU * 30 * u)) : 0;
      s[i] += Math.sin(TAU * f * t) * chirp * g;
    }
  }
  return verb(s, 0.3, 1.5);
};''','''/** Dế xa: nhiễu lọc dải mềm (không dùng sine thuần – sine 4–5 kHz nghe chói "eee"), nhịp rả rích, nhỏ. */
const crickets = (dur, seed = 16) => {
  const r = rng(seed);
  const s = buffer(dur);
  for (let c = 0; c < 3; c++) {
    const bp = biquad("bp", 3300 + r() * 500, 6);
    const per = 0.9 + r() * 0.7;
    const g = 0.4 + r() * 0.5;
    const off = r() * per;
    for (let i = 0; i < s.length; i++) {
      const t = i / SR + off;
      const u = t % per;
      const chirp = u < 0.24 ? Math.sin((Math.PI * u) / 0.24) * (0.6 + 0.4 * Math.sin(TAU * 24 * u)) : 0;
      s[i] += bp(nz(r)) * chirp * g;
    }
  }
  return verb(filt(s, "lp", 4200), 0.35, 1.5);
};'''),
('''  amb_night_loop: () => loopify((d) => add(crickets(d, 140), room(d, 141, 200), 0, 0.3), 8),''','''  amb_night_loop: () => loopify((d) => add(add(room(d, 141, 220), crickets(d, 140), 0, 0.35), passby(4, 142), 3, 0.2), 8),'''),
])
fix('scripts/tiktok2/ep2/generate-sfx.mjs',[
('''/** Chuông báo thức điện tử: bíp bíp bíp – nghỉ. */
const alarm = (dur = 3) => {
  const s = buffer(dur);
  for (let i = 0; i < s.length; i++) {
    const t = i / SR;
    const u = t % 1.0;
    const on = u < 0.6 && u % 0.15 < 0.08;
    s[i] = on ? Math.sign(Math.sin(TAU * 2900 * t)) * 0.3 + Math.sin(TAU * 2900 * t) * 0.5 : 0;
  }
  return filt(s, "lp", 6000);
};''','''/** Chuông báo thức: bíp bíp dịu (sine 1,6 kHz, sườn mềm – không dùng sóng vuông chói). */
const alarm = (dur = 3) => {
  const s = buffer(dur);
  for (let i = 0; i < s.length; i++) {
    const t = i / SR;
    const u = t % 1.0;
    const v = u % 0.18;
    const on = u < 0.62 && v < 0.1 ? Math.sin((Math.PI * v) / 0.1) : 0;
    s[i] = (Math.sin(TAU * 1600 * t) + 0.25 * Math.sin(TAU * 3200 * t)) * on;
  }
  return filt(s, "lp", 3500);
};'''),
('''const cicadas = (dur) => {
  const s = buffer(dur);
  for (let i = 0; i < s.length; i++) {
    const t = i / SR;
    s[i] = Math.sin(TAU * 5200 * t) * (0.5 + 0.5 * Math.sin(TAU * 42 * t)) * (0.7 + 0.3 * Math.sin(TAU * 0.2 * t));
  }
  return verb(s, 0.3);
};''','''/** Ve kêu xa: nhiễu lọc dải ~3,8 kHz rung 40 Hz, lọc thông thấp (không dùng sine thuần chói tai). */
const cicadas = (dur) => {
  const r = rng(90);
  const s = buffer(dur);
  const bp = biquad("bp", 3800, 3);
  for (let i = 0; i < s.length; i++) {
    const t = i / SR;
    s[i] = bp(nz(r)) * (0.55 + 0.45 * Math.sin(TAU * 40 * t)) * (0.7 + 0.3 * Math.sin(TAU * 0.2 * t));
  }
  return verb(filt(s, "lp", 4500), 0.4, 1.4);
};'''),
('''  amb_balcony_night_loop: () => loopify((d) => add(add(filt(room(d, 130, 180, 1.4), "lp", 160), crickets(d, 131), 0, 0.6), passby(4, 132), 4, 0.25), 10),''','''  amb_balcony_night_loop: () => loopify((d) => add(add(filt(room(d, 130, 180, 1.4), "lp", 160), crickets(d, 131), 0, 0.25), passby(4, 132), 4, 0.3), 10),'''),
])
fix('src/tiktok2/ep2/shots/act45.tsx',[('loopFor("cicadas_loop", 0, h.dur + 6, 0.45, 10)','loopFor("cicadas_loop", 0, h.dur + 6, 0.2, 10)')])
fix('src/tiktok2/ep2/shots/act123.tsx',[('fx: (h) => [hit("alarm", 0, 0.8), hit("alarm_rattle", 0, 0.6), hit("blanket", h.L("L005"), 0.6)]','fx: (h) => [hit("alarm", 0, 0.55), hit("alarm_rattle", 0, 0.45), hit("blanket", h.L("L005"), 0.6)]')])
fix('src/tiktok2/ep2/shots/act78.tsx',[('fx: () => [hit("alarm", 0, 0.7), hit("alarm_rattle", 0, 0.5)]','fx: () => [hit("alarm", 0, 0.5), hit("alarm_rattle", 0, 0.4)]')])
EOF
grep -n "nz = \|const nz" scripts/tiktok2/ep1/generate-sfx.mjs | head -2; node scripts/tiktok2/ep1/generate-sfx.mjs amb_night_loop && node scripts/tiktok2/ep2/generate-sfx.mjs alarm cicadas_loop amb_balcony_night_loop amb_kitchen_night_loop && npx tsc --noEmit -p . 2>&1 | grep tiktok2 | head
~~~~~

**D70** `2026-10-24T13:16:56Z` · ok · Soften shimmer and phone swipe; regenerate all sfx

~~~~~bash
cd /Users/thanhphu/my-video; python3 - <<'EOF'
def fix(p, pairs):
    s=open(p,encoding='utf-8').read()
    for a,b in pairs:
        assert a in s,(p,a); s=s.replace(a,b)
    open(p,'w',encoding='utf-8').write(s)
fix('scripts/tiktok2/ep1/generate-sfx.mjs',[
('''  const parts = Array.from({ length: 9 }, () => ({ f: 2200 + r() * 4200, ph: r() * TAU, tr: 6 + r() * 9, at: r() * 0.35 }));''','''  // dải 1,6–4 kHz, rung chậm hơn: lấp lánh mềm, không chói
  const parts = Array.from({ length: 9 }, () => ({ f: 1600 + r() * 2400, ph: r() * TAU, tr: 4 + r() * 5, at: r() * 0.35 }));'''),
('''  return verb(s, 0.35, 0.7);
};
const pop =''','''  return verb(filt(s, "lp", 5000), 0.35, 0.7);
};
const pop ='''),
])
fix('scripts/tiktok2/ep2/generate-sfx.mjs',[('const phoneSwipe = () => filt(whoosh(0.22, 77, 2000, 5000), "hp", 1500);','const phoneSwipe = () => filt(filt(whoosh(0.22, 77, 900, 2600), "hp", 600), "lp", 3500);')])
EOF
node scripts/tiktok2/ep1/generate-sfx.mjs > /dev/null && node scripts/tiktok2/ep2/generate-sfx.mjs > /dev/null && echo "sfx regenerated"; for e in 1 2; do sed -i '' 's/loopFor("static_loop", 0, h.dur, 0.25, 8)/loopFor("static_loop", 0, h.dur, 0.12, 8)/; s/loopFor("static_loop", 0, h.dur, 0.2, 8)/loopFor("static_loop", 0, h.dur, 0.1, 8)/' src/tiktok2/ep1/shots/act56.tsx; done; grep -n '"phone_swipe", t, 0\.[0-9]' src/tiktok2/ep2/shots/*.tsx | head
~~~~~

**D71** `2026-10-24T13:17:14Z` · ok · Lower swipe volumes; render audio for both episodes

~~~~~bash
cd /Users/thanhphu/my-video; sed -i '' 's/map((t) => hit("phone_swipe", t, 0.4))/map((t) => hit("phone_swipe", t, 0.25))/; s/\[0, 18, 36, 54, 72, 90, 108, 126\].filter((t) => t < h.dur).map((t) => hit("phone_swipe", t, 0.35))/[0, 36, 72, 108].filter((t) => t < h.dur).map((t) => hit("phone_swipe", t, 0.22))/' src/tiktok2/ep2/shots/act6.tsx; sed -i '' 's/\[0, 14, 30, 44, 60, 80\].map((t) => hit("phone_swipe", t, 0.5))/[0, 30, 60].map((t) => hit("phone_swipe", t, 0.3))/' src/tiktok2/ep2/shots/act45.tsx; npx tsc --noEmit -p . 2>&1 | grep tiktok2 | head; S=/private/tmp/claude-501/-Users-thanhphu-my-video/f0388be0-3a67-4763-a32e-a8c763508214/scratchpad; for e in 1 2; do npx remotion render src/tiktok2/index.ts Tiktok2Ep$e "$S/mixfix-ep$e.wav" --codec=wav --log=error 2>&1 | tail -2; done; ls -la $S/mixfix-ep*.wav
~~~~~

**D72** `2026-10-24T13:53:26Z` · ok · Replace hissy water; rank loops by hiss content

~~~~~bash
cd /Users/thanhphu/my-video; python3 - <<'EOF'
def fix(p, pairs):
    s=open(p,encoding='utf-8').read()
    for a,b in pairs:
        assert a in s,(p,a); s=s.replace(a,b)
    open(p,'w',encoding='utf-8').write(s)
fix('scripts/tiktok2/ep2/generate-sfx.mjs',[
('''const waterRun = (dur) => {
  const r = rng(82);
  const s = buffer(dur);
  const bp = biquad("bp", 1800, 0.6);
  const lp = biquad("lp", 900, 0.7);
  for (let i = 0; i < s.length; i++) s[i] = bp(nz(r)) * 0.6 + lp(nz(r)) * 0.5;
  return s;
};''','''/** Nước chảy vào bồn: tiếng róc rách (các bọt "ục" cao độ ngẫu nhiên) trên nền ầm nhẹ tần thấp – không dùng nhiễu dải rộng (nghe như xè xè). */
const waterRun = (dur) => {
  const r = rng(82);
  const s = buffer(dur);
  const lp = biquad("lp", 380, 0.7);
  for (let i = 0; i < s.length; i++) s[i] = lp(nz(r)) * 0.5;
  for (let k = 0; k < dur * 26; k++) {
    const at = r() * (dur - 0.08);
    const f = 300 + r() * 520;
    const b = buffer(0.06);
    for (let i = 0; i < b.length; i++) {
      const t = i / SR;
      b[i] = Math.sin(TAU * f * (1 + 4 * t) * t) * Math.exp(-t * 70);
    }
    add(s, b, at, 0.25 + r() * 0.35);
  }
  return filt(s, "lp", 1600);
};'''),
])
for p,a,b in [
 ('src/tiktok2/ep2/shots/act78.tsx','loopFor("water_run_loop", h.L("L193") - 2, h.dur + 4, 0.45, 8)','loopFor("water_run_loop", h.L("L193") - 2, h.dur + 4, 0.22, 8)'),
 ('src/tiktok2/ep2/shots/act78.tsx','loopFor("water_run_loop", 0, h.dur + 4, 0.45, 4)','loopFor("water_run_loop", 0, h.dur + 4, 0.22, 4)'),
 ('src/tiktok2/ep2/shots/act78.tsx','loopFor("water_run_loop", 0, h.dur + 4, 0.5, 4)','loopFor("water_run_loop", 0, h.dur + 4, 0.24, 4)'),
 ('src/tiktok2/ep2/shots/act78.tsx','loopFor("water_run_loop", 0, h.dur + 4, 0.35, 4)','loopFor("water_run_loop", 0, h.dur + 4, 0.18, 4)'),
 ('src/tiktok2/ep2/shots/act78.tsx','loopFor("water_run_loop", 0, h.dur + 4, 0.3, 4)','loopFor("water_run_loop", 0, h.dur + 4, 0.16, 4)'),
 ('src/tiktok2/ep2/shots/act78.tsx','loopFor("water_run_loop", 0, h.dur, 0.35, 30)','loopFor("water_run_loop", 0, h.dur, 0.16, 30)'),
]:
    fix(p,[(a,b)])
EOF
node scripts/tiktok2/ep2/generate-sfx.mjs water_run_loop; S=/private/tmp/claude-501/-Users-thanhphu-my-video/f0388be0-3a67-4763-a32e-a8c763508214/scratchpad; cat > $S/noisy.py <<'EOF'
# Xếp hạng file SFX/ambience theo "độ xè" = năng lượng dải 2–8 kHz dạng nhiễu (không có cao độ), để tìm nguồn tiếng xè xè.
import array, glob, math, os, sys, wave
def band(a, sr, lo, hi):
    f0 = math.sqrt(lo*hi); q = f0/(hi-lo); w = 2*math.pi*f0/sr; al = math.sin(w)/(2*q); c = math.cos(w)
    b0, b2, a0, a1, a2 = al, -al, 1+al, -2*c, 1-al; x1=x2=y1=y2=0.0; e=0.0
    for s in a:
        x=s/32768; y=(b0*x+b2*x2-a1*y1-a2*y2)/a0; x2,x1,y2,y1=x1,x,y1,y; e+=y*y
    return e/len(a)
rows=[]
for p in sorted(glob.glob(sys.argv[1]+"/*_loop.wav")):
    w=wave.open(p); a=array.array("h",w.readframes(min(w.getnframes(), w.getframerate()*3)))
    tot=sum((s/32768)**2 for s in a)/len(a); hf=band(a,w.getframerate(),2000,8000)
    rows.append((10*math.log10(hf/tot+1e-12), 10*math.log10(hf+1e-12), os.path.basename(p)))
for r in sorted(rows, reverse=True)[:10]: print(f"  {r[2]:34s} tỉ lệ dải cao {r[0]:6.1f} dB · mức dải cao {r[1]:6.1f} dB")
EOF
for e in ep1 ep2; do echo $e; python3 $S/noisy.py "public/kênh tiktok 2/sfx/$e"; done
~~~~~

**D73** `2026-10-24T14:06:02Z` · ok · Check failed render; soften panting

~~~~~bash
cd /Users/thanhphu/my-video; tail -5 /private/tmp/claude-501/-Users-thanhphu-my-video/f0388be0-3a67-4763-a32e-a8c763508214/tasks/bc75cygaq.output | cut -c1-300; python3 - <<'EOF'
def fix(p, pairs):
    s=open(p,encoding='utf-8').read()
    for a,b in pairs:
        assert a in s,(p,a); s=s.replace(a,b)
    open(p,'w',encoding='utf-8').write(s)
fix('scripts/tiktok2/ep1/generate-sfx.mjs',[
('''const panting = (dur) => {
  const s = buffer(dur);
  for (let t = 0, k = 0; t < dur - 0.6; t += 0.82, k++) {
    add(s, inhale(0.38, 40 + k), t, 0.8);
    add(s, exhale(0.42, 60 + k, 1100), t + 0.38, 1);
  }
  return s;
};''','''/** Thở hổn hển: hơi thở tần thấp, mềm (lọc thông thấp 1,2 kHz – không nghe xè xè). */
const panting = (dur) => {
  const s = buffer(dur);
  for (let t = 0, k = 0; t < dur - 0.6; t += 0.82, k++) {
    add(s, inhale(0.38, 40 + k), t, 0.6);
    add(s, exhale(0.42, 60 + k, 700), t + 0.38, 1);
  }
  return filt(filt(s, "lp", 1200), "lp", 1200);
};'''),
])
for a,b in [('loopFor("panting_loop", h.L("L211") - 4, h.dur + 30, 0.7, 6)','loopFor("panting_loop", h.L("L211") - 4, h.dur + 30, 0.45, 6)'),('loopFor("panting_loop", 0, h.dur, 0.5, 10)','loopFor("panting_loop", 0, h.dur, 0.35, 10)'),('loopFor("panting_loop", 0, h.L("L230"), 0.75, 6)','loopFor("panting_loop", 0, h.L("L230"), 0.45, 6)')]:
    fix('src/tiktok2/ep1/shots/act8.tsx',[(a,b)])
EOF
node scripts/tiktok2/ep1/generate-sfx.mjs panting_loop; S=/private/tmp/claude-501/-Users-thanhphu-my-video/f0388be0-3a67-4763-a32e-a8c763508214/scratchpad; python3 $S/noisy.py "public/kênh tiktok 2/sfx/ep1" | head -3
~~~~~

**D74** `2026-10-24T14:06:15Z` · ok · background · Re-render audio for both episodes and mux

~~~~~bash
cd /Users/thanhphu/my-video; S=/private/tmp/claude-501/-Users-thanhphu-my-video/f0388be0-3a67-4763-a32e-a8c763508214/scratchpad; L=node_modules/@remotion/compositor-darwin-arm64; set -e; for e in 1 2; do npx remotion render src/tiktok2/index.ts Tiktok2Ep$e "$S/mixfix-ep$e.wav" --codec=wav --timeout=240000 --concurrency=4 --log=error; cp "out/tiktok 2/tiktok2-ep$e.mp4" "$S/video-ep$e-prev.mp4"; DYLD_LIBRARY_PATH=$L $L/ffmpeg -v error -y -i "$S/video-ep$e-prev.mp4" -i "$S/mixfix-ep$e.wav" -map 0:v -map 1:a -c:v copy -c:a aac -b:a 256k -shortest -movflags +faststart "out/tiktok 2/tiktok2-ep$e.mp4"; python3 scripts/tiktok2/ep1/check_mix.py "out/tiktok 2/tiktok2-ep$e.mp4" ep$e; done; echo ALL DONE
~~~~~

**D75** `2026-10-24T14:15:13Z` · ok · Verify muxed files and re-measure HF noise

~~~~~bash
cd /Users/thanhphu/my-video; cat /private/tmp/claude-501/-Users-thanhphu-my-video/f0388be0-3a67-4763-a32e-a8c763508214/tasks/b31oe3jhh.output; L=node_modules/@remotion/compositor-darwin-arm64; for e in 1 2; do DYLD_LIBRARY_PATH=$L $L/ffprobe -v error -show_entries stream=codec_name,width,height,nb_frames:format=duration -of compact "out/tiktok 2/tiktok2-ep$e.mp4"; done; S=/private/tmp/claude-501/-Users-thanhphu-my-video/f0388be0-3a67-4763-a32e-a8c763508214/scratchpad; for e in ep1 ep2; do DYLD_LIBRARY_PATH=$L $L/ffmpeg -v error -y -i "out/tiktok 2/tiktok2-$e.mp4" -ac 1 -ar 16000 -c:a pcm_s16le $S/hf_$e.wav; done; python3 $S/hf2.py $S
~~~~~

**D76** `2026-10-25T04:27:52Z` · ok · Start whisper and print EP3 SRT

~~~~~bash
cd /Users/thanhphu/my-video; mkdir -p scripts/tiktok2/ep3 src/tiktok2/ep3/data src/tiktok2/ep3/shots "public/kênh tiktok 2/sfx/ep3"; (node scripts/tiktok2/ep1/transcribe.mjs ep3 > /private/tmp/claude-501/-Users-thanhphu-my-video/f0388be0-3a67-4763-a32e-a8c763508214/scratchpad/whisper3.log 2>&1 &); python3 - <<'EOF'
t=open("public/kênh tiktok 2/Voice/ep3/ep3 tiktok2.srt",encoding="utf-8").read().strip().split("\n\n")
f=lambda s: int(s[:2])*3600+int(s[3:5])*60+float(s[6:].replace(",","."))
for b in t:
    l=b.strip().split("\n"); a,z=l[1].split(" --> ")
    print(l[0], f"{f(a):.1f}", " ".join(l[2:]))
EOF
~~~~~

**D77** `2026-10-25T04:28:41Z` · ok · Add atHold shots; verify ep2 unchanged

~~~~~bash
cd /Users/thanhphu/my-video; python3 - <<'EOF'
p='scripts/tiktok2/ep1/build_timing.py'; s=open(p,encoding='utf-8').read()
a='''    flat = [" ".join(words_of(l["text"])) for l in lines]
    cur = 0
    for s in shots_in:
        if s["id"] in ov.get("anchors", {}):'''
b='''    flat = [" ".join(words_of(l["text"])) for l in lines]
    cur = 0
    for s in shots_in:
        if "atHold" in s:
            # shot chỉ có hình, nằm trong khoảng hold sau một câu (không có thoại riêng)
            s["first"] = None
            s["holdLine"] = next(k for k, l in enumerate(lines) if l["id"] == s["atHold"])
            continue
        if s["id"] in ov.get("anchors", {}):'''
assert a in s; s=s.replace(a,b)
a='''    for k, s in enumerate(shots_in):
        s["last"] = (shots_in[k + 1]["first"] - 1) if k + 1 < len(shots_in) else n - 1
    hold = {}
    fast = set()
    for s in shots_in:'''
b='''    voiced = [s for s in shots_in if s["first"] is not None]
    for k, s in enumerate(voiced):
        s["last"] = (voiced[k + 1]["first"] - 1) if k + 1 < len(voiced) else n - 1
    hold = {}
    fast = set()
    for s in voiced:'''
assert a in s; s=s.replace(a,b)
a='''    shots = []
    for k, s in enumerate(shots_in):
        a = 0 if k == 0 else lines[s["first"]]["from"] - 2
        b = (lines[shots_in[k + 1]["first"]]["from"] - 2) if k + 1 < len(shots_in) else total
        shots.append({"id": s["id"], "act": s["act"], "moc": s["moc"], "firstLine": lines[s["first"]]["id"], "lastLine": lines[s["last"]]["id"], "from": a, "to": b, "start": round(a / FPS, 3), "end": round(b / FPS, 3)})'''
b='''    shots = []
    startOf = lambda s: lines[s["holdLine"]]["holdFrom"] if s["first"] is None else lines[s["first"]]["from"] - 2
    for k, s in enumerate(shots_in):
        a = 0 if k == 0 else startOf(s)
        b = startOf(shots_in[k + 1]) if k + 1 < len(shots_in) else total
        fl = lines[s["first"]]["id"] if s["first"] is not None else None
        ll = lines[s["last"]]["id"] if s["first"] is not None else None
        shots.append({"id": s["id"], "act": s["act"], "moc": s["moc"], "firstLine": fl, "lastLine": ll, "from": a, "to": b, "start": round(a / FPS, 3), "end": round(b / FPS, 3)})'''
assert a in s; s=s.replace(a,b)
a='''    for s in shots:
        for k in range(int(s["firstLine"][1:]) - 1, int(s["lastLine"][1:])):'''
b='''    for s in shots:
        if not s["firstLine"]:
            md.append(f"| {s['id']} | – | {s['start']:.2f} | {s['end']:.2f} | (chỉ hình, trong hold) | |")
            continue
        for k in range(int(s["firstLine"][1:]) - 1, int(s["lastLine"][1:])):'''
assert a in s; s=s.replace(a,b)
open(p,'w',encoding='utf-8').write(s)
EOF
S=/private/tmp/claude-501/-Users-thanhphu-my-video/f0388be0-3a67-4763-a32e-a8c763508214/scratchpad; cp src/tiktok2/ep2/data/timing.json $S/ep2-before.json; python3 scripts/tiktok2/ep1/build_timing.py ep2 | tail -1; cmp src/tiktok2/ep2/data/timing.json $S/ep2-before.json && echo "EP2 unchanged"; python3 scripts/tiktok2/ep1/build_timing.py ep1 | tail -1; tail -2 $S/whisper3.log
~~~~~

**D78** `2026-10-25T04:29:07Z` · ok · Write EP3 shotlist and overrides

~~~~~bash
cd /Users/thanhphu/my-video; python3 - <<'EOF'
import json
S=[
("1.1",1,"Nếu bạn quay lại được",{"hold":0.5}),
("2.1",2,"Bảy giờ sáng",{"hold":0.2}),
("2.2",2,"Bạn đã tập câu chào",{"hold":0.3}),
("2.3",2,"Linh nhìn bạn",{"hold":0.3}),
("2.4",2,"Chào",{"hold":0.3}),
("2.5",2,"Linh khựng lại",{"hold":1.2}),
("2.6",2,"Bạn vừa gọi",{"hold":0.6}),
("2.7",2,"Bạn nhắm mắt",{"hold":0.2,"lineHolds":{"L014":0.5}}),
("2.8",2,"Chào linh",{"hold":0.4}),
("2.9",2,"Tua lại",{"hold":0.4}),
("2.10",2,"Lần thứ ba",{"hold":0.9}),
("2.11",2,"Bảy giờ năm phút",{"hold":1.0}),
("3.1",3,"Luật thế này",{}),
("3.2",3,"Nắm chặt tay",{"hold":0.3}),
("3.3",3,"Chỉ mình bạn nhớ",{"hold":0.3}),
("3.4",3,"Mỗi ngày ba lần",{"hold":0.3}),
("3.5",3,"Và khi đã dùng hết lượt thứ ba",{"hold":0.6}),
("3.6",3,"trung bình mỗi người nói",{"hold":0.4}),
("3.7",3,"ấn tượng đầu tiên",{"hold":0.5}),
("4.1",4,"Ngày thứ hai",{"fast":True}),
("4.2",4,"Tám giờ mười",{"fast":True}),
("4.3",4,"Tám giờ mười lăm",{"fast":True,"hold":0.4}),
("4.4",4,"Thế là bạn mua một cuốn sổ",{"hold":0.3}),
("4.5",4,"Bạn bắt đầu tiêu",{"hold":0.4}),
("5.1",5,"Đá phạt đền",{"hold":0.3}),
("5.2",5,"Bạn sút",{"hold":0.4}),
("5.3",5,"Tua lại",{"hold":0.2}),
("5.4",5,"Vào",{"hold":0.9}),
("5.5",5,"Thủ môn đứng nhìn",{"hold":1.0}),
("5.6",5,"Giờ sinh hoạt",{}),
("5.7",5,"Câu thứ nhất",{"hold":0.3}),
("5.8",5,"Câu thứ ba",{"hold":0.4,"lineHolds":{"L083":1.0}}),
("5.9",5,"Và Linh",{"hold":0.3}),
("5.10",5,"Lần hai",{"hold":0.6}),
("5.11",5,"Bạn trở thành người hoàn hảo",{"hold":0.6}),
("6.1",6,"Nhưng có một cái giá",{}),
("6.2",6,"Một câu nói hớ",{"fast":True}),
("6.3",6,"Và khi đã hết lượt",{"hold":0.4}),
("6.4",6,"Vậy là có một luật",{"hold":0.6}),
("6.5",6,"Từ trưa tới tối",{"hold":0.4}),
("6.6",6,"Phong thằng bạn thân",{"hold":0.3}),
("6.7",6,"Dạo này mày nói chuyện",{"hold":0.4}),
("6.8",6,"Mẹ cũng nói y vậy",{"hold":0.4}),
("6.9",6,"Bạn hoàn hảo hơn bao giờ hết",{"hold":1.2}),
("7.1",7,"Lượt một",{"fast":True}),
("7.2",7,"Lượt hai",{"fast":True}),
("7.3",7,"Lượt ba",{"fast":True}),
("7.4",7,"Bốn giờ chiều",{"hold":0.5}),
("7.5",7,"Phong chạy tới",{}),
("7.6",7,"Ba tao chuyển công tác",{"hold":0.5}),
("7.7",7,"Phong là đứa duy nhất biết",{"hold":0.4}),
("7.8",7,"Sao giờ mày mới nói",{"hold":0.3}),
("7.9",7,"Bạn nắm chặt tay",{"hold":0.6,"lineHolds":{"L146":1.0}}),
("7.10",7,"Phong nhìn bạn",{"hold":0.8}),
("7.11",7,"Ba ô tròn đã tô kín",{"hold":0.8}),
("8.1",8,"Bốn giờ bốn mươi",{"hold":0.3}),
("8.2",8,"Bạn có thể đợi tới nửa đêm",{"hold":0.4}),
("8.3",8,"Bạn chạy",{"fast":True}),
("8.4",8,"Bến xe",{"hold":0.4}),
("8.5",8,"Phong ngồi cạnh cửa sổ",{"hold":0.4}),
("8.6",8,"Bạn gõ lên kính",{"hold":0.4}),
("8.7",8,"Bạn đã chạy suốt quãng đường",{"hold":0.5}),
("8.8",8,"Tao",{"hold":1.2}),
("8.9",8,"Phong nhìn bạn",{"hold":0.3}),
("8.10",8,"Nhưng tao biết mày nói thật",{"hold":1.5}),
("8.11",8,"Xe lăn bánh",{"hold":1.2}),
("8.12",8,"Câu nói hoàn hảo",{"hold":1.0}),
("9.1",9,"Thứ hai",{}),
("9.2",9,"Ba ô tròn trong sổ",{"hold":0.3}),
("9.3",9,"Chào",{"hold":0.3}),
("9.4",9,"Linh khựng lại",{"hold":0.4}),
("9.5",9,"Bạn kỳ ghê",{"hold":0.5}),
("9.6",9,"Tay bạn đã nắm lại",{"hold":1.2}),
("9.7",9,"Lần này bạn để nguyên",{"hold":0.8}),
("9.8",9,"Tối đó điện thoại rung",{"hold":0.3}),
("9.9",9,"Phong gửi một tấm ảnh",{"hold":0.6}),
("9.10",9,"Tao tới rồi",{"hold":1.2}),
("9.11",9,"Nửa đêm Ba ô tròn mới",{"hold":2.8}),
("9.12",9,"(teaser – chỉ hình)",{"atHold":"L219"}),
("9.13",9,"Còn bạn",{}),
]
shots=[]
for id,act,moc,o in S:
    d={"id":id,"act":act,"moc":moc}; d.update(o); shots.append(d)
json.dump({"_doc":"Danh sách shot EP3. moc = vài chữ đầu câu (so khớp gần đúng, theo thứ tự). hold = giây giữ hình sau câu cuối của shot. lineHolds = giữ sau một câu cụ thể. fast = cắt dồn dập. atHold = shot chỉ có hình, đặt trong hold sau câu đó (9.12 teaser – voice không có câu này).","shots":shots},open('src/tiktok2/ep3/data/shotlist.json','w',encoding='utf-8'),ensure_ascii=False,indent=1)
json.dump({"_doc":"Chỉnh tay timeline EP3 rồi chạy lại: python3 scripts/tiktok2/ep1/build_timing.py ep3. Đơn vị giây. holds: giữ hình sau câu. gaps: khoảng lặng sau câu. anchors: gắn shot vào câu khác. trim: nới/thu đầu-cuối câu [đầu, cuối]. endCard: độ dài thẻ cuối.",
 "holds":{},"gaps":{},"anchors":{"3.6":"L042","3.7":"L046","4.1":"L050","5.1":"L063","5.4":"L069","7.1":"L121","9.10":"L215","9.11":"L218"},"trim":{},"endCard":1.5,"maxGap":0.38,"minGap":0.15},open('src/tiktok2/ep3/data/timing-overrides.json','w',encoding='utf-8'),ensure_ascii=False,indent=2)
EOF
tail -1 /private/tmp/claude-501/-Users-thanhphu-my-video/f0388be0-3a67-4763-a32e-a8c763508214/scratchpad/whisper3.log
~~~~~

**D79** `2026-10-25T04:29:12Z` · ok · Build EP3 timeline and check cuts

~~~~~bash
cd /Users/thanhphu/my-video; python3 scripts/tiktok2/ep1/build_timing.py ep3 && python3 scripts/tiktok2/ep1/check_cuts.py ep3 | tail -4 && python3 -c "
import json;t=json.load(open('src/tiktok2/ep3/data/timing.json'))
for s in t['shots']: print(s['id'],s['firstLine'],s['lastLine'],s['start'],round(s['end']-s['start'],2))
" | column -c 220
~~~~~

**D80** `2026-10-25T04:30:08Z` · ok · Create EP3 time module

~~~~~bash
cd /Users/thanhphu/my-video; sed -e 's#Truy vấn timeline EP1. MỌI mốc sinh từ giọng (scripts/tiktok2/ep1/build_timing.py → data/timing.json)#Truy vấn timeline EP3. MỌI mốc sinh từ giọng (python3 scripts/tiktok2/ep1/build_timing.py ep3 → data/timing.json)#' src/tiktok2/ep1/time.ts > src/tiktok2/ep3/time.ts; grep -c "EP3" src/tiktok2/ep3/time.ts
~~~~~

**D81** `2026-10-25T04:38:39Z` · ok · Generate EP3 sfx and check hiss ranking

~~~~~bash
cd /Users/thanhphu/my-video; python3 - <<'EOF'
p='scripts/tiktok2/ep3/generate-sfx.mjs'; s=open(p,encoding='utf-8').read()
s=s.replace("import { add, babble, birds, clink, creak, crinkle, engine, filt, gen as ep1, hum, loopify,","import { add, babble, birds, clink, crinkle, engine, filt, gen as ep1, loopify,")
s=s.replace("void creak;\nvoid hum;\n","")
open(p,'w',encoding='utf-8').write(s)
EOF
node scripts/tiktok2/ep3/generate-sfx.mjs 2>&1 | tail -3; ls "public/kênh tiktok 2/sfx/ep3" | wc -l; S=/private/tmp/claude-501/-Users-thanhphu-my-video/f0388be0-3a67-4763-a32e-a8c763508214/scratchpad; python3 $S/noisy.py "public/kênh tiktok 2/sfx/ep3"
~~~~~

**D82** `2026-10-25T04:40:23Z` · ok · Render EP3 storyboard pages

~~~~~bash
cd /Users/thanhphu/my-video; rm -rf "out/tiktok 2/review/board3"; npx remotion render src/tiktok2/index.ts T2E3Board "out/tiktok 2/review/board3" --sequence --image-format=jpeg --log=error 2>&1 | grep -v "^    at" | head -8; ls "out/tiktok 2/review/board3"
~~~~~

**D83** `2026-10-25T04:41:26Z` · ok · Fix syntax; test bus stills

~~~~~bash
cd /Users/thanhphu/my-video; python3 - <<'EOF'
p='src/tiktok2/ep3/shots/act89.tsx'; s=open(p,encoding='utf-8').read()
s=s.replace('shadow={{false}} />','shadow={false} />')
a='''          <PhongInBus f={f} eyes={f >= L("L188") ? "happy" : "half"} />
          <Coach x={600} y={1500} f={f} running window={1} />'''
assert a in s
s=s.replace(a,'''          <Coach x={600} y={1500} f={f} running window={1} inside={<PhongInBus f={f} eyes={f >= L("L188") ? "happy" : "half"} />} />''')
open(p,'w',encoding='utf-8').write(s)
EOF
npx tsc --noEmit -p . 2>&1 | grep tiktok2 | head; S=/private/tmp/claude-501/-Users-thanhphu-my-video/f0388be0-3a67-4763-a32e-a8c763508214/scratchpad; for fr in 8600 9500; do npx remotion still src/tiktok2/index.ts Tiktok2Ep3 $S/e3_$fr.png --frame=$fr --scale=0.4 --log=error; done
~~~~~

**D84** `2026-10-25T04:42:15Z` · ok · Move Bạn beside window; render last board pages

~~~~~bash
cd /Users/thanhphu/my-video; sed -i '' 's/WIN.x + 160/WIN.x + 330/g' src/tiktok2/ep3/shots/act89.tsx; grep -c "WIN.x + 330" src/tiktok2/ep3/shots/act89.tsx; rm -rf "out/tiktok 2/review/board3"; npx remotion render src/tiktok2/index.ts T2E3Board "out/tiktok 2/review/board3" --sequence --frames=5-6 --image-format=jpeg --log=error 2>&1 | grep -v "^    at" | head -3
~~~~~

**D85** `2026-10-25T04:42:32Z` · ok · background · Render final EP3 MP4

~~~~~bash
cd /Users/thanhphu/my-video; npx remotion render src/tiktok2/index.ts Tiktok2Ep3 "out/tiktok 2/tiktok2-ep3.mp4" --codec=h264 --crf=18 --concurrency=8 --timeout=240000 --log=error > /private/tmp/claude-501/-Users-thanhphu-my-video/f0388be0-3a67-4763-a32e-a8c763508214/scratchpad/render-ep3.log 2>&1; echo EXIT $?
~~~~~

**D86** `2026-10-25T04:42:42Z` · ok · Update CLAUDE.md and memory for EP3

~~~~~bash
cd /Users/thanhphu/my-video; python3 - <<'EOF'
p='CLAUDE.md'; s=open(p,encoding='utf-8').read()
a='- Render kênh này qua entry riêng:'
b='''- EP3 “quay lại 30 giây” ở **`src/tiktok2/ep3/`** (composition `Tiktok2Ep3`): RewindFX, FistECU, RewindCounter, Notebook trong `ep3/kit.tsx`; shot chỉ có hình nằm trong hold dùng `"atHold": "Lxxx"` trong shotlist. SFX `scripts/tiktok2/ep3/generate-sfx.mjs` → `sfx/ep3/`. Tránh sine thuần tần cao và nhiễu dải rộng kéo dài (người dùng nghe thành “e e”, “xè xè”).
- Render kênh này qua entry riêng:'''
assert a in s; s=s.replace(a,b,1); open(p,'w',encoding='utf-8').write(s)
p='/Users/thanhphu/.claude/projects/-Users-thanhphu-my-video/memory/series-tiktok2.md'; s=open(p,encoding='utf-8').read()
s+='''2026-10-25 · User heard "e e"/"xè xè" noise in EP1/EP2 (water loop, crickets/cicadas as pure 4–5 kHz sines, square-wave alarm, panting). Fixed by using soft band-limited noise/low tones. For future SFX avoid pure high sines and long broadband noise; check with an HF-energy scan when voice is silent.
EP3 "quay lại 30 giây" built in src/tiktok2/ep3 (Bạn has no hair there; Phong has spiky hair). Voice line for teaser 9.12 didn't exist, so it is a visual-only shot inside a hold.
'''
open(p,'w',encoding='utf-8').write(s)
EOF
echo ok
~~~~~

**D87** `2026-10-25T04:50:49Z` · ok · Locate HF hiss peaks in EP2 without voice

~~~~~bash
cd /Users/thanhphu/my-video; S=/private/tmp/claude-501/-Users-thanhphu-my-video/f0388be0-3a67-4763-a32e-a8c763508214/scratchpad; L=node_modules/@remotion/compositor-darwin-arm64; DYLD_LIBRARY_PATH=$L $L/ffmpeg -v error -y -i "out/tiktok 2/tiktok2-ep2.mp4" -ac 1 -ar 22050 -c:a pcm_s16le $S/ep2_22k.wav; cat > $S/hiss.py <<'EOF'
import array, math, sys, wave, json
w=wave.open(sys.argv[1]); sr=w.getframerate(); a=array.array("h",w.readframes(w.getnframes()))
def bp(lo,hi):
    f0=math.sqrt(lo*hi); q=f0/(hi-lo); ww=2*math.pi*f0/sr; al=math.sin(ww)/(2*q); c=math.cos(ww)
    return al,-al,1+al,-2*c,1-al
b0,b2,a0,a1,a2=bp(4000,9000); x1=x2=y1=y2=0.0
hop=sr//10; e=[]; acc=0.0
for i,s in enumerate(a):
    x=s/32768; y=(b0*x+b2*x2-a1*y1-a2*y2)/a0; x2,x1,y2,y1=x1,x,y1,y; acc+=y*y
    if (i+1)%hop==0: e.append(10*math.log10(acc/hop+1e-12)); acc=0
t=json.load(open(sys.argv[2])); spk=set()
for l in t["lines"]:
    for k in range(int(l["start"]*10)-1,int(l["end"]*10)+2): spk.add(k)
sid=lambda s: next(x["id"] for x in t["shots"] if x["start"]<=s<x["end"]+0.01)
rows=[(e[k],k/10) for k in range(len(e)) if k not in spk]
rows.sort(reverse=True)
seen=set(); out=[]
for v,s in rows:
    key=round(s)
    if key in seen: continue
    seen.add(key); out.append((v,s))
    if len(out)>=25: break
for v,s in sorted(out,key=lambda r:r[1]): print(f"{int(s//60)}:{s%60:05.2f}  shot {sid(s):5s}  dải 4–9 kHz {v:6.1f} dB")
import statistics
q=[v for v,_ in rows]; print("trung vị (không giọng):",round(statistics.median(q),1),"dB")
EOF
python3 $S/hiss.py $S/ep2_22k.wav src/tiktok2/ep2/data/timing.json
~~~~~

**D88** `2026-10-25T04:51:19Z` · ok · Check file time and mid-band noise

~~~~~bash
cd /Users/thanhphu/my-video; ls -la "out/tiktok 2/tiktok2-ep2.mp4"; S=/private/tmp/claude-501/-Users-thanhphu-my-video/f0388be0-3a67-4763-a32e-a8c763508214/scratchpad; sed -e 's/bp(4000,9000)/bp(1200,4000)/' -e 's/dải 4–9 kHz/dải 1,2–4 kHz/' $S/hiss.py > $S/hiss_mid.py; python3 $S/hiss_mid.py $S/ep2_22k.wav src/tiktok2/ep2/data/timing.json | tail -12
~~~~~

**D89** `2026-10-25T04:53:17Z` · ok · Remove bedroom morning ambience and re-render EP2 audio

~~~~~bash
cd /Users/thanhphu/my-video; python3 - <<'EOF'
p='src/tiktok2/ep2/audio.tsx'; s=open(p,encoding='utf-8').read()
a='  bedroom: [["amb_bedroom_morning_loop", 0.6], ["amb_room_tone_loop", 0.3]],'
assert a in s
s=s.replace(a,'  // người dùng yêu cầu bỏ hẳn amb_bedroom_morning_loop (nghe xè xè lặp lại) – chỉ còn room tone + nền yên\n  bedroom: [["amb_room_tone_loop", 0.45], ["amb_quiet_loop", 0.35]],')
open(p,'w',encoding='utf-8').write(s)
EOF
grep -rn "amb_bedroom_morning_loop" src/tiktok2/ | head; S=/private/tmp/claude-501/-Users-thanhphu-my-video/f0388be0-3a67-4763-a32e-a8c763508214/scratchpad; L=node_modules/@remotion/compositor-darwin-arm64; npx remotion render src/tiktok2/index.ts Tiktok2Ep2 "$S/mix-ep2-v3.wav" --codec=wav --timeout=240000 --concurrency=4 --log=error 2>&1 | grep -v "^    at" | tail -3; python3 scripts/tiktok2/ep1/check_mix.py $S/mix-ep2-v3.wav ep2
~~~~~

**D90** `2026-10-25T04:56:42Z` · ok · Remove class ambience in EP2/EP3; re-render both audios

~~~~~bash
cd /Users/thanhphu/my-video; python3 - <<'EOF'
def fix(p, pairs):
    s=open(p,encoding='utf-8').read()
    for a,b in pairs:
        assert a in s,(p,a); s=s.replace(a,b)
    open(p,'w',encoding='utf-8').write(s)
fix('src/tiktok2/ep2/audio.tsx',[
('  bedroom: [["amb_room_tone_loop", 0.45], ["amb_quiet_loop", 0.35]],','  bedroom: [["amb_room_tone_loop", 0.6], ["amb_quiet_loop", 0.4]],'),
('  class: [["amb_class_loop", 0.65], ["amb_quiet_loop", 0.25]],','  // người dùng yêu cầu bỏ hẳn amb_class_loop\n  class: [["amb_quiet_loop", 0.55], ["amb_room_tone_loop", 0.45]],'),
])
fix('src/tiktok2/ep3/audio.tsx',[
('  class: [["amb_class_loop", 0.65], ["amb_quiet_loop", 0.25]],','  // người dùng yêu cầu bỏ hẳn amb_class_loop (EP2) – áp dụng luôn EP3\n  class: [["amb_quiet_loop", 0.55], ["amb_room_tone_loop", 0.45]],'),
])
EOF
grep -rn "amb_class_loop\|amb_bedroom_morning" src/tiktok2/ep2 src/tiktok2/ep3 | grep -v "người dùng"; S=/private/tmp/claude-501/-Users-thanhphu-my-video/f0388be0-3a67-4763-a32e-a8c763508214/scratchpad; L=node_modules/@remotion/compositor-darwin-arm64; set -e; for e in 2 3; do npx remotion render src/tiktok2/index.ts Tiktok2Ep$e "$S/mix-ep$e-v4.wav" --codec=wav --timeout=240000 --concurrency=4 --log=error 2>&1 | grep -v "^    at" | tail -3; python3 scripts/tiktok2/ep1/check_mix.py $S/mix-ep$e-v4.wav ep$e; done
~~~~~

**D91** `2026-10-25T05:02:22Z` · ok · Re-render EP2 audio, mux both episodes, verify

~~~~~bash
cd /Users/thanhphu/my-video; S=/private/tmp/claude-501/-Users-thanhphu-my-video/f0388be0-3a67-4763-a32e-a8c763508214/scratchpad; L=node_modules/@remotion/compositor-darwin-arm64; npx remotion render src/tiktok2/index.ts Tiktok2Ep2 "$S/mix-ep2-v4.wav" --codec=wav --timeout=240000 --concurrency=4 --log=error 2>&1 | grep -v "^    at" | tail -3; python3 scripts/tiktok2/ep1/check_mix.py $S/mix-ep2-v4.wav ep2 && for e in 2 3; do cp "out/tiktok 2/tiktok2-ep$e.mp4" "$S/video-ep$e-before-v4.mp4"; DYLD_LIBRARY_PATH=$L $L/ffmpeg -v error -y -i "$S/video-ep$e-before-v4.mp4" -i "$S/mix-ep$e-v4.wav" -map 0:v -map 1:a -c:v copy -c:a aac -b:a 256k -shortest -movflags +faststart "out/tiktok 2/tiktok2-ep$e.mp4"; DYLD_LIBRARY_PATH=$L $L/ffprobe -v error -show_entries stream=codec_name,width,height,nb_frames:format=duration -of compact "out/tiktok 2/tiktok2-ep$e.mp4"; python3 scripts/tiktok2/ep1/check_mix.py "out/tiktok 2/tiktok2-ep$e.mp4" ep$e; done
~~~~~

**D92** `2026-10-25T05:05:54Z` · ok · Final EP3 checks and act table

~~~~~bash
cd /Users/thanhphu/my-video; S=/private/tmp/claude-501/-Users-thanhphu-my-video/f0388be0-3a67-4763-a32e-a8c763508214/scratchpad; L=node_modules/@remotion/compositor-darwin-arm64; python3 scripts/tiktok2/ep1/check_cuts.py ep3 | tail -1; DYLD_LIBRARY_PATH=$L $L/ffmpeg -v error -y -i "out/tiktok 2/tiktok2-ep3.mp4" -ac 1 -ar 22050 -c:a pcm_s16le $S/ep3_22k.wav; python3 $S/hiss.py $S/ep3_22k.wav src/tiktok2/ep3/data/timing.json | tail -1; python3 -c "
import json;t=json.load(open('src/tiktok2/ep3/data/timing.json'))
n={1:'Hook',2:'Cold open – cổng trường',3:'Luật chơi',4:'Học lại mọi thứ',5:'Bắt đầu vui',6:'Cái giá',7:'Cao trào 1 – thứ Sáu',8:'Cao trào 2 – chạy tới bến xe',9:'Kết + teaser'}
f=lambda s:f'{int(s//60)}:{s%60:04.1f}'
for a in t['acts']:
  sh=[s for s in t['shots'] if s['act']==a['act']]
  ls=[s for s in sh if s['firstLine']]
  print(a['act'],n[a['act']],f(a['from']/30),f(a['to']/30),len(sh),ls[0]['firstLine'],ls[-1]['lastLine'])
print('hold',round(sum(l['hold'] for l in t['lines']),1))"
~~~~~

**D93** `2026-10-25T09:33:11Z` · ok · Start whisper and print EP5 SRT

~~~~~bash
cd /Users/thanhphu/my-video; mkdir -p scripts/tiktok2/ep5 src/tiktok2/ep5/data src/tiktok2/ep5/shots "public/kênh tiktok 2/sfx/ep5"; (node scripts/tiktok2/ep1/transcribe.mjs ep5 > /private/tmp/claude-501/-Users-thanhphu-my-video/f0388be0-3a67-4763-a32e-a8c763508214/scratchpad/whisper5.log 2>&1 &); python3 - <<'EOF'
t=open("public/kênh tiktok 2/Voice/ep5/ep5 tiktok2.srt",encoding="utf-8").read().strip().split("\n\n")
f=lambda s: int(s[:2])*3600+int(s[3:5])*60+float(s[6:].replace(",","."))
for b in t:
    l=b.strip().split("\n"); a,z=l[1].split(" --> ")
    print(l[0], f"{f(a):.1f}", " ".join(l[2:]))
EOF
~~~~~

**D94** `2026-10-25T09:35:14Z` · ok · Write EP5 shotlist, build and check timeline

~~~~~bash
cd /Users/thanhphu/my-video; python3 - <<'EOF'
import json
S=[
("1.1",1,"Nếu bạn dừng được thời gian",{"hold":0.6}),
("2.1",2,"Tiết Toán",{"hold":0.2}),
("2.2",2,"Bạn đứng trước bảng",{"hold":0.3}),
("2.3",2,"Cả lớp nhìn",{"hold":0.3}),
("2.4",2,"Bạn vỗ tay một cái",{"hold":1.0}),
("2.5",2,"Cô giáo khựng giữa cái chớp mắt",{"hold":0.4}),
("2.6",2,"Ở góc mắt bạn",{"hold":0.3}),
("2.7",2,"Bạn chạy xuống bàn Vy",{"hold":0.2}),
("2.8",2,"Ba",{"hold":0.3}),
("2.9",2,"Bạn viết đáp án",{"hold":0.2}),
("2.10",2,"Cô nhìn bảng",{"hold":0.3}),
("2.11",2,"Đúng",{"hold":1.1}),
("3.1",3,"Luật thế này",{}),
("3.2",3,"Vỗ tay một cái",{"hold":0.3}),
("3.3",3,"Chỉ mình bạn cử động",{"hold":0.4}),
("3.4",3,"Nhưng mỗi lần dừng",{"hold":0.3}),
("3.5",3,"Và ngày đã mất",{"hold":0.5}),
("3.6",3,"trong một ngày tim bạn đập",{"hold":0.4}),
("3.7",3,"Ông nội bạn thì có một thói quen",{"hold":0.3}),
("3.8",3,"Thêm một ngày lời",{"hold":0.8}),
("4.1",4,"Ba mươi giây ngắn lắm",{"hold":0.2}),
("4.2",4,"Đủ để chép một câu trả lời",{"hold":0.3}),
("4.3",4,"Đủ để đi từ bàn này",{"hold":0.5}),
("4.4",4,"Giờ ra chơi Vy hỏi bạn mượn",{"hold":1.0}),
("4.5",4,"Nè",{"hold":0.5}),
("4.6",4,"Bạn già thêm mười ngày",{"hold":0.6}),
("5.1",5,"Mẹ làm rơi rổ trứng",{"fast":True,"hold":0.2}),
("5.2",5,"Mẹ chớp mắt",{"fast":True,"hold":0.5}),
("5.3",5,"Đá bóng sân xóm",{"fast":True,"hold":1.1}),
("5.4",5,"Bạn chụp ảnh cả hẻm",{"fast":True,"hold":0.4}),
("5.5",5,"Một tháng",{"fast":True,"hold":0.3}),
("5.6",5,"tóc người mọc khoảng",{"hold":0.4}),
("5.7",5,"Tóc bạn thì mọc nhanh hơn",{"hold":0.4}),
("5.8",5,"Ông nội nhìn bạn",{"hold":0.8}),
("6.1",6,"Nhưng có một cái giá",{}),
("6.2",6,"Bạn bắt đầu đếm",{"hold":0.2}),
("6.3",6,"Bốn tháng",{"hold":0.4}),
("6.4",6,"Không ai biết",{"hold":0.3}),
("6.5",6,"Bạn nhìn ông nội xé tờ lịch",{"hold":0.3}),
("6.6",6,"Còn bạn",{"hold":1.3}),
("6.7",6,"Vậy là có một luật",{"hold":0.6}),
("6.8",6,"Ly nước rơi",{"hold":0.4}),
("6.9",6,"Con biết sao ông vui",{"hold":1.6}),
("7.1",7,"Tối thứ Sáu",{"hold":0.3}),
("7.2",7,"Ông nội đưa chén lên",{"hold":0.3}),
("7.3",7,"Cái chén rơi xuống mâm",{"hold":0.4}),
("7.4",7,"Ba",{}),
("7.5",7,"Ba gọi một một lăm",{"hold":0.2}),
("7.6",7,"Kẹt xe hả",{"hold":0.4}),
("7.7",7,"với đột quỵ mỗi phút",{"hold":0.4}),
("7.8",7,"Bệnh viện cách nhà bạn hai cây số",{"hold":1.3}),
("7.9",7,"Bạn nhìn ông",{"hold":0.4}),
("7.10",7,"Bạn vỗ tay",{"hold":0.4}),
("8.1",8,"Cả nhà đứng hình",{"hold":0.3}),
("8.2",8,"Bạn kéo cái xe lăn",{"hold":0.3}),
("8.3",8,"Bạn đẩy ông ra cửa",{}),
("8.4",8,"Hai mươi giây",{"fast":True}),
("8.5",8,"Vỗ tay",{"fast":True}),
("8.6",8,"Bạn đẩy tiếp",{"fast":True}),
("8.7",8,"Ra đường lớn",{"fast":True}),
("8.8",8,"Vỗ tay",{"fast":True}),
("8.9",8,"Chân bạn bắt đầu run",{"fast":True}),
("8.10",8,"Bốn mươi ngày",{"fast":True}),
("8.11",8,"Bạn thấy biển hiệu đỏ",{"hold":0.3}),
("8.12",8,"Sáu mươi ngày",{"hold":0.2}),
("8.13",8,"Bạn vỗ tay lần cuối",{"hold":0.3}),
("8.14",8,"Bác sĩ giật mình",{"hold":1.3}),
("8.15",8,"Đột quỵ Kíp cấp cứu",{"hold":0.3}),
("8.16",8,"Cánh cửa phòng cấp cứu",{"hold":0.6}),
("8.17",8,"Bạn ngồi bệt xuống sàn",{"hold":1.6}),
("8.18",8,"Tính từ lúc chén cơm rơi",{"hold":1.2}),
("9.1",9,"Hai tuần sau",{"hold":0.3}),
("9.2",9,"Bác sĩ nói ông tới kịp",{"hold":0.4}),
("9.3",9,"Ba vẫn không hiểu",{"hold":0.2}),
("9.4",9,"Con đẩy ông đi",{"hold":0.6}),
("9.5",9,"Ông nhìn bạn",{"hold":0.8}),
("9.6",9,"Rồi ông xoa đầu bạn",{"hold":1.6}),
("9.7",9,"Trên tường phòng bệnh",{"hold":0.4}),
("9.8",9,"Sáng hôm đó ông chỉ tay",{"hold":0.5}),
("9.9",9,"Thêm một ngày lời",{"hold":1.6}),
("9.10",9,"Bạn đã cho đi sáu mươi ba ngày",{"hold":0.9}),
("9.11",9,"Có những ngày không phải để giữ",{"hold":1.3}),
("9.12",9,"Còn bạn",{}),
]
shots=[]
for id,act,moc,o in S:
    d={"id":id,"act":act,"moc":moc}; d.update(o); shots.append(d)
json.dump({"_doc":"Danh sách shot EP5. moc = vài chữ đầu câu (so khớp gần đúng, theo thứ tự). hold = giây giữ hình sau câu cuối của shot. lineHolds = giữ sau một câu cụ thể. fast = cắt dồn dập.","shots":shots},open('src/tiktok2/ep5/data/shotlist.json','w',encoding='utf-8'),ensure_ascii=False,indent=1)
json.dump({"_doc":"Chỉnh tay timeline EP5 rồi chạy lại: python3 scripts/tiktok2/ep1/build_timing.py ep5. Đơn vị giây. holds: giữ hình sau câu. gaps: khoảng lặng sau câu. anchors: gắn shot vào câu khác. trim: nới/thu đầu-cuối câu [đầu, cuối]. endCard: độ dài thẻ cuối.",
 "holds":{},"gaps":{},"anchors":{"3.6":"L055","4.1":"L063","5.1":"L080","5.6":"L101","6.9":"L132","7.7":"L150","8.15":"L218"},"trim":{},"endCard":1.5,"maxGap":0.38,"minGap":0.15},open('src/tiktok2/ep5/data/timing-overrides.json','w',encoding='utf-8'),ensure_ascii=False,indent=2)
EOF
python3 scripts/tiktok2/ep1/build_timing.py ep5 && python3 scripts/tiktok2/ep1/check_cuts.py ep5 | tail -3 && python3 -c "
import json;t=json.load(open('src/tiktok2/ep5/data/timing.json'))
for s in t['shots']: print(s['id'],s['firstLine'],s['lastLine'],s['start'],round(s['end']-s['start'],2))
" | column -c 220
~~~~~

**D95** `2026-10-25T09:35:25Z` · ok · Inspect energy around L143/L144 boundary

~~~~~bash
cd /Users/thanhphu/my-video; python3 -c "
import sys,json;sys.path.insert(0,'scripts/tiktok2/ep1')
from build_timing import envelope,P
db=envelope(P('whisper.cpp','tiktok2-ep5-16k.wav'))
t=json.load(open('src/tiktok2/ep5/data/timing.json'))
l=[x for x in t['lines'] if x['id'] in('L143','L144')]
for x in l: print(x['id'],x['src'],[round(v/30,2) for v in x['src']])
print(' '.join(f'{k/100:.2f}:{db[k]:.0f}' for k in range(22760,22840,2)))
"
~~~~~

**D96** `2026-10-25T09:35:38Z` · ok · Create EP5 time module

~~~~~bash
cd /Users/thanhphu/my-video; sed -e 's#Truy vấn timeline EP1. MỌI mốc sinh từ giọng (scripts/tiktok2/ep1/build_timing.py → data/timing.json)#Truy vấn timeline EP5. MỌI mốc sinh từ giọng (python3 scripts/tiktok2/ep1/build_timing.py ep5 → data/timing.json)#' src/tiktok2/ep1/time.ts > src/tiktok2/ep5/time.ts; grep -c EP5 src/tiktok2/ep5/time.ts
~~~~~

**D97** `2026-10-25T09:44:30Z` · ok · Generate EP5 sfx and check hiss

~~~~~bash
cd /Users/thanhphu/my-video; sed -i '' 's/import { add, babble, clink, creak, crinkle, engine, filt,/import { add, babble, clink, creak, crinkle, filt,/; /^void engine;$/d' scripts/tiktok2/ep5/generate-sfx.mjs; node scripts/tiktok2/ep5/generate-sfx.mjs 2>&1 | tail -2; ls "public/kênh tiktok 2/sfx/ep5" | wc -l; S=/private/tmp/claude-501/-Users-thanhphu-my-video/f0388be0-3a67-4763-a32e-a8c763508214/scratchpad; python3 $S/noisy.py "public/kênh tiktok 2/sfx/ep5" | head -6
~~~~~

**D98** `2026-10-25T09:46:29Z` · ok · Render EP5 storyboard pages

~~~~~bash
cd /Users/thanhphu/my-video; rm -rf "out/tiktok 2/review/board5"; npx remotion render src/tiktok2/index.ts T2E5Board "out/tiktok 2/review/board5" --sequence --image-format=jpeg --timeout=240000 --log=error 2>&1 | grep -v "^    at" | head -6; ls "out/tiktok 2/review/board5"
~~~~~

**D99** `2026-10-25T09:47:29Z` · ok · Fix ER sign color and Grandpa on bed; test stills

~~~~~bash
cd /Users/thanhphu/my-video; python3 - <<'EOF'
def fix(p, pairs):
    s=open(p,encoding='utf-8').read()
    for a,b in pairs:
        assert a in s,(p,a); s=s.replace(a,b)
    open(p,'w',encoding='utf-8').write(s)
fix('src/tiktok2/ep5/sets.tsx',[
('export const erGate = (f: number, o: { glow?: number } = {}): SetLayers => ({','export const erGate = (f: number, o: { glow?: number; sign?: boolean } = {}): SetLayers => ({'),
('''      <rect x={200} y={760} width={600} height={160} rx={16} fill="#c4302a" />
      <rect x={180} y={740} width={640} height={200} rx={20} fill="#ff4a3a" opacity={0.25 * (o.glow ?? 1)} style={{ filter: "blur(30px)" }} />
      <text x={500} y={870} textAnchor="middle" fontFamily={FONT} fontWeight={800} fontSize={110} fill="#fff">
        CẤP CỨU
      </text>''','''      {o.sign !== false && <ErSign glow={o.glow} />}'''),
('''/** Hành lang cấp cứu:''','''/** Biển "CẤP CỨU" đỏ phát sáng (vẽ riêng được ở lớp không bị lọc màu khi đứng hình). */
export const ErSign: React.FC<{ glow?: number }> = ({ glow = 1 }) => (
  <g>
    <rect x={180} y={740} width={640} height={200} rx={20} fill="#ff4a3a" opacity={0.35 * glow} style={{ filter: "blur(30px)" }} />
    <rect x={200} y={760} width={600} height={160} rx={16} fill="#c4302a" />
    <text x={500} y={870} textAnchor="middle" fontFamily={FONT} fontWeight={800} fontSize={110} fill="#fff">
      CẤP CỨU
    </text>
  </g>
);
/** Hành lang cấp cứu:'''),
])
fix('src/tiktok2/ep5/shots/act89.tsx',[
('import { bridge, dinner, erGate, erHall, mainRoad, nightMarket, ward } from "../sets";','import { bridge, dinner, erGate, erHall, ErSign, mainRoad, nightMarket, ward } from "../sets";'),
('''  return <Stage5 set={erGate(0, { glow: 1 + Math.sin(f / 4) * 0.3 })} frozen={0.7} cam={{ x: 500, y: 860, z: interpolate(f, [0, dur], [0.9, 1.3]) }} f={f} actors={<Push x={-200} y={1700} f={f} s={0.7} />} />;''','''  return <Stage5 set={erGate(0, { sign: false })} frozen={1} cam={{ x: 500, y: 860, z: interpolate(f, [0, dur], [0.9, 1.3]) }} f={f} actors={<><g transform="translate(0,0)"><ErSign glow={1 + Math.sin(f / 4) * 0.3} /></g><Push x={-200} y={1700} f={f} s={0.7} /></>} />;'''),
('''const OngBed: React.FC<{ f: number; eyes?: "happy" | "normal" | "half"; hand?: { x: number; y: number } }> = ({ f, eyes = "normal", hand }) => (
  <Ong x={BED.x - 120} y={BED.y + 40} t={f} facing={1} pose={hand ? "reach" : "sitChair"} handR={hand} cane={false} eyes={eyes} lean={-10} shadow={false} />
);''','''/** Ông ngồi trên nệm, dựa gối, chăn đắp qua chân. */
const OngBed: React.FC<{ f: number; eyes?: "happy" | "normal" | "half"; hand?: { x: number; y: number } }> = ({ f, eyes = "normal", hand }) => (
  <g>
    <Ong x={BED.x - 120} y={BED.y + 170} t={f} facing={1} pose={hand ? "reach" : "sitChair"} handR={hand} cane={false} eyes={eyes} lean={-10} shadow={false} />
    <path d={`M${BED.x - 200} ${BED.y + 30} Q${BED.x + 150} ${BED.y - 20 + Math.sin(f / 50) * 3} ${BED.x + 470} ${BED.y + 30} L${BED.x + 470} ${BED.y + 140} L${BED.x - 210} ${BED.y + 140} Z`} fill="#a8bcd0" />
  </g>
);'''),
])
s=open('src/tiktok2/ep5/shots/act89.tsx',encoding='utf-8').read()
s=s.replace('faceCam(BED.x - 120, BED.y + 40,','faceCam(BED.x - 120, BED.y + 170,')
open('src/tiktok2/ep5/shots/act89.tsx','w',encoding='utf-8').write(s)
fix('src/tiktok2/ep5/shots/act45.tsx',[('<AbsoluteFill style={{ background: "#fff", opacity: Math.max(flash(L("L095")), flash(L("L096"))) }} />','<AbsoluteFill style={{ background: "#fff", opacity: 0.7 * Math.max(flash(L("L095")), flash(L("L096"))) }} />')])
EOF
npx tsc --noEmit -p . 2>&1 | grep tiktok2 | head; S=/private/tmp/claude-501/-Users-thanhphu-my-video/f0388be0-3a67-4763-a32e-a8c763508214/scratchpad; for fr in 8900 11330; do npx remotion still src/tiktok2/index.ts Tiktok2Ep5 $S/e5_$fr.png --frame=$fr --scale=0.4 --log=error; done
~~~~~

**D100** `2026-10-25T09:51:26Z` · ok · background · Render final EP5 MP4

~~~~~bash
cd /Users/thanhphu/my-video; npx remotion render src/tiktok2/index.ts Tiktok2Ep5 "out/tiktok 2/tiktok2-ep5.mp4" --codec=h264 --crf=18 --concurrency=8 --timeout=240000 --log=error 2>&1 | tail -5; ls -la "out/tiktok 2/tiktok2-ep5.mp4"
~~~~~

**D101** `2026-10-25T09:51:30Z` · ok · Check voice cuts and inspect timing structure

~~~~~bash
cd /Users/thanhphu/my-video; python3 scripts/tiktok2/ep1/check_cuts.py ep5 2>&1 | tail -6; python3 - <<'EOF'
import json
t=json.load(open('src/tiktok2/ep5/data/timing.json'))
print(t.keys())
for k in ('acts',):
  if k in t: print(json.dumps(t[k],ensure_ascii=False)[:1500])
sh=t.get('shots',[])
print(len(sh), sh[0] if sh else None)
EOF
~~~~~

**D102** `2026-10-25T09:59:43Z` · ERROR · Check disk and render audio-only WAV

~~~~~bash
cd /Users/thanhphu/my-video; df -h . | tail -1; ls /var/folders 2>/dev/null >/dev/null; npx remotion render src/tiktok2/index.ts Tiktok2Ep5 "out/tiktok 2/ep5-audio.wav" --codec=wav --concurrency=8 --timeout=240000 --log=error 2>&1 | grep -v "^    at " | tail -8; ls -la "out/tiktok 2/ep5-audio.wav"
~~~~~

**D103** `2026-10-25T10:06:35Z` · ok · Check tick WAV format and SFX script header

~~~~~bash
cd /Users/thanhphu/my-video; DYLD_LIBRARY_PATH=node_modules/@remotion/compositor-darwin-arm64 node_modules/@remotion/compositor-darwin-arm64/ffprobe -hide_banner "public/kênh tiktok 2/sfx/ep5/clock_tick.wav" 2>&1 | grep Stream; ls scripts/tiktok2/ep5/; head -30 scripts/tiktok2/ep5/generate-sfx.mjs
~~~~~

**D104** `2026-10-25T10:06:59Z` · ok · Bake freeze SFX stem

~~~~~bash
cd /Users/thanhphu/my-video; npx tsx scripts/tiktok2/ep5/bake-freeze-stem.ts 2>&1 | tail -3
~~~~~

**D105** `2026-10-25T10:07:16Z` · ok · Apply gain to stem, wire stem into audio layer

~~~~~bash
cd /Users/thanhphu/my-video; python3 - <<'EOF'
p='scripts/tiktok2/ep5/bake-freeze-stem.ts'
s=open(p,encoding='utf-8').read()
a='''const out = new Float32Array(Math.ceil((TOTAL / FPS) * SR));'''
b='''/** Đã nhân sẵn FX_GAIN của audio.tsx (0.45) để chồng tiếng không vượt biên; trong tập stem chỉ còn nhân hệ số né giọng. */
const FX_GAIN = 0.45;
const out = new Float32Array(Math.ceil((TOTAL / FPS) * SR));'''
assert a in s; s=s.replace(a,b)
a='''  for (let i = 0; i < s.length && o + i < out.length; i++) if (o + i >= 0) out[o + i] += s[i] * vol;'''
assert a in s; s=s.replace(a,'''  for (let i = 0; i < s.length && o + i < out.length; i++) if (o + i >= 0) out[o + i] += s[i] * vol * FX_GAIN;''')
s=s.replace("// Không chuẩn hoá: giữ mức tương đối như cue riêng; chỉ hạn biên nếu chồng tiếng vượt 1.","// Không chuẩn hoá: giữ đúng mức như cue riêng; chỉ hạn biên phòng hờ.")
open(p,'w',encoding='utf-8').write(s)

p='src/tiktok2/ep5/audio.tsx'
s=open(p,encoding='utf-8').read()
a=s[s.index('  // Dừng thời gian: vỗ tay'):s.index('    if (z !== FREEZES[0])')]
b='''  // Dừng thời gian: vỗ tay + "vút" + "tách" và tích tắc mỗi giây đồng hồ đã gộp sẵn vào freeze_stem.wav
  // (scripts/tiktok2/ep5/bake-freeze-stem.ts, cùng mốc ALL_CLAPS/clockSec) – ~500 <Audio> riêng làm đầy ổ đĩa khi render.
  // Ở đây chỉ còn: ù nhỏ trong lúc dừng; thả: âm thế giới bật lại.
  for (const z of FREEZES) {
    cues.push({ c: { src: "freeze_hum_loop", at: 0, vol: 0.5, dur: z.to - z.from, loop: true, fadeIn: 10, fadeOut: 4 }, abs: z.from });
'''
s=s.replace(a,b)
s=s.replace('import { ALL_CLAPS, clockSec, FREEZES, freezeK } from "./freeze";','import { FREEZES, freezeK } from "./freeze";')
a='''      {beds.map((b, i) => ('''
b='''      <Sequence name="🔊 freeze_stem (vỗ tay + tích tắc)" from={0} durationInFrames={TOTAL} layout="none">
        <Html5Audio src={staticFile(SFX("freeze_stem"))} volume={(f) => duck(f, DUCK_FX)} />
      </Sequence>
      {beds.map((b, i) => ('''
assert a in s; s=s.replace(a,b,1)
open(p,'w',encoding='utf-8').write(s)
EOF
sed -n 56,70p src/tiktok2/ep5/audio.tsx; npx tsx scripts/tiktok2/ep5/bake-freeze-stem.ts 2>&1|tail -1; npx tsc --noEmit -p . 2>&1 | grep tiktok2 | head
~~~~~

**D106** `2026-10-25T10:07:38Z` · ok · Render EP5 audio-only WAV

~~~~~bash
cd /Users/thanhphu/my-video; npx remotion render src/tiktok2/index.ts Tiktok2Ep5 "out/tiktok 2/ep5-audio.wav" --codec=wav --concurrency=8 --timeout=240000 --log=error 2>&1 | grep -v "^    at " | tail -5; ls -la "out/tiktok 2/ep5-audio.wav"; df -h /System/Volumes/Data | tail -1
~~~~~

**D107** `2026-10-25T10:10:53Z` · ok · background · Render muted EP5 video and mux audio

~~~~~bash
cd /Users/thanhphu/my-video; S=/private/tmp/claude-501/-Users-thanhphu-my-video/f0388be0-3a67-4763-a32e-a8c763508214/scratchpad; npx remotion render src/tiktok2/index.ts Tiktok2Ep5 "$S/ep5-video.mp4" --codec=h264 --crf=18 --muted --concurrency=8 --timeout=240000 --log=error 2>&1 | grep -v "^    at " | tail -5 && DYLD_LIBRARY_PATH=node_modules/@remotion/compositor-darwin-arm64 node_modules/@remotion/compositor-darwin-arm64/ffmpeg -y -hide_banner -loglevel error -i "$S/ep5-video.mp4" -i "out/tiktok 2/ep5-audio.wav" -map 0:v -map 1:a -c:v copy -c:a aac -b:a 256k -shortest "out/tiktok 2/tiktok2-ep5.mp4"; ls -la "out/tiktok 2/tiktok2-ep5.mp4"
~~~~~

**D108** `2026-10-25T10:10:57Z` · ok · Run mix check and inspect hiss script

~~~~~bash
cd /Users/thanhphu/my-video; python3 scripts/tiktok2/ep1/check_mix.py "out/tiktok 2/ep5-audio.wav" ep5 2>&1 | tail -12; S=/private/tmp/claude-501/-Users-thanhphu-my-video/f0388be0-3a67-4763-a32e-a8c763508214/scratchpad; ls $S/*.py; head -15 $S/hiss.py
~~~~~

**D109** `2026-10-25T10:11:56Z` · ok · Check freezeK at silent frames and bed files

~~~~~bash
cd /Users/thanhphu/my-video; S=/private/tmp/claude-501/-Users-thanhphu-my-video/f0388be0-3a67-4763-a32e-a8c763508214/scratchpad; cat > $S/dbg.tsx <<'EOF'
import { FREEZES, freezeK } from "/Users/thanhphu/my-video/src/tiktok2/ep5/freeze";
for (const f of [1861, 2158, 2299, 2371, 2503, 9241, 9451, 9663, 9830, 10154]) console.log(f, freezeK(f).toFixed(2));
console.log(FREEZES.map((z) => `${z.from}-${z.to}`).join(" "));
EOF
npx tsx $S/dbg.tsx 2>&1 | tail -12; grep -n "amb_room_tone_loop\|amb_quiet_loop\|amb_er_loop" scripts/tiktok2/ep5/generate-sfx.mjs | head; ls -la "public/kênh tiktok 2/sfx/ep5/" | grep -E "room_tone|quiet|er_loop|hum"
~~~~~

**D110** `2026-10-25T10:12:46Z` · ok · Typecheck, re-render audio, re-run mix check

~~~~~bash
cd /Users/thanhphu/my-video; npx tsc --noEmit -p . 2>&1 | grep tiktok2 | head -5; npx remotion render src/tiktok2/index.ts Tiktok2Ep5 "out/tiktok 2/ep5-audio.wav" --codec=wav --concurrency=4 --timeout=240000 --log=error 2>&1 | grep -v "^    at " | tail -5; python3 scripts/tiktok2/ep1/check_mix.py "out/tiktok 2/ep5-audio.wav" ep5 2>&1 | tail -3
~~~~~

**D111** `2026-10-25T10:20:28Z` · ok · Re-mux final MP4, probe it, run hiss scan

~~~~~bash
cd /Users/thanhphu/my-video; S=/private/tmp/claude-501/-Users-thanhphu-my-video/f0388be0-3a67-4763-a32e-a8c763508214/scratchpad; F=node_modules/@remotion/compositor-darwin-arm64; DYLD_LIBRARY_PATH=$F $F/ffmpeg -y -hide_banner -loglevel error -i "$S/ep5-video.mp4" -i "out/tiktok 2/ep5-audio.wav" -map 0:v -map 1:a -c:v copy -c:a aac -b:a 256k -shortest "out/tiktok 2/tiktok2-ep5.mp4" && DYLD_LIBRARY_PATH=$F $F/ffprobe -v error -show_entries format=duration:stream=codec_name,width,height,r_frame_rate -of compact "out/tiktok 2/tiktok2-ep5.mp4"; ls -la "out/tiktok 2/tiktok2-ep5.mp4"; DYLD_LIBRARY_PATH=$F $F/ffmpeg -y -hide_banner -loglevel error -i "out/tiktok 2/tiktok2-ep5.mp4" -ac 1 -ar 22050 $S/ep5_22k.wav && python3 $S/hiss.py $S/ep5_22k.wav src/tiktok2/ep5/data/timing.json 2>&1 | tail -8
~~~~~

**D112** `2026-10-25T10:21:22Z` · ok · Record render lessons in channel memory

~~~~~bash
cd /Users/thanhphu/.claude/projects/-Users-thanhphu-my-video/memory; cat >> series-tiktok2.md <<'EOF'

## Render lessons (EP5, 2026-10-25)
- Remotion pads every `<Audio>` to full length during the audio merge → ~900 tracks filled the disk (98% full, "No space left on device"). Bake repeated cues into one stem (EP5: `scripts/tiktok2/ep5/bake-freeze-stem.ts` → `sfx/ep5/freeze_stem.wav`, positions from freeze.ts), keep the track count around 400 or fewer.
- A looped bed whose volume callback stays at 0 for a long stretch (a freeze) renders silent AFTER that stretch → split beds around freezes (`pieces()` in ep5/audio.tsx). Always run check_mix: digital zeros = this bug.
- Safe path when the disk is tight: `--codec=wav` audio + `--muted` video, then mux with ffmpeg.
EOF
grep -n "tiktok2" MEMORY.md
~~~~~

**D113** `2026-10-25T10:45:08Z` · ok · Register QA compositions and typecheck

~~~~~bash
cd /Users/thanhphu/my-video/src/tiktok2; python3 - <<'EOF'
p='Tiktok2Root.tsx'
s=open(p,encoding='utf-8').read()
s=s.replace('import { SHOTS as SHOTS5, TOTAL as TOTAL5 } from "./ep5/time";\n','import { SHOTS as SHOTS5, TOTAL as TOTAL5 } from "./ep5/time";\nimport { TextBoundsQA } from "./qa/TextBoundsQA";\n\n/** QA chữ lọt khung (scripts/tiktok2/check-text-bounds.mjs): lấy mẫu mỗi QA_EVERY frame của tập. */\nconst QA_EVERY = 10;\nconst qa = (Ep: React.FC<Record<string, unknown>>, props: Record<string, unknown> = {}): React.FC => () => (\n  <TextBoundsQA every={QA_EVERY}>\n    <Ep {...props} />\n  </TextBoundsQA>\n);\nconst QA_N = (total: number) => Math.ceil(total / QA_EVERY);\n',1)
a='''    <Folder name="Tiktok2Ep1-Sheets">'''
b='''    <Folder name="Tiktok2-QA">
      <Composition id="T2QA1" component={qa(Tiktok2Ep1 as React.FC<Record<string, unknown>>)} durationInFrames={QA_N(totalOf("vi"))} fps={30} width={1920} height={1080} />
      <Composition id="T2QA1En" component={qa(Tiktok2Ep1 as React.FC<Record<string, unknown>>, { lang: "en" })} durationInFrames={QA_N(totalOf("en"))} fps={30} width={1920} height={1080} />
      <Composition id="T2QA2" component={qa(Tiktok2Ep2 as React.FC<Record<string, unknown>>)} durationInFrames={QA_N(TOTAL2)} fps={30} width={1920} height={1080} />
      <Composition id="T2QA3" component={qa(Tiktok2Ep3 as React.FC<Record<string, unknown>>)} durationInFrames={QA_N(TOTAL3)} fps={30} width={1920} height={1080} />
      <Composition id="T2QA5" component={qa(Tiktok2Ep5 as React.FC<Record<string, unknown>>)} durationInFrames={QA_N(TOTAL5)} fps={30} width={1920} height={1080} />
    </Folder>
    <Folder name="Tiktok2Ep1-Sheets">'''
assert a in s; s=s.replace(a,b,1)
open(p,'w',encoding='utf-8').write(s)
EOF
cd /Users/thanhphu/my-video; npx tsc --noEmit -p . 2>&1 | grep tiktok2 | head
~~~~~

**D114** `2026-10-25T10:45:32Z` · ok · Test QA probe on one frame

~~~~~bash
cd /Users/thanhphu/my-video; S=/private/tmp/claude-501/-Users-thanhphu-my-video/f0388be0-3a67-4763-a32e-a8c763508214/scratchpad; npx remotion still src/tiktok2/index.ts T2QA5 $S/qa.png --frame=890 --scale=0.4 --log=verbose 2>&1 | grep -E "TEXTQA|rror" | head
~~~~~

**D115** `2026-10-25T10:45:44Z` · ok · Force-report all text to verify logging works

~~~~~bash
cd /Users/thanhphu/my-video; S=/private/tmp/claude-501/-Users-thanhphu-my-video/f0388be0-3a67-4763-a32e-a8c763508214/scratchpad; sed -i '' 's/const MARGIN = 2;/const MARGIN = -2000;/' src/tiktok2/qa/TextBoundsQA.tsx; npx remotion still src/tiktok2/index.ts T2QA5 $S/qa.png --frame=890 --scale=0.4 --log=verbose 2>&1 | grep -E "TEXTQA" | head -5; sed -i '' 's/const MARGIN = -2000;/const MARGIN = 2;/' src/tiktok2/qa/TextBoundsQA.tsx; grep -n "MARGIN =" src/tiktok2/qa/TextBoundsQA.tsx
~~~~~

**D116** `2026-10-25T10:45:54Z` · ok · Add ping log and inspect verbose output

~~~~~bash
cd /Users/thanhphu/my-video; S=/private/tmp/claude-501/-Users-thanhphu-my-video/f0388be0-3a67-4763-a32e-a8c763508214/scratchpad; sed -i '' 's|          for (const h of measure(ref.current, width, height)) console.log(`TEXTQA|          console.log(`TEXTQA-PING ${at}`);\n          for (const h of measure(ref.current, width, height)) console.log(`TEXTQA|' src/tiktok2/qa/TextBoundsQA.tsx; npx remotion still src/tiktok2/index.ts T2QA5 $S/qa.png --frame=890 --scale=0.4 --log=verbose > $S/qa.log 2>&1; grep -c . $S/qa.log; grep -iE "TEXTQA|console|browser" $S/qa.log | head
~~~~~

**D117** `2026-10-25T10:46:32Z` · ok · Run text-bounds check on EP5

~~~~~bash
cd /Users/thanhphu/my-video; time node scripts/tiktok2/check-text-bounds.mjs ep5 2>&1 | grep -v "^\[chrome\]" | tail -40
~~~~~

**D118** `2026-10-25T10:59:45Z` · ok · Inspect QA run progress

~~~~~bash
tail -c 1500 /private/tmp/claude-501/-Users-thanhphu-my-video/f0388be0-3a67-4763-a32e-a8c763508214/tasks/bxyvdtmea.output; ps aux | grep check-text-bounds | grep -v grep | wc -l
~~~~~

**D119** `2026-10-25T10:59:56Z` · ok · background · Chunk QA renders and rerun on EP5

~~~~~bash
cd /Users/thanhphu/my-video; python3 - <<'EOF'
p='scripts/tiktok2/check-text-bounds.mjs'
s=open(p,encoding='utf-8').read()
a=s[s.index('  await renderFrames({'):s.index('  // gom theo chữ')]
b='''  // chia đoạn 100 frame, mỗi đoạn một trình duyệt mới (máy ít RAM: chạy liền 1000+ frame làm Chrome sập)
  for (let a = 0; a < composition.durationInFrames; a += CHUNK) {
    await renderFrames({
      composition,
      serveUrl,
      inputProps: {},
      imageFormat: "none",
      frameRange: [a, Math.min(composition.durationInFrames, a + CHUNK) - 1],
      concurrency: 3,
      timeoutInMilliseconds: 120000,
      onStart: () => {},
      onFrameUpdate: () => {},
      outputDir: null,
      onBrowserLog: (log) => {
        const t = log.text;
        if (t.startsWith("TEXTQA-PING")) pings++;
        else if (t.startsWith("TEXTQA|")) {
          const [, at, kind, side, box, ...txt] = t.split("|");
          hits.push({ at: +at, kind, side, box, txt: txt.join("|") });
        }
      },
    });
    process.stdout.write(`\\r${ep}: ${Math.min(composition.durationInFrames, a + CHUNK)}/${composition.durationInFrames}`);
  }
  process.stdout.write("\\n");
'''
s=s.replace(a,b)
s=s.replace('const EVERY = 10;','const EVERY = 10;\nconst CHUNK = 100;')
open(p,'w',encoding='utf-8').write(s)
EOF
node scripts/tiktok2/check-text-bounds.mjs ep5 2>&1 | grep -v "^\[chrome\]" | tr '\r' '\n' | grep -v "^ep5: " | tail -60
~~~~~

**D120** `2026-10-25T11:11:10Z` · ok · background · Run text-bounds check on EP1–EP3

~~~~~bash
cd /Users/thanhphu/my-video; node scripts/tiktok2/check-text-bounds.mjs ep1 ep2 ep3 2>&1 | grep -v "^\[chrome\]" | tr '\r' '\n' | grep -vE "^ep[0-9]: |browser crashed|Protocol error|    at |Killed previous|Made new" | tail -150
~~~~~

**D121** `2026-10-25T11:11:57Z` · ok · Reframe EP5 classroom cameras, add range option

~~~~~bash
cd /Users/thanhphu/my-video; python3 - <<'EOF'
def fix(p, pairs):
    s=open(p,encoding='utf-8').read()
    for a,b in pairs:
        assert s.count(a)==1,(p,a); s=s.replace(a,b)
    open(p,'w',encoding='utf-8').write(s)
fix('src/tiktok2/ep5/shots/act123.tsx',[
# 2.4 wides after the clap: raise camera so the board's top line stays in frame
('{ at: clap + 8, a: { x: 360, y: 1040, z: 1.0 }, b: { x: 520, y: 1020, z: 1.12 }, hold: true }, { at: L("L014") - 2, a: { x: 300, y: 1060, z: 1.1 }, b: { x: 700, y: 1040, z: 1.18 }, hold: true }',
 '{ at: clap + 8, a: { x: 360, y: 940, z: 1.0 }, b: { x: 520, y: 900, z: 1.12 }, hold: true }, { at: L("L014") - 2, a: { x: 300, y: 920, z: 1.1 }, b: { x: 700, y: 900, z: 1.18 }, hold: true }'),
# 2.5 board close-up: frame the whole board text
('{ at: L("L017") - 2, a: { x: BOARD.x, y: BOARD.y + 300, z: 1.6 }, b: { x: BOARD.x + 80, y: BOARD.y + 280, z: 1.7 } }',
 '{ at: L("L017") - 2, a: { x: BOARD.x, y: BOARD.y + 160, z: 1.5 }, b: { x: BOARD.x + 80, y: BOARD.y + 150, z: 1.58 } }'),
# 2.6 medium wide at end
('{ at: L("L023") - 2, a: { x: 560, y: 1060, z: 1.15 }, b: { x: 640, y: 1060, z: 1.2 } }',
 '{ at: L("L023") - 2, a: { x: 560, y: 920, z: 1.15 }, b: { x: 640, y: 920, z: 1.2 } }'),
# 2.7 running medium: push the board text fully out of frame instead of a sliver
('{ at: 0, a: { x: 460, y: 1200, z: 1.2 }, b: { x: 380, y: 1200, z: 1.3 } }',
 '{ at: 0, a: { x: 460, y: 1320, z: 1.2 }, b: { x: 380, y: 1320, z: 1.3 } }'),
])
# frame-range option: ep5@570-1160 (episode frames)
fix('scripts/tiktok2/check-text-bounds.mjs',[
('// Chạy: node scripts/tiktok2/check-text-bounds.mjs ep5 [ep1 ep1en ep2 ep3 …]   (mặc định: tất cả)',
 '// Chạy: node scripts/tiktok2/check-text-bounds.mjs ep5 [ep1 ep1en ep2 ep3 …]   (mặc định: tất cả); chỉ một đoạn: ep5@570-1160 (frame của tập)'),
('for (const ep of eps) {\n  const id = IDS[ep];','for (const arg of eps) {\n  const [ep, range] = arg.split("@");\n  const id = IDS[ep];'),
('  for (let a = 0; a < composition.durationInFrames; a += CHUNK) {',
 '  const [r0, r1] = range ? range.split("-").map((v) => Math.round(+v / EVERY)) : [0, composition.durationInFrames - 1];\n  const end = Math.min(composition.durationInFrames, r1 + 1);\n  for (let a = r0; a < end; a += CHUNK) {'),
('      frameRange: [a, Math.min(composition.durationInFrames, a + CHUNK) - 1],','      frameRange: [a, Math.min(end, a + CHUNK) - 1],'),
('    process.stdout.write(`\\r${ep}: ${Math.min(composition.durationInFrames, a + CHUNK)}/${composition.durationInFrames}`);','    process.stdout.write(`\\r${ep}: ${Math.min(end, a + CHUNK)}/${end}`);'),
('  writeFileSync(join(ROOT, `out/tiktok 2/qa/text-bounds-${ep}.txt`)','  writeFileSync(join(ROOT, `out/tiktok 2/qa/text-bounds-${ep}${range ? "@" + range : ""}.txt`)'),
])
EOF
npx tsc --noEmit -p . 2>&1 | grep tiktok2 | head -3
~~~~~

**D122** `2026-10-25T11:20:31Z` · ok · Render stills of flagged EP2/EP3 frames

~~~~~bash
cd /Users/thanhphu/my-video; S=/private/tmp/claude-501/-Users-thanhphu-my-video/f0388be0-3a67-4763-a32e-a8c763508214/scratchpad; npx remotion still src/tiktok2/index.ts Tiktok2Ep2 $S/b2_320.png --frame=320 --scale=0.4 --log=error; npx remotion still src/tiktok2/index.ts Tiktok2Ep3 $S/b3_260.png --frame=260 --scale=0.4 --log=error; npx remotion still src/tiktok2/index.ts Tiktok2Ep3 $S/b3_880.png --frame=880 --scale=0.4 --log=error; ls $S/b*.png
~~~~~

**D123** `2026-10-25T11:21:34Z` · ok · Apply EP2/EP3 camera fixes and recheck all fixed ranges

~~~~~bash
cd /Users/thanhphu/my-video/src/tiktok2; python3 - <<'EOF'
def fix(p, pairs):
    s=open(p,encoding='utf-8').read()
    for a,b in pairs:
        assert s.count(a)==1,(p,a); s=s.replace(a,b)
    open(p,'w',encoding='utf-8').write(s)
fix('ep2/shots/act123.tsx',[('{ at: 0, a: { x: 470, y: 1240, z: 1.9 }, b: { x: 480, y: 1240, z: 2.05 } }, { at: at[2] - 2, a: { x: 420, y: 1250, z: 2.3 }, b: { x: 430, y: 1250, z: 2.45 } }',
 '{ at: 0, a: { x: 480, y: 1256, z: 1.9 }, b: { x: 490, y: 1256, z: 2.05 } }, { at: at[2] - 2, a: { x: 410, y: 1264, z: 2.3 }, b: { x: 418, y: 1264, z: 2.45 } }')])
fix('ep3/shots/act123.tsx',[
('{ at: L("L005") - 2, a: { x: 300, y: 1100, z: 1.1 }, b: { x: 340, y: 1100, z: 1.15 } }','{ at: L("L005") - 2, a: { x: 300, y: 1150, z: 1.1 }, b: { x: 340, y: 1150, z: 1.15 } }'),
('{ x: -620, y: 600, z: 1.4 }','{ x: -320, y: 600, z: 1.4 }'),
])
EOF
cd /Users/thanhphu/my-video; npx tsc --noEmit -p . 2>&1 | grep tiktok2 | head -3; node scripts/tiktok2/check-text-bounds.mjs ep2@240-500 ep3@160-360 ep3@680-1060 ep5@560-1250 2>&1 | grep -v "^\[chrome\]" | tr '\r' '\n' | grep -vE "^ep[0-9]: |browser crashed|Protocol error|    at |Killed previous|Made new" | tail -30
~~~~~

**D124** `2026-10-25T11:23:38Z` · ok · Adjust cameras again and recheck

~~~~~bash
cd /Users/thanhphu/my-video/src/tiktok2; python3 - <<'EOF'
def fix(p, pairs):
    s=open(p,encoding='utf-8').read()
    for a,b in pairs:
        assert s.count(a)==1,(p,a); s=s.replace(a,b)
    open(p,'w',encoding='utf-8').write(s)
fix('ep2/shots/act123.tsx',[('a: { x: 480, y: 1256, z: 1.9 }, b: { x: 490, y: 1256, z: 2.05 }','a: { x: 480, y: 1280, z: 1.9 }, b: { x: 490, y: 1280, z: 2.05 }'),('a: { x: 410, y: 1264, z: 2.3 }, b: { x: 418, y: 1264, z: 2.45 }','a: { x: 410, y: 1300, z: 2.3 }, b: { x: 418, y: 1300, z: 2.45 }')])
fix('ep3/shots/act123.tsx',[('{ x: -320, y: 600, z: 1.4 }','{ x: -240, y: 600, z: 1.4 }')])
fix('ep5/shots/act123.tsx',[('{ at: 0, a: { x: 460, y: 1320, z: 1.2 }, b: { x: 380, y: 1320, z: 1.3 } }','{ at: 0, a: { x: 460, y: 1430, z: 1.2 }, b: { x: 380, y: 1430, z: 1.3 } }')])
EOF
cd /Users/thanhphu/my-video; node scripts/tiktok2/check-text-bounds.mjs ep2@240-500 ep3@680-1060 ep5@1060-1250 2>&1 | grep -v "^\[chrome\]" | tr '\r' '\n' | grep -vE "^ep[0-9]: |browser crashed|Protocol error|    at |Killed previous|Made new" | tail -20
~~~~~

**D125** `2026-10-25T11:24:26Z` · ok · Nudge EP2/EP3 cameras and recheck

~~~~~bash
cd /Users/thanhphu/my-video; sed -i '' 's/a: { x: 480, y: 1280, z: 1.9 }, b: { x: 490, y: 1280, z: 2.05 }/a: { x: 480, y: 1295, z: 1.9 }, b: { x: 490, y: 1295, z: 2.05 }/' src/tiktok2/ep2/shots/act123.tsx; sed -i '' 's/{ x: -240, y: 600, z: 1.4 }/{ x: -215, y: 600, z: 1.4 }/' src/tiktok2/ep3/shots/act123.tsx; grep -c "y: 1295" src/tiktok2/ep2/shots/act123.tsx; grep -c "x: -215" src/tiktok2/ep3/shots/act123.tsx; node scripts/tiktok2/check-text-bounds.mjs ep2@240-500 ep3@680-1060 2>&1 | grep -v "^\[chrome\]" | tr '\r' '\n' | grep -vE "^ep[0-9]: |browser crashed|Protocol error|    at |Killed previous|Made new" | tail -10
~~~~~

**D126** `2026-10-25T11:24:58Z` · ok · Bring EP2 poster fully into frame and recheck

~~~~~bash
cd /Users/thanhphu/my-video; sed -i '' 's/a: { x: 480, y: 1295, z: 1.9 }, b: { x: 490, y: 1295, z: 2.05 }/a: { x: 480, y: 1315, z: 1.9 }, b: { x: 490, y: 1315, z: 2.05 }/' src/tiktok2/ep2/shots/act123.tsx; node scripts/tiktok2/check-text-bounds.mjs ep2@240-500 2>&1 | grep -v "^\[chrome\]" | tr '\r' '\n' | grep -vE "^ep[0-9]: |browser crashed|Protocol error|    at |Killed previous|Made new" | tail -5
~~~~~

**D127** `2026-10-25T11:25:26Z` · ERROR · Final EP2 nudge, recheck, render verification stills

~~~~~bash
cd /Users/thanhphu/my-video; sed -i '' 's/a: { x: 480, y: 1315, z: 1.9 }, b: { x: 490, y: 1315, z: 2.05 }/a: { x: 480, y: 1355, z: 1.9 }, b: { x: 490, y: 1355, z: 2.05 }/' src/tiktok2/ep2/shots/act123.tsx; node scripts/tiktok2/check-text-bounds.mjs ep2@240-500 2>&1 | grep -v "^\[chrome\]" | tr '\r' '\n' | grep -vE "^ep[0-9]: |browser crashed|Protocol error|    at |Killed previous|Made new" | tail -5; S=/private/tmp/claude-501/-Users-thanhphu-my-video/f0388be0-3a67-4763-a32e-a8c763508214/scratchpad; for x in "Tiktok2Ep2 300 a" "Tiktok2Ep2 430 b" "Tiktok2Ep3 880 c" "Tiktok2Ep3 260 d" "Tiktok2Ep5 1100 e" "Tiktok2Ep5 780 f"; do set -- $x; npx remotion still src/tiktok2/index.ts $1 $S/fix_$3.png --frame=$2 --scale=0.4 --log=error; done
~~~~~

**D128** `2026-10-25T11:26:14Z` · ok · Push poster out, recheck, render verification stills

~~~~~bash
cd /Users/thanhphu/my-video; sed -i '' 's/a: { x: 480, y: 1355, z: 1.9 }, b: { x: 490, y: 1355, z: 2.05 }/a: { x: 480, y: 1410, z: 1.9 }, b: { x: 490, y: 1410, z: 2.05 }/' src/tiktok2/ep2/shots/act123.tsx; node scripts/tiktok2/check-text-bounds.mjs ep2@240-500 2>&1 | grep -v "^\[chrome\]" | tr '\r' '\n' | grep -vE "^ep[0-9]: |browser crashed|Protocol error|    at |Killed previous|Made new" | tail -4; S=/private/tmp/claude-501/-Users-thanhphu-my-video/f0388be0-3a67-4763-a32e-a8c763508214/scratchpad; for x in "Tiktok2Ep2:300:a" "Tiktok2Ep2:430:b" "Tiktok2Ep3:880:c" "Tiktok2Ep3:260:d" "Tiktok2Ep5:1100:e" "Tiktok2Ep5:780:f"; do IFS=: read c fr n <<< "$x"; npx remotion still src/tiktok2/index.ts $c $S/fix_$n.png --frame=$fr --scale=0.4 --log=error; done; ls $S/fix_*
~~~~~

**D129** `2026-10-25T11:28:07Z` · ok · Render EP5 board stills after moving text

~~~~~bash
cd /Users/thanhphu/my-video; S=/private/tmp/claude-501/-Users-thanhphu-my-video/f0388be0-3a67-4763-a32e-a8c763508214/scratchpad; for x in 780:g 1380:h 1555:i 640:j; do IFS=: read fr n <<< "$x"; npx remotion still src/tiktok2/index.ts Tiktok2Ep5 $S/fix_$n.png --frame=$fr --scale=0.4 --log=error; done; echo ok
~~~~~

**D130** `2026-10-25T11:28:59Z` · ok · A/B EP1 still around SetStage blurFar prop

~~~~~bash
cd /Users/thanhphu/my-video; S=/private/tmp/claude-501/-Users-thanhphu-my-video/f0388be0-3a67-4763-a32e-a8c763508214/scratchpad; npx remotion still src/tiktok2/index.ts Tiktok2Ep1 $S/ab_before.png --frame=3000 --log=error && python3 - <<'EOF'
p='src/tiktok2/ep1/SetStage.tsx'
s=open(p,encoding='utf-8').read()
for a,b in [('  readonly blurFg?: number;\n  readonly vignette?: number;','  readonly blurFg?: number;\n  /** độ nhoè lớp xa (mặc định của Stage); 0 = lấy nét vào tường/bảng */\n  readonly blurFar?: number;\n  readonly vignette?: number;'),
 ('seed, blurBg, blurFg, vignette, children','seed, blurBg, blurFg, blurFar, vignette, children'),
 ('    blurFg={blurFg}\n    vignette','    blurFg={blurFg}\n    blurFar={blurFar}\n    vignette')]:
    assert s.count(a)==1,a; s=s.replace(a,b)
open(p,'w',encoding='utf-8').write(s)
EOF
npx remotion still src/tiktok2/index.ts Tiktok2Ep1 $S/ab_after.png --frame=3000 --log=error && cmp $S/ab_before.png $S/ab_after.png && echo IDENTICAL
~~~~~

**D131** `2026-10-25T11:29:25Z` · ok · Focus board in close-ups, move circle, render stills

~~~~~bash
cd /Users/thanhphu/my-video/src/tiktok2; python3 - <<'EOF'
p='ep5/shots/act123.tsx'
s=open(p,encoding='utf-8').read()
pairs=[
('board?: "blank" | "answer"; chalk?: number; teach?: "arms" | "blink" | "look" | "half" }> = ({ f, t, fk, cam, ban = {}, board = "blank", chalk = 1, teach = "arms" }) => (',
 'board?: "blank" | "answer"; chalk?: number; teach?: "arms" | "blink" | "look" | "half"; focusBoard?: boolean }> = ({ f, t, fk, cam, ban = {}, board = "blank", chalk = 1, teach = "arms", focusBoard = false }) => ('),
('    set={withBoard(classroom(t), board, chalk)}\n    frozen={fk}\n    cam={cam}\n    f={f}\n',
 '    set={withBoard(classroom(t), board, chalk)}\n    frozen={fk}\n    cam={cam}\n    blurFar={focusBoard ? 0 : undefined}\n    f={f}\n'),
# 2.5 board close-up at end
('  return <ClassRoom f={f} t={0} fk={fk} teach="blink" cam={cutCam(f, [{ at: 0, a: faceCam(TEACH.x, TEACH.y, 1.05, 2.8)',
 '  return <ClassRoom f={f} t={0} fk={fk} teach="blink" focusBoard={f >= L("L017") - 2} cam={cutCam(f, [{ at: 0, a: faceCam(TEACH.x, TEACH.y, 1.05, 2.8)'),
# 2.9
('  return <ClassRoom f={f} t={f} fk={0} board="answer" chalk={k} cam=',
 '  return <ClassRoom f={f} t={f} fk={0} board="answer" chalk={k} focusBoard={f < L("L034") - 2} cam='),
# 2.11
('      <ClassRoom f={f} t={f} fk={0} board="answer" teach="half" cam=',
 '      <ClassRoom f={f} t={f} fk={0} board="answer" teach="half" focusBoard={f >= L("L038") - 2 && f < L("L040") - 2} cam='),
('<ellipse cx={760} cy={430} rx={300} ry={90} fill="none" stroke="#ff4a3a" strokeWidth={10} />',
 '<ellipse cx={1090} cy={400} rx={540} ry={85} fill="none" stroke="#ff4a3a" strokeWidth={10} />'),
]
for a,b in pairs:
    assert s.count(a)==1,a; s=s.replace(a,b)
open(p,'w',encoding='utf-8').write(s)
EOF
cd /Users/thanhphu/my-video; npx tsc --noEmit -p . 2>&1 | grep tiktok2 | head -3; S=/private/tmp/claude-501/-Users-thanhphu-my-video/f0388be0-3a67-4763-a32e-a8c763508214/scratchpad; for x in 780:g 1380:h 1555:i; do IFS=: read fr n <<< "$x"; npx remotion still src/tiktok2/index.ts Tiktok2Ep5 $S/fix2_$n.png --frame=$fr --scale=0.4 --log=error; done; echo ok
~~~~~

**D132** `2026-10-25T11:30:08Z` · ok · Raise 2.9 camera and recheck EP5 classroom range

~~~~~bash
cd /Users/thanhphu/my-video; python3 - <<'EOF'
p='src/tiktok2/ep5/shots/act123.tsx'
s=open(p,encoding='utf-8').read()
a='{ at: 0, a: { x: BOARD.x + 260, y: BOARD.y + 100, z: 2.3 }, b: { x: BOARD.x + 300, y: BOARD.y + 100, z: 2.5 } }'
assert s.count(a)==1
s=s.replace(a,'{ at: 0, a: { x: BOARD.x + 260, y: BOARD.y + 50, z: 2.3 }, b: { x: BOARD.x + 300, y: BOARD.y + 50, z: 2.5 } }')
open(p,'w',encoding='utf-8').write(s)
EOF
node scripts/tiktok2/check-text-bounds.mjs ep5@560-1710 2>&1 | grep -v "^\[chrome\]" | tr '\r' '\n' | grep -vE "^ep[0-9]: |browser crashed|Protocol error|    at |Killed previous|Made new" | tail -20
~~~~~

**D133** `2026-10-25T11:31:30Z` · ok · Classify blurred-background text in QA tool

~~~~~bash
cd /Users/thanhphu/my-video; python3 - <<'EOF'
p='src/tiktok2/qa/TextBoundsQA.tsx'
s=open(p,encoding='utf-8').read()
a='''const ownText = (el: Element) =>'''
b='''/** Độ nhoè CSS lớn nhất trên đường lên gốc (lớp nền xa/gần của Stage có blur theo độ sâu). */
const blurOf = (el: Element) => {
  let b = 0;
  for (let e: Element | null = el; e; e = e.parentElement) {
    const m = /blur\\(([\\d.]+)px\\)/.exec(getComputedStyle(e).filter);
    if (m) b = Math.max(b, parseFloat(m[1]));
  }
  return b;
};

const ownText = (el: Element) =>'''
assert a in s; s=s.replace(a,b,1)
a='''    const kind = el instanceof SVGElement ? "svg" : "html";'''
b='''    // "blur" = chữ thuộc lớp nền đang nhoè (cắt mép như mọi vật nền khi quay cận) – chỉ để tham khảo
    const kind = blurOf(el) > 2 ? "blur" : el instanceof SVGElement ? "svg" : "html";'''
assert a in s; s=s.replace(a,b,1)
s=s.replace(" * Chữ nằm HẲN ngoài khung (không thấy) thì bỏ qua."," * Chữ nằm HẲN ngoài khung (không thấy) thì bỏ qua. Chữ ở lớp nền đang nhoè (blur > 2px) ghi loại \"blur\" (tham khảo).")
open(p,'w',encoding='utf-8').write(s)

p='scripts/tiktok2/check-text-bounds.mjs'
s=open(p,encoding='utf-8').read()
a='''  const head = `${ep} (${id}) · ${pings} frame đã đo (mỗi ${EVERY} frame) · ${rows.length} cụm chữ lọt khung`;'''
b='''  const sharp = rows.filter((g) => g.kind !== "blur").length;
  const head = `${ep} (${id}) · ${pings} frame đã đo (mỗi ${EVERY} frame) · ${sharp} cụm chữ RÕ lọt khung · ${rows.length - sharp} cụm chữ nền mờ (tham khảo)`;'''
assert a in s; s=s.replace(a,b)
s=s.replace("  bad += rows.length;","  bad += sharp;")
s=s.replace("// Kết quả: out/tiktok 2/qa/text-bounds-<tập>.txt ; mã thoát 1 nếu có chữ lọt khung.","// Kết quả: out/tiktok 2/qa/text-bounds-<tập>.txt ; mã thoát 1 nếu có chữ RÕ (không thuộc lớp nền nhoè) lọt khung.")
open(p,'w',encoding='utf-8').write(s)
EOF
grep -n 'blur\\\\(' src/tiktok2/qa/TextBoundsQA.tsx; npx tsc --noEmit -p . 2>&1 | grep tiktok2 | head -3
~~~~~

**D134** `2026-10-25T11:31:55Z` · ok · background · Full text-bounds check on all TikTok2 episodes

~~~~~bash
cd /Users/thanhphu/my-video; node scripts/tiktok2/check-text-bounds.mjs ep5 ep2 ep3 ep1 2>&1 | grep -v "^\[chrome\]" | tr '\r' '\n' | grep -vE "^ep[0-9]: |browser crashed|Protocol error|    at |Killed previous|Made new" | tail -80
~~~~~

**D135** `2026-10-25T11:32:06Z` · ok · Document text-bounds check in CLAUDE.md and memory

~~~~~bash
cd /Users/thanhphu/my-video; python3 - <<'EOF'
p='CLAUDE.md'
s=open(p,encoding='utf-8').read()
a='- Render kênh này qua entry riêng: `npx remotion render src/tiktok2/index.ts Tiktok2Ep2 "out/tiktok 2/tiktok2-ep2.mp4"`. Mix đã duyệt: giọng 1.0, SFX ×0.45, nền ×0.56; phụ đề 50px.'
assert a in s
s=s.replace(a, a+'''
- **Trước khi render mỗi tập: kiểm chữ lọt khung** `node scripts/tiktok2/check-text-bounds.mjs epN` (composition `T2QA<N>` trong Tiktok2Root, đo DOM mỗi 10 frame; chỉ một đoạn: `epN@570-1160`). Phải 0 cụm chữ RÕ lọt khung; chữ nền mờ chỉ tham khảo. Chữ trên bảng/biển/poster vẽ CÙNG LỚP với vật mang nó (vd lớp `far` của set), không vẽ ở lớp diễn viên; chữ trong set phải nằm trọn trong khung hoặc ra hẳn ngoài khung. Tập mới: thêm composition `T2QA<N>` + id trong script.''')
open(p,'w',encoding='utf-8').write(s)
EOF
cat >> /Users/thanhphu/.claude/projects/-Users-thanhphu-my-video/memory/series-tiktok2.md <<'EOF'

## Text out of frame (user complaint 2026-10-25)
- User saw text cut off at frame edges in recent eps. Tool: `node scripts/tiktok2/check-text-bounds.mjs epN` (T2QA* compositions + src/tiktok2/qa/TextBoundsQA.tsx). Run before every render; 0 sharp hits required.
- Causes found: EP5 board text drawn on actor layer (drifts off parallax board) → put sign/board text on the same set layer; cameras framing set text half-in (EP2 poster/clock, EP3 school sign) → frame text fully in or fully out.
EOF
echo done
~~~~~

**D136** `2026-10-25T15:38:45Z` · ok · List voice and reference files, read transcribe script

~~~~~bash
cd /Users/thanhphu/my-video; ls "public/kênh tiktok 2/Voice" "public/kênh tiktok 2/Ref cho kênh tiktok 2"; grep -c "Tiktok2Ep1En\|timing.en" /Users/thanhphu/.claude/projects/-Users-thanhphu-my-video/f0388be0-3a67-4763-a32e-a8c763508214.jsonl; cat scripts/tiktok2/ep1/transcribe.mjs
~~~~~

**D137** `2026-10-25T15:39:02Z` · ok · Extract media-related command history with results

~~~~~bash
cd /Users/thanhphu/.claude/projects/-Users-thanhphu-my-video/; python3 - > /private/tmp/claude-501/-Users-thanhphu-my-video/f0388be0-3a67-4763-a32e-a8c763508214/scratchpad/export/cmds.txt <<'EOF'
import json,re
res={}
lines=[json.loads(l) for l in open('f0388be0-3a67-4763-a32e-a8c763508214.jsonl') if l.strip()]
for d in lines:
    if d.get('type')=='user':
        c=d.get('message',{}).get('content')
        if isinstance(c,list):
            for x in c:
                if isinstance(x,dict) and x.get('type')=='tool_result':
                    cc=x.get('content'); t=cc if isinstance(cc,str) else ' '.join(y.get('text','') for y in cc if isinstance(y,dict))
                    res[x['tool_use_id']]=(x.get('is_error'),t)
for d in lines:
    if d.get('type')!='assistant': continue
    for x in d['message'].get('content',[]):
        if isinstance(x,dict) and x.get('type')=='tool_use' and x['name']=='Bash':
            cmd=x['input']['command']
            if re.search(r'remotion (render|still)|ffmpeg|transcribe|build_timing|generate-sfx|check_(cuts|mix)|bake-freeze|check-text-bounds|install-whisper|whisper',cmd):
                err,out=res.get(x['id'],(None,''))
                print('=====',d['timestamp'][:19],'ERR' if err else 'ok', x['input'].get('description',''))
                print(cmd[:1500])
                print('--> ',out[-400:].replace('\n',' | '))
EOF
wc -l /private/tmp/claude-501/-Users-thanhphu-my-video/f0388be0-3a67-4763-a32e-a8c763508214/scratchpad/export/cmds.txt; grep -c "^=====" /private/tmp/claude-501/-Users-thanhphu-my-video/f0388be0-3a67-4763-a32e-a8c763508214/scratchpad/export/cmds.txt
~~~~~

**D138** `2026-10-25T15:39:11Z` · ok · List render and mux commands verbatim

~~~~~bash
cd /private/tmp/claude-501/-Users-thanhphu-my-video/f0388be0-3a67-4763-a32e-a8c763508214/scratchpad/export; grep -nE "remotion render|ffmpeg .*-map|ffmpeg -y" cmds.txt | cut -c1-600 | head -60
~~~~~

**D139** `2026-10-25T15:39:21Z` · ok · Measure script sizes for verbatim inclusion

~~~~~bash
cd /Users/thanhphu/my-video; wc -l scripts/tiktok2/ep1/*.py scripts/tiktok2/ep1/*.mjs scripts/tiktok2/*/generate-sfx.mjs scripts/tiktok2/ep5/bake-freeze-stem.ts scripts/sfx-lib.mjs src/tiktok2/ep5/time.ts src/tiktok2/ep5/audio.tsx src/tiktok2/ep5/Episode.tsx src/tiktok2/ep5/freeze.ts src/tiktok2/ep1/theme.ts src/tiktok2/ep1/ui.tsx src/tiktok2/ep1/Stage.tsx src/tiktok2/ep1/Character.tsx; ls -la scripts/sfx-lib.mjs; git log --oneline -1 -- scripts/sfx-lib.mjs; git status --short scripts/sfx-lib.mjs
~~~~~

**D140** `2026-10-25T15:40:20Z` · ok · Read timing/check script headers and model usage

~~~~~bash
cd /Users/thanhphu/my-video; sed -n 1,40p scripts/tiktok2/ep1/build_timing.py; cat scripts/tiktok2/ep1/check_mix.py scripts/tiktok2/ep1/check_cuts.py | head -60; python3 -c "
import json,collections
c=collections.Counter()
for l in open('/Users/thanhphu/.claude/projects/-Users-thanhphu-my-video/f0388be0-3a67-4763-a32e-a8c763508214.jsonl'):
  d=json.loads(l)
  if d.get('type')=='assistant': c[d['message'].get('model')]+=1
print(c)"; ls /private/tmp/claude-501/-Users-thanhphu-my-video/f0388be0-3a67-4763-a32e-a8c763508214/scratchpad/*.py
~~~~~


---

## Step summary (JSON)

~~~~~json
[
  {
    "step": 1,
    "name": "Receive brief, voice and references",
    "tool": "human",
    "model": null,
    "inputs": [
      "brief text (Appendix A)",
      "public/kênh tiktok 2/Voice/epN/epN tiktok2.mp3",
      "public/kênh tiktok 2/Voice/epN/epN tiktok2.srt",
      "public/kênh tiktok 2/Ref cho kênh tiktok 2/*.png"
    ],
    "params": {},
    "prompt_ref": "Appendix A.1/A.3/A.4/A.5",
    "outputs": [],
    "manual": true
  },
  {
    "step": 2,
    "name": "Transcribe voice (word timestamps)",
    "tool": "whisper.cpp via scripts/tiktok2/ep1/transcribe.mjs",
    "model": "ggml-large-v3-turbo.bin",
    "inputs": [
      "epN tiktok2.mp3"
    ],
    "params": {
      "resample": "16 kHz mono s16",
      "language": "vi",
      "flags": "-ojf -ml 1 -sow -t 8 -np"
    },
    "prompt_ref": "none (no initial prompt)",
    "outputs": [
      "whisper.cpp/tiktok2-epN-16k.wav",
      "whisper.cpp/tiktok2-epN-transcript.json"
    ],
    "manual": false
  },
  {
    "step": 3,
    "name": "Write shot list and overrides from brief",
    "tool": "Claude Code",
    "model": "claude-opus-5-5",
    "inputs": [
      "brief shot list"
    ],
    "params": {
      "fields": [
        "id",
        "act",
        "moc",
        "hold",
        "lineHolds",
        "fast",
        "atHold"
      ],
      "minGap": 0.15,
      "maxGap": 0.38,
      "endCard": 1.5
    },
    "prompt_ref": "Appendix A",
    "outputs": [
      "src/tiktok2/epN/data/shotlist.json",
      "src/tiktok2/epN/data/timing-overrides.json"
    ],
    "manual": false
  },
  {
    "step": 4,
    "name": "Build voice-driven timeline",
    "tool": "python3 scripts/tiktok2/ep1/build_timing.py epN",
    "model": null,
    "inputs": [
      "SRT",
      "transcript json",
      "16k wav",
      "shotlist.json",
      "timing-overrides.json"
    ],
    "params": {
      "fps": 30,
      "envelope_ms": 10,
      "boundary": "nearest silence run to SRT boundary",
      "joinNext": "contiguous when no silence"
    },
    "prompt_ref": null,
    "outputs": [
      "src/tiktok2/epN/data/timing.json",
      "src/tiktok2/epN/captions.json",
      "out/tiktok 2/epN-timeline.md"
    ],
    "manual": false
  },
  {
    "step": 5,
    "name": "Verify cut points in silence",
    "tool": "python3 scripts/tiktok2/ep1/check_cuts.py epN",
    "model": null,
    "inputs": [
      "timing.json",
      "16k wav"
    ],
    "params": {
      "threshold": "noise floor + 20 dB at ±20 ms"
    },
    "prompt_ref": null,
    "outputs": [
      "console report"
    ],
    "manual": false
  },
  {
    "step": 6,
    "name": "Write scene, set, character and audio code",
    "tool": "Claude Code",
    "model": "claude-opus-5-5",
    "inputs": [
      "brief",
      "timing.json"
    ],
    "params": {
      "canvas": "1920x1080",
      "fps": 30,
      "timing_access": "sec2f/L/at/useShot only",
      "assembly": "absolute-frame <Sequence>"
    },
    "prompt_ref": "Appendix A",
    "outputs": [
      "src/tiktok2/epN/*.tsx"
    ],
    "manual": false
  },
  {
    "step": 7,
    "name": "Synthesize SFX, foley, ambience",
    "tool": "node scripts/tiktok2/epN/generate-sfx.mjs",
    "model": null,
    "inputs": [],
    "params": {
      "format": "WAV mono 44.1 kHz 16-bit",
      "deterministic": true
    },
    "prompt_ref": null,
    "outputs": [
      "public/kênh tiktok 2/sfx/epN/*.wav"
    ],
    "manual": false
  },
  {
    "step": 8,
    "name": "Type-check",
    "tool": "npx tsc --noEmit -p .",
    "model": null,
    "inputs": [
      "src"
    ],
    "params": {},
    "prompt_ref": null,
    "outputs": [],
    "manual": false
  },
  {
    "step": 9,
    "name": "Storyboard render and visual review",
    "tool": "npx remotion render src/tiktok2/index.ts T2E{N}Board --sequence --image-format=jpeg; Claude visual review",
    "model": "claude-opus-5-5 (review)",
    "inputs": [
      "compositions"
    ],
    "params": {
      "board_size": "1920x1500",
      "pick": [
        0.2,
        0.55,
        0.85
      ]
    },
    "prompt_ref": null,
    "outputs": [
      "out/tiktok 2/review/boardN/element-*.jpeg"
    ],
    "manual": false
  },
  {
    "step": 10,
    "name": "Render final MP4",
    "tool": "npx remotion render src/tiktok2/index.ts Tiktok2EpN",
    "model": null,
    "inputs": [
      "compositions",
      "voice mp3",
      "sfx wavs"
    ],
    "params": {
      "codec": "h264",
      "crf": 18,
      "concurrency": 8,
      "timeout_ms": 240000
    },
    "prompt_ref": null,
    "outputs": [
      "out/tiktok 2/tiktok2-epN.mp4"
    ],
    "manual": false
  },
  {
    "step": 11,
    "name": "Audio-only re-render and mux (audio fixes / low disk)",
    "tool": "remotion render --codec=wav [+ --muted video] + bundled ffmpeg",
    "model": null,
    "inputs": [
      "video mp4 (or muted)",
      "mix wav"
    ],
    "params": {
      "ffmpeg": "-map 0:v -map 1:a -c:v copy -c:a aac -b:a 256k -shortest"
    },
    "prompt_ref": null,
    "outputs": [
      "out/tiktok 2/tiktok2-epN.mp4"
    ],
    "manual": false
  },
  {
    "step": 12,
    "name": "EP5 only: bake repeated freeze cues into a stem",
    "tool": "npx tsx scripts/tiktok2/ep5/bake-freeze-stem.ts",
    "model": null,
    "inputs": [
      "clap.wav",
      "freeze_whoosh.wav",
      "day_tick.wav",
      "clock_tick.wav",
      "freeze.ts"
    ],
    "params": {
      "pre_gain": 0.45
    },
    "prompt_ref": null,
    "outputs": [
      "public/kênh tiktok 2/sfx/ep5/freeze_stem.wav"
    ],
    "manual": false
  },
  {
    "step": 13,
    "name": "Mix and noise QA",
    "tool": "check_mix.py + scratch hiss.py/noisy.py/hf2.py",
    "model": null,
    "inputs": [
      "final mp4 or wav",
      "timing.json"
    ],
    "params": {
      "dead_air": "< -55 dBFS / 250 ms",
      "hiss_band": "4-9 kHz outside voice"
    },
    "prompt_ref": null,
    "outputs": [
      "console report"
    ],
    "manual": false
  },
  {
    "step": 14,
    "name": "Text-out-of-frame QA",
    "tool": "node scripts/tiktok2/check-text-bounds.mjs epN",
    "model": null,
    "inputs": [
      "T2QA<N> composition"
    ],
    "params": {
      "every": 10,
      "chunk": 100,
      "concurrency": 3,
      "imageFormat": "none"
    },
    "prompt_ref": null,
    "outputs": [
      "out/tiktok 2/qa/text-bounds-epN.txt"
    ],
    "manual": false
  },
  {
    "step": 15,
    "name": "User review and feedback",
    "tool": "human",
    "model": null,
    "inputs": [
      "out/tiktok 2/tiktok2-epN.mp4"
    ],
    "params": {},
    "prompt_ref": "Appendix A.6",
    "outputs": [
      "feedback messages"
    ],
    "manual": true
  },
  {
    "step": 16,
    "name": "Timeline table and total duration report",
    "tool": "inline python over timing.json",
    "model": null,
    "inputs": [
      "timing.json"
    ],
    "params": {},
    "prompt_ref": null,
    "outputs": [
      "out/tiktok 2/epN-timeline.md",
      "chat report"
    ],
    "manual": false
  }
]
~~~~~
