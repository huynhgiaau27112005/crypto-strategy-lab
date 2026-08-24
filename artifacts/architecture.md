# Kiến trúc thực tế

> Mô tả kiến trúc **đã thực sự build**, khác với `docs/software-architecture/` (bản thiết kế ban đầu, tham khảo). Ghi rõ chỗ nào khớp, chỗ nào lệch và tại sao.

## 1. Kiểu kiến trúc

**NestJS Modular Monolith** — một tiến trình Node.js duy nhất, chia thành các module NestJS độc lập theo domain. Đúng theo `docs/software-architecture/decisions.md` ADR-001 (chọn Monolith thay vì Microservices vì team nhỏ, deadline ngắn, không cần network latency giữa các "service" logic).

**Khác với thiết kế ban đầu — chưa có Python Workers, chưa có event bus:**

| Thiết kế ban đầu (`docs/software-architecture/`) | Thực tế hiện tại |
|---|---|
| 2 Python worker riêng (Crawler, Sentiment) giao tiếp qua HTTP/Redis Queue | Chưa build — `news`/`sentiment`/`chart`/`continuous-loop` module vẫn là stub rỗng |
| In-process Event Bus (`@nestjs/event-emitter`), domain event (`MarketPriceUpdated`, `StrategyEvaluatedEvent`...) | **Chưa dùng** — `package.json` không có `@nestjs/event-emitter`. Các module gọi nhau **trực tiếp qua Dependency Injection** (đồng bộ, in-process), không qua event |
| Redis (cache leaderboard + BullMQ job queue) | Chưa có — search loop chạy tuần tự trong 1 process, dùng `setImmediate` để nhường event loop giữa các iteration thay vì thật sự song song |
| WebSocket cho realtime | Chưa có — client phải poll `GET /experiments/:id` |

**Vì sao chấp nhận lệch:** MVP hiện tại ưu tiên đúng luồng dữ liệu (Search → Backtest → Leaderboard) và đúng mô hình dữ liệu (Candidate tách biệt) trước, vì đây là phần đề bài chấm nặng nhất (reproducibility, tách biệt trách nhiệm). Event bus / queue / WebSocket là cải tiến hạ tầng có thể thêm sau mà không đổi lại domain logic — đúng tinh thần "logical module ≠ deployable service" nhưng ở mức đơn giản hơn thiết kế gốc.

## 2. Sơ đồ module thực tế

```
┌──────────────────────────────────────────────────────────────────────┐
│                    NESTJS MODULAR MONOLITH (1 process)                │
│                                                                        │
│  ┌──────────┐   ┌────────────────┐   ┌──────────────┐                │
│  │   Auth   │   │  Market Data   │   │ Strategy     │                │
│  │  Module  │   │    Module      │   │ Engine       │                │
│  │          │   │ - BinanceClient│   │ Module       │                │
│  │ JWT +    │   │ - CandleRepo   │   │ (switch/case │                │
│  │ refresh  │   │                │   │  4 strategy) │                │
│  └────┬─────┘   └────────┬───────┘   └──────┬───────┘                │
│       │                  │                   │                        │
│       │                  │           ┌───────▼────────┐               │
│       │                  │           │  Composite     │               │
│       │                  │           │  Strategy      │               │
│       │                  │           │  Module        │               │
│       │                  │           │ (weighted vote)│               │
│       │                  │           └───────┬────────┘               │
│       │                  │                   │                        │
│       │          ┌───────▼───────────────────▼────────┐              │
│       │          │      Strategy Search Module          │              │
│       │          │  - ExperimentRepository               │              │
│       │          │  - ExperimentConfigRepository          │              │
│       │          │  - ExperimentIterationRepository       │              │
│       │          │  - CandidateRepository                 │              │
│       │          │  - StrategyRepository (seed lookup)    │              │
│       │          │  - DomainGuidedRandomGenerator          │              │
│       │          │  - StrategySearchService (vòng lặp)     │              │
│       │          └───────┬─────────────────┬───────────────┘              │
│       │                  │                 │                          │
│       │          ┌───────▼───────┐  ┌──────▼────────┐                │
│       │          │  Backtesting  │  │  Leaderboard  │                │
│       │          │    Module     │  │    Module      │                │
│       │          │ - Simulation  │  │ - rebuild theo │                │
│       │          │ - Evaluation  │  │   experiment   │                │
│       │          │ - BacktestRun │  │                │                │
│       │          │   Repository  │  │                │                │
│       │          └───────────────┘  └────────────────┘                │
│       │                                                               │
│  ┌────▼─────────────────────────────────────────────────────────┐    │
│  │           DatabaseModule (@Global) — pg.Pool                  │    │
│  └──────────────────────────┬──────────────────────────────────┘    │
│                                                                        │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐            │
│  │  Chart   │ │   News   │ │Sentiment │ │ ContinuousLoop│  ← STUB    │
│  │  (stub)  │ │  (stub)  │ │  (stub)  │ │    (stub)     │            │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────┘            │
└──────────────────────────────────┬───────────────────────────────────┘
                                    │
                    ┌───────────────┴────────────────┐
                    ▼                                 ▼
          PostgreSQL 18 + TimescaleDB          Binance REST API
          (raw pg.Pool, không ORM)             (candle lịch sử)
```

**Mọi mũi tên giữa module là lời gọi hàm trực tiếp qua NestJS DI** (constructor injection), không phải qua message queue hay event. `StrategySearchService` là "nhạc trưởng" — nó tiêm (inject) trực tiếp `BacktestingService`, `LeaderboardService`, và tất cả repository của chính nó, rồi tự điều phối vòng lặp Generate → Backtest → Persist → Rebuild leaderboard trong cùng 1 hàm.

## 3. Luồng Search → Backtest → Leaderboard (luồng lõi của toàn hệ thống)

```
POST /strategy-search/experiments  (yêu cầu Bearer token)
        │
        ▼
StrategySearchService.start(userId, request)
        │
        ├─ 1. Validate request (timeframe, khoảng thời gian, số lượng...)
        ├─ 2. Kiểm tra đủ nến lịch sử chưa (tối thiểu theo domain đã bật)
        ├─ 3. Tra 4 strategy SYSTEM theo tên (StrategyRepository)
        ├─ 4. Resolve weight: request cung cấp HOẶC chia đều mặc định
        │      → BẮT BUỘC weight phải khớp đúng tập domain đã bật
        │        (nếu không → 400, tránh lỗi âm thầm — xem mục 5)
        ├─ 5. Trong 1 transaction: tạo experiment + experiment_config +
        │      experiment_config_strategies (lưu weight)
        └─ 6. Trả 202 ngay, lên lịch chạy nền (setImmediate)
                │
                ▼  (chạy nền, không giữ HTTP request)
        StrategySearchService.run(experimentId)
                │
                ├─ Vòng lặp cho tới khi đạt 1 trong 3 điều kiện dừng:
                │    • đủ số candidate (maxCandidates)
                │    • hết thời gian (maxDurationSeconds)
                │    • không cải thiện N vòng liên tiếp (maxNoImprovement)
                │
                └─ Mỗi vòng lặp:
                     1. DomainGuidedRandomGenerator sinh 1 candidate
                        (chọn domain hợp lệ + tham số ngẫu nhiên trong
                         không gian tham số của STRATEGY_CATALOG)
                     2. Tạo experiment_iteration + candidate +
                        candidate_strategies (transaction)
                     3. BacktestingService.run(candidate, candles, weightMap)
                        → CompositeStrategyService.analyze() mỗi cây nến
                          (weighted vote dùng weight từ config, KHÔNG
                           random theo từng candidate)
                        → Trả về trades[] + evaluation (Return, WinRate,
                          MaxDrawdown, Sharpe, overall_score...)
                     4. BacktestRunRepository.complete() — lưu
                        backtest_runs + trades + evaluations (1 transaction)
                     5. LeaderboardService.rebuildForExperiment() —
                        tính lại Top-K (lọc theo minimumTrades), lưu
                        leaderboard_entries
                        (chạy NGOÀI try-block chính — lỗi rebuild không
                         được phép biến 1 backtest THÀNH CÔNG thành FAILED)
                     6. Nếu lỗi ở bước 2-4: đánh dấu iteration FAILED,
                        và backtest_run FAILED (nếu candidate đã tồn tại)
```

```
GET /strategy-search/experiments/:id        → trạng thái + tiến độ (observability)
GET /strategy-search/experiments/:id/top    → Top-K hiện tại
POST /strategy-search/experiments/:id/cancel → dừng giữa chừng
```

## 4. Bốn nguyên tắc kiến trúc đã áp dụng đúng

1. **Tách Strategy khỏi Search Configuration khỏi Candidate.** `strategies` chỉ có 4 dòng bất biến (MA/RSI/BOLLINGER/SUPPORT_RESISTANCE). Mọi tổ hợp tham số do search sinh ra nằm ở `candidate_strategies`, không phình vào `strategies`. Xem `artifacts/database.md` mục 2.

2. **Weight là thuộc tính của Configuration, không phải Candidate.** Quyết định kiến trúc quan trọng nhất phát sinh giữa chừng: `CompositeStrategyService.analyze()` cần weight để tính weighted vote, nhưng weight không còn nằm trên `CandidateMember` (đã chuyển sang `experiment_config_strategies`). Giải pháp: truyền `weights: Record<SearchStrategyType, number>` như **tham số runtime** vào `analyze()`/`BacktestingService.run()`, không nhúng vào `CandidateDefinition` (thứ được lưu DB và fingerprint). Lý do: nhúng weight vào candidate sẽ (a) nhân bản dữ liệu config vào từng candidate, và (b) làm cùng một bộ tham số kỹ thuật fingerprint khác nhau giữa các experiment khác weight — phá cơ chế chống trùng lặp candidate.

3. **Strategy không tự đụng DB.** `CompositeStrategyService`/`StrategyEngineService` chỉ nhận `SignalContext` (mảng nến + index) và `CandidateMember` (tham số) — không import `DatabaseService`, không tự query.

4. **Auth 404 thay vì 403 cho tài nguyên không thuộc về mình** — tránh rò rỉ thông tin (xem `artifacts/api-contract.md` mục 5).

## 5. Rủi ro đã tìm thấy và vá trong lúc build (đáng nói khi vấn đáp)

Đây là các lỗi **thật, được subagent review tìm ra khi triển khai**, không phải giả định — cho thấy quy trình review nhiều lớp có tác dụng:

| Lỗi | Hậu quả nếu không vá | Trạng thái |
|---|---|---|
| Migration tạo bảng thiếu `IF NOT EXISTS` | Chạy lại migration thủ công sẽ lỗi "relation already exists" | Đã vá (Task 1) |
| `ExperimentRepository.status()` dùng `MAX(uuid)` | Postgres không có hàm `max(uuid)` → `GET /experiments/:id` **luôn luôn 500** | Đã vá (Task 8), thay bằng `ARRAY_AGG ... FILTER` |
| `strategyWeights` không được validate khớp `enabledDomains` | Gửi đúng ví dụ weight mà chính đề bài minh hoạ (MA 0.3/RSI 0.3/BB 0.4, thiếu Support/Resistance) → **mọi iteration lỗi âm thầm**, experiment kết thúc "COMPLETED" với 0 candidate, API vẫn trả `202` như bình thường | Đã vá (Task 8) — validate 2 chiều trước khi tạo experiment |
| Leaderboard rebuild nằm trong cùng try-block với backtest | 1 lỗi tạm thời khi rebuild leaderboard → backtest **đã thành công** bị đánh dấu FAILED, evaluation tốt bị loại vĩnh viễn khỏi Top-K | Đã vá (Task 8) — tách ra try-block riêng |
| Test cho `BacktestRunRepository` chỉ kiểm `.some()` substring | Không phát hiện được bug hoán đổi `profit_loss`/`return_pct`, thiếu câu lệnh DELETE, sai thứ tự ghi | Đã vá (Task 7) — test giờ kiểm thứ tự + tham số ràng buộc |

## 5b. Giới hạn đã biết: mất cơ chế chống trùng candidate

Bản code cũ (mô hình phẳng) dùng `fingerprint` (SHA-256 của tham số) + `ON CONFLICT` để bỏ qua candidate đã test trùng, không tính vào `generated`. Khi rewire sang schema Candidate mới (Task 8), cơ chế này **chưa được khôi phục** — mỗi candidate sinh ra đều tạo iteration + lưu DB + tính vào `generated`, kể cả khi trùng tham số với candidate trước đó. Hệ quả: trong không gian tham số hẹp (vd chỉ bật 2 domain), có thể thấy nhiều candidate giống hệt nhau trong Top-K. **Không phải lỗi dữ liệu/crash** — chỉ là kết quả kém đa dạng hơn mong đợi.

**Quyết định:** không sửa trong đợt migrate này (cần thêm cột `fingerprint` + unique index vào `candidates`, tức thêm 1 migration nữa, rủi ro cho deadline). `CandidateFingerprintService` hiện chưa được dùng ở luồng chính (chỉ còn test riêng của nó). Việc tiếp theo (nếu còn thời gian): thêm cột fingerprint hoặc dọn hẳn code chết (`attempts`/`maximumAttempts`/`SEARCH_SPACE_EXHAUSTED` hiện không bao giờ kích hoạt vì lý do tương tự — `attempts` tăng cùng nhịp `generated`).

## 6. Nợ kiến trúc lớn nhất còn lại — ưu tiên cao nhất cho việc tiếp theo

**`StrategyEngineService` dùng `switch (member.type)` với cả 4 strategy code inline trong 1 class; `StrategyPluginService` là stub rỗng.** Đây là vi phạm trực tiếp yêu cầu "Adding a strategy must not require rewriting the Strategy Engine" và anti-pattern "Hard-coded Strategy" mà đề bài liệt kê tường minh (`docs/about-projects/03-anti-patterns-to-avoid.md` #2). `docs/modules-specification/strategy-plugin.md` + `strategy-engine.md` đã đặc tả sẵn lời giải (Registry + Facade). **Không sửa trong đợt migrate này** (ngoài phạm vi, rủi ro deadline) — khuyến nghị là plan tiếp theo, ưu tiên cao nhất vì đây là tiêu chí chấm điểm nặng nhất của đồ án.

## 7. Việc chưa làm (theo thứ tự khuyến nghị ưu tiên)

1. Strategy Registry/Plugin refactor (mục 6) — điểm số cao nhất.
2. `market-data` chưa có auth guard.
3. News crawler + Sentiment worker thật (theo `artifacts/decisions.md` mục 3: crawl thật, sentiment dùng model có sẵn — không train từ đầu).
4. WebSocket realtime cho chart + leaderboard push.
5. Port UI từ `docs/ui-prototype/` sang `web-platform/` (chưa động tới gì).
6. Redis + BullMQ nếu quy mô search cần chạy song song thật (hiện tuần tự vẫn đáp ứng MVP).
