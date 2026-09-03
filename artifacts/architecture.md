# Kiến trúc thực tế

> Mô tả kiến trúc **đã thực sự build**, khác với `docs/software-architecture/` (bản thiết kế ban đầu, tham khảo). Ghi rõ chỗ nào khớp, chỗ nào lệch và tại sao.

## 1. Kiểu kiến trúc

**NestJS Modular Monolith** — một tiến trình Node.js duy nhất, chia thành các module NestJS độc lập theo domain. Đúng theo `docs/software-architecture/decisions.md` ADR-001 (chọn Monolith thay vì Microservices vì team nhỏ, deadline ngắn, không cần network latency giữa các "service" logic).

**So với thiết kế ban đầu (cập nhật 2026-08-29):**

| Thiết kế ban đầu (`docs/software-architecture/`) | Thực tế hiện tại |
|---|---|
| 2 Python worker riêng (Crawler, Sentiment) giao tiếp qua HTTP/Redis Queue | Crawler đã build (`workers/news/`, gọi qua BullMQ). Sentiment degrade về `NoopSentimentProvider` khi chưa cài FinBERT |
| In-process Event Bus (`@nestjs/event-emitter`), domain event | **Đã dùng** — `@nestjs/event-emitter` v3.1.0. 4 domain event, xem [event-catalog.md](event-catalog.md). Search **không còn** gọi thẳng Leaderboard |
| Redis (cache leaderboard + BullMQ job queue) | **Đã có cả hai** — BullMQ **3 queue** (`search`, `news-crawl`, `ai-generate`), cache Top-K theo version. Xem [queue.md](queue.md), [cache.md](cache.md) |
| WebSocket cho realtime | **Đã có** — `MarketDataGateway` push nến/tick BTCUSDT qua socket.io |

**Hai tầng event — phân biệt bắt buộc:**

| | BullMQ (Redis) | `@nestjs/event-emitter` |
|---|---|---|
| Ranh giới | **Xuyên tiến trình** (API ⇄ Worker) | **Trong 1 tiến trình** |
| Bền vững / retry | Có / có | Không / không |
| Dùng cho | Đơn vị **công việc** | **Thông báo** việc đã xảy ra |

Chi tiết đầy đủ: [event-catalog.md](event-catalog.md). Đường ghi/đọc của Leaderboard: [cqrs.md](cqrs.md). Vì sao chưa dùng service mesh: [service-mesh-evolution.md](service-mesh-evolution.md).

### Cách đọc C4 Level 2 (tránh hiểu nhầm mũi tên)

Nguồn: [architecture-c4-level-2.puml](architecture-c4-level-2.puml). Đối chiếu code, không đọc như “mọi mũi tên = HTTP”.

| Thắc mắc thường gặp | Sự thật trong code |
|---|---|
| Không thấy dây **vào** Background Worker? API có gọi Worker không? | **Không.** API không HTTP-gọi Worker. Job đi `API → Redis → Worker` (BullMQ pull). Sơ đồ vẽ `Redis → Worker : Jobs`. |
| API **và** Worker cùng spawn AI Strategy Worker? | **Đúng, hai đường khác nhau.** Worker spawn `validate.py` sau LLM trên job `ai-generate`. API spawn `validate.py` / `run.py` cho `POST /validate`, `POST /save`, `POST /:id/run` (vẫn đồng bộ). |
| Generate code phải từ Python Worker → LLM? | **Sai.** `workers/ai-strategy/` không gọi mạng/LLM. `AiStrategyService.generate()` (NestJS, chạy **trong process Worker**) gọi `OpenAiCompatibleProvider` → LLM, rồi mới spawn `validate.py`. |

Level 3 ([architecture-c4-level-3.puml](architecture-c4-level-3.puml)) chi tiết class: `AiGenerateQueueService`, `AiGenerateProcessor`, 3 queue Redis.

## 2. Sơ đồ module thực tế

```
┌──────────────────────────────────────────────────────────────────────┐
│                    NESTJS MODULAR MONOLITH (1 process)                │
│                                                                        │
│  ┌──────────┐   ┌────────────────┐   ┌──────────────┐   ┌──────────┐  │
│  │   Auth   │   │  Market Data   │   │ Strategy     │──▶│ Strategy │  │
│  │  Module  │   │    Module      │   │ Engine       │   │ Plugin   │  │
│  │          │   │ - BinanceClient│   │ Module       │   │ Module   │  │
│  │ JWT +    │   │ - CandleRepo   │   │ (delegates   │   │ (Registry│  │
│  │ refresh  │   │                │   │  to Registry)│   │ + 4 plugin)│ │
│  └────┬─────┘   └────────┬───────┘   └──────┬───────┘   └──────────┘  │
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
                     5. emit `backtest.completed` (await emitAsync)
                        → LeaderboardEventsHandler nhận, gọi
                          LeaderboardService.rebuildForExperiment():
                          tính lại Top-K (mọi candidate đã backtest xong), lưu
                          leaderboard_entries, INCR leaderboard:version
                        (emit NGOÀI try-block chính — lỗi rebuild không
                         được phép biến 1 backtest THÀNH CÔNG thành FAILED;
                         handler tự nuốt lỗi và log warn)
                        (Search KHÔNG còn tham chiếu LeaderboardService —
                         xem event-catalog.md)
                     6. Nếu lỗi ở bước 2-4: đánh dấu iteration FAILED,
                        và backtest_run FAILED (nếu candidate đã tồn tại),
                        rồi emit `backtest.failed` — vẫn kích hoạt rebuild,
                        vì rebuild là ranh giới ITERATION chứ không phải
                        "có dữ liệu mới". Giữ đúng số lần rebuild như
                        trước khi chuyển sang event.
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

## 4b. Strategy Plugin Registry — thay `switch (member.type)` (đã fix, task 2026-08-24)

**Vấn đề cũ:** `StrategyEngineService.analyze()` là 1 hàm `switch (member.type)` với cả 4 nhánh code tín hiệu (MA/RSI/BOLLINGER/SUPPORT_RESISTANCE) viết inline trong cùng 1 class. Đây đúng là anti-pattern "Hard-coded Strategy" mà đề bài liệt kê tường minh — thêm 1 strategy thứ 5 buộc phải sửa file `strategy-engine.service.ts` (thêm 1 `case`), vi phạm trực tiếp yêu cầu "adding a strategy must not require rewriting the Strategy Engine".

**Giải pháp — Registry pattern (Open/Closed Principle):**

- `service/src/modules/strategy-plugin/strategy-plugin.types.ts` định nghĩa interface `StrategyPlugin` (mỗi strategy tự khai báo `type`, `domain`, `displayName`, `description`, `parameterSchema`, và hàm `analyze(member, context): StrategySignal` của riêng nó) và `ParameterSpec` (mô tả 1 tham số: `key/label/type/min/max/step/default`, dùng để build UI form động sau này thay vì hard-code form theo từng strategy).
- `service/src/modules/strategy-plugin/strategy-registry.ts`: `StrategyRegistry` là 1 `Map<SearchStrategyType, StrategyPlugin>` bọc trong `@Injectable`. `register()` từ chối đăng ký trùng type; `get()` ném lỗi rõ ràng nếu type chưa đăng ký (không âm thầm trả `undefined`); `list()` phục vụ liệt kê toàn bộ plugin (vd cho endpoint catalog UI sau này).
- `service/src/modules/strategy-plugin/plugins/{ma,rsi,bollinger,support-resistance}.plugin.ts`: mỗi file là 1 class implement `StrategyPlugin`, chứa **nguyên vẹn** phần thân tín hiệu (signal math) từng được copy từ nhánh `switch` cũ — không đổi 1 dòng logic, chỉ di chuyển vị trí. `parameterSchema` lấy đúng range/tên tham số từ `strategy-search/catalog/strategy-catalog.ts` (nguồn sự thật duy nhất cho không gian tham số của search).
- `StrategyPluginModule` (`onModuleInit`) đăng ký cả 4 plugin vào `StrategyRegistry` khi app khởi động, và export `StrategyRegistry` để module khác inject.
- `StrategyEngineService` giờ chỉ còn 1 dòng nghiệp vụ: `this.registry.get(member.type).analyze(member, context)`. **Không còn `switch`, không còn `if (type === ...)` nào trong file này.**
- `StrategyEngineModule` import `StrategyPluginModule` để `StrategyRegistry` được inject qua constructor — không có vòng phụ thuộc (`strategy-plugin` **không** import `strategy-search` module, dù dùng type `CandidateMember`/`SearchStrategyType` từ đó — chỉ import kiểu dữ liệu (type-only ở mức module graph), không import class/service, nên không đóng vòng DI dù `strategy-search → backtesting → composite-strategy → strategy-engine → strategy-plugin`).

**Cách thêm strategy thứ 5 (vd MACD) mà KHÔNG sửa 1 dòng nào trong `strategy-engine.service.ts` hay `strategy-registry.ts`:**

1. Thêm `'MACD'` vào union type `SearchStrategyType` (`strategy-search/domain/search.types.ts`) — bước duy nhất chạm vào file ngoài `strategy-plugin/`.
2. Tạo `service/src/modules/strategy-plugin/plugins/macd.plugin.ts`, class `MacdPlugin implements StrategyPlugin` với `type = 'MACD'`, `domain`, `parameterSchema`, và `analyze()` chứa signal math riêng.
3. Thêm `MacdPlugin` vào mảng `providers` + vào vòng lặp `onModuleInit` của `StrategyPluginModule`.
4. (Tuỳ chọn) thêm entry vào `STRATEGY_CATALOG` nếu muốn search engine sinh candidate loại này.

Không cần sửa `StrategyEngineService`, `StrategyRegistry`, `CompositeStrategyService`, hay `BacktestingService` — đúng tinh thần Open/Closed: engine đóng với sửa đổi, mở với mở rộng.

**Test:** `strategy-plugin/strategy-registry.spec.ts` (đăng ký/duplicate/unknown-type/list) và `strategy-engine/strategy-engine.service.spec.ts` (engine chỉ delegate, không tự biết logic strategy nào) — cả hai mock hoàn toàn `StrategyPlugin`, không phụ thuộc plugin thật. Ngược lại, `backtesting/backtesting.service.spec.ts` cố tình dùng **registry thật + 4 plugin thật** (không mock) để làm regression guard: nếu số liệu backtest đổi sau refactor này, nghĩa là có nhánh bị sửa logic thay vì chỉ di chuyển vị trí.

## 4c. Event-Driven — cắt phụ thuộc Search → Leaderboard (2026-08-29)

**Trước:** `StrategySearchService` inject thẳng `LeaderboardService` và gọi `rebuildForExperiment()` ở 2 chỗ. Module Search phải biết Leaderboard tồn tại, biết nó cần `topK`, và biết phải bọc try/catch quanh nó.

**Sau:** Search chỉ **thông báo** việc đã xảy ra (`backtest.completed` / `backtest.failed` / `candidates.regenerated`). `LeaderboardEventsHandler` — sống trong module sở hữu read model — quyết định điều đó nghĩa là gì.

Bằng chứng decoupling kiểm tra được:

```bash
grep -rn "LeaderboardService" service/src/modules/strategy-search/
# → chỉ còn comment, không còn tham chiếu code
```

**Thêm strategy mới / thêm consumer mới không phải sửa Search.** Muốn push WebSocket khi leaderboard đổi? Subscribe `leaderboard.updated` — không đụng một dòng nào trong `strategy-search/`.

Hai điểm phải nhớ khi vấn đáp (chi tiết ở [event-catalog.md](event-catalog.md) và [decisions.md](decisions.md)):

- **`await emitAsync`, không phải `emit`** — `emit` không await listener, sẽ làm vòng lặp search chạy trước rebuild.
- **`WorkerModule` phải import `LeaderboardModule` tường minh** — listener chỉ tồn tại nếu module của nó nằm trong graph của tiến trình đang emit. Bỏ import này thì Leaderboard ngừng cập nhật mà **không** test nào đỏ.

## 5. Rủi ro đã tìm thấy và vá trong lúc build (đáng nói khi vấn đáp)

Đây là các lỗi **thật, được subagent review tìm ra khi triển khai**, không phải giả định — cho thấy quy trình review nhiều lớp có tác dụng:

| Lỗi | Hậu quả nếu không vá | Trạng thái |
|---|---|---|
| Migration tạo bảng thiếu `IF NOT EXISTS` | Chạy lại migration thủ công sẽ lỗi "relation already exists" | Đã vá (Task 1) |
| `ExperimentRepository.status()` dùng `MAX(uuid)` | Postgres không có hàm `max(uuid)` → `GET /experiments/:id` **luôn luôn 500** | Đã vá (Task 8), thay bằng `ARRAY_AGG ... FILTER` |
| `strategyWeights` không được validate khớp `enabledDomains` | Gửi đúng ví dụ weight mà chính đề bài minh hoạ (MA 0.3/RSI 0.3/BB 0.4, thiếu Support/Resistance) → **mọi iteration lỗi âm thầm**, experiment kết thúc "COMPLETED" với 0 candidate, API vẫn trả `202` như bình thường | Đã vá (Task 8) — validate 2 chiều trước khi tạo experiment |
| Leaderboard rebuild nằm trong cùng try-block với backtest | 1 lỗi tạm thời khi rebuild leaderboard → backtest **đã thành công** bị đánh dấu FAILED, evaluation tốt bị loại vĩnh viễn khỏi Top-K | Đã vá (Task 8) — tách ra try-block riêng |
| Test cho `BacktestRunRepository` chỉ kiểm `.some()` substring | Không phát hiện được bug hoán đổi `profit_loss`/`return_pct`, thiếu câu lệnh DELETE, sai thứ tự ghi | Đã vá (Task 7) — test giờ kiểm thứ tự + tham số ràng buộc |

## 5b. ~~Giới hạn đã biết: mất cơ chế chống trùng candidate~~ — **Đã vá (migration 005, 2026-09-03)**

**Bối cảnh (giữ lại để hiểu vì sao code có hình dạng này):** bản code cũ (mô hình phẳng) dùng `fingerprint` (SHA-256 của tham số) + `ON CONFLICT` để bỏ qua candidate đã test trùng, không tính vào `generated`. Khi rewire sang schema Candidate mới (Task 8), cơ chế này bị mất — mỗi candidate sinh ra đều tạo iteration + lưu DB + tính vào `generated`, kể cả khi trùng tham số với candidate trước đó. Hệ quả: trong không gian tham số hẹp (vd chỉ bật 2 domain), Top-K có thể chứa nhiều candidate giống hệt nhau. Không phải lỗi dữ liệu/crash, chỉ là kết quả kém đa dạng hơn mong đợi. Quyết định lúc đó: hoãn, vì cần thêm 1 migration nữa và đang sát deadline đợt migrate.

**Đã khôi phục.** `005_candidate_fingerprint.sql` thêm cột `candidate_fingerprint char(64)` + unique index `(experiment_id, candidate_fingerprint)` lên **`experiment_iterations`**, không phải `candidates`. Hai lý do:

1. Unique index không trải được qua 2 bảng, mà ràng buộc này **bắt buộc phải scope theo experiment** (cùng tổ hợp chạy trên khoảng nến khác / chi phí khác là kết quả khác, phải được chạy lại). `experiment_iterations` đã có sẵn `experiment_id`; `candidates` thì phải denormalize thêm cột.
2. Trong `run()`, iteration row được tạo **trước** candidate row — nên đây là điểm sớm nhất có thể từ chối, và conflict ở đây không để lại gì phải dọn.

`candidates.iteration_id` là UNIQUE nên iteration ↔ candidate là 1:1; đặt ở bảng nào cũng định danh đúng một candidate.

**Thay đổi kéo theo:**

- `ExperimentIterationRepository.createNext()` nhận thêm `fingerprint`, dùng `ON CONFLICT ... DO NOTHING` và trả `null` khi trùng (không throw). Không dùng SELECT-rồi-INSERT: 1 round trip, không có khe race.
- `run()` gọi `continue` khi nhận `null` — **không** tăng `generated`, **không** tạo candidate, **không** backtest, **không** emit event. Chỉ `attempts` tăng.
- `regenerateForStrategyVersion()` cũng truyền fingerprint, làm chặt thêm ràng buộc "idempotent theo tổ hợp" (`api-contract.md` §3): `pluginVersion` nằm trong definition nên version mới ra fingerprint mới và vẫn insert được, còn gọi lại lần hai ở cùng bộ version thì bị skip.
- **`attempts` / `maximumAttempts` / `SEARCH_SPACE_EXHAUSTED` hết là code chết** — giờ `attempts` mới thực sự tăng nhanh hơn `generated`. Có test canh nhánh này (`strategy-search.service.spec.ts`, describe `run() duplicate-candidate guard`).
- Metric mới `candidates_duplicate_total`. Tỉ lệ của nó so với `candidates_generated_total` tiến về 1 là dấu hiệu không gian tham số sắp cạn.

**Đổi hành vi cần biết (không chỉ đổi cấu trúc):** trước đây candidate trùng vẫn được backtest và **vẫn cộng vào `noImprovement`**. Nay `noImprovement` chỉ đếm candidate thật sự mới, nên search **chạy lâu hơn** trước khi dừng vì `NO_IMPROVEMENT`. Đúng hướng, nhưng số liệu demo chụp trước ngày 2026-09-03 sẽ không khớp nữa.

**Chưa kiểm chứng trên DB thật:** migration được viết theo đúng khuôn `004` (additive, `IF NOT EXISTS`, chạy lại được, không cần backfill vì Postgres coi các `NULL` là phân biệt trong unique index) và toàn bộ 355 unit test xanh, nhưng chưa chạy `database/migrate.js` lên Postgres thật (Docker không bật lúc thực hiện). Cần chạy trước khi merge.

## 6. Nợ kiến trúc lớn nhất còn lại — ưu tiên cao nhất cho việc tiếp theo

~~`StrategyEngineService` dùng `switch (member.type)` với cả 4 strategy code inline trong 1 class; `StrategyPluginService` là stub rỗng.~~ **Đã fix — xem mục 4b (Strategy Plugin Registry, 2026-08-24).** `StrategyEngineService` giờ chỉ delegate qua `StrategyRegistry`, không còn `switch`/`if` theo strategy type nào trong engine.

Nợ kiến trúc lớn nhất còn lại sau khi mục này được xử lý: xem mục 7 bên dưới (thứ tự ưu tiên đã cập nhật).

## 7. Việc chưa làm (theo thứ tự khuyến nghị ưu tiên)

1. ~~Strategy Registry/Plugin refactor~~ — **đã xong (mục 4b)**.
2. `market-data` chưa có auth guard.
3. News crawler + Sentiment worker thật (theo `artifacts/decisions.md` mục 3: crawl thật, sentiment dùng model có sẵn — không train từ đầu).
4. WebSocket push cho leaderboard — nay chỉ còn là việc subscribe `leaderboard.updated` (event đã phát sẵn, chưa có consumer), không phải sửa Search. Chart realtime đã có qua `MarketDataGateway`.
5. Port UI từ `docs/ui-prototype/` sang `web-platform/` (chưa động tới gì).
6. Redis + BullMQ nếu quy mô search cần chạy song song thật (hiện tuần tự vẫn đáp ứng MVP).
7. `CandidateFingerprintService.displayName()` (`strategy-search/services/candidate-fingerprint.service.ts`) vẫn có `switch (member.type)` riêng — nhưng đây là format tên hiển thị (cosmetic), không phải signal engine, và ngoài phạm vi task Registry này. Cân nhắc dọn sau nếu muốn nhất quán tuyệt đối.
