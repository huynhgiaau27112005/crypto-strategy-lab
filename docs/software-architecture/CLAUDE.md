# docs/software-architecture/ — THAM KHẢO (có thể sửa/đập đi xây lại)

Nhóm tự viết tay 5 file này (`README.md`, `system.md`, `modules.md`, `data.md`, `decisions.md`). Nội dung **có thể sai** và **có mâu thuẫn đã biết** với `docs/database/`. Không coi đây là spec bắt buộc phải tuân theo 100% — coi như bản nháp thiết kế tốt để xuất phát, được toàn quyền chỉnh sửa/thay thế khi implement, miễn kết quả cuối cùng vẫn thoả `docs/about-projects/` (đặc biệt là `02-architecture-goals.md` và `03-anti-patterns-to-avoid.md`).

## Điều nên giữ (đã hợp lý, ít rủi ro)

- Style tổng: **NestJS Modular Monolith** + Python auxiliary workers tách riêng cho crawler và sentiment (ADR-001, ADR-002) — khớp đúng chủ trương "God Service" phải tránh và "Crawler không được gắn cứng vào ML" trong `about-projects/03`.
- Plugin/Registry pattern cho Strategy Engine (ADR-004) — khớp yêu cầu "Hard-coded Strategy" phải tránh.
- WebSocket cho realtime market + leaderboard push (ADR-003) — khớp yêu cầu NFR real-time trong `about-projects/02`.
- Task queue (BullMQ/Redis) cho backtest song song (ADR-006) — khớp yêu cầu scalability tới ~100k candidate.
- Event bus nội bộ (`@nestjs/event-emitter`) để giảm coupling giữa module — khớp yêu cầu event-driven trong đề bài.

## Điều cần thẩm định lại / có khả năng over-engineered cho deadline gấp

- Toàn bộ nhánh **Python Workers** (Crawler bằng Scrapy/Playwright + Sentiment bằng FinBERT/PyTorch qua OpenRouter) là khối lượng công việc rất lớn — cân nhắc mock/đơn giản hoá nếu timeline không cho phép, nhưng đây là quyết định phải hỏi người dùng, không tự ý cắt giảm.
- `AuthModule` với "Pro Student" plan tier: không rõ có bắt buộc hệ thống multi-user thật hay chỉ là placeholder — xem mục mâu thuẫn ở CLAUDE.md gốc.
- `LLMStrategyParser` (sinh strategy từ prompt tự nhiên / URL) không nằm trong MVP theo `docs/about-projects/01-what-is-this-project.md` — đây là phần mở rộng, không phải bắt buộc.

## Mâu thuẫn đã biết (xem đầy đủ ở CLAUDE.md gốc, mục "Mâu thuẫn đã biết")

- Mô hình dữ liệu Search/Candidate khác với `docs/database/`.
- Model sentiment ghi là FinBERT, còn ví dụ trong `docs/database/news_format.json` ghi PhoBERT.
- Danh sách strategy nền tảng không khớp hoàn toàn với `docs/database/`.

**Trước khi implement `StrategySearchModule`, `BacktestModule`, hoặc `NewsOrchestrationModule`/Sentiment: bắt buộc đọc mục mâu thuẫn ở CLAUDE.md gốc và hỏi người dùng nếu chưa được xác nhận.**
