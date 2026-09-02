# Continuous Strategy Loop

Tài liệu vấn đáp — **kiến trúc đã build**. Đối chiếu sơ đồ:

- Level 1: `artifacts/architecture-c4-level-1.png`
- Level 2: `artifacts/architecture-c4-level-2.png`
- Level 3: `artifacts/architecture-c4-level-3.png`
- Sequence: `artifacts/architecture-flow-search-backtest.png`

Nguồn chi tiết: `artifacts/architecture.md`, `artifacts/queue.md`, `artifacts/event-catalog.md`, `artifacts/cqrs.md`.

---

## 1. Mục đích

Đề bài bắt buộc vòng đời candidate lặp lại trên nền:

**Generate → Backtest → Evaluate → Rank → (Leaderboard) → generate tiếp**

cho đến khi gặp **điều kiện dừng tường minh** — không được `while(true)`.

Trong code **không có** class tên `ContinuousLoopModule`. Vòng lặp là sự phối hợp của:

| Vai trò trong loop | Module NestJS (Level 3) |
|---|---|
| Sinh candidate + điều kiện dừng + enqueue job | Strategy Search |
| Mô phỏng lệnh + tính metric | Backtesting |
| Vote tín hiệu tổ hợp | Composite Strategy + Strategy Engine + Plugin Registry |
| Materialize Top-K | Leaderboard (qua domain event, không gọi thẳng từ Search) |
| Đưa việc nặng ra khỏi HTTP | Queue (`search`) + Background Worker |

Mục tiêu đồ án là chứng minh kiến trúc **mở rộng được** (đổi generator, thêm strategy, thêm worker) — không phải tìm chiến lược sinh lời.

---

## 2. Level 1 — System Context

Người dùng (**Trader**) chỉ thấy một hệ thống: Crypto Strategy Lab.

Với vòng search/backtest, hệ thống **không** gọi LLM. Nó cần:

- **Binance** — nến lịch sử để backtest (API Application lấy REST klines; không phải frontend gọi Binance).
- **PostgreSQL** — experiment, candidate, trade, evaluation, leaderboard (nằm trong biên hệ thống ở Level 2).

Tin tức / LLM nằm trên cùng sơ đồ Level 1 nhưng thuộc pipeline khác (News, AI Strategy). Loop này chỉ **đọc** nến đã có và **ghi** kết quả thí nghiệm.

Luồng ngữ cảnh:

```
Trader  --sử dụng-->  Crypto Strategy Lab  --lấy nến-->  Binance
```

---

## 3. Level 2 — Container (luồng xuyên process)

Các hộp liên quan trực tiếp tới loop:

```
Trader → Web Application (HTTPS)
       → API Application (REST)
       → Redis (Enqueue jobs / cache)
       → Background Worker (Jobs)
       → Database (SQL)
```

**Không có mũi tên HTTP từ API tới Worker.** Hai tiến trình NestJS chỉ gặp nhau ở Redis (BullMQ). API `queue.add()`; Worker **pull** job.

### 3.1. Bắt đầu loop (HTTP, tiến trình API)

1. Trader trên **Web Application** (tab Backtest / Leaderboard) gửi `POST /strategy-search/experiments` kèm JWT.
2. **API Application** validate, ghi experiment + config **bất biến** vào Postgres, enqueue job `{ experimentId }` lên queue `search`, trả **202** ngay.
3. Frontend **poll** `GET /experiments/:id` mỗi 2 giây (có trần số lần) — không WebSocket cho tiến độ search.

### 3.2. Chạy loop (tiến trình Worker)

4. **Background Worker** nhận job, gọi **cùng** `StrategySearchService.run()` — không fork logic.
5. Mỗi iteration: sinh candidate → backtest → persist → emit event → rebuild leaderboard → `INCR` version trên Redis (cache Top-K của API thành miss).
6. Worker ghi SQL Postgres; API đọc Top-K từ `leaderboard_entries` + cache Redis.

### 3.3. Dừng / huỷ

- Stop trong `run()`: đủ `maxCandidates`, hết `maxDurationSeconds`, `maxNoImprovement` vòng không cải thiện, hoặc `CANCELLED`.
- `POST .../cancel`: API ghi status Postgres + gỡ job nếu còn chờ trên Redis. Job **đang chạy** không bị kill — vòng `while` tự thấy `CANCELLED` ở iteration kế.

Kill API giữa chừng **không** dừng loop: job nằm Redis, Worker vẫn chạy tới COMPLETED.

News Worker / AI Strategy Worker **không** nằm trên đường này (trừ khi experiment có chọn strategy `AI:<id>` — xem file AI-Generated Strategy).

---

## 4. Level 3 — Component (một vòng iteration)

Bám các hộp trên `architecture-c4-level-3`:

**Frontend:** `BacktestPage` + `useExperiment` (poll) + `LeaderboardPage`.

**API (enqueue only):**

```
StrategySearchController
  → StrategySearchService.start() / extend() / cancel()
      → SearchQueueService.enqueue(experimentId)     // @InjectQueue("search")
      → Experiment*Repository (SQL)
```

`start()` **không** gọi `run()`.

**Worker:**

```
SearchProcessor  @Processor("search")  concurrency 5
  → StrategySearchService.run(experimentId)          // cùng class với API
```

**Bên trong `run()`, mỗi candidate:**

```
1. DomainGuidedRandomGenerator
      (catalog TREND / MOMENTUM / VOLATILITY / STRUCTURE;
       ≥ 1 domain hướng + ≥ 1 domain xác nhận)
2. INSERT experiment_iterations + candidates + candidate_strategies
3. (Nếu có AI:<id>) AiStrategySignalPrecomputeService — 1 lần / cả run, trước vòng lặp
4. BacktestingService.run(candidate, candles, weights)
      → mỗi nến: CompositeStrategyService
            → StrategyEngineService.analyze(member)
                  → StrategyRegistry.resolve(type).analyze()
                     (plugin MA/RSI/BB/SR hoặc AiStrategyPluginAdapter)
      → mô phỏng phí, slippage, SL/TP
      → 1 transaction: backtest_runs + trades + evaluations
5. await emitAsync("backtest.completed" | "backtest.failed")
      → LeaderboardEventsHandler
            → LeaderboardService.rebuildForExperiment()
                  → DELETE + INSERT leaderboard_entries
                  → INCR leaderboard:version
                  → emit "leaderboard.updated" (không await)
```

**Đường đọc (vẫn API):** `GET .../top` → `getTop()` đọc cache theo version Redis; miss thì `SELECT leaderboard_entries`.

Search **không** inject `LeaderboardService`. Đó là decoupling Event-Driven trên Level 3.

---

## 5. Quyết định kiến trúc (hỏi / đáp)

### Q: Vì sao không chạy cả vòng lặp trong API (`setImmediate`)?

**A:** Search có thể hàng trăm iteration, chiếm event loop HTTP, chết khi restart API, không scale 2 instance. Đề bài yêu cầu đường đi tới ~100k candidate. Giải pháp: BullMQ queue `search`, Worker process riêng, **tái dùng** `run()` — không viết vòng lặp lần 2.

### Q: Vì sao API không gọi Worker bằng HTTP?

**A:** Worker cố ý **không có HTTP nghiệp vụ**. Hợp đồng xuyên process là Redis. Vẽ C4 Level 2 theo hướng dữ liệu: `API → Redis (enqueue)` và `Redis → Worker (jobs)`.

### Q: Vì sao Redis vừa queue vừa cache — không tách Kafka + Redis riêng?

**A:** Quy mô đồ án: một Redis đủ BullMQ + cache-aside Top-K. Kafka bị từ chối (`artifacts/decisions.md`). Cache và queue **không chung ioredis client** (timeout/offline queue khác nhau) — chỉ chung *config host/port*.

### Q: Vì sao generator là Domain-Guided Random chứ không random thuần?

**A:** MVP bắt buộc có ít nhất Random Search. Random mù ghép MA với MA, thiếu cặp hướng/xác nhận. Generator bắt buộc cấu trúc domain hợp lệ rồi mới random **tham số trong catalog** — đổi sang Genetic sau này chỉ thay generator, không đụng Backtest / Leaderboard.

### Q: Weight nằm ở đâu — candidate hay config?

**A:** Trên `experiment_config_strategies`, **cố định cả experiment**. Cùng bộ tham số kỹ thuật không được đổi fingerprint chỉ vì experiment khác weight. Composite nhận `weights` như tham số runtime lúc backtest.

### Q: Vì sao Search không gọi thẳng `LeaderboardService.rebuildForExperiment()`?

**A:** Anti-pattern gọi chặt + không thêm consumer được (WebSocket leaderboard, audit) mà không sửa Search. Search chỉ `await emitAsync` sự thật đã xảy ra. Handler sống trong Leaderboard module.

### Q: Vì sao phải `await emitAsync`, không dùng `emit`?

**A:** `emit` không đợi listener async. Vòng search sẽ sang candidate tiếp theo trước khi rebuild xong → Top-K / cache version lệch. Có test canh việc này.

### Q: Iteration **lỗi** vẫn phát event và vẫn rebuild — tại sao?

**A:** Rebuild là ranh giới **iteration**, không phải “có điểm mới”. Trước khi tách event, mọi vòng (kể cả fail) đều rebuild một lần. Bỏ `backtest.failed` sẽ giảm số lần `INCR` version so với hệ thống cũ — đổi hành vi, không chỉ đổi kiến trúc.

### Q: Lỗi rebuild có được phép đánh FAILED một backtest đã thành công không?

**A:** Không. Emit nằm **ngoài** try/catch của backtest. Handler `onIterationBoundary` **nuốt** lỗi, log warn. Ngược lại, `candidates.regenerated` (HTTP đồng bộ) **không** nuốt — user phải nhận 5xx.

### Q: Vì sao `WorkerModule` phải import `LeaderboardModule` tường minh?

**A:** Event in-process **không xuyên process**. `run()` chạy ở Worker → listener phải tồn tại **ở Worker**. Bỏ import: event bắn vào hư vô, leaderboard đứng im, unit test (mock emitter) vẫn xanh.

### Q: Đây có phải CQRS / Event Sourcing không?

**A:** **Tactical CQRS**, một Postgres. Đường ghi materialize `leaderboard_entries`; đường đọc SELECT + cache. Không tách hai database, không event store. Provenance = không overwrite `backtest_runs` / `evaluations`.

### Q: Cache Top-K vô hiệu hoá thế nào khi ghi ở Worker, đọc ở API?

**A:** Domain event không tới được API. Worker `INCR leaderboard:version:<experimentId>` trên Redis dùng chung. Lần `getTop()` sau ghép key `...:v{n+1}` → miss → đọc SQL lại.

### Q: Frontend poll 2s có phải infinite loop cấm trong đề bài không?

**A:** Không. Cadence cố định, dừng khi status terminal, trần 150 lần (~5 phút) rồi `timeout`. Loop nền thật sự có stop condition phía worker.

### Q: `jobId = experimentId` để chống double-run được không?

**A:** Đã thử, **loại**. BullMQ sau khi job complete, `add()` cùng jobId trả job cũ, **không** chạy lại — `extend()` thành no-op im lặng. Cách đúng: quét job in-flight theo `experimentId` (coalesce), `jobId` luôn mới (`{id}-run-{timestamp}`).

### Q: Retry search có tạo candidate trùng / leaderboard hỏng không?

**A:** `attempts: 3`, backoff. `run()` idempotent qua `setRunning()` + đếm `generated` từ DB. Rebuild leaderboard là DELETE + INSERT trong 1 transaction.

### Q: Strategy Engine có `if (MA) ... if (RSI)` không?

**A:** Không. `StrategyEngineService` chỉ `registry.resolve(type).analyze()`. Thêm MACD = plugin mới, không sửa engine. (Anti-pattern Hard-coded Strategy.)

### Q: Strategy có được query database không?

**A:** Không. Plugin nhận `SignalContext` (nến + index) và `CandidateMember`. Persistence nằm ở repository / backtest module.

---

## 6. Câu chốt khi trình bày

> Loop là **một job BullMQ** chứa nhiều iteration. Mỗi iteration là **một domain event**. Ranking là **read model**. Frontend chỉ poll trạng thái. Điều kiện dừng nằm trong `run()`, không nằm ở UI.
