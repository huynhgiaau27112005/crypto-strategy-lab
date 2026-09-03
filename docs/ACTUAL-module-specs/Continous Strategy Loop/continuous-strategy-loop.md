# Continuous Strategy Loop — mô tả luồng hoạt động

Tài liệu vấn đáp cho **vòng lặp đã build thật**. Đọc file này cùng sơ đồ
[`architecture-c4-level-3-continuous-loop.puml`](architecture-c4-level-3-continuous-loop.puml)
là đủ hiểu vòng lặp chạy thế nào — mọi tên hộp trong sơ đồ đều là tên class/file có thật trong `service/src/modules/strategy-search/`, `backtesting/`, `composite-strategy/`, `strategy-engine/`, `leaderboard/`, `web-platform/src/`.

Sơ đồ liên quan: `artifacts/architecture-c4-level-3.png`, `artifacts/architecture-flow-search-backtest.png` (sequence). Chi tiết sâu hơn: `artifacts/queue.md`, `artifacts/event-catalog.md`, `artifacts/cqrs.md`, `artifacts/cache.md`.

---

## 1. Module này làm gì

Đề bài yêu cầu một vòng đời candidate lặp lại:

**Generate → Backtest → Evaluate → Rank → (Leaderboard) → generate tiếp**

cho tới khi gặp **điều kiện dừng tường minh** — cấm `while(true)`.

Điều đầu tiên phải nói khi vấn đáp: **trong code không có class nào tên `ContinuousLoopModule`**. "Loop" không phải một module, nó là **sự phối hợp của 5 module**, nối với nhau bằng **một job BullMQ** và **một domain event cho mỗi iteration**:

| Vai trò trong vòng lặp | Module thật |
|---|---|
| Sinh candidate, giữ điều kiện dừng, enqueue job | **Strategy Search** |
| Mô phỏng lệnh, tính metric | **Backtesting** |
| Bỏ phiếu tín hiệu có trọng số | **Composite Strategy** + **Strategy Engine** + **Plugin Registry** |
| Materialize bảng xếp hạng Top-K | **Leaderboard** (qua domain event, Search không gọi thẳng) |
| Đẩy việc nặng ra khỏi HTTP | **Queue** (`search`) + **Worker process** |

Mục tiêu là chứng minh kiến trúc **mở rộng được** — đổi generator (Random → Genetic), thêm strategy, thêm worker — chứ không phải tìm chiến lược sinh lời.

---

## 2. Cách đọc sơ đồ

Sơ đồ chia làm 5 vùng. Ranh giới quan trọng nhất là **giữa API Process và Worker Process** — hai tiến trình Node hoàn toàn riêng biệt, chỉ gặp nhau ở Redis.

| Vùng trên sơ đồ | Là gì | Điểm phải nhớ |
|---|---|---|
| **Frontend** | `BacktestPage`, `LeaderboardPage`, `useExperiment` | Chỉ **poll trạng thái**. Không giữ logic dừng |
| **API Process** | `main.ts` | Nhận lệnh, ghi config, **enqueue**, đọc kết quả. **KHÔNG chạy vòng lặp** |
| **Redis** | queue `search` + cache | Vừa là hàng đợi, vừa là **kênh vô hiệu hoá cache xuyên tiến trình** |
| **Worker Process** | `worker.ts` | Nơi vòng lặp **thật sự** chạy, và cũng là nơi domain event được phát |
| **PostgreSQL** | experiments → iterations → candidates → runs → leaderboard | Toàn bộ lịch sử, không ghi đè |

### Từ vựng — đọc bảng này trước, nếu không sẽ hiểu nhầm §4

Ba từ dưới đây rất dễ lẫn, và lẫn một cái là hiểu sai cả vòng lặp:

| Từ | Nghĩa trong hệ thống | Số lượng trong một experiment ví dụ |
|---|---|---|
| **experiment** | một lần người dùng bấm "Chạy" | 1 |
| **iteration** | **một vòng lặp = một lần thử**. Một dòng `experiment_iterations` | tối đa 100 |
| **candidate** | tổ hợp cụ thể được thử ở vòng đó | **1 cho mỗi iteration** (quan hệ 1:1) |
| **candle** | cây nến — thứ backtest duyệt qua bên trong bước 4 | 4300 cho **mỗi** candidate |
| **member** | một strategy trong tổ hợp | 2–4 cho mỗi candidate |

Điểm quan trọng nhất: **iteration = candidate**. Iteration *không phải* thứ gì đó xảy ra bên trong backtest. `maxCandidates` và `iteration_limit` cũng là **cùng một con số** — đó là lý do `extend()` chỉ cần `increaseIterationLimit()`.

Và có **ba vòng lặp lồng nhau**, tài liệu này chỉ đánh số vòng ngoài cùng:

```
VÒNG 1 — candidate  (bước 1→7)      ~100 lần    ← "7 bước" là vòng này
   └── VÒNG 2 — nến (trong bước 4)  ~4300 lần
          └── VÒNG 3 — member       2–4 lần
```

Nên `plugin.analyze()` được gọi khoảng `100 × 4300 × 3` ≈ 1.3 triệu lần trong một experiment. Đó là lý do chi phí của **một** lần gọi lại quan trọng đến thế (xem file AI-Generated Strategy §7).

### Vì sao thanh tiến độ trên UI tăng liên tục

Không có cơ chế chia chunk nào cả. Mỗi vòng lặp ghi thêm **một** dòng `experiment_iterations`, và UI cứ 2 giây đếm lại số dòng đó:

```sql
COUNT(ei.id)                                        AS generated
COUNT(ei.id) FILTER (WHERE ei.status = 'COMPLETED') AS completed
COUNT(ei.id) FILTER (WHERE ei.status = 'RUNNING')   AS running   -- luôn 0 hoặc 1
```

Worker chạy **tuần tự từng candidate một**; UI thì đọc bộ đếm theo chu kỳ. "Chunk" mà người xem cảm thấy chính là số candidate lọt vào khoảng 2 giây giữa hai lần poll — backtest một candidate rất nhanh vì toàn bộ là phép tính trong bộ nhớ (nến đã nạp sẵn ở bước 0, không I/O, không gọi mạng).

Bằng chứng đối chiếu: cột `running` **luôn là 0 hoặc 1**. Nếu có chạy song song thì nó đã là 5 hay 10. (`concurrency: 5` của `SearchProcessor` là 5 **experiment** khác nhau, không phải 5 candidate trong cùng một experiment.)

### Ba chỗ hay bị hiểu sai

Nói trước cho gọn:

- **`start()` không gọi `run()`.** API chỉ ghi DB rồi `queue.add()`, trả 202 ngay. Vòng lặp bắt đầu ở tiến trình khác, muộn hơn.
- **`API → Worker` không tồn tại.** Worker cố ý **không có HTTP nghiệp vụ**. Hợp đồng xuyên tiến trình là Redis, không phải REST.
- **Domain event không xuyên tiến trình.** `EventEmitter2` chỉ sống trong một process. Vì `run()` chạy ở Worker nên listener leaderboard cũng **phải** ở Worker.

---

## 3. Luồng 1 — Bắt đầu một experiment (HTTP, tiến trình API)

**Bước 1 — Trader gửi cấu hình.**

```
POST /strategy-search/experiments   (kèm JWT)   →   202 Accepted
```

`StrategySearchService.start()` làm ba việc, theo đúng thứ tự này:

1. **Validate** request — timeframe, khoảng thời gian, chi phí (fee/slippage), trọng số. Nếu trọng số có `AI:<id>` thì kiểm tra quyền sở hữu tại đây luôn (xem file AI-Generated Strategy §6), sai thì 400 ngay, không để lọt vào job.
2. **Ghi `experiments` + `experiment_configs` + `experiment_config_strategies`** vào Postgres. Config này **bất biến** — đó là điều làm cho kết quả có thể tái lập và giải thích được về sau.
3. **`schedule()` → `SearchQueueService.enqueue(experimentId)`** rồi trả về ngay.

**Bước 2 — Enqueue, với hai chi tiết đáng nói.**

`enqueue()` quét các job đang in-flight theo `experimentId` và **coalesce** — đã có job cho experiment này thì không thêm job thứ hai. Nhưng `jobId` thì **luôn mới** (`{experimentId}-run-{timestamp}`), kèm `attempts: 3` và backoff exponential 10s.

Vì sao không đơn giản đặt `jobId = experimentId` cho khỏi trùng? Đã thử và **loại**: BullMQ no-op `add()` với một `jobId` đã tồn tại, **kể cả jobId của job đã complete**. Nghĩa là `extend()` sau này sẽ im lặng không làm gì cả — một lỗi không có triệu chứng. Chi tiết ở `artifacts/queue.md`.

**Bước 3 — Frontend poll.**

`useExperiment` gọi `GET /experiments/:id` mỗi **2 giây**, dừng ngay khi status là terminal, và có **trần 150 lần (~5 phút)** rồi tự chuyển sang state `timeout`. Không WebSocket cho tiến độ search.

---

## 4. Luồng 2 — Một vòng iteration (tiến trình Worker)

`SearchProcessor` (`@Processor("search")`, `concurrency 5`) nhấc job, mở lại correlation context từ `job.data.correlationId`, rồi gọi `StrategySearchService.run(experimentId)` — **cùng một class** mà API dùng, không có vòng lặp thứ hai được viết riêng cho Worker.

### Bước 0 — Chuẩn bị, một lần cho cả run

Trước khi vào vòng lặp, `run()` làm sẵn những thứ **mọi candidate đều dùng chung**:

- nạp chuỗi nến của experiment (và kiểm tra còn đủ nến không);
- nếu có `AI:<id>`: `AiStrategySignalPrecomputeService.precompute()` — chạy Python một lần trên cả chuỗi;
- nếu có `NEWS_SENTIMENT`: dựng chuỗi sentiment theo nến;
- `buildRunCatalog()` — **loại khỏi run này** mọi strategy precompute thất bại.

Đây là điểm khấu hao chi phí: mọi candidate trong một run chia sẻ cùng chuỗi nến, nên tính trước ở đây rẻ hơn tính lại trong vòng lặp hàng trăm lần.

`loadConfig()` cố tình **đọc DB tươi** ở đây, không dùng cache trong bộ nhớ — vì `extend()` ghi `iteration_limit` mới ở **tiến trình API**, còn `run()` chạy ở **tiến trình Worker**; cache process-local sẽ phục vụ giá trị cũ.

### Bước 1 → 7 — Vòng lặp

```
while (generated < maxCandidates) {
```

**Bước 1 — Kiểm tra điều kiện dừng.** Đây là chỗ thay thế cho `while(true)`. Mỗi vòng kiểm tra lại **năm** điều:

| Điều kiện | `stop_reason` ghi vào DB |
|---|---|
| `isCancelled(experimentId)` | (return luôn, giữ status `CANCELLED`) |
| `Date.now() >= deadline` | `MAX_DURATION` |
| `noImprovement >= maxNoImprovement` | `NO_IMPROVEMENT` |
| `attempts >= max(maxCandidates × 100, 1000)` | `SEARCH_SPACE_EXHAUSTED` |
| hết vòng `while` | `MAX_CANDIDATES` |

`SEARCH_SPACE_EXHAUSTED` chỉ có nghĩa nhờ cơ chế chống trùng ở **bước 3**: candidate trùng `continue` mà không tăng `generated`, nên `attempts` tăng nhanh hơn `generated`. Trong không gian tham số hẹp, generator cuối cùng chỉ bốc lại những tổ hợp đã thử — không có guard này thì vòng lặp sẽ quay vô ích tới `MAX_DURATION`. *(Trước migration 005, `attempts` tăng cùng nhịp `generated` nên nhánh này là code chết — xem `artifacts/architecture.md` §5b.)*

`deadline` tính từ **lúc `run()` này bắt đầu**, không phải từ `experiment.created_at` — nếu tính từ `created_at` thì một experiment được `extend()` lại sau vài ngày sẽ có deadline đã hết hạn sẵn và sinh ra **0 iteration mới** trong im lặng.

**Bước 2 — Generate.** `DomainGuidedRandomGenerator` bắt buộc mỗi candidate có **ít nhất một domain hướng** (`TREND` hoặc `STRUCTURE`) và **ít nhất một domain xác nhận** (`MOMENTUM` hoặc `VOLATILITY`), rồi mới random tham số trong catalog. `CandidateFingerprintService.canonicalize()` chuẩn hoá (sắp xếp member theo type, sắp xếp key của tham số) để `{MA, RSI}` và `{RSI, MA}` được nhận ra là **cùng một tổ hợp**, rồi `.fingerprint()` băm SHA-256 dạng chuẩn đó — chính là khoá mà bước 3 dùng để chặn trùng.

**Bước 3 — Persist, và chặn tổ hợp trùng.**

```sql
INSERT INTO experiment_iterations (..., candidate_fingerprint)
VALUES (..., $2)
ON CONFLICT (experiment_id, candidate_fingerprint) DO NOTHING
RETURNING *
```

Trả về rỗng nghĩa là **experiment này đã thử đúng tổ hợp đó rồi** → `continue`: không tạo candidate, không backtest, không phát event, và quan trọng nhất là **không tăng `generated`**. Chỉ `attempts` tăng.

Ba lý do cho hình dạng này:

- **`ON CONFLICT` chứ không phải `SELECT` rồi `INSERT`.** Một round-trip DB thay vì hai, và không có khe hở giữa lúc kiểm tra và lúc ghi.
- **Ràng buộc đặt trên `experiment_iterations`, không phải `candidates`.** Unique index không trải qua hai bảng được, mà ràng buộc này bắt buộc phải scope theo experiment — cùng tổ hợp chạy trên khoảng nến khác hay chi phí khác là kết quả khác, **phải** được chạy lại. Bảng `experiment_iterations` đã có sẵn `experiment_id`; đặt ở `candidates` thì phải denormalize thêm cột.
- **Đây là điểm sớm nhất có thể từ chối.** Iteration row được tạo trước candidate row, nên conflict ở đây không để lại dòng mồ côi nào phải dọn.

Trọng số **cố ý không nằm trong fingerprint** — nó thuộc về Configuration, không thuộc Candidate (`artifacts/architecture.md` §167). Nhét weight vào sẽ khiến cùng một bộ tham số kỹ thuật ra hai fingerprint khác nhau ở hai experiment khác weight, phá đúng cơ chế đang xây.

Nếu chèn thành công thì tới `candidates` + `candidate_strategies`. Mỗi member trỏ tới **một row `strategies` cụ thể, bất biến** — đó là cách hệ thống đảm bảo "Experiment #122 vẫn gắn với đúng version nó đã chạy".

> **Lịch sử:** cơ chế này có ở bản code cũ, mất khi rewire sang schema Candidate, và được khôi phục ở `005_candidate_fingerprint.sql` (2026-09-03). Hệ quả của giai đoạn thiếu nó: Top-K trong không gian tham số hẹp chứa nhiều candidate giống hệt nhau.

**Bước 4 — Backtest.** `BacktestingService.run(candidate, candles, weights, ...)`. Bên trong, mỗi cây nến:

```
CompositeStrategyService.analyze()
   → với mỗi member: StrategyEngineService.analyze(member, ctx)
        → registry.resolve(type).analyze()      // MA/RSI/BB/SR/News, hoặc AI adapter
   → BUY=+1, SELL=-1, HOLD=0
   → score = Σ(w × signal) / Σw          // luôn ∈ [-1, 1]
   → score > buyThreshold → BUY, < sellThreshold → SELL, còn lại HOLD
```

Rồi mô phỏng phí, slippage, SL/TP, và ghi **một transaction**: `backtest_runs` + `trades` + `evaluations`.

Mẫu số là tổng trọng số của **mọi** member có weight, kể cả member vừa bỏ phiếu HOLD — một phiếu trắng phải kéo điểm về 0 như phiếu trắng thật, chứ không được lặng lẽ biến mất khỏi trung bình.

**Bước 5 — Evaluate.** So `overallScore` với `bestScore`: tốt hơn thì reset `noImprovement = 0`, không thì `+= 1`. Đây chính là thứ nuôi điều kiện dừng `NO_IMPROVEMENT` ở bước 1.

Lưu ý nó chỉ đếm **candidate thật sự mới** — candidate trùng đã bị chặn ở bước 3 và không bao giờ tới đây. Điều này đúng về mặt logic (chạy lại cùng một tổ hợp thì không thể tự phá kỷ lục của chính nó), nhưng nghĩa là search **chạy lâu hơn** trước khi dừng vì `NO_IMPROVEMENT` so với trước migration 005.

**Bước 6 — Ranh giới iteration (chỗ tinh tế nhất).**

```ts
await this.events.emitAsync('backtest.completed' | 'backtest.failed', payload)
```

Ba quyết định nằm gọn trong hai dòng này:

- **Emit nằm NGOÀI try/catch của backtest.** Nếu listener hỏng (rebuild leaderboard gặp lỗi DB tạm thời), nó **không được phép** lật ngược một backtest đã COMPLETED thành FAILED. Bản thân handler `onIterationBoundary` cũng **nuốt lỗi** và chỉ log warn.
- **`await emitAsync`, không phải `emit`.** `emit()` không đợi listener async. Vòng lặp sẽ chạy tiếp và `experiments.finish(COMPLETED)` có thể xong **trước** khi lần rebuild cuối commit — Top-K và cache version lệch nhau. Có test canh đúng việc này.
- **Phát event cả khi iteration FAIL.** Vì rebuild là **ranh giới iteration**, không phải "có điểm mới để xếp hạng". Trước khi tách event, mọi vòng — kể cả vòng lỗi — đều rebuild một lần. Chỉ nghe event thành công sẽ âm thầm làm giảm số lần `INCR` version so với hành vi vốn có; đó là **đổi hành vi**, không phải chỉ đổi kiến trúc.

**Bước 7 — `await setImmediate()`.** Nhường event loop một nhịp giữa các iteration.

### Sau vòng lặp

```
experiments.finish(COMPLETED, stopReason)
```

`stop_reason` được **ghi vào DB**, để UI giải thích được vì sao một run mới chạy 51/100 đã dừng, thay vì chỉ hiện "51/100" trơ trọi.

---

## 5. Luồng 3 — Dừng, huỷ, và chuyện gì xảy ra khi tiến trình chết

**`POST /experiments/:id/cancel`** làm hai việc ở tiến trình API:

1. ghi status `CANCELLED` vào Postgres;
2. `cancelIfQueued()` — gỡ job khỏi Redis **nếu nó chưa được nhấc**.

Job **đang chạy thì không bị kill**. Vòng lặp tự phát hiện `CANCELLED` ở **bước 1** của iteration kế tiếp rồi `return`. Đây là dừng hợp tác, không phải cưỡng bức — đổi lại không có transaction nào bị cắt giữa chừng.

**Kill tiến trình API giữa chừng không dừng vòng lặp.** Job nằm ở Redis, Worker vẫn chạy tới COMPLETED. Đây là điểm nên demo khi vấn đáp — nó chứng minh việc tách tiến trình là thật, không phải trang trí trên sơ đồ.

**Ngược lại, tắt Worker thì không có gì chạy.** API vẫn trả 202 bình thường, job nằm im trong Redis, UI poll mãi ở `RUNNING` cho tới khi chạm trần 150 lần. Không có lỗi nào đỏ lên — cái bẫy hay gặp nhất lúc demo.

**Retry.** `attempts: 3` với backoff. An toàn vì `run()` idempotent: `setRunning()` chặn chạy chồng, số iteration đã sinh được **đếm lại từ DB** chứ không giữ trong bộ nhớ, và rebuild leaderboard là DELETE + INSERT trong một transaction.

---

## 6. Luồng 4 — Đọc kết quả, và bài toán cache hai tiến trình

**Đường ghi (Worker):** `LeaderboardEventsHandler` → `LeaderboardService.rebuildForExperiment()`:

```sql
-- trong 1 transaction
DELETE FROM leaderboard_entries WHERE leaderboard_id = $1;
INSERT INTO leaderboard_entries (...)
  SELECT ..., ROW_NUMBER() OVER (ORDER BY ev.overall_score DESC) AS rank
  FROM experiment_iterations ei
  JOIN candidates c ... JOIN backtest_runs br ... JOIN evaluations ev ...
  WHERE ei.experiment_id = $2 ORDER BY ev.overall_score DESC LIMIT $3;
```

**Đường đọc (API):** `GET /experiments/:id/top` → `getTop()` đọc cache Redis, miss thì `SELECT leaderboard_entries`.

Vấn đề: **ghi ở Worker, đọc ở API — hai tiến trình không chia sẻ bộ nhớ.** Một domain event in-process không thể nào với sang được.

Cách giải: rebuild xong thì Worker `INCR leaderboard:version:{experimentId}` trên **cùng một Redis**. Lần `getTop()` kế tiếp ở API ghép key thành `...:v{n+1}` → **cache miss một cách tự nhiên** → đọc SQL lại. Không cần message hay event riêng giữa hai tiến trình.

Việc `INCR` là best-effort: hỏng thì chỉ khiến lần đọc sau phục vụ dữ liệu cũ thêm tối đa một TTL, chứ không mất bản rebuild đã commit.

---

## 7. Luồng 5 — Kéo dài và sinh lại

**`POST /experiments/:id/extend`** — chỉ hợp lệ khi experiment đang `COMPLETED` (không thì 409). Nó `reopen()`, tăng `iteration_limit` thêm N (1–50, mặc định 10), xoá cache config, rồi `schedule()` lại. Job mới nhấc lên và `run()` chạy tiếp trên **cùng experiment, cùng config bất biến** — vòng lặp nối dài chứ không phải experiment mới.

`generated` được **đếm lại từ DB** (`countByExperimentId`), nên nó chạy từ 101 đến 110 chứ không đụng vào 100 candidate cũ. Và nhờ fingerprint scope theo experiment, 10 candidate mới **được đảm bảo khác** cả 100 cái trước.

Hai biến thì **không** đọc lại từ DB mà reset về mặc định mỗi lần `run()` khởi động: `bestScore = -Infinity` và `noImprovement = 0`. Hệ quả cần biết:

- candidate thứ 101 luôn được tính là "phá kỷ lục", dù điểm có thể thua xa candidate #37;
- bộ đếm `noImprovement` được cấp lại đủ ngân sách từ đầu — đó là lý do một experiment vừa dừng vì `NO_IMPROVEMENT` mà extend vào thì vẫn chạy đủ 10 vòng thay vì dừng ngay.

Không ảnh hưởng kết quả: bảng xếp hạng xếp trên **toàn bộ** 110 candidate bằng SQL `ORDER BY overall_score DESC`, nên một candidate #101 kém vẫn không leo lên được.

**`POST /experiments/:id/regenerate`** là nửa sau của thao tác "Lưu tham số → tạo version mới" trên `ParameterPanel`. Nửa đầu (`StrategyPluginService.saveVersion`) tạo một row `strategies` mới. Nửa sau này sinh lại **chỉ những tổ hợp đang nằm trên Leaderboard** có chứa strategy đó — gom theo tập member, mỗi tổ hợp một candidate mới, seed từ candidate tốt nhất hiện có của tổ hợp ấy. Bị giới hạn trong Top-K nên không thể fan-out thành hàng trăm backtest đồng bộ.

Cascade này cũng đi qua đúng fingerprint của bước 3, làm chặt thêm ràng buộc "idempotent theo tổ hợp": `pluginVersion` nằm trong candidate definition, nên regenerate với version **mới** ra fingerprint mới và chèn được, còn bấm lại lần hai ở cùng bộ version thì bị skip thay vì đẻ thêm bản gần-trùng.

Điểm khác biệt về xử lý lỗi cần nhớ: `candidates.regenerated` là **HTTP đồng bộ**, nên listener của nó **không nuốt lỗi** — người dùng phải nhận 5xx. Ngược hẳn với `onIterationBoundary` chạy nền.

---

## 8. Vì sao thiết kế như vậy

**Vì sao không chạy vòng lặp ngay trong API bằng `setImmediate`?**
Một search có thể hàng trăm iteration: nó sẽ chiếm event loop phục vụ HTTP, chết khi restart API, và không scale nổi 2 instance. Đề bài nhắm tới đường đi hàng chục nghìn candidate. Giải: queue `search` + Worker riêng, **tái dùng chính `run()`** — không viết vòng lặp lần thứ hai.

**Vì sao API không gọi Worker bằng HTTP?**
Worker cố ý không có HTTP nghiệp vụ (nó chỉ có một cổng `:3001` cho `/metrics` và `/health/live`). Hợp đồng xuyên tiến trình là Redis. Trên C4 Level 2 phải vẽ theo hướng dữ liệu: `API → Redis (enqueue)` và `Redis → Worker (jobs)`.

**Vì sao Search không gọi thẳng `LeaderboardService.rebuildForExperiment()`?**
Vì gọi chặt thì không thêm được consumer mới (WebSocket đẩy leaderboard, audit log) mà không phải sửa Search. Search chỉ `await emitAsync` một **sự thật đã xảy ra**; handler sống trong module sở hữu read model.

**Vì sao `WorkerModule` phải import `LeaderboardModule` tường minh?**
Vì event in-process không xuyên tiến trình: `run()` chạy ở Worker nên listener phải tồn tại **ở Worker**. Bỏ import này thì event bắn vào hư vô, leaderboard đứng im — và **không có test nào đỏ**, vì unit test mock emitter. Đây là loại lỗi chỉ kiến trúc mới nhìn ra, đáng nói khi vấn đáp.

**Vì sao generator là Domain-Guided Random chứ không random thuần?**
MVP bắt buộc có ít nhất Random Search. Nhưng random mù sẽ ghép MA với MA, thiếu cặp hướng/xác nhận. Generator ép cấu trúc domain hợp lệ trước, rồi mới random tham số trong catalog. Đổi sang Genetic sau này chỉ cần thay generator — Backtest, Leaderboard, Engine không đụng tới.

---

## 9. Hỏi — đáp khi vấn đáp

**Q: Trọng số nằm ở candidate hay ở config?**
Ở `experiment_config_strategies`, **cố định cả experiment**. Cùng một bộ tham số kỹ thuật không được đổi fingerprint chỉ vì experiment khác trọng số. Composite nhận `weights` như tham số runtime lúc backtest.

**Q: Frontend poll 2 giây có phải infinite loop bị cấm không?**
Không. Cadence cố định, dừng ngay khi status terminal, và có trần 150 lần rồi báo `timeout`. Vòng lặp thật ở Worker cũng có 5 điều kiện dừng. Cấm là `while(true)` không lối thoát, không phải polling có biên.

**Q: Redis vừa queue vừa cache — sao không tách Kafka + Redis riêng?**
Quy mô đồ án: một Redis đủ cho BullMQ + cache-aside Top-K. Kafka đã bị từ chối (`artifacts/decisions.md`). Lưu ý: cache và queue **không dùng chung ioredis client** (một cái `maxRetriesPerRequest: null`, cái kia `enableOfflineQueue: false` để fail nhanh) — chỉ dùng chung *config host/port*.

**Q: Đây có phải CQRS / Event Sourcing không?**
**Tactical CQRS**, trên một Postgres duy nhất. Đường ghi materialize `leaderboard_entries`; đường đọc SELECT + cache. Không tách hai database, không event store. Tính truy vết đến từ việc **không ghi đè** `backtest_runs` / `evaluations`.

**Q: Strategy Engine có `if (MA) ... if (RSI)` không?**
Không. `StrategyEngineService` chỉ `registry.resolve(type).analyze()`. Thêm MACD = viết một plugin mới, không sửa Engine. (Anti-pattern *Hard-coded Strategy*.)

**Q: Strategy có được query database không?**
Không. Plugin chỉ nhận `SignalContext` (chuỗi nến + index hiện tại) và `CandidateMember`. Mọi persistence nằm ở repository / Backtesting module.

**Q: Retry search có tạo candidate trùng hay làm hỏng leaderboard không?**
Không. `run()` idempotent: `setRunning()` chặn chạy chồng, `generated` đếm lại từ DB, rebuild leaderboard là DELETE + INSERT trong một transaction.

**Q: Chọn ít strategy đơn thì số iterations có thấp hơn không?**
Có, nhưng qua đường `NO_IMPROVEMENT` chứ không phải "hết tổ hợp". Ít strategy → generator bốc trúng tổ hợp đã thử liên tục → bước 3 chặn hết → `attempts` leo nhanh trong khi `generated` đứng yên → cuối cùng chạm `SEARCH_SPACE_EXHAUSTED`. Một trường hợp khác: chọn ít tới mức thiếu hẳn nhóm hướng hoặc nhóm xác nhận thì generator ném lỗi **ngay ở bước 0** (`"Search requires a directional and a confirmation domain."`) — experiment không chạy được, chứ không phải chạy ít.

**Q: Vì sao không `SELECT` xem tổ hợp đã tồn tại chưa rồi mới quyết định?**
Vì thêm một round-trip DB vào mỗi vòng lặp mà vẫn còn khe race giữa lúc `SELECT` và lúc `INSERT`. Để database tự chặn bằng unique index thì đúng một round-trip và không có khe hở. Xem bước 3.

**Q: `concurrency: 5` ở `SearchProcessor` nghĩa là gì?**
Một tiến trình Worker chạy tối đa 5 **experiment** song song. Còn "một experiment chỉ có một job tại một thời điểm" là do `SearchQueueService` đảm bảo ở phía producer, không phải ở đây.

---

## 10. Câu chốt khi trình bày

> Vòng lặp là **một job BullMQ** chứa nhiều iteration. Mỗi iteration kết thúc bằng **một domain event**. Bảng xếp hạng là **read model** được dựng lại từ event đó. Frontend chỉ poll trạng thái. Và điều kiện dừng nằm **trong `run()`** — năm điều kiện, kiểm tra mỗi vòng, lý do dừng được ghi lại vào DB — chứ không nằm ở UI.
