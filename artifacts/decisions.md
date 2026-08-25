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

### 5. Công thức weighted voting — bỏ ràng buộc tổng trọng số = 1

**Phát hiện (người dùng chỉ ra):** UI bắt tổng trọng số phải bằng 1, từ chối bộ trọng số hợp lệ như `0.25 / 0.25 / 0.20 / 0.45`. Nhưng prototype ghi công thức rõ ràng:

> Điểm tổng hợp = Σ (trọng số × tín hiệu) / Σ trọng số

Đây là **trung bình có trọng số** — phép chia đã tự chuẩn hoá, nên tổng không cần bằng 1.

**Nguyên nhân gốc:** `CompositeStrategyService.analyze()` tính `Σ (trọng số × tín hiệu)` mà **thiếu phép chia cho `Σ trọng số`**. Ràng buộc "tổng = 1" chính là thứ che lấp lỗi này: khi Σw = 1 thì hai công thức trùng nhau nên không ai phát hiện ra.

**Chốt:** Hiện thực đúng công thức (chia cho tổng trọng số), bỏ `assertWeightsSumToOne` ở cả backend lẫn frontend. Thay bằng ràng buộc thật sự còn cần: mỗi trọng số phải hữu hạn và ≥ 0, và không được toàn bộ bằng 0 (mẫu số = 0).

**Lý do bỏ ràng buộc mà không sửa công thức là sai:** score sẽ vượt ra ngoài `[-1, 1]` khi tổng trọng số > 1, khiến `buyThreshold`/`sellThreshold` mất ý nghĩa. Hai nửa phải đi cùng nhau.

**Bằng chứng sửa đúng:** không test cũ nào phải đổi giá trị kỳ vọng — mọi fixture cũ đều có tổng = 1, nơi công thức cũ và mới cho cùng kết quả. Mẫu số dùng tổng trọng số của **mọi** thành viên (không chỉ thành viên khác HOLD), để HOLD đóng vai trò phiếu trắng kéo điểm về 0, đúng như công thức hiển thị.

### 6. Sinh tín hiệu phải nằm trong Strategy Engine, không ở frontend

**Phát hiện:** `RealtimePage.tsx` render badge `BUY`/`SELL` bằng `up ? 'BUY' : 'SELL'`, với `up` chỉ là "giá tăng so với nến đầu", và tự tính MA(20) phía client.

**Chốt:** Thêm endpoint `GET /strategy-engine/signal?interval=` trả tín hiệu tổng hợp thật + tín hiệu từng plugin + MA(20), do Registry/Engine tính. Frontend chỉ hiển thị.

**Lý do:** `BUY/SELL/HOLD` là output chuẩn hoá của Strategy Engine. Suy ra nó trong component React vi phạm đúng 2 anti-pattern của đề bài ("business logic trong frontend", "strategy logic ngoài Strategy Engine"). Ngoài ra badge đó trông có thẩm quyền nhưng thực chất chỉ là dấu của biến động giá — nguy hiểm hơn là không hiển thị gì.

**Bằng chứng:** sau khi sửa, `5m` trả `SELL` còn `1h` trả `HOLD` trong khi **cả hai đều đang tăng giá** (+1.93% và +23.29%) — logic cũ chắc chắn cho `BUY` ở cả hai.

### 7. Crawler giữ là tiến trình Python tách biệt — cài Python 3.13

**Phát hiện:** `workers/news/` của đồng đội có 724 dòng crawler/parser/sentiment chạy được, nhưng **chưa dùng được**: `main.py` rỗng, không có tầng ghi Postgres (không psycopg/asyncpg), thư mục `models/` chỉ có README chứ chưa có model FinBERT, `torch` chưa cài. Máy chỉ có Python 3.9.6 trong khi code dùng cú pháp PEP 604 (`str | bytes`) đánh giá lúc định nghĩa class → cần ≥ 3.10.

**Chốt (sau khi hỏi lại):** Cài Python 3.13, **giữ nguyên worker Python**, bổ sung tầng ghi DB + entry point + API trigger qua ranh giới job.

**Lý do:** Giữ đúng ADR-005 — Crawler và Sentiment là tiến trình tách biệt, không nhúng vào API. Phương án viết lại crawler bằng Node chạy được ngay nhưng vứt bỏ code đồng đội và lệch kiến trúc đã công bố.

**Ràng buộc bắt buộc:** API **không** gọi thẳng subprocess như một hàm đồng bộ — phải qua ranh giới job để Crawler vẫn là tiến trình độc lập.

### 8. Sentiment model — FinBERT chạy local

**Bối cảnh:** Mục 3 ở trên để ngỏ ("cần chốt cụ thể model/API nào khi bắt đầu code module này").

**Chốt (sau khi hỏi lại):** **FinBERT local**, tải model về `workers/news/models/finbert`, chạy qua `transformers` — đúng như `workers/news/src/core/sentiment/sentiment.py` đồng đội đã viết sẵn.

**Lý do:** Không tốn phí theo lượt gọi, chạy offline nên demo không phụ thuộc mạng hay API key.

**Ràng buộc bắt buộc:** Model phải nằm sau một interface provider. Đề bài cấm "crawler gắn cứng vào 1 model ML" — đổi sang model khác không được phép sửa code crawler.
