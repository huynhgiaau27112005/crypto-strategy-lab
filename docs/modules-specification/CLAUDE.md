# docs/modules-specification/ — THAM KHẢO (có thể sửa/đập đi xây lại)

Spec chi tiết cho từng module, viết tay, độ chi tiết không đều nhau (`strategy-engine.md` rất dài, `realtime-candles-with-redis.md` chỉ là 1 sơ đồ ngắn). Coi là tài liệu thiết kế hỗ trợ, không phải hợp đồng bắt buộc.

## Tóm tắt từng file

| File | Nội dung | Ghi chú |
|---|---|---|
| `strategy-engine.md` | Strategy Engine là Facade che giấu 3 thành phần nội bộ: Validation, Indicator, Analyzer; đề xuất dùng Abstract Factory để dựng 3 thành phần này theo từng strategy. | Pattern hợp lý, khớp yêu cầu "Strategy Accesses the Database Directly" phải tránh. Nhưng để ngỏ tín hiệu chuẩn hoá là `BUY/SELL/HOLD` **hoặc** `LONG/SHORT/NONE` — chưa chốt, xem mâu thuẫn ở CLAUDE.md gốc. |
| `strategy-plugin.md` | Registry đứng trên Strategy Engine Facade; nơi duy nhất module khác được phép truy cập strategy đã đăng ký; cũng là nơi nhận strategy `.py` được sinh tự động (AI-generated) sau khi review. | Phần "nhận strategy .py được sinh ra" gắn với tính năng AI-generated strategy — không phải MVP, chỉ làm nếu người dùng xác nhận. |
| `news_crawler.md` | Crawler Python worker, không sở hữu business logic, không tự làm sentiment, không expose API cho user trực tiếp. | Khớp `docs/software-architecture`. File dài (1006 dòng) — đọc phần cần khi implement, không cần đọc hết ngay từ đầu. |
| `sentiment.md` | Sentiment Python worker, tách biệt khỏi crawler, không sở hữu persistence, không có business logic trading. | Khớp `docs/software-architecture`, nhưng để ý ví dụ model trong `docs/database/news_format.json` ghi PhoBERT trong khi `software-architecture/system.md` ghi FinBERT — hỏi người dùng nếu cần chốt model cụ thể trước khi code thật (có thể dùng rule-based tạm nếu deadline gấp, nhưng đó cũng là quyết định cần hỏi — xem CLAUDE.md gốc). |
| `realtime-candles-with-redis.md` | Kiến trúc 1 worker duy nhất giữ kết nối Binance WS → Redis (cache + pub/sub) → Socket server → nhiều client. Lý do: tránh N kết nối trực tiếp Binance từ N client, tránh ghi tick trực tiếp vào SQL. | Ngắn nhưng quan trọng — đây là lời giải cho anti-pattern "Frontend Coupled Directly to Binance". |

## Quy tắc

- Pattern nội bộ (Facade, Abstract Factory, Registry) là gợi ý thiết kế tốt — giữ nếu không có lý do kỹ thuật để đổi, nhưng không bắt buộc dùng đúng tên pattern nếu một cách tổ chức code khác đơn giản hơn mà vẫn thoả cùng ràng buộc (không hard-code branching, strategy không đụng DB).
- Nếu 1 module trong đây chưa có file spec riêng (vd `BacktestModule`, `LeaderboardModule`, `AuthModule`) — không có nghĩa là không cần làm; tham chiếu `docs/software-architecture/modules.md` và `docs/about-projects/` cho các module đó, và nếu vẫn thiếu chi tiết cần thiết để implement, hỏi người dùng.
