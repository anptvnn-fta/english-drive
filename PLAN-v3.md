# EngDrive v3 — Đặc tả triển khai chi tiết (bàn giao cho agent thực thi)

*Lập 05/07/2026 bởi Fable (kiến trúc + kế hoạch). Phần code do agent khác thực hiện theo đúng tài liệu này.*
*Trạng thái: kế hoạch đã được chủ dự án duyệt. Chưa triển khai.*

---

## 0. Bối cảnh dự án (đọc trước khi code)

- **Repo:** `C:\Users\admin\Downloads\english-drive` = github.com/anptvnn-fta/english-drive (public).
  Web chạy thật: https://anptvnn-fta.github.io/english-drive/ — deploy tự động khi push `main` (GitHub Actions, `.github/workflows/pages.yml`).
- **Kiến trúc:** web tĩnh vanilla JS, KHÔNG build step, KHÔNG framework. 5 trang: `index.html` (dashboard),
  `car.html` (học trên xe — trọng tâm), `learn.html` (flashcard FSRS), `games.html`, `speak.html`.
- **Dữ liệu từ vựng:** 1.260 từ trong `data/level1-4.js` + `data/ngsl1-3.js`, mỗi mục
  `{w, p, i, v, ex, xv, t}` = từ, loại từ, IPA (General American, không dấu /), nghĩa Việt, câu ví dụ, dịch, chủ đề.
  `js/core.js` gộp thành `VOCAB` theo thứ tự `LEVELS` (7 chặng), tự bỏ trùng theo `w`.
- **SRS:** FSRS v6 qua `vendor/ts-fsrs.umd.js` (global `window.FSRS`), tham số trong `core.js`
  (`learning_steps: []` — CỐ Ý, đừng bật lại). Thẻ nằm ở `Store.data.words[w].fc`; `box` chỉ là số hiển thị.
- **Đồng bộ:** Supabase project `ivcqqhofayvssammkini` (ap-southeast-1), RPC `get_progress`/`put_progress`
  khóa bằng mã bí mật; client là `js/sync.js`. Settings merge phải giữ NGUYÊN THAM CHIẾU `Store.data.settings`
  (Object.assign — đã có, đừng đổi thành gán object mới).
- **Người dùng:** 1 người Việt học từ số 0, nghe trên xe ~30 phút/ngày, tối flashcard.
  Mục tiêu gần: chuẩn đầu ra tiếng Anh chương trình cử nhân từ xa ngành Tài chính–Ngân hàng (NEU);
  công việc cần nghe + nói giao tiếp, đọc tài liệu data. UI tiếng Việt. **Mọi chỗ hiện từ đều phải có IPA.**

### Quy tắc bắt buộc với agent thực thi

1. Giữ vanilla JS + script tag, không thêm bundler/framework/dependency ngoài trừ khi spec ghi rõ.
2. Không phá schema dữ liệu cũ; mọi trường mới đều tùy chọn (optional).
3. Sau mỗi phase: chạy `node --check` toàn bộ JS + test trên preview + **một vòng review đối nghịch**
   (nhiều agent tìm lỗi, mỗi finding 2 agent phản biện, chỉ sửa lỗi được xác nhận) trước khi push.
4. Deploy = commit + push `main`. **TUYỆT ĐỐI không dùng tool deploy_to_vercel của MCP**
   (nó đẩy cả thư mục Downloads lên mạng).
5. Commit message tiếng Việt, kèm `Co-Authored-By` theo chuẩn hiện có trong git log.

### Bẫy kỹ thuật đã phát hiện qua review (KHÔNG tái phạm)

- Chrome Android nuốt utterance ngay sau `speechSynthesis.cancel()` → `TTS.speak` đã có chờ 220ms, giữ nguyên.
- `u.lang` phải gán = `voice.lang` khi đổi giọng, nếu không Android bỏ qua giọng GB/AU.
- Tab ẩn bị throttle timer → car.js có xử lý visibilitychange đọc lại từ đang dở; test tự động phải
  dùng stub có `setTimeout`, cấm vòng lặp thuần microtask (sẽ treo tab).
- `prompt()/confirm()` bị chặn trên nhiều màn hình Android ô tô → mọi nhập liệu dùng input + nút trong trang.
- SpeechRecognition: luôn lưu `Car._activeRec` và abort khi jump/replay/visibilitychange.
- `Car.seenSet` chống đếm trùng tiến độ khi replay — mọi chỗ mới ghi tiến độ trên xe phải qua nó.
- AudioContext phải được tạo/resume trong cử chỉ chạm (đã làm ở `btnStart`).

---

## PHASE 1 — Minh họa từ vựng 3 lớp (phương án đã duyệt)

### 1.1 Cấu trúc dữ liệu

Tạo file mới `data/extras.js` (KHÔNG sửa 7 file data hiện có):

```js
window.VOCAB_EXTRAS = {
  "coffee":   { e: "☕" },
  "analysis": { img: "img/analysis.webp" },
  "deadline": { e: "⏰", m: "đét-lai — trễ hạn là bị 'đét' ngay" },
  // e = emoji hệ thống | img = ảnh AI | m = câu liên tưởng. Cả 3 đều tùy chọn.
};
```

`js/core.js`: khi build `VOCAB`, merge `window.VOCAB_EXTRAS[w]` vào từng entry (spread, không ghi đè trường gốc).
Thêm `<script src="data/extras.js">` vào cả 5 trang HTML, TRƯỚC `core.js`.

### 1.2 Lớp emoji (làm trước, 1 buổi)

- Fan-out agents (8 phần × ~158 từ): với mỗi từ, chọn 1 emoji Unicode CHUẨN (có trong bộ hệ thống
  Windows/Android) gợi đúng NGHĨA của từ theo nghĩa `v` trong data. Không chọn emoji chỉ "liên quan xa".
  Nếu không có emoji đạt → trả `null` (từ đó chuyển sang lớp ảnh AI).
- Tiêu chí nghiệm thu: agent phản biện xem cặp (emoji, nghĩa Việt) — che từ tiếng Anh đi, nhìn emoji
  phải đoán ra đúng trường nghĩa. Tỷ lệ đạt kỳ vọng ~60-70% của 1.260 từ.
- Output: phần `e` trong `data/extras.js`.

### 1.3 Lớp ảnh AI (2-4 ngày lịch vì bậc miễn phí)

- Model: Gemini image model mới nhất khả dụng (giá đã kiểm chứng 07/2026: $0,039/ảnh chuẩn,
  $0,0195 batch; bậc MIỄN PHÍ ~500 ảnh/ngày — dùng bậc miễn phí, tổng chi phí mục tiêu = 0đ).
  Lưu ý: `gemini-2.5-flash-image` dự kiến ngừng 02/10/2026 — kiểm tra model hiện hành trước khi chạy.
- API key: hỏi chủ dự án cung cấp (user đã có key Gemini từ dự án Pixelle-Video), đặt vào biến môi trường
  `GEMINI_API_KEY` khi chạy script, KHÔNG commit key.
- Viết `tools/gen-images.mjs` (Node, chạy tay, KHÔNG nằm trong web):
  1. Đọc data + extras, lấy danh sách từ chưa có `e` (ước ~400-500 từ).
  2. Prompt template: `"Minimal flat illustration for the English word '{w}' meaning '{nghĩa tiếng Anh
     từ trường def/v}'. Single clear visual metaphor, no text, no letters, soft colors,
     white background, simple shapes, 1:1"`. Với từ trừu tượng: yêu cầu ẩn dụ cụ thể
     (vd. probability = xúc xắc, growth = mầm cây + mũi tên).
  3. Lưu `img/{w}.webp` 512×512 (chuyển webp bằng `sharp`, quality ~80, mục tiêu ≤ 30KB/ảnh —
     tổng ≤ ~20MB, giới hạn cứng GitHub Pages 1GB đã kiểm chứng, không lo).
  4. Ghi log từ nào lỗi/miss để chạy bù hôm sau (giới hạn 500/ngày, ~2 ảnh/phút).
- Nghiệm thu ảnh: fan-out agents có vision xem từng ảnh + nghĩa: "che từ đi, ảnh có gợi đúng nghĩa không,
  có chữ/ký tự lạc vào không?" — ảnh rớt thì sinh lại với ẩn dụ khác (tối đa 2 lần, vẫn rớt thì bỏ ảnh,
  từ đó dựa vào câu liên tưởng).
- Output: phần `img` trong `data/extras.js` + thư mục `img/`.

### 1.4 Lớp câu liên tưởng (song song với 1.3)

- Chọn ~300 từ khó nhất: ưu tiên (a) từ ≥ 3 âm tiết, (b) từ trừu tượng không có emoji lẫn ảnh đạt,
  (c) từ level Dữ liệu nâng cao.
- Fan-out agents viết câu liên tưởng tiếng Việt ≤ 15 từ, BẮT BUỘC gắn đồng thời:
  ÂM đọc gần đúng của từ (phiên âm bồi) + NGHĨA. Mẫu: `deadline → "đét-lai: trễ hạn là bị đét, lái xe về ngay"`.
- Vòng phản biện: agent khác chấm từng câu theo 2 tiêu chí âm/nghĩa, câu rớt viết lại.
- Output: phần `m` trong `data/extras.js`.

### 1.5 Tích hợp UI

- `learn.html/learn.js` — mặt trước flashcard: hình (img ưu tiên, không có thì emoji cỡ ~64px) phía trên từ;
  mặt sau: thêm dòng câu liên tưởng `m` (style nhẹ, màu warning) dưới ví dụ.
- `games.js` — trò "Chọn nghĩa" (envi): hiện hình cạnh từ ở đề bài. KHÔNG cho hình vào các lựa chọn
  (lộ đáp án). Trò "Xếp chữ": hiện hình cạnh nghĩa Việt làm gợi ý.
- `car.js/car.html` — hình NHỎ (≤ 96px, opacity ~0.85) ở góc trên phải vùng chữ, không che 3 dòng chính,
  KHÔNG hiệu ứng động (an toàn lái xe). Ảnh dùng `loading="lazy"`/gán src khi render.
- CSS: thêm class `.word-illust` (flashcard/games) và `.car-illust` (xe) vào `css/style.css`,
  theo đúng design token hiện có (biến màu, bo góc 20px).
- Không đụng `js/sync.js` — extras là dữ liệu tĩnh, không sync.

### 1.6 Nghiệm thu Phase 1

- [ ] `node --check` sạch toàn bộ; các trang load không lỗi console.
- [ ] Flashcard hiện đúng 3 kiểu minh họa với từ mẫu: coffee (emoji), analysis (ảnh), deadline (mnemonic).
- [ ] Car mode: chữ vẫn to nguyên kích thước cũ, hình không che chữ ở 1280×720 và 375×812.
- [ ] Tổng dung lượng `img/` ≤ 25MB; Pages deploy thành công.
- [ ] Vòng review đối nghịch: 0 lỗi critical còn mở.
- [ ] Footer index.html thêm ghi nguồn nếu có dùng tài nguyên yêu cầu attribution.

---

## PHASE 2 — Chốt đích chứng chỉ (nửa buổi, làm ngay sau hoặc song song Phase 1)

Nghiên cứu web (WebSearch/agent-reach) trả lời CHÍNH XÁC, có dẫn nguồn:

1. **Chuẩn đầu ra ngoại ngữ chương trình CỬ NHÂN TỪ XA ngành Tài chính–Ngân hàng của NEU**
   (Đại học Kinh tế Quốc dân, hệ e-learning/đào tạo từ xa — tra trang neu.edu.vn, elearning.neu.edu.vn,
   quy chế/thông báo hiện hành): yêu cầu bậc mấy khung 6 bậc? Chấp nhận những chứng chỉ nào
   (VSTEP/TOEIC/IELTS...) với ngưỡng điểm bao nhiêu? Miễn/quy đổi ra sao?
2. Lệ phí + địa điểm + lịch thi hiện hành tại Hà Nội: TOEIC L&R (IIG), VSTEP (các trường được cấp phép).
3. Output: bảng so sánh + khuyến nghị đích cụ thể (chứng chỉ nào, ngưỡng điểm nào, thi khoảng tháng nào)
  ghi vào mục này của PLAN. Số liệu phải từ nguồn chính thức, ghi ngày tra cứu.

### KẾT QUẢ Phase 2 (tra cứu 06/07/2026, nguồn chính thức NEU + tổng hợp):

**XÁC NHẬN bằng bảng chính thức NEU (user gửi ảnh Phụ lục 2 + 2B). NEU bỏ VSTEP; chương trình chính quy học bằng tiếng Việt (hệ từ xa TCNH áp theo) = Bậc 4/B2. Bốn chứng chỉ được chấp nhận:**
- **TOEFL ITP 500 — CHỈ Nghe + Ngữ pháp + Đọc, KHÔNG có Nói/Viết** (rẻ ~900k-1tr, nội địa).
- TOEIC 4 kỹ năng: 600 (Nghe-Đọc) + 270 (Nói-Viết).
- IELTS 5.5.
- TOEFL iBT 46.
- (CLC/POHE/dạy tiếng Anh = B4 cao hơn: IELTS 6.0/TOEIC 730+290/ITP 543/iBT 60. Ngôn ngữ Anh & tiên tiến = Bậc 5: IELTS 6.5.)
- Thi nội bộ NEU thay thế: ≥50/100, mỗi phần ≥30.

**LỘ TRÌNH KHUYẾN NGHỊ (đã tối ưu theo thế mạnh nghe-đọc của user):**
- **Đích tốt nghiệp = TOEFL ITP 500** — con đường NGẮN NHẤT: né hoàn toàn Nói/Viết (2 kỹ năng user yếu), khớp đúng cách học nghe+đọc+từ vựng, rẻ nhất. TOEIC Nghe-Đọc dùng làm thước đo dọc đường.
- **Dài hạn (giảng dạy bằng tiếng Anh) = IELTS 6.0-6.5** — lúc đó mới cần đầu tư Nói.
- TÁC ĐỘNG APP: app hiện tại (nghe/đọc/từ vựng) phục vụ THẲNG TOEFL ITP — CHƯA cần Phase 4 (Nói-Viết) vội; để dành cho giai đoạn IELTS. Phase 3 (từ TCNH + TOEIC/TSL) vẫn hữu ích vì Reading TOEFL ITP + công việc cần vốn từ.
- Còn nên xác nhận: hệ từ xa có dùng đúng Bậc 4 này hay thấp hơn Bậc 3 (gọi 0965010628/eneu@neu.edu.vn) — nếu thấp hơn thì càng nhẹ.

Nguồn: onthiielts.com.vn/chuan-dau-ra-tieng-anh-neu, daotao.neu.edu.vn/vi/quy-dinh-chuan-dau-ra-ngoai-ngu, cel.neu.edu.vn.

---

## PHASE 3 — Từ vựng chuyên ngành (1-2 buổi, sau Phase 1)

### 3.1 Track "Tài chính–Ngân hàng" (~200 từ)

- Chủ đề con: ngân hàng cơ bản (deposit, loan, interest, account, branch...), tín dụng & rủi ro,
  đầu tư & thị trường (stock, bond, portfolio, dividend...), kế toán–tài chính doanh nghiệp
  (asset, liability, equity, revenue, profit margin...), fintech & thanh toán.
- Pipeline giống đợt NGSL: chọn từ (ưu tiên trùng giáo trình TCNH đại cương) → IPA tra
  `tmp/cmudict-ipa.txt` (tải lại từ github.com/menelik3/cmudict-ipa nếu thiếu) → agents sinh
  `{p, v, ex, xv, t}` với ví dụ NGỮ CẢNH TÀI CHÍNH → dedupe với 1.260 từ hiện có → file `data/finance.js`,
  thêm vào `LEVELS` làm chặng 8 "Tài chính–Ngân hàng".
- Câu ví dụ dài hơn một chút được phép (≤ 12 từ) vì phục vụ đọc hiểu.

### 3.2 TSL — TOEIC Service List (khi vào giai đoạn luyện thi, chờ kết quả Phase 2)

- Nguồn: newgeneralservicelist.com (nhóm Browne, ~1.200 từ, CC BY-SA 4.0 — cùng giấy phép NGSL).
  Tìm bản CSV/tải được; nếu không có bản máy đọc được thì dùng GitHub mirror (kiểm tra số từ khớp ~1.200).
- Pipeline như 3.1, dedupe với toàn bộ từ đã có (dự kiến trùng nhiều với NGSL — chỉ nạp phần chưa có),
  file `data/tsl.js`, chặng 9.

---

## PHASE 4 — Nghe & nói nâng cao trên xe (1-2 buổi, sau Phase 2 chốt đích)

### 4.1 Chế độ "luyện tai" (nghe câu, không chỉ từ)

- Dataset mới `data/dialogs.js`: ~200 cặp hỏi-đáp ngắn kiểu TOEIC Part 2
  (`{q: "Where is the meeting room?", a: "It's on the second floor.", qv: "...", av: "..."}`),
  agents sinh theo bối cảnh văn phòng/tài chính/đời sống, ≤ 9 từ mỗi câu, chỉ dùng từ trong vốn 1.460 từ
  (NGSL + finance) để người học nghe hiểu được.
- car.html thêm nút chuyển chế độ `Từ vựng ↔ Luyện tai` (to, trong drawer hoặc cạnh phase pill).
  Flow phát 1 cặp: đọc Q (giọng 1) → pause 4s (người học tự đoán) → đọc A (giọng 2 KHÁC — tận dụng
  TTS.enVoiceFor) → đọc bản dịch tiếng Việt của cả cặp → cặp kế. Ôn lô 5 cặp như flow từ vựng.
  Màn hình: hiện text Q to, A hiện SAU khi đọc A (để không đọc lỏm).
- Tiến độ: lưu số cặp đã nghe trong `Store.data.log` (trường `dialog`), không cần SRS cho câu.

### 4.2 Shadow câu (mở rộng chế độ đọc theo hiện có)

- Trong chế độ luyện tai, nếu `settings.shadow` bật: sau câu A, mời đọc theo CẢ CÂU A;
  chấm bằng similarity ≥ 0.6 với transcript (nới hơn mức từ đơn 0.72 vì câu dài).
  Tái dùng `listenOnce`/`shadowGate` hiện có (refactor nhận tham số target + threshold).

---

## Thứ tự thực hiện đề xuất

```
Phase 1.2 emoji ──┐
Phase 1.4 mnemonic ─┼─→ 1.5 UI → 1.6 nghiệm thu → deploy
Phase 1.3 ảnh AI ──┘ (kéo dài 2-4 ngày, nạp dần theo ngày)
Phase 2 research (độc lập, làm bất kỳ lúc nào, nửa buổi)
Phase 3.1 finance track → deploy
Phase 2 chốt đích → Phase 3.2 TSL → Phase 4 → deploy
```

Mỗi lần deploy xong phải curl kiểm tra file mới trên https://anptvnn-fta.github.io/english-drive/ trả 200.
