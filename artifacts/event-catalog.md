# Event Catalog

> Hợp đồng của mọi event trong hệ thống. Thêm event mới vào code mà không thêm dòng ở đây được coi là **bug**, không phải thiếu sót — file này là contract, `service/src/domain-events/event-names.ts` chỉ là bản cài đặt.

## 1. Hai tầng event — đừng gộp làm một

Hệ thống có **hai** cơ chế event khác hẳn nhau về ranh giới và bảo đảm. Khi vấn đáp phải phân biệt rõ, vì gọi nhầm tên sẽ bị hỏi vặn ngay.

| | **BullMQ (Redis)** | **`@nestjs/event-emitter` (in-process)** |
|---|---|---|
| Ranh giới | **Xuyên tiến trình** — API enqueue, Worker thực thi | **Trong cùng 1 tiến trình** — không bao giờ ra khỏi process |
| Bền vững | Có — job nằm trong Redis, sống qua restart | **Không** — process chết là event mất |
| Retry | Có (`attempts: 3`, exponential backoff) | Không có |
| Dùng cho | Đơn vị **công việc** (chạy search, crawl tin) | **Thông báo** một việc đã xảy ra |
| File | `service/src/queue/`, `search-queue.service.ts` | `service/src/domain-events/` |

**Hệ quả quan trọng:** listener của `backtest.completed` chạy **trong tiến trình worker**, vì `StrategySearchService.run()` chạy ở đó. Nếu `WorkerModule` không import `LeaderboardModule`, listener không tồn tại và event bắn vào hư vô — xem `worker.module.ts` và mục 5 bên dưới.

---

## 2. Domain events (in-process)

### 2.1 `backtest.completed`

| Mục | Nội dung |
|---|---|
| **Owner** | `StrategySearchService.run()` (chạy trong Worker) |
| **Khi emit** | Sau khi `backtestRuns.complete()` + `iterations.complete()` thành công, **ngoài** try/catch của backtest |
| **Consumers** | `LeaderboardEventsHandler.onIterationBoundary()` |
| **Payload** | `experimentId`, `candidateId`, `iterationId`, `topK`, `minimumTrades`, `correlationId?` |
| **Schema version** | v1 (`BacktestCompletedPayload`) |
| **Ordering** | Tuần tự nghiêm ngặt theo iteration — emit bằng `await emitAsync`, không phải `emit`. Xem mục 4. |
| **Duplicate** | Có thể lặp khi BullMQ retry cả job search. Vô hại: rebuild là **idempotent** (DELETE + INSERT lại toàn bộ `leaderboard_entries` trong 1 transaction) |
| **Consumer failure** | **Nuốt** — handler log warn rồi trả về. Backtest rows đã commit; lỗi rebuild không được phép làm hỏng search job |
| **Cần replay?** | Không. Trạng thái thật nằm ở `backtest_runs`/`evaluations`; có thể dựng lại leaderboard bất cứ lúc nào bằng cách gọi lại rebuild |

### 2.2 `backtest.failed`

| Mục | Nội dung |
|---|---|
| **Owner** | `StrategySearchService.run()` (nhánh catch) |
| **Khi emit** | Sau `iterations.fail()` / `backtestRuns.fail()` |
| **Consumers** | `LeaderboardEventsHandler.onIterationBoundary()` — **cùng handler với event thành công** |
| **Payload** | `experimentId`, `candidateId?`, `iterationId`, `reason`, `topK`, `minimumTrades`, `correlationId?` |
| **Schema version** | v1 (`BacktestFailedPayload`) |
| **Ordering** | Như trên |
| **Duplicate** | Như trên |
| **Consumer failure** | Nuốt |
| **Cần replay?** | Không |

**Tại sao một event "thất bại" lại kích hoạt rebuild?** Đây là điểm dễ bị hỏi nhất.

Trước refactor, `run()` gọi `rebuildForExperiment()` sau **mọi** iteration — khối gọi nằm cố ý **ngoài** try/catch của backtest. Nghĩa là một iteration lỗi vẫn kéo theo 1 lần rebuild và 1 lần `INCR leaderboard:version`. Nếu chỉ emit khi thành công, số lần rebuild và số lần bump cache sẽ **giảm** so với hệ thống đã luôn chạy → đó là đổi behavior, mà mục tiêu refactor này là *chỉ đổi kiến trúc*.

Vì vậy `backtest.failed` mang ngữ nghĩa **"một iteration đã kết thúc"** (iteration boundary), không phải "có dữ liệu mới để xếp hạng".

**Bằng chứng đo được:** chạy thật một experiment `maxCandidates: 5` → key `leaderboard:version:<expId>` = **5**, đúng 1 bump/iteration, khớp hệ thống cũ.

### 2.3 `candidates.regenerated`

| Mục | Nội dung |
|---|---|
| **Owner** | `StrategySearchService.regenerateForStrategyVersion()` (chạy trong tiến trình **API**, không phải worker) |
| **Khi emit** | **Một lần duy nhất**, sau vòng lặp cascade, chỉ khi `created.length > 0` |
| **Consumers** | `LeaderboardEventsHandler.onCandidatesRegenerated()` |
| **Payload** | `experimentId`, `candidateIds[]`, `topK`, `minimumTrades`, `correlationId?` |
| **Schema version** | v1 (`CandidatesRegeneratedPayload`) |
| **Ordering** | Không liên quan — mỗi request 1 event |
| **Duplicate** | Không có retry (đường HTTP đồng bộ) |
| **Consumer failure** | **KHÔNG nuốt** — lỗi lan ra controller → HTTP 5xx |
| **Cần replay?** | Không |

**Tại sao error policy ngược với 2.1/2.2?** Vì call-site gốc ngược nhau: `run()` bọc try/catch quanh rebuild, còn `regenerateForStrategyVersion()` thì không. Endpoint regenerate là hành động đồng bộ của người dùng — rebuild lỗi phải trả 5xx, chứ không phải 200 kèm leaderboard cũ. Gộp hai handler làm một sẽ âm thầm đổi endpoint này từ 500 → 200.

> **Bẫy cài đặt:** `@nestjs/event-emitter` mặc định `suppressErrors: true` — nó bọc mọi listener trong try/catch, log rồi **nuốt**. Handler này phải khai báo `@OnEvent(..., { suppressErrors: false })`, nếu không lỗi biến mất giữa handler và điểm emit. Có test wiring riêng canh việc này.

### 2.4 `leaderboard.updated`

| Mục | Nội dung |
|---|---|
| **Owner** | `LeaderboardService.rebuildForExperiment()` |
| **Khi emit** | Sau khi transaction rebuild commit **và** sau `cache.incr(leaderboardVersionKey)` |
| **Consumers** | Hiện tại: chưa có consumer thật (chỉ log khi listener lỗi). Dự kiến: WebSocket push, metrics |
| **Payload** | `experimentId`, `topK`, `leaderboardVersion: number \| null`, `correlationId?` |
| **Schema version** | v1 (`LeaderboardUpdatedPayload`) |
| **Ordering** | Không đảm bảo với consumer khác — đây là event **duy nhất không được await** |
| **Duplicate** | Nhiều lần trên cùng experiment là bình thường (mỗi iteration 1 lần) |
| **Consumer failure** | Nuốt + log. Rebuild đã commit trước khi emit; listener lỗi không được phép biến một ghi thành công thành thất bại |
| **Cần replay?** | Không |

`leaderboardVersion = null` nghĩa là lệnh `INCR` Redis thất bại (`CacheService.incr` tự nuốt lỗi và trả `null`). Đây là tín hiệu **cache suy giảm**, không phải rebuild thất bại — event vẫn được phát, vì consumer vẫn cần biết read model đã đổi.

---

## 3. Event ở tầng khác — chỉ document, không phải domain event

Ba mục dưới đây **không** đi qua `@nestjs/event-emitter`. Ghi ở đây để bản đồ event đầy đủ, và để tránh nói quá khi vấn đáp.

| Tên | Cơ chế thật | Nguồn | Ghi chú |
|---|---|---|---|
| `SearchJobEnqueued` | BullMQ `queue.add()` | `SearchQueueService.enqueue()` | Không phải event object — là **job**. Mang `correlationId` sang worker. Có coalescing: một experiment chỉ 1 job in-flight |
| `NewsCrawlCompleted` | BullMQ job return value | `NewsCrawlProcessor.process()` | Kết quả job, không broadcast cho ai |
| `CandleClosed` | **WebSocket** `socket.io` `emit('candle')` | `MarketDataGateway` | Broadcast tới browser đang subscribe, **không phải** domain event nội bộ. Nến đóng mới được persist |

---

## 4. Quy tắc bắt buộc khi emit

1. **Luôn `await emitAsync`, không dùng `emit`.**
   `emit()` không await listener bất đồng bộ. Nếu dùng `emit`, vòng lặp search chạy tiếp trong khi rebuild còn dang dở → `experiments.finish('COMPLETED')` có thể xảy ra **trước** lần rebuild cuối, làm Leaderboard thiếu candidate cuối cùng. Lời gọi trực tiếp trước đây được `await`, nên emit cũng phải `await`.
   *Ngoại lệ duy nhất:* `leaderboard.updated` (mục 2.4) — cố ý fire-and-forget, có `.catch()`.

2. **Payload tự mang đủ ngữ cảnh.** `topK`/`minimumTrades` đi kèm payload thay vì để handler query lại `ExperimentRepository` — nếu không sẽ thêm 1 round-trip DB mỗi iteration mà lời gọi trực tiếp cũ không hề có.

3. **`correlationId` lấy từ `getCorrelationId()` tại điểm emit**, để log của listener nối được với HTTP request đã khởi động search (dù cách đó 1 process boundary + 1 hop Redis).

4. **Dùng 2 decorator `@OnEvent` xếp chồng, không dùng `@OnEvent([a, b])`.** Dạng array có trong type signature nhưng được truyền thẳng cho `eventemitter2.on()`, nơi array bị hiểu là **đường dẫn event lồng nhau**; với `wildcard: false` thì subscription không khớp event nào cả — im lặng, không lỗi.

---

## 5. Chỗ hỏng im lặng đã biết — đọc trước khi sửa module

Listener chỉ tồn tại nếu module chứa nó nằm trong graph của tiến trình đang emit.

`StrategySearchService` **không còn** phụ thuộc `LeaderboardService` (đó chính là điểm decoupling — `grep -rn LeaderboardService src/modules/strategy-search/` chỉ ra comment). Phản xạ tự nhiên tiếp theo là xoá `LeaderboardModule` khỏi `StrategySearchModule` — đã làm. Nhưng trước đó `WorkerModule` lấy `LeaderboardModule` **gián tiếp** qua chính import đó.

Vì vậy `WorkerModule` phải import `LeaderboardModule` **tường minh**. Nếu ai đó dọn dẹp import này:

- Không test unit nào đỏ (tất cả đều mock emitter).
- Build vẫn sạch.
- Leaderboard **vĩnh viễn không cập nhật** trong production.

Cách phát hiện: test wiring trong `leaderboard-events.handler.spec.ts` dựng `EventEmitterModule` thật; và boot worker rồi kiểm tra log có dòng `LeaderboardModule dependencies initialized`.
