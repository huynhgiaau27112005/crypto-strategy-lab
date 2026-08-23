# docs/database/ — THAM KHẢO (có thể sửa/đập đi xây lại)

Nhóm tự thiết kế schema (`design.dbml`, `Schema explanation.md`, `news_format.json`). Có giá trị lớn ở phần **giải thích khái niệm** (đặc biệt là phân biệt Strategy / Configuration / Candidate / Experiment ở mục 27 của `Schema explanation.md`) — nên giữ lại tư duy này vì nó phục vụ tốt yêu cầu "reproducibility" (`about-projects/02` mục 9). Nhưng schema cụ thể có thể cần sửa.

## Điều nên giữ

- Phân tách rõ 4 khái niệm: **Strategy** (thuật toán, vd MA/RSI/BB) ≠ **Configuration** (cách search: weight, timeframe, iteration limit) ≠ **Candidate** (tham số cụ thể 1 iteration sinh ra, vd MA20/RSI14) ≠ **Experiment** (1 lần search run). Đây là thiết kế tốt hơn bản `experiments` phẳng trong `docs/software-architecture/data.md` vì tách rõ "cấu hình tìm kiếm" khỏi "kết quả cụ thể", và giải quyết đúng bài toán reproducibility đề bài yêu cầu.
- Nguyên tắc immutable: strategy không update, thay đổi config tạo Experiment mới, giữ lại lịch sử cũ.
- 15 constraint liệt kê ở mục 28 — checklist hữu ích khi viết migration thật, dù ORM cụ thể có thể khác.

## Điều cần thẩm định lại

- TimescaleDB cho bảng `candles`: hợp lý về mặt kỹ thuật (time-series), nhưng cần cân nhắc so với timeline — nếu không kịp, dùng PostgreSQL thường + index theo `(pair, timeframe, timestamp)` vẫn chấp nhận được cho MVP; đây là điều nên hỏi người dùng nếu ảnh hưởng lớn tới effort.
- `AI_GENERATED` strategy (sinh code Python từ mô tả tự nhiên, chạy sandbox riêng) không nằm trong MVP của `docs/about-projects/` — đừng implement trừ khi người dùng xác nhận muốn làm phần mở rộng này.
- File `news_format.json` chỉ là **ví dụ mẫu 1 record**, không phải DDL — model `PhoBERT` trong đó có thể chỉ là placeholder, không nhất thiết là quyết định cuối.

## Mâu thuẫn đã biết với `docs/software-architecture/data.md`

Mô hình Search/Candidate ở đây (4 bảng: `experiments → experiment_configs → candidates → candidate_strategies`) **không khớp** với mô hình phẳng bên `software-architecture/data.md` (`experiments` gắn thẳng `strategy_id`). Đây là quyết định kiến trúc dữ liệu quan trọng nhất cần chốt trước khi code Backtest/Search/Leaderboard — bắt buộc hỏi người dùng, không tự chọn 1 bên. Xem thêm ở CLAUDE.md gốc.
