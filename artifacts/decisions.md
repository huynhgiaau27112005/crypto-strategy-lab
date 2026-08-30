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

### 9. Không mô hình hoá phí giao dịch / slippage trong backtest (final-review finding #8 / item 6)

**Phát hiện:** `grep -riE "fee|slippage|commission"` trên `service/src` và `artifacts/` không ra kết quả nào. `BacktestingService` khớp lệnh entry/exit đều tại giá `close`, không trừ phí, không làm xấu giá theo slippage. Trong khi đó `BacktestPage.tsx` gắn nhãn `Net Profit` là "Sau phí và slippage" (sai — chưa hề trừ), và form cấu hình thu thập `Vốn (USD)`, `Transaction cost (%)`, `Slippage (bps)` nhưng không truyền đi đâu cả.

**Hai phương án cân nhắc:**
- (a) Implement thật: cộng phí vào cả entry/exit, làm xấu giá khớp theo hướng lệnh (mua khớp cao hơn, bán khớp thấp hơn), lưu 3 tham số này vào `experiment_configs`/`experiments.search_config`, viết test khẳng định phí cao hơn → lợi nhuận ròng thấp hơn nghiêm ngặt trên cùng 1 candidate.
- (b) Bỏ tuyên bố: xoá nhãn "Sau phí và slippage", vô hiệu hoá 3 ô input đúng theo cách các control chưa nối dây khác trong dự án đang làm (ví dụ ô "Coin" đã `readOnly disabled`).

**Chốt: chọn (b).** Đây là một backtest engine dùng cho đồ án Kiến trúc phần mềm — mục tiêu là chứng minh kiến trúc mở rộng được, không phải độ chính xác tài chính. Việc thêm một model phí/slippage đúng đắn (đặc biệt là slippage — cần giả định về thanh khoản/order book mà hệ thống hiện không mô hình hoá) trong đợt sửa cuối trước khi nộp bài, khi không có ngân sách thời gian để viết test kiểm chứng công thức tài chính kỹ lưỡng, rủi ro cao hơn lợi ích: một công thức phí sai còn tệ hơn không có phí, vì nó tạo cảm giác sai về độ tin cậy của con số. Route (b) an toàn hơn và trung thực hơn.

**Đã sửa:**
- `BacktestPage.tsx`: đổi nhãn metric `Net Profit` thành "Chưa tính phí & slippage" (đúng sự thật hiện tại).
- 3 field `Vốn (USD)` / `Transaction cost (%)` / `Slippage (bps)` chuyển sang `readOnly disabled`, đúng pattern ô `Coin` đã dùng cho input chưa nối dây.
- Cập nhật dòng ghi chú dưới form giải thích rõ lý do bị vô hiệu hoá (chưa có model phí/slippage trong `BacktestingService`), trỏ về mục quyết định này.

**Nợ kỹ thuật còn lại:** nếu sau này muốn làm (a), cần: (1) thêm cột lưu 3 tham số này (ví dụ mở rộng `experiments.search_config` JSONB — đã dùng cho mục 1 ở decision liên quan tới search config cross-process), (2) áp dụng trong `BacktestingService` tại điểm khớp entry/exit, (3) viết test pin cứng thứ tự: phí cao hơn ⇒ lợi nhuận ròng thấp hơn nghiêm ngặt trên cùng input.

### 10. Version tham số cho strategy đơn + cascade sinh lại tổ hợp (sửa 3 lần, 2 lần đầu sai hướng)

**Phát hiện ban đầu (người dùng báo):** Lưu nhiều version tham số MA (v2, v3, v5, v7...) qua `ParameterPanel` nhưng catalog và version ghim vào Search mới **luôn hiện v1**. Nguyên nhân đúng: `createVersion()` ghi version mới với `type='USER'`, còn `listCatalog()`/`start()` chỉ đọc `WHERE type='SYSTEM'`.

**Lần sửa 1 (sai):** thêm `listLatestForUser()` + nhét tham số đã lưu vào vòng random của `DomainGuidedRandomGenerator`. Sai vì nó biến tham số đã lưu thành một ứng viên *ngẫu nhiên* — không phải thứ người dùng chủ động chọn.

**Lần sửa 2 (sai nặng hơn):** đọc `docs/database/Schema explanation.md` mục 5 ("database KHÔNG được chứa MA20/MA30/MA50 như strategy riêng") rồi **xoá sạch versioning cho strategy đơn**, thay bằng "tạo 1 Candidate thủ công". Sai vì đọc mục 5 rộng hơn phạm vi thật của nó, và vì bỏ qua 4 nguồn binding nói ngược lại:

| Nguồn | Nói gì |
|---|---|
| `about-projects/03-anti-patterns-to-avoid.md` #10 | *"Do not overwrite old strategy results when **parameters or logic change**. A changed strategy receives a **new version**"* — tham số đổi ⇒ strategy nhận version mới |
| `about-projects/02-architecture-goals.md` §9 | *"Every strategy definition has a version"*; experiment truy được *"exact strategy **version, parameters**"* (2 thứ tách biệt) |
| `modules-specification/strategy-plugin.md` §12 | *"a registered strategy has a version… the registry must not make an updated implementation indistinguishable from the earlier version"* |
| `docs/ui-prototype` (đọc cả JS mock) | input tham số **editable**, dropdown "Version tham số", nút "Dùng lại tham số version này", `hist[strategyId]` = lịch sử version **theo từng strategy** |

**Chốt (lần 3, đang dùng) — mô hình version 2 cấp, lấy thẳng từ state logic của prototype:**

```
verNum(id) = base + histOf(id).length - 1        // cấp 1: version của strategy đơn
bump       = Σ (histOf(memberId).length - 1)     // cộng trên các thành phần
comboVer   = 1 + bump + comboRev                 // cấp 2: version của tổ hợp (Candidate)
```

Version của Candidate **dẫn xuất** từ version các strategy thành phần — nên **không cần lưu thêm cột nào**: `candidate_strategies.strategy_id` vốn đã trỏ tới đúng một row `strategies` bất biến, tức đã mã hoá sẵn version tổ hợp.

Cụ thể đã build:

1. **Strategy đơn có version thật.** `POST /strategy-plugin/strategies/:name/versions` luôn INSERT row mới (`type='USER'`, owner-scoped), không bao giờ UPDATE. `GET .../versions` trả lineage SYSTEM + version của chính user (không thấy của user khác).
2. **`start()` ghim version hiện tại của user** (`listLatestForUser`) — thoả §9 "traceable to the exact strategy version".
3. **Cascade** `POST /strategy-search/experiments/:id/regenerate` — đúng câu prototype in ra khi bấm lưu: *"hệ thống sinh lại N tổ hợp có chứa strategy này thành version tổ hợp mới trong Leaderboard"*. Chỉ thay **duy nhất** strategy vừa đổi, các thành phần khác giữ nguyên row + tham số ⇒ so sánh táo-với-táo. Giới hạn trong Top-K hiện tại và gộp theo *tổ hợp* (1 candidate mới / 1 tổ hợp) nên không bao giờ fan-out thành hàng trăm backtest đồng bộ.
4. **Search vẫn random tham số như cũ** — đúng vai trò "tự động khám phá không gian tham số" (about-projects #16/#17). Hai cơ chế song song, không giẫm chân nhau: Search dò tự động, user ghim thủ công.
5. **Candidate cũ bất biến** — vẫn trỏ row version cũ, kết quả cũ vẫn tái lập được (#36 "Experiment #122 must remain linked to the exact version it used", anti-pattern #10).

**Điểm kỹ thuật đáng lưu (weight):** candidate do cascade sinh trỏ tới row `strategies` **mới hơn** row đã ghim trong `experiment_config_strategies`. `CandidateRepository.findDetail()` vì thế resolve weight theo **`name`** thay vì `strategy_id` — weight là thuộc tính của strategy trong Search Configuration ("MA có trọng số 0.25"), không phải của từng version tham số. Giữ join theo id sẽ khiến INNER JOIN **âm thầm nuốt mất** đúng các member đó khỏi mọi màn hình chi tiết, và tránh được việc phải sửa `experiment_configs` (vốn bất biến theo `docs/database`).

**Cột "Version" ở Leaderboard:** trước đây hiển thị `catalog?.version` (version mới nhất *hiện tại*) chứ không phải version candidate thực sự đã chạy — mọi candidate cũ tự nhiên bị gán nhãn version mới nhất. `findDetail()` giờ SELECT thêm `s.version`, frontend đọc `m.version`.

**2 bug chỉ lộ ra khi verify live (unit test mock DB không bắt được):**
- `listLatestForUser` sắp xếp bằng `owner_user_id = $1 DESC`. Row SYSTEM có `owner_user_id` NULL ⇒ biểu thức ra **NULL chứ không phải false**, mà Postgres `DESC` mặc định **NULLS FIRST** ⇒ row SYSTEM luôn thắng row của chính user. Lưu MA v8 xong catalog vẫn báo v1. Sửa bằng `COALESCE(owner_user_id = $1, false) DESC`.
- Cascade **không idempotent**: sau lần 1, Leaderboard chứa cả candidate đã migrate (MA v8) lẫn candidate cũ (MA v1) của *cùng một tổ hợp*. Chỉ skip candidate đã migrate là chưa đủ — candidate cũ vẫn seed một bản trùng, nên mỗi lần bấm lưu lại đẻ thêm 1 candidate y hệt. Sửa bằng cách theo dõi idempotency theo **tổ hợp**, không theo candidate.

**Bài học:** (1) "test xanh" không đồng nghĩa đúng kiến trúc — phải đối chiếu **tất cả** nguồn binding, không chỉ nguồn vừa đọc; (2) một câu trong tài liệu tham khảo (mục 5 của `Schema explanation.md`, nói về tham số do *Search Engine* sinh) không được phép suy rộng thành quy tắc phủ định 4 nguồn binding khác; (3) unit test mock DB không thay thế được verify chạy thật — cả 2 bug cuối chỉ lộ khi gọi API thật trên Postgres thật.

**Bằng chứng verify live (API + psql thật):** experiment 12 candidate → lưu MA v8 → cascade `regenerated:1` → candidate mới rank #1 (74.494 > 74.357 cũ), members = `MA v8 {12,60}` + `RSI v1` giữ nguyên; candidate cũ vẫn `MA v1 {20,50}` không đổi; cascade lại 2 lần → `regenerated:0`; lưu MA v9 → cascade → `regenerated:1`. Leaderboard cuối chứa đồng thời candidate ở v1, v8, v9.

### 11. Version tham số = đầu vào của Search; thêm NewsSentimentStrategy (7 lỗi người dùng báo)

Người dùng báo 7 lỗi sau khi tự bấm thử. Điều tra cho thấy **5 lỗi đúng, 2 hiểu nhầm** — ghi lại cả hai để chuẩn bị vấn đáp.

#### Hai điểm KHÔNG phải bug

**(1) "Search không chạy đủ 100 iteration" (dừng ở 51/100).** Đúng spec, không phải lỗi. `04-examples-in-the-brief.md` #23 ghi rõ 3 điều kiện dừng ví dụ: *"100 candidates, one hour, or **no improvement for 50 iterations**"*, và anti-pattern #8 **cấm** vòng lặp không có điều kiện dừng. `maxNoImprovement = 50` chính là điều kiện thứ 3. Lỗi thật là **UI không nói lý do dừng** nên nhìn như hỏng → nay lưu `stopReason` (MAX_CANDIDATES / MAX_DURATION / NO_IMPROVEMENT / SEARCH_SPACE_EXHAUSTED) vào `experiments.search_config` và hiển thị câu giải thích dưới thanh tiến trình.

**(2) "Tin tức là mock".** Không phải. Kiểm tra DB: 55 bài từ cointelegraph.com, có URL thật, `crawled_at` cập nhật theo từng lần crawl. Cái *trông giống* mock là `content` lưu nguyên HTML của RSS `description` — lỗi thật, nhưng ở crawler chứ không phải dữ liệu giả.

#### Lỗi 2+3 (cùng gốc): nhãn version nói dối — nghiêm trọng nhất

**Bằng chứng:** `strategies` MA v7 có `parameters = {11,30}`, nhưng candidate ghim v7 lại chạy `{50,200}`. Trên UI: candidate ghi "v10" kèm `fastPeriod 10 · slowPeriod 50`, trong khi MA v10 thật sự là `{22,30}`.

**Nguyên nhân:** `start()` ghim một *version row*, nhưng `DomainGuidedRandomGenerator` lại **random tham số** từ một bảng hằng trong code. Hai thứ hoàn toàn không liên quan nhau, nên nhãn và số luôn có thể lệch.

**Chốt (người dùng chọn phương án C):** biến các biến thể tham số của đề bài thành **version thật** trong bảng `strategies` (`database/seeds/003_system_parameter_versions.sql`, lấy đúng ví dụ #87: MA 10/30, 10/50, 20/50, 20/100, 50/100, 50/200; RSI 14/30/70, 14/25/75, 21/30/70...). Search nay **random trên tập version** thay vì trên tuple trong code:

- Mỗi `CatalogEntry` = **một version**, `sample()` trả đúng `parameters` của version đó và mang theo `strategyId` của chính row đó.
- `CandidateMember.strategyId` mới thêm → `run()` lưu `candidate_strategies.strategy_id` trỏ đúng version đã sinh ra tham số.
- Tính ngẫu nhiên **không mất** (vẫn đúng #16/#87) — chỉ đổi đơn vị random từ "tuple trong code" sang "version trong DB", nên mọi điểm đã thử đều gọi tên và tái lập được.
- Seed idempotent + chống trùng: version = `MAX(version) + row_number()` theo từng tên, nên chạy lại là no-op và không bao giờ đè version người dùng đã lưu.
- DB chưa seed → fallback về sampler cũ kèm cảnh báo log, để hệ thống vẫn chạy thay vì từ chối.

**Cột Version ở Leaderboard:** trước hiển thị số *iteration* (không phải version). Nay là **combo version** dẫn xuất từ bộ version thành phần, đúng công thức prototype `comboVer = 1 + Σ(version thành phần − 1)` — cài dưới dạng ordinal dày đặc trong từng tên tổ hợp để số nhỏ và không nhảy cóc. Bỏ nút *"Dùng lại tham số version này"*: mọi version đã là đầu vào Search rồi, chép ngược lại chỉ tạo bản trùng.

**Bằng chứng đã sửa (chạy thật):** experiment 20 candidate → **50/50 member có `strategies.parameters = candidate_strategies.parameters`**, 0 lệch. Cùng tên `MA + RSI` xuất hiện 4 lần với 4 bộ version khác nhau (v13/v7, v12/v7, v14/v5, v15/v5) → 4 Version phân biệt được.

#### Lỗi 6: thiếu NewsSentimentStrategy — vi phạm required-flow

`05-required-flows.md` (**file binding**, mở đầu ghi *"behavior the brief **requires**"*) có hẳn **#17 Sentiment-as-strategy flow**, và demo flow bắt buộc gồm bước *"add SentimentStrategy → rerun search"*. Code trước đó **không có gì**. Đã bổ sung:

- Domain thứ 5 `INFORMATION` (đúng phân nhóm #17), **không** phải directional cũng không phải confirmation — sentiment chỉ là phiếu bổ sung, tổ hợp vẫn phải có 1 định hướng + 1 xác nhận.
- `NewsSentimentPlugin` theo đúng luật #30 (trung bình sentiment vượt ngưỡng → BUY/SELL), ngưỡng và cửa sổ là **tham số** để Search dò được.
- `NewsSentimentPrecomputeService` dựng chuỗi sentiment theo từng nến **một lần mỗi run** (cùng điểm khấu hao với AI signals) — plugin **không** chạm DB, đúng anti-pattern "strategy không được nối thẳng vào database".
- Nến không có tin trong cửa sổ → `null` → plugin trả **HOLD** (phiếu trắng), **không** quy về 0. "Không có dữ liệu" khác "dữ liệu trung hoà"; quy về 0 sẽ biến một lỗ hổng dữ liệu thành một lá phiếu tự tin.
- Chống lookahead bias: mỗi nến chỉ thấy tin đăng **trước hoặc bằng** thời điểm nó — có test riêng khoá chặt.

**Hạn chế trung thực:** RSS chỉ giữ tin ~1–2 ngày, nên backtest trên khoảng xa trong quá khứ sẽ có phần lớn nến không có tin → sentiment member phần lớn HOLD. Cần nói rõ khi vấn đáp; muốn khắc phục phải có nguồn tin lịch sử.

#### Lỗi 4: `fetch failed` khi sinh AI Strategy

**Không phải lỗi code.** GitHub Models đang bị khai tử: `models.inference.ai.azure.com` trả **NXDOMAIN**, endpoint mới trả `github_models_retirement_brownout`. Lỗi code phụ đã sửa: `fetch()` không có try/catch, nên Node ném `TypeError: fetch failed` — không nêu host, không nêu nguyên nhân. Nay bắt lỗi và dịch `error.cause.code` (ENOTFOUND / ECONNREFUSED / TLS / timeout) thành câu tiếng Việt chỉ rõ phải sửa biến môi trường nào; lỗi 4xx cũng kèm luôn body của provider.

#### Lỗi 5: trang News

- `content` lưu HTML thô → sửa **tận gốc** ở `normalizer.py._strip_html` (BeautifulSoup, fallback regex). Thêm phòng vệ ở `NewsService.toSummary` cho 55 dòng đã crawl trước đó, tránh phải migrate dữ liệu lịch sử.
- Thiếu nút mở bài gốc → `url` vốn đã có sẵn trong DB *và* API, chỉ là FE chưa render. Thêm link mở tab mới (`rel="noopener noreferrer"`).
- `Pos/Neu/Neg` → `Positive/Neutral/Negative`.
- Nút Crawl: đổi sang cùng kiểu nút primary/blueprint như *"Chạy thêm 10 iteration"*; đang chạy thì đổi thành **"Dừng Crawl"** màu đỏ + spinner. Thêm `POST /news/crawl/cancel`. Job đang chờ thì xoá khỏi queue; job **đang chạy** thì đánh dấu huỷ hợp tác và để nó kết thúc lô hiện tại — báo "đang dừng" là trung thực, còn giả vờ dừng ngay sẽ là nói dối UI phải rút lại sau.

#### Lỗi 7: AI strategy không hiện sau khi lưu

Backend vốn đúng (`listLatestPerName` scope theo owner + active). Gap ở FE: catalog chỉ fetch **một lần** lúc mount. Thêm `refreshStrategies()` gọi sau khi lưu. Quan trọng: lần refresh **không** reset tick/trọng số người dùng đã chỉnh — chỉ default cho strategy *mới xuất hiện*.

#### Bug phát sinh, chỉ lộ khi verify chạy thật (unit test không bắt được)

1. `listLatestForUser` sắp xếp bằng `owner_user_id = $1 DESC`; row SYSTEM có owner NULL → biểu thức ra **NULL**, mà Postgres `DESC` mặc định **NULLS FIRST** → row SYSTEM luôn thắng version của chính user. Lưu MA v8 xong catalog vẫn báo v1. Sửa bằng `COALESCE(..., false)`.
2. Cascade sinh lại tổ hợp **không idempotent** — bấm lưu lần 2 đẻ candidate trùng, vì skip theo *candidate* thay vì theo *tổ hợp*.
3. `validateRequest` còn một **bản sao hard-code** danh sách 4 domain → `INFORMATION` bị từ chối là "unsupported" dù đã thêm ở mọi nơi khác. Sửa bằng cách suy ra từ `BUILTIN_DOMAIN_BY_NAME` để thêm domain không còn phải nhớ sửa literal thứ hai.
4. `stripHtml` early-return khi chuỗi không chứa `<` → entity (`&amp;`) không được decode. Chính test tôi vừa viết bắt được.

**Bài học lớn nhất của đợt này:** tôi từng tuyên bố "hoàn thành 100%" dựa trên **test xanh**, trong khi người dùng phát hiện 5 lỗi thật chỉ bằng cách bấm thử từng màn hình. Test xanh chứng minh code làm đúng điều test mô tả — **không** chứng minh sản phẩm dùng được. Cả 4 bug ở mục trên đều lọt qua toàn bộ suite và chỉ lộ ra khi gọi API thật trên Postgres thật.



## Đợt sửa theo tab "Flow" trong Google Doc (2026-08-28)

Nguồn: danh sách lỗi người dùng ghi trong tab **Flow** của doc `Plan`, phân mức
theo màu (đỏ = ảnh hưởng cao, xanh dương = ảnh hưởng thấp, tím = cần bàn).
Ba mục tím đã được chốt trước khi code (xem cuối mục này).

### F1. Chart không realtime — chỉ nhảy khi nến đóng (đỏ)

**Phát hiện:** `MarketDataGateway.handleUpstreamUpdate` có `if (!update.isClosed) return;`
— nến đang hình thành bị **chặn cả broadcast lẫn ghi DB**. Hệ quả: chart chỉ đổi
một lần mỗi timeframe, nên pane 1m trễ tới 1 phút và pane 4h trễ tới 4 giờ so với
thị trường. Đây đúng là lỗi requirement: WebSocket có mà luồng vẫn tĩnh.

**Chốt:** tách hai quyết định vốn bị gộp làm một.
- **Broadcast** cả nến chưa đóng, kèm cờ `closed: boolean`. FE `upsertCandle` vẽ đè
  lên đúng cây nến đang chạy → chart chuyển động liên tục trong một interval.
- **Ghi DB** vẫn chỉ nến đã đóng. Ghi nến đang chạy sẽ làm hỏng chuỗi lịch sử mà
  mọi backtest đọc — lý do ban đầu của `if` này vẫn đúng, chỉ là nó đã bị áp cho
  cả đường broadcast một cách không cần thiết.

### F2. "Recent ticks" lấy theo phút, không phải tick (đỏ)

**Phát hiện:** panel này được nuôi bằng chính stream **nến**, nên về bản chất
không thể có quá 1 dòng mỗi timeframe. Một "tick" là một lệnh khớp, không phải
một cây nến.

**Chốt:** thêm stream `btcusdt@aggTrade` (`BinanceClient.streamTrades`) và room
`trades` trên gateway (`subscribeTrades` / `unsubscribeTrades`, cùng cơ chế đếm
tham chiếu như stream nến). FE dùng hook riêng `useMarketTicks`. Tách room riêng
để client chỉ vẽ chart không phải gánh luồng trade vốn dày hơn nhiều.

Refactor kèm theo: `streamCandles`/`streamTrades` dùng chung `openStream()` —
một chỗ duy nhất giữ logic reconnect backoff, thay vì nhân bản.

### F3. Thiếu cột Volume dưới mỗi chart (đỏ)

`CandleChart` thêm `HistogramSeries` trên price scale riêng (`scaleMargins.top =
0.78`) để độ lớn volume không bóp méo thang giá. Màu theo chiều nến.

### F4. Nút bật/tắt realtime + chọn đường MA (tím → đã chốt)

**Chốt (người dùng chọn):** có nút bật/tắt realtime, và mặc định đổi sang bộ MA
của Binance — **MA7 / MA25 / MA99** thay cho MA(20) tự xuất hiện. Người dùng
tick chọn đường nào muốn hiện (7/20/25/50/99). Tắt realtime = giữ nguyên nến đã
có, không nhận update (không xoá dữ liệu — đóng băng, không reset).

`CandleChart` nay nhận `maOverlays: MaOverlay[]` thay vì `maPeriod` cố định, và
thêm/bớt series theo period nên đổi lựa chọn không phải dựng lại chart.

### F5. Backtest yêu cầu tối thiểu 202 nến / thiếu nến quá khứ 1h, 4h (đỏ)

**Phát hiện:** `minimumCandles()` là **đúng** (MA cần 202 nến lookback). Lỗi thật
nằm ở chỗ **không có đường nào tự nạp nến vào DB** ngoài script thủ công
`npm run seed:candles`. Khoảng ngày người dùng chọn hợp lệ; database mới là thứ
trống — nặng nhất ở 1h/4h vì một tháng lịch sử chỉ vài trăm dòng.

**Chốt:** `MarketDataService.ensureCandleCoverage()` — đếm nến trong cửa sổ, nếu
thiếu thì phân trang kéo từ Binance (`startTime`+`endTime`) và upsert. Gọi ngay
đầu `StrategySearchService.start()`, với ngưỡng
`max(minimumCandles, MIN_CANDLES_PER_TIMEFRAME = 300)` — đúng yêu cầu "mỗi
timeframe phải có ít nhất trên 300 candle trong database".

Ràng buộc an toàn: idempotent (upsert theo `(timeframe, timestamp)`), chặn số
trang tối đa (`MAX_BACKFILL_PAGES = 30`) và có `sleep` giữa các trang — không vi
phạm anti-pattern "uncontrolled infinite loop"; Binance lỗi thì chỉ log cảnh báo
rồi rơi xuống check nến như cũ, không biến sự cố mạng thành 500.

Thông báo lỗi khi vẫn thiếu nến được viết lại bằng tiếng Việt, nói rõ phải làm gì
(chọn khoảng ngày dài hơn hoặc timeframe nhỏ hơn) thay vì câu tiếng Anh về
"dataset".

### F6. Chart kết quả backtest không lấy nến đúng thời gian trong config (đỏ)

**Phát hiện:** vòng backtest **luôn** chạy đúng cửa sổ config
(`ExperimentRepository.candles(timeframe, start, end)`). Chỗ sai là **chart mục
02**: `useCandleHistory` gọi `GET /market-data/candles` vốn chỉ có
`symbol/interval/limit`, nên vẽ 300 nến mới nhất bất kể khoảng ngày đã backtest —
lệnh liệt kê bên dưới thường nằm hoàn toàn ngoài vùng giá đang hiển thị.

**Chốt:** thêm `startTime`/`endTime` (ISO 8601 hoặc epoch ms) cho
`GET /market-data/candles`, truyền xuống Binance klines. Cache key gồm cả 2 mốc
để một request có cửa sổ không bao giờ bị phục vụ bằng response "mới nhất".

### F7. Vốn / Transaction cost / Slippage bị vô hiệu hoá (xanh dương) — **đảo quyết định số 9**

Quyết định số 9 ở trên chọn phương án (b): bỏ tuyên bố, khoá 3 ô input, vì lúc đó
không đủ thời gian viết test kiểm chứng công thức tài chính. Người dùng yêu cầu
sửa, nên đợt này làm **phương án (a)** như chính mục "Nợ kỹ thuật còn lại" của
quyết định 9 đã phác:

- `BacktestCosts` (`initialCapital`, `transactionCostPct`, `slippageBps`,
  `stopLossPct`, `takeProfitPct`) lưu trong `experiments.search_config` JSONB —
  đúng chỗ quyết định 9 đề xuất, **không cần migration**.
- Áp dụng tại điểm khớp lệnh: mua khớp **cao hơn** giá tham chiếu, bán khớp
  **thấp hơn** (slippage theo bps); phí tính trên notional **cả hai chiều**;
  `notional = capital / (1 + fee)` để phí vào lệnh trừ từ chính vốn cấp cho lệnh.
- Mặc định `DEFAULT_BACKTEST_COSTS` = **y hệt hành vi cũ** (vốn 10 000, phí 0,
  slippage 0, không SL/TP) nên mọi caller/test cũ và mọi experiment đã lưu
  trước đây tái lập đúng kết quả cũ.
- Test: `backtesting-costs.spec.ts` pin cứng từng quy tắc (vốn, phí hai chiều,
  hướng slippage, SL/TP, ưu tiên SL).

Nhãn `Net Profit` đổi lại thành "Đã trừ phí & slippage theo config" — nay là sự
thật.

### F8. Thiếu điểm Take Profit / Stop Loss trên chart kết quả (xanh dương)

Trước đây `SimulatedTrade` **không hề có** khái niệm SL/TP: cột Stoploss /
TakeProfit trong bảng luôn `—`, và 2 cột `stop_loss`/`take_profit` trong bảng
`trades` chưa bao giờ được ghi (enum `exit_reason` thì đã có sẵn `STOP_LOSS`,
`TAKE_PROFIT` từ migration 003).

**Chốt:** SL/TP là **tuỳ chọn, mặc định tắt** (ô để trống = tắt). Bật thì:
- thoát ngay **trong cây nến chạm mức**, so với `low`/`high` chứ không phải
  `close` — chờ close sẽ báo giá thoát tốt hơn thực tế;
- một nến chạm cả hai mức → lấy **Stop Loss** (giả định mức có lợi khớp trước là
  cách backtest tự đánh bóng kết quả);
- ghi `stop_loss`/`take_profit`/`exit_reason` xuống DB, hiện trên bảng lệnh
  (thêm cột "Lý do thoát") và vẽ 3 đường Entry / SL / TP trên chart cho lệnh
  đang chọn (bấm một dòng trong bảng để đổi lệnh được đánh dấu).

Không đặt mặc định khác 0 cho SL/TP: làm thế sẽ **âm thầm đổi kết quả** của mọi
lần chạy.

### F9. Config backtest mất khi chuyển tab rồi quay lại (đỏ)

Form nằm trong `useState` của `BacktestPage`, mà đổi tab là unmount page. Chuyển
toàn bộ form vào `ExperimentContext` (`backtestForm` / `setBacktestForm`) — cùng
chỗ đã giữ `experimentId`/`lastConfig`, scope ở route `/app` nên sống qua mọi lần
đổi tab.

### F10. Top-K nhập tự do (tím → đã chốt)

**Chốt (người dùng chọn):** giới hạn **1–20**, mặc định 8. Backend siết
`MAX_TOP_K = 20` (trước là 100) ở cả `validateRequest` lẫn `sanitizeSearchConfig`;
FE dùng `input type=number` có `min`/`max` + thông báo lỗi tiếng Việt trước khi
gửi.

### F11. Tiêu đề candidate đang xem quá nhỏ (xanh dương)

Đổi từ dòng caption 11px dưới ô tìm kiếm thành **heading có dropdown**: nhãn
"CANDIDATE ĐANG XEM" + tên tổ hợp 19px + mũi tên sổ danh sách (đúng ý "Tiêu đề
candidate hiện tại ⬇" trong doc). Ô tìm kiếm bị bỏ vì danh sách tối đa nay chỉ
còn 20 dòng (F10) — tìm kiếm trong 20 dòng là thừa.

### F12. Chữ bảng lệnh / Leaderboard quá nhỏ (xanh dương)

`.table` nâng nền chung (td 12→13px, th 10→11px, padding rộng hơn);
`.trades-table` nâng thêm một nấc (td 14px) vì đây là bảng người ta thật sự đọc
số. Không phóng to toàn app để khỏi phá layout các panel khác.

### F13. "Lưu bộ Strategy & trọng số" — KHÔNG đổi Leaderboard (giữ nguyên business gốc)

Tab Flow có một gạch đầu dòng nói rằng bấm "Lưu bộ Strategy & trọng số" thì
Leaderboard phải reorder (nếu đổi trọng số) hoặc tạo version rồi so lại (nếu đổi
tham số plugin). **Người dùng xác nhận gạch đầu dòng đó là sai, quên xoá.**

**Business đúng, giữ nguyên như trước:** nút "Lưu bộ Strategy & trọng số" chỉ xác
nhận lựa chọn ở phía client (`StrategySelectionContext.confirmSelection()` bật cờ
`confirmed`, tự tắt khi người dùng chỉnh tiếp). Nó **không gọi API nào**, **không
đụng tới Leaderboard**. Leaderboard chỉ đổi khi bấm **Chạy Search & Backtest** ở
tab Backtest — lúc đó experiment mới được tạo lại từ đầu với bộ strategy và trọng
số hiện tại.

Lý do business này hợp lý: trọng số là thuộc tính **cố định của một Experiment
Configuration** (xem mục 4b) — mọi candidate trong cùng một lần chạy phải được
chấm bằng cùng một bộ trọng số thì so sánh giữa chúng mới có nghĩa. Sửa trọng số
của một experiment đã chạy xong rồi chấm lại tại chỗ sẽ làm hỏng đúng tính chất
"experiment truy vết được tới đúng cấu hình đã sinh ra nó".

Trong một lượt sửa trước, tôi đã hiện thực gạch đầu dòng sai đó (thêm
`POST /strategy-search/experiments/:id/reweight` chấm lại toàn bộ candidate) —
**đã gỡ bỏ hoàn toàn**: endpoint, DTO, service method, 2 query repository
(`updateWeight`, `listAllCandidateMembers`) và toàn bộ thay đổi FE kèm theo
(`appliedWeights` trong `ExperimentContext`, props `saving`/`saveNotice` của
`WeightedVotingTable`, handler async ở `StrategyEnginePage`). `StrategyEnginePage`
và `WeightedVotingTable` được khôi phục đúng bản gốc.

Cascade "lưu tham số plugin → tạo version mới → sinh lại tổ hợp"
(`ParameterPanel` → `POST .../regenerate`) là chuyện **khác** và vốn đã có từ
trước; nó không nằm trong nút "Lưu bộ Strategy & trọng số" và không bị đụng tới.

### F14. Version người dùng tự chỉnh không hiện trên Leaderboard (tím → đã chốt)

**Chốt (người dùng chọn):** giữ Top-K đúng nghĩa xếp hạng, **thêm mục riêng
"Version của tôi"** bên dưới. `POST .../regenerate` nay trả thêm `summaries`:
mỗi tổ hợp vừa sinh lại kèm **hạng thật trên tổng số** (`RANK() OVER` trên toàn
bộ candidate đã hoàn tất, không chỉ Top-K) + các chỉ số chính. Nhờ vậy một
version tệ vẫn nhìn thấy được và so sánh được ("#37 / 100"), thay vì biến mất
làm người dùng tưởng hệ thống không tạo gì.

### F15. Nút "Xem kết quả backtest" nên nổi bật (tím → làm luôn)

Thêm class `.btn-go` (nền `--color-up`) cho hành động chính của panel, thay vì
một nút secondary xám lẫn giữa các nút xám khác.

### F16. AI Strategy vẫn sinh code giả dù đã gắn API key (đỏ)

**Phát hiện:** `llmProviderFactory` chỉ đọc **`OPENAI_API_KEY`**. Tài liệu kiến
trúc lại nói dùng **OpenRouter**, và `service/.env.example` **không hề nhắc** biến
nào cho AI. Đặt key dưới tên khác ⇒ rơi âm thầm về `FakeLlmProvider`, mà code
canned của nó là Python hợp lệ nên nhìn không ra.

**Chốt:**
- chấp nhận cả `OPENAI_API_KEY` và `OPENROUTER_API_KEY` (OpenRouter nói cùng
  protocol OpenAI-compatible), mỗi biến có `BASE_URL`/`MODEL` mặc định riêng;
- thêm `GET /ai-strategy/provider` và **banner đỏ ngay đầu tab AI Strategy** khi
  đang chạy provider giả lập, nói rõ phải đặt biến nào ở đâu. Im lặng fallback là
  bản thân cái bug;
- bổ sung đầy đủ các biến vào `service/.env.example`.

### Không đổi (đã đúng sẵn, đã kiểm tra lại)

- **Danh sách strategy hệ thống:** đủ 4 loại đề bài nêu (MA, RSI, Bollinger,
  Support/Resistance) + News Sentiment, đăng ký qua `StrategyRegistry`.
- **Bấm thẻ Strategy để check/uncheck:** đã có từ commit f4f0945.
- **Danh sách strategy do AI sinh trên tab Strategy Engine:** đã có (nhóm 2).
- **Tín hiệu HOLD/SELL trên từng Strategy:** **giữ**. Doc ghi "bỏ nếu không cần
  thiết; nếu là đặc điểm của từng Strategy thì giữ" — đây đúng là output riêng
  của từng plugin (`GET /strategy-engine/signal` → `perStrategy`), không phải
  nhãn trang trí, nên giữ.


## F17. AI Strategy không chạy được trên Windows (2026-08-29)

**Triệu chứng:** tab AI Strategy luôn dừng ở check đầu tiên với
`Validation worker could not run: Python worker process error (validate.py):
spawn E:\...\workers
ews\.venvin\python ENOENT`.

**Đúng là lỗi code — và là HAI lỗi chồng lên nhau,** cả hai đều do worker Python
được viết với giả định chạy trên POSIX:

### Lỗi 1 — đường dẫn interpreter hard-code kiểu POSIX

`getAiStrategyPythonBin()` trả về thẳng
`<repo>/workers/news/.venv/bin/python` **vô điều kiện**. Hai vấn đề:
- venv trên Windows nằm ở `Scripts\python.exe`, không phải `bin/python`;
- trên máy này `workers/news/.venv` **không tồn tại** (chưa ai tạo), nên kể cả
  sửa đúng layout vẫn hỏng.

**Sửa:** thứ tự phân giải rõ ràng, dừng ở cái đầu tiên tồn tại:
1. `AI_STRATEGY_PYTHON_BIN` — override tường minh, dùng nguyên văn (lựa chọn cố
   ý phải thắng mọi auto-detect);
2. venv `workers/news/.venv` **nếu thật sự có**, thử đúng layout của HĐH;
3. `python` (Windows) / `python3` (POSIX) lấy từ PATH.

`validate.py`/`run.py` chỉ dùng thư viện chuẩn (`ast`, `json`, `signal`,
`threading`) nên bất kỳ CPython 3.10+ nào cũng chạy — venv là tiện lợi, không
phải điều kiện bắt buộc. Đây là lý do bước 3 hợp lệ chứ không phải fallback bừa.

Kèm theo: `ENOENT` nay được dịch thành câu chỉ rõ phải làm gì (cài Python / đặt
`AI_STRATEGY_PYTHON_BIN`) thay vì ném nguyên `spawn ... ENOENT` lên UI.

### Lỗi 2 — `signal.SIGALRM` không tồn tại trên Windows

Sửa xong lỗi 1 thì lộ lỗi thứ hai: cả `validate.py` và `run.py` đều gọi
`signal.signal(signal.SIGALRM, ...)`. Trên Windows module `signal` **không có**
`SIGALRM` → `AttributeError` ngay trước khi script kịp in JSON nào, nên Node chỉ
thấy exit code khác 0.

**Sửa:** thêm context manager dùng chung `time_limit()` trong `sandbox.py`:
- POSIX: giữ nguyên `signal.alarm` (kernel ngắt main thread);
- Windows: `threading.Timer` + `_thread.interrupt_main()` — raise
  `KeyboardInterrupt` ở main thread giữa các bytecode, đủ để thoát khỏi vòng lặp
  Python thuần mà strategy do AI sinh vốn chỉ gồm những thứ đó.

Cả hai đường đều **vẫn chỉ là defense in depth**, đúng như docstring gốc đã nói:
không cơ chế nào ngắt được một lời gọi C dài, và `python-process.util.ts` luôn
bọc tiến trình bằng timeout cứng riêng rồi SIGKILL khi quá hạn. `_SmokeTimeout`
và `_RunTimeout` gộp thành một `TimeLimitExceeded` duy nhất.

### Đã verify chạy thật (không chỉ test xanh)

Chạy trên chính máy Windows này, qua đúng lớp `runPythonWorker` mà API dùng:
- `validate.py` với strategy hợp lệ → `parses=OK contract=OK safety=OK smoke=OK`;
- `validate.py` với `while True: pass` → `smoke=FAIL "Smoke run exceeded 5s
  internal timeout"`, tiến trình kết thúc sau ~6s (watchdog Windows hoạt động);
- `run.py` trả về đúng dãy signal;
- `run.py` với `import os` → vẫn bị chặn: `Safety scan failed: disallowed import: os`
  (gate an toàn không bị nới lỏng khi sửa).


## F18. Nút "Crawl tin tức" mất trạng thái khi chuyển tab (2026-08-29)

**Triệu chứng:** bấm Crawl, chuyển sang tab khác rồi quay lại tab News thì nút
trở về "Crawl tin tức" trong khi worker vẫn đang crawl.

**Hai nguyên nhân, cùng cho ra một triệu chứng:**

### Nguyên nhân 1 — state sống trong component bị unmount

`useNewsCrawl` là hook thường, gọi bên trong `NewsPage`. Đổi tab = React
unmount `NewsPage` ⇒ cleanup abort request, clear timer, và toàn bộ `job`/`state`
biến mất. Quay lại là mount mới, bắt đầu từ `'idle'`. Đây **đúng cùng một lớp
lỗi** với "config Backtest mất khi đổi tab" (mục F9) — chỉ khác chỗ nó nằm ở
hook chứ không phải `useState` trong page.

**Sửa:** đưa lên `NewsCrawlProvider` mount tại route `/app` (cạnh
`ExperimentProvider` trong `App.tsx`), `useNewsCrawl()` thành consumer của
context. Một poll duy nhất sống xuyên suốt mọi lần đổi tab.

Thêm: reload cả trang thì provider cũng bị unmount thật, nên khi mount provider
gọi `GET /news/crawl/status` **một lần** để nhận lại job đang chạy. Endpoint này
đọc state BullMQ/Redis thật, không phải bộ nhớ client — nên nút phản ánh worker
đang làm gì, chứ không phải tab này nhớ được gì.

### Nguyên nhân 2 — trần polling 5 phút ngắn hơn trần của worker

`MAX_POLL_ATTEMPTS = 150` × 2s = **5 phút**, trong khi một lượt crawl được chặn
ở **10 phút** phía server (`news-crawl.config.ts` → `getTimeoutMs`). Nghĩa là
mọi lượt crawl chạy quá phút thứ 5 đều bị client tự tuyên bố `'timeout'` và lật
nút về "Crawl tin tức" trong khi worker vẫn đang chạy — UI nói ngược lại hệ
thống. Sửa nguyên nhân 1 mà không sửa cái này thì lỗi vẫn tái diễn, chỉ muộn hơn.

**Sửa:** bỏ trần theo số lần thử, thay bằng trần theo **số lần lỗi liên tiếp**
(`MAX_CONSECUTIVE_FAILURES = 5`). Vòng lặp vẫn có điều kiện dừng rõ ràng —
chính trạng thái job của server, vốn đã bị chặn bởi timeout cứng của worker —
nên **không** vi phạm anti-pattern "uncontrolled infinite loop": nó không thể
sống lâu hơn cái job nó đang theo dõi. Một request status lỗi lẻ tẻ cũng không
còn bị coi là "crawl đã dừng".

### Đã verify bằng cách bấm thật trên trình duyệt

API thật đang chạy ở `:3000` nhưng tôi không đăng nhập hộ người dùng được, nên
dựng một mock API nhỏ ở scratchpad (không thuộc repo) + một dev server tạm, nạp
phiên bằng refresh token thay vì gõ mật khẩu. Kết quả:

| Thao tác | Trước | Sau |
|---|---|---|
| Bấm Crawl | "Dừng Crawl" · "Đang crawl…" | giữ nguyên |
| Đổi sang Realtime → Backtest → quay lại News | **về "Crawl tin tức"** | vẫn "Dừng Crawl" · "Đang crawl…" |
| Reload cả trang | **về "Crawl tin tức"** | vẫn "Dừng Crawl" · "Đang crawl…" |
| Bấm "Dừng Crawl" | — | về "Crawl tin tức" · "Crawl xong" |
| Đổi tab sau khi dừng | — | vẫn ở trạng thái đã dừng |


## F19. Crawl tin tức chết với `spawn ... bin\python ENOENT` (2026-08-29)

**Đây là ĐÚNG lỗi ở mục F17, nhưng ở module News — và tôi đã bỏ sót nó.** F17 sửa
`ai-strategy.config.ts`, trong khi `news-crawl.config.ts` có y hệt một dòng
hard-code `.venv/bin/python` kiểu POSIX. Sửa một bản, bản kia vẫn hỏng.

**Sửa triệt để:** gộp về **một** implementation dùng chung,
`service/src/common/python-bin.ts`:
- `resolvePythonBin(venvDir, override)` — override env → venv **nếu thật sự có**,
  đúng layout HĐH (`Scripts\python.exe` trên Windows) → interpreter trên PATH;
- `describeSpawnFailure(err, bin, envVar)` — dịch `ENOENT` thành câu nói rõ phải
  cài Python hoặc đặt biến môi trường nào.

Cả `news-crawl.config.ts` lẫn `ai-strategy.config.ts` giờ gọi chung hàm này. Lý
do gộp chứ không copy lần hai: bản sao thứ hai chính là thứ đã tạo ra bug này.

### Khác biệt quan trọng giữa hai worker

| | AI strategy | News crawler |
|---|---|---|
| Thư viện | chỉ standard library | feedparser, bs4, pydantic, requests, pyyaml, psycopg2 |
| Fallback PATH có đủ không? | **Có** | **Không** — thiếu package sẽ lỗi lúc import |

Nên với News, fallback PATH chỉ giúp lỗi *dễ đọc*, không tự sinh ra dependency.
Venv `workers/news/.venv` vẫn là bước cài đặt bắt buộc (đúng như
`workers/news/README.md` mô tả) — đã tạo và cài trên máy này.

### Sentiment tạm thời là NULL

`torch` + `transformers` (~2.5GB) **chưa cài**, nên `get_sentiment_provider()`
degrade về `NoopSentimentProvider` đúng như thiết kế: bài vẫn crawl và lưu, cột
`sentiment` để NULL, và log ghi rõ lý do. Muốn có sentiment thật thì cài extra
`sentiment` rồi tải model FinBERT — xem `workers/news/README.md`.

### Đã chạy thật, không chỉ test xanh

- `main.py` trực tiếp: crawl 30 bài từ cointelegraph, **upsert 30 dòng vào
  Postgres**, exit 0;
- qua đúng lớp `NewsCrawlService.execute()` (chính đường `POST /news/crawl` gọi):
  `News crawl completed.` sau 5.1s;
- `getPythonBin()` nay trả về `...\.venv\Scripts\python.exe` (tồn tại: true).

**Bài học lặp lại lần thứ hai trong repo này:** ở đợt trước tôi đã ghi "test xanh
không chứng minh sản phẩm dùng được". Lần này tôi lặp lại đúng sai lầm đó theo
kiểu khác — sửa một module rồi tuyên bố xong, mà không grep xem cùng pattern còn
ở đâu nữa. Khi sửa một lỗi do giả định môi trường (đường dẫn, HĐH, layout), việc
đầu tiên phải là **grep toàn repo tìm bản sao của cùng giả định đó**.


---

## 2026-08-29 — Event-Driven / Event Catalog / Tactical CQRS / Service Mesh ADR

Đợt refactor **chỉ đổi kiến trúc, không đổi behavior**. Mốc kiểm chứng: trước refactor `npx jest` = 46 suite / 307 test xanh; sau refactor = 47 suite / 325 test xanh, cộng một lần chạy thật end-to-end.

### Bảng chốt phạm vi

| Kỹ thuật | Quyết định | Lý do |
|---|---|---|
| **Event-Driven** (in-process) | **Làm** | Search không còn gọi thẳng Leaderboard. `@nestjs/event-emitter` cho domain event trong process; BullMQ vẫn giữ vai trò xuyên tiến trình |
| **Event Catalog** | **Làm** | [event-catalog.md](event-catalog.md) — mỗi event có owner, schema version, consumer, idempotency, chính sách lỗi |
| **Tactical CQRS** | **Làm (ghi nhận + tài liệu hoá)** | [cqrs.md](cqrs.md) — đường ghi/đọc vốn đã tách sẵn qua `leaderboard_entries` + cache theo version; đợt này chỉ đặt tên đúng và viết lại cho rõ |
| **Service Mesh** | **Chỉ ADR, KHÔNG deploy** | [service-mesh-evolution.md](service-mesh-evolution.md) — API và Worker không gọi nhau qua HTTP, nên mesh sẽ không chặn được traffic nào |
| **Event Sourcing** | **Từ chối** | Provenance đã đủ qua các dòng quan hệ immutable: `candidates` + `candidate_strategies` + `strategies.version` + `backtest_runs`/`evaluations` ghi mới mỗi iteration. Event Sourcing sẽ thêm projection + replay + versioning cho một bài toán đã giải xong |
| **Full CQRS** (tách DB đọc/ghi) | **Từ chối** | Đúng 1 read model, 1 bảng. Tách DB sẽ thêm replication lag và mất tính transactional mà chưa đổi lại được gì |
| **Kafka** | **Từ chối** | BullMQ + event in-process đủ cho quy mô đồ án |

### Bốn cạm bẫy phá behavior — phần đáng nói nhất khi vấn đáp

Plan gốc được viết trước khi đọc code. Khi đọc code thật thì thấy 4 chỗ mà làm y theo plan sẽ **âm thầm đổi behavior**. Đây là nội dung có giá trị nhất của đợt này: refactor kiến trúc mà **chứng minh được** hành vi không đổi.

**1. `emit()` là fire-and-forget.**
`EventEmitter2.emit()` không await listener bất đồng bộ. Lời gọi cũ `await this.leaderboard.rebuildForExperiment(...)` chặn vòng lặp search. Nếu dùng `emit`, vòng lặp chạy tiếp trong khi rebuild dang dở → `experiments.finish('COMPLETED')` có thể xảy ra trước lần rebuild cuối → Leaderboard thiếu candidate cuối cùng.
→ **Bắt buộc `await emitAsync`.** Có test canh riêng.

**2. Rebuild vốn chạy cả khi backtest FAIL.**
Trong `run()`, khối rebuild nằm cố ý **ngoài** try/catch của backtest, tức là chạy sau **mọi** iteration. Nếu chỉ emit `backtest.completed`, số lần rebuild và số lần `INCR leaderboard:version` sẽ giảm.
→ Emit thêm **`backtest.failed`**, cùng một handler subscribe cả hai. `backtest.failed` mang nghĩa *"iteration đã kết thúc"*, không phải *"có dữ liệu mới"*.
→ **Đã đo:** chạy thật `maxCandidates: 5` → `leaderboard:version` = **5**, đúng 1 bump/iteration như hệ thống cũ.
→ *Đây là chỗ cố ý lệch khỏi plan gốc* (plan nói "không emit khi fail"), vì người dùng yêu cầu giữ behavior tuyệt đối.

**3. Hai call-site có chính sách lỗi ngược nhau.**
`run()` bọc try/catch quanh rebuild (lỗi → log warn, search vẫn COMPLETED). `regenerateForStrategyVersion()` thì **không** bọc (lỗi → HTTP 5xx). Gộp cả hai vào một handler nuốt lỗi sẽ âm thầm đổi endpoint regenerate từ 500 → 200 kèm leaderboard cũ.
→ Hai event, hai method handler, hai chính sách. Và: `@nestjs/event-emitter` mặc định **`suppressErrors: true`** — tự nuốt lỗi listener — nên handler regenerate phải khai báo `{ suppressErrors: false }`, nếu không lỗi biến mất giữa handler và điểm emit. **Test wiring bắt được đúng chỗ này.**

**4. Listener biến mất khi dọn import.**
`WorkerModule` trước đây có `LeaderboardService` **gián tiếp** qua `StrategySearchModule`. Sau refactor, `StrategySearchModule` không cần `LeaderboardModule` nữa (đó chính là bằng chứng decoupling) → xoá import là phản xạ tự nhiên. Nhưng làm vậy thì `LeaderboardEventsHandler` **không được khởi tạo trong worker**: event bắn vào hư vô, Leaderboard vĩnh viễn không cập nhật, **mọi unit test vẫn xanh** (tất cả đều mock emitter), build vẫn sạch.
→ `WorkerModule` phải import `LeaderboardModule` **tường minh**, kèm comment. Đã kiểm chứng bằng cách boot worker thật và xem log `LeaderboardModule dependencies initialized`.

### Bẫy phụ thuộc: `@nestjs/event-emitter` v12 là ESM-only

`npm install @nestjs/event-emitter` kéo về **v12.0.0**, package ESM thuần. Jest (cấu hình CJS) đổ ngay `SyntaxError: Unexpected token 'export'`, và runtime CJS cũng sẽ chết theo.
→ Ghim **v3.1.0** (CJS, peer dep `@nestjs/common ^10 || ^11`). Đừng nâng lên v12 nếu chưa chuyển toàn bộ service sang ESM.

### Bẫy phụ: `@OnEvent([a, b])` không hoạt động

Dạng array có trong type signature nhưng được truyền thẳng cho `eventemitter2.on()`, nơi array bị hiểu là **đường dẫn event lồng nhau**; với `wildcard: false` thì không khớp event nào — im lặng, không báo lỗi.
→ Dùng **hai decorator `@OnEvent` xếp chồng**. Lỗi này chỉ lộ ra nhờ test dựng `EventEmitterModule` thật; test mock hoàn toàn không thấy.

### Đã verify chạy thật, không chỉ test xanh

1. Boot cả hai tiến trình với TimescaleDB + Redis thật → log có `EventEmitterModule dependencies initialized` và `LeaderboardModule dependencies initialized` trong **WorkerModule**.
2. `POST /strategy-search/experiments` (`maxCandidates: 5`, `topK: 3`) → search chạy trong worker, dừng `MAX_CANDIDATES`.
3. `leaderboard:version:<expId>` = **5** → đúng 1 rebuild/iteration, khớp behavior trước refactor.
4. `leaderboard_entries` có đúng 3 dòng (`top_k = 3`), rank 1..3 giảm dần theo score.
5. `GET /experiments/:id/top` trả đúng Top-3 qua đường đọc cache-aside.
6. `correlationId` xuyên suốt từ HTTP request → job BullMQ → log trong worker (`cid=36da2e4e-...`).

---

## F20. AI Strategy generate — queue async, poll, không WebSocket (2026-08-29)

**Bối cảnh:** `POST /ai-strategy/generate` trước đây gọi LLM + spawn `validate.py` **đồng bộ** trong tiến trình API — request treo tới vài chục giây, cạnh tranh event loop, và restart API giữa chừng làm mất luồng sinh đang chạy.

**Chốt:**

| Quyết định | Lựa chọn | Lý do |
|---|---|---|
| Theo dõi tiến độ generate | **HTTP poll 2s** (`GET /ai-strategy/generate/status`) | Cùng pattern đã chứng minh với experiment progress và news crawl; không cần thêm WebSocket namespace chỉ cho 1 tab AI Strategy |
| Phạm vi queue | **Chỉ `generate`** trên queue `ai-generate` | `validate`/`save`/`run` vẫn đồng bộ trên API — nhanh, do người dùng chủ động, không cần tách tiến trình |
| Job trùng user | **`409 Conflict`**, không replace/coalesce | Message chính xác: `"A generate job is already running for this account."` — tránh 2 lần gọi LLM song song cho cùng account (tốn token, race ghi UI) |
| Lưu kết quả job | **Redis returnvalue (BullMQ)**, không Postgres | Generate là thao tác ephemeral trước khi user bấm Save; không cần migration/bảng job; client poll đọc `result` khi `COMPLETED` |

**Hệ quả kiến trúc:** Job đi `API → Redis → Worker` (không có HTTP API→Worker). Worker (NestJS) gọi LLM (`WORKER → LLM` trên C4 level 2) — **không** phải Python `workers/ai-strategy/` gọi LLM. Spawn Python cho validate sau generate nằm trong worker; spawn cho validate/run thủ công vẫn từ API. Sơ đồ: `architecture-c4-level-2.puml` / `architecture-c4-level-3.puml`. Chi tiết: `artifacts/queue.md` mục 4.1, `artifacts/ai-strategy.md` mục 2b, `artifacts/api-contract.md` mục 3c.
