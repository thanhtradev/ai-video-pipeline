You are writing an episode brief for a Vietnamese animated YouTube/TikTok channel (code-drawn
cartoon; the frame depends on the channel, see INPUT). The brief will be fed to an automated pipeline, so follow the format EXACTLY.
All video content (narration, character descriptions, shot descriptions, on-screen TEXT) must be
in Vietnamese. VISUAL STYLE may be in English.

OUTPUT: plain text only, inside ONE code block. No Markdown bold/italics/headings, no commentary
before or after. Sections in this order:

EP<n> — <episode title in Vietnamese>

=== NHÂN VẬT ===
- <NAME IN CAPS>: <look: age, hoodie colour, hair, props>. One line per character.

=== VISUAL STYLE ===
- <bullet points: art style, palette, depth, lighting, camera, colour grade per act>

=== HIỆU ỨNG RIÊNG TẬP NÀY ===
- <EFFECT NAME IN CAPS>: <what it looks like, timing>. Only effects specific to this episode.

VOICE
<narration, one sentence group per line>

=== DANH SÁCH SHOT (SFX/foley trong ngoặc) ===
[1. <ACT NAME>]
1.1 MỐC "<first words of a VOICE line>": <shot description>. TEXT "<on-screen text>" (<sfx>, <sfx>)
1.2 "<first words of a VOICE line>": <shot description>. (<sfx>)

[2. <ACT NAME>]
2.1 ...

HARD RULES (the pipeline rejects the brief otherwise):
1. VOICE: one spoken line per text line. Separate acts with ONE blank line. Delivery tags go in
   square brackets at the start of a line, in English: [punchy] [tense] [deadpan] [short pause]
   [gentle] [as Grandpa, cheerful] … Tags are not read aloud.
2. Write numbers and units as spoken Vietnamese words ("ba mươi giây", "một trăm nghìn"), not digits.
3. 1 to 12 acts. Every act in VOICE must have a matching [n. ACT NAME] block in DANH SÁCH SHOT,
   in the same order.
4. Shot ids are <act>.<n>, numbered 1, 2, 3… within each act, without gaps.
5. Each shot's MỐC (the quoted text) must be copied character-for-character from the START of a
   VOICE line in the same act, and MỐCs must appear in the same order as the lines they point to.
   Change shot every 1–3 lines.
6. Each act's narration under 10,000 characters; the whole brief under 30,000 characters.
7. Length: about 3.2 spoken words per second (6 minutes ≈ 1150 words of narration).
8. Optional shot notes: "Giữ cho đọng" for a held beat (gag, emotion), "nhanh" for rapid cuts.
9. Facts introduced with "Chuyện này là thật: …" must be well established; never invent
   statistics, names or quotes. Nothing frightening or graphic on screen.
10. The narration's first line is the channel hook, and its last line is the channel ending (see INPUT).

EXAMPLE (the first two acts of a real brief; copy its format and style, not its story):

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

=== DANH SÁCH SHOT (SFX/foley trong ngoặc) ===
[1. HOOK]
1.1 MỐC "Nếu bạn dừng được thời gian": ECU hai bàn tay vỗ vào nhau → wide hẻm Sài Gòn đứng hình: chim bồ câu treo giữa trời, ly cà phê đá tung giữa không trung; đồng hồ 30 giây và "+1 NGÀY" hiện góc trên. TEXT trên cùng "NẾU MỖI LẦN DỪNG THỜI GIAN, BẠN GIÀ THÊM 1 NGÀY?" (vỗ tay, vút, tách)

[2. COLD OPEN – tiết Toán]
2.1 "Tiết Toán": cô gọi tên, bạn đi lên bảng. (bước chân)
2.2 "Bạn đứng trước bảng": close-up bạn cầm phấn, mắt "> <".
2.3 "Cả lớp nhìn": wide cả lớp nhìn lên; cô khoanh tay.
2.4 "Bạn vỗ tay một cái": ECU vỗ tay → FreezeWorld. Giữ cho đọng. (vỗ tay, vút, im lặng)
2.5 "Cô giáo khựng giữa cái chớp mắt": cận cô mí mắt khép dở; Đạt ngáp dở; bụi phấn treo như tuyết.
2.6 "Ở góc mắt bạn, có một con số": đồng hồ 30 → 28. (tích tắc)
2.7 "Bạn chạy xuống bàn Vy": bạn chạy giữa các bàn đông cứng, lật vở Vy, đọc. (bước chạy, lật vở)
2.8 "Ba. Hai. Một": đồng hồ đỏ, bạn chạy về bảng → UNFREEZE. (âm thanh bật lại)
2.9 "Bạn viết đáp án": ECU phấn viết nhanh. (phấn)
2.10 "Cô nhìn bảng": close-up cô nhìn bảng, nhìn bạn, mắt nửa mí.
2.11 "Đúng. Nhưng cô gọi": cận bảng: chữ "BÀI 3" trên đề, bạn ghi "BÀI 4". Giữ cho đọng. TEXT "-1 NGÀY TUỔI. GIẢI SAI BÀI."

INPUT (fill in before sending)
- Topic: <chủ đề>
- Length: <số phút> minutes
- Channel: <choose one>
    Chíp (BẠN) ("what if" channel, landscape 16:9): main character BẠN, teenager in a saturated
      ORANGE hoodie, told in the second person. Hook starts with "Nếu bạn…?" ; final line exactly
      "Một chữ nếu… một cuộc đời khác."
    Chíp Khoa học (science channel, VERTICAL 9:16 for phones): host CHÍP, a small curious robot in
      a teal hoodie with a blinking antenna, told in the third person; one science question per
      episode. Shots for a tall frame: one or two characters, diagrams above them. Hook starts
      with "Chíp ơi, tại sao…?" ; final line exactly "Chíp đã hiểu. Còn bạn?"
- Notes: <ý tưởng, nhân vật, cảnh muốn có>
