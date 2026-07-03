# EngDrive — Học tiếng Anh trên xe & máy tính

Web học tiếng Anh cá nhân cho người mới bắt đầu, chuyên ngành **dữ liệu**.
Chạy hoàn toàn trên trình duyệt Chrome — không cần cài đặt.

## Các chế độ

| Trang | Dùng khi nào | Nội dung |
|---|---|---|
| `car.html` | **Trên xe** (màn hình Android) | Hiện từ – phiên âm – nghĩa chữ cực to, tự đọc Anh→Việt lặp 3–5 lần, ôn theo lô 5 từ, ôn tập lớn sau 5 lô, hết từ thì phát vòng nghe thụ động |
| `index.html` | Trang chủ | Thống kê, lộ trình 4 cấp độ, cài đặt, đồng bộ thiết bị |
| `learn.html` | Máy tính, 10–15 phút/tối | Flashcard ôn ngắt quãng (Leitner: 1→2→4→7→15→30→60 ngày) |
| `games.html` | Giải trí có ích | 4 trò: chọn nghĩa, chọn từ, nghe-chọn, xếp chữ — luôn kèm phiên âm |
| `speak.html` | Máy tính/điện thoại có mic | Đọc từ vào mic, Chrome nhận diện và chấm điểm |

## Lộ trình từ vựng (320 từ, mở rộng dần)

1. **Nền tảng** (100) — chào hỏi, động từ cơ bản, thời gian, con người, nơi chốn, tính từ, đồ vật
2. **Công việc & giao tiếp** (80) — văn phòng, email, họp hành, tần suất
3. **Dữ liệu cơ bản** (80) — data, database, chart, filter, query, pivot table…
4. **Dữ liệu nâng cao** (60) — thống kê, machine learning, data engineering

Dữ liệu nằm ở `data/level1-4.js`, mỗi từ: `{w, p, i, v, ex, xv, t}` =
từ, loại từ, IPA, nghĩa Việt, câu ví dụ, dịch câu, chủ đề. Thêm từ mới chỉ cần thêm dòng.

## Đồng bộ giữa xe và máy tính

Tiến độ lưu trong localStorage từng máy, đồng bộ qua Supabase bằng **mã đồng bộ** bí mật:
tạo mã ở trang chủ trên một máy, nhập đúng mã đó trên máy kia. Server chỉ trả dữ liệu khi
biết đúng mã (RPC security definer, không liệt kê được dữ liệu người khác).

## Kỹ thuật

- Web tĩnh thuần HTML/CSS/JS, không build step, không framework.
- Giọng đọc: Web Speech API (giọng Google có sẵn của Chrome, cả tiếng Anh lẫn tiếng Việt).
- Nhận diện giọng nói: webkitSpeechRecognition (cần Chrome + internet).
- Giữ màn hình sáng trên xe: Screen Wake Lock API.
