# decisions.md — Quyết định đã chốt với người dùng

Ghi lại theo skill `resolve-before-coding` mỗi khi một mâu thuẫn/thiếu thông tin ở `docs/` được người dùng xác nhận, để không phải hỏi lại và để phục vụ vấn đáp.

## 2026-08-23 — Kickoff Phase 2 (4 quyết định chặn kiến trúc)

### 1. Mô hình dữ liệu Search/Candidate

**Chốt:** Theo `docs/database/Schema explanation.md` — tách `experiments → experiment_configs → experiment_config_strategies → experiment_iterations → candidates → candidate_strategies`. **Không** dùng mô hình phẳng của `docs/software-architecture/data.md` (strategy_id gắn thẳng vào experiments).

**Lý do:** Tách rõ "cấu hình tìm kiếm" (weight, timeframe, iteration limit) khỏi "kết quả cụ thể mỗi iteration" (tham số candidate) — khớp yêu cầu reproducibility của đề bài (`docs/about-projects/02-architecture-goals.md` mục 9).

**Hệ quả cho code:** `docs/software-architecture/data.md` (bảng `experiments`) cần viết lại theo schema `docs/database/design.dbml`. `BacktestModule` ghi vào `backtest_runs`/`trades`/`evaluations` (tên bảng theo `docs/database/`, không phải `experiments`/`trades` phẳng như `software-architecture/modules.md` mô tả).

### 2. Danh sách strategy nền tảng MVP

**Chốt:** 4 strategy — **MA, RSI, Bollinger Bands, Support/Resistance**.

**Lý do:** `docs/about-projects/01-what-is-this-project.md` (binding) liệt kê rõ 4 strategy này là ví dụ MVP. `docs/database/` chỉ nêu 3 (MA, RSI, BB) làm ví dụ minh hoạ khái niệm, không phải giới hạn cứng — bổ sung Support/Resistance vào bảng `strategies` seed data.

### 3. Phạm vi News + Sentiment pipeline

**Chốt:** **Không mock.** Crawl news thật (có hỗ trợ AI để trích xuất/self-healing như `docs/modules-specification/news_crawler.md` mô tả). Sentiment dùng **model AI có sẵn** (pretrained, qua API hoặc pretrained pipeline) — **không tự train/fine-tune model từ đầu** (khác với phương án FinBERT tự host nêu trong `docs/software-architecture/system.md`).

**Lý do:** Người dùng ưu tiên dữ liệu thật cho demo, nhưng không đủ thời gian tự huấn luyện/host model ML riêng trong 2 ngày.

**Hệ quả cho code:** `Sentiment Worker` gọi một model/API sentiment classification có sẵn (vd OpenRouter LLM, hoặc pretrained HF pipeline chạy local không cần train) thay vì tự host + fine-tune FinBERT. Giữ đúng ranh giới kiến trúc: Crawler và Sentiment vẫn là 2 tiến trình/module tách biệt như ADR-005, chỉ đổi cách hiện thực hoá sentiment bên trong. Contract `NewsItem`/`SentimentResult` giữ nguyên theo `docs/database/news_format.json`. **Cần chốt cụ thể model/API nào (vd OpenRouter model ID) khi bắt đầu code module này — nếu chưa rõ, hỏi tiếp lúc đó.**

### 4b. Code hiện có trong `service/` — migrate, không giữ nguyên

**Phát hiện:** `service/src/` không phải stub — đã có ~2700 dòng code thật cho Market Data (Binance client thật), Strategy Engine, Strategy Search (domain-guided random generator chạy được), Backtesting, Leaderboard, với một số test. Dùng mô hình phẳng (`experiments`→`experiment_strategies` trực tiếp) + `session_id` ẩn danh qua cookie, không có migration file nào (schema tồn tại ngầm).

**Chốt (sau khi hỏi lại):** Migrate toàn bộ sang mô hình Candidate tách riêng + Auth thật, **không** giữ mô hình phẳng/session. Việc migrate được thực hiện qua plan `docs/superpowers/plans/2026-08-23-foundation-candidate-auth-migration.md`.

**Điều chỉnh thiết kế kèm theo (quyết định kỹ thuật thuần tuý, không hỏi lại vì đã nằm trong phạm vi "migrate sang schema database/"):** Code hiện tại random hoá **weight** của từng strategy member cho mỗi candidate (`domain-guided-random.generator.ts`). Theo đúng schema đã chọn, weight là thuộc tính của **Search Configuration** (`experiment_config_strategies.weight`), cố định cho mọi candidate trong 1 experiment — chỉ tham số kỹ thuật (period, threshold...) và cấu trúc (chọn domain nào) mới random theo từng candidate. Generator được viết lại theo hướng này.

### 4c. Phát hiện `database/` (root) — hạ tầng thật của đồng đội, khác `docs/database/`

**Phát hiện (sau khi `git fetch` + kiểm tra `main`):** Trong lúc phiên này đang chạy, đồng đội đã push và merge nhiều nhánh vào `main` (`database`, `market`, `search`, `strategy-plugin`, `crawler_sentiment_worker`, `tahi`). Có một folder **`database/` ở root** (khác `docs/database/`) chứa:
- `database/migrate.js` — migration runner riêng (không phải `node-pg-migrate`), track qua bảng `schema_migrations`, chạy các file SQL đánh số trong `database/migrations/`.
- `database/migrations/001_initial_schema.sql` + `002_domain_guided_search.sql` — **đã là schema thật, đã chạy**, đúng mô hình phẳng + `sessions` (không auth) mà code trong `service/src/` đang dùng.
- `database/seed.js` + `database/seeds/001_initial_seed.sql`, `database/README.md` (giải thích rất kỹ, có chủ đích, tại sao chọn session-based không auth), `database/design.dbml` (bản **cũ hơn, đơn giản hơn** `docs/database/design.dbml` — không có users/refresh_tokens/candidates).

Kết luận: `docs/database/design.dbml` là bản thiết kế **sau này, chưa từng được đồng bộ vào `database/`** — tức là đề xuất nâng cấp chưa triển khai, không phải "nháp có thể sai" như ban đầu tôi hiểu. `database/` mới là hạ tầng **thật, đã chạy, nhiều nhánh khác của đồng đội có thể đang phụ thuộc vào nó**.

**Chốt (sau khi hỏi lại):** Vẫn tiến hành migrate sang Candidate + Auth thật theo `docs/database/`, **và cập nhật luôn `database/`** (không chỉ `service/`) — thêm migration mới `database/migrations/003_candidate_auth_schema.sql` theo đúng convention hiện có của đồng đội (file SQL đánh số, chạy qua `database/migrate.js`, không thêm `node-pg-migrate` làm công cụ thứ 2 song song). `docs/database/design.dbml` + `database/design.dbml` cần đồng bộ lại sau khi migrate xong.

**Rủi ro người dùng đã chấp nhận:** Các nhánh khác (`market`, `search`, `strategy-plugin`, `crawler_sentiment_worker`) có thể đang code dựa trên schema phẳng/session hiện tại — migrate sang Candidate+Auth có thể xung đột với PR/branch đang mở của đồng đội. **Khuyến nghị nhóm thông báo cho các thành viên khác trước khi merge nhánh migrate này vào `main`**, để tránh xung đột song song.

### 4. Authentication

**Chốt:** **Auth thật** (đăng ký/đăng nhập) theo schema `users`/`refresh_tokens` trong `docs/database/`.

**Lý do:** Người dùng xác nhận muốn có auth thật thay vì user ngầm định — dùng cho ownership của `experiments`, `strategies` do user tạo, và AI-generated strategies (nếu làm phần mở rộng này sau).

**Hệ quả cho code:** Cần `AuthModule` thật (JWT + refresh token), không phải placeholder "Pro Student" mơ hồ như `docs/software-architecture/modules.md` mô tả.
