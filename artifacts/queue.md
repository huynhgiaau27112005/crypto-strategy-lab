# queue.md — BullMQ/Redis: search & crawl chạy ở tiến trình worker (task-16)

> Tài liệu này mô tả **những gì thực sự được build**, khác với `docs/` (input/tham khảo). Cập nhật cùng lúc với code.

## 1. Vấn đề trước khi có queue

Trước task-16, `StrategySearchService.run(experimentId)` chạy **toàn bộ vòng lặp search** (generate → backtest → rebuild leaderboard, có thể 100+ iteration) ngay trong tiến trình API xử lý HTTP request — `POST /strategy-search/experiments` chỉ trả `202` rồi gọi `setImmediate()` để chạy nền, nhưng vẫn là **cùng 1 process Node** với server HTTP. Tương tự, `POST /news/crawl` dùng `child_process.spawn()` để chạy worker Python, nhưng theo dõi trạng thái job trong **một biến `currentJob` giữ trong bộ nhớ** của tiến trình API.

Hệ quả thật, không phải lý thuyết:

1. Một search dài cạnh tranh event loop với việc xử lý HTTP request khác trên cùng process.
2. Restart API giữa lúc search đang chạy → mất toàn bộ state đang chạy (không có gì "resume" được — vòng lặp `run()` chỉ tồn tại trong 1 lời gọi hàm của process đã chết).
3. Không scale ngang được: chạy 2 instance API sẽ double-run cùng một job, hoặc process A giữ state mà process B (nhận HTTP request tiếp theo từ client) không biết gì về nó.

## 2. Giải pháp: BullMQ + Redis, tách API (enqueue) khỏi Worker (execute)

```
API (service/src/main.ts)          Worker (service/src/worker.ts)
  NestFactory.create()               NestFactory.createApplicationContext()
  có HTTP server                     KHÔNG có HTTP server
  chỉ .add() job lên queue            có @Processor() → BullMQ Worker thật,
  không bao giờ chạy run()/execute()  gọi thẳng StrategySearchService.run()
                                       và NewsCrawlService.execute()
         \                                    /
          \                                  /
           v                                v
         ┌─────────────── Redis ───────────────┐
         │  queue "search"                     │
         │  queue "news-crawl"                 │
         └──────────────────────────────────────┘
```

**Nguyên tắc cốt lõi — tái dùng logic, không fork:** `SearchProcessor.process()` gọi thẳng `StrategySearchService.run(experimentId)` — **đúng method đã có, đã test**, không viết lại vòng lặp search lần thứ hai. Tương tự `NewsCrawlProcessor.process()` gọi `NewsCrawlService.execute()` — phần "spawn process Python + đợi kết quả" giữ nguyên logic cũ (timeout, cắt stderr 8000 ký tự, kill SIGKILL khi quá hạn), chỉ đổi từ callback-đăng-ký-vào-biến-`currentJob` sang một `Promise` mà BullMQ tự quản lý vòng đời.

## 3. Vì sao WorkerModule import CÙNG module với AppModule, không phải module riêng

`service/src/worker.module.ts` import `StrategySearchModule` và `NewsModule` — **y hệt** những gì `AppModule` import. Không có `StrategySearchModule` phiên bản 2 cho worker. Khác biệt duy nhất: `WorkerModule` khai báo thêm `SearchProcessor` và `NewsCrawlProcessor` làm provider.

Đây là điểm kỹ thuật quan trọng của `@nestjs/bullmq`: một class có decorator `@Processor(queueName)` (kế thừa `WorkerHost`) **chỉ thực sự khởi động một BullMQ `Worker` (kết nối Redis, kéo job) khi nó được instantiate như một provider trong module graph của ứng dụng đang chạy**. `StrategySearchModule`/`NewsModule` (dùng chung) không khai báo 2 class này trong `providers` của chính nó — chúng chỉ được khai báo trong `WorkerModule`. Vì vậy:

- Chạy `node dist/main.js` (AppModule) → có HTTP server, có `SearchQueueService`/`NewsCrawlQueueService` (chỉ gọi `.add()`), **không có** `SearchProcessor`/`NewsCrawlProcessor` → không kéo job, không chạy `run()`.
- Chạy `node dist/worker.js` (WorkerModule) → không có HTTP server, có `SearchProcessor`/`NewsCrawlProcessor` → BullMQ Worker thật khởi động, kéo job từ Redis, gọi vào `StrategySearchService.run()`/`NewsCrawlService.execute()`.

Đây chính là "điểm kiến trúc" mà task-16 yêu cầu chứng minh: API enqueue, Worker execute, cùng một class nghiệp vụ, không phải 2 bản sao.

## 4. Hai queue, payload chỉ chứa định danh

| Queue | Job data | Ai add() | Ai process() |
|---|---|---|---|
| `search` | `{ experimentId: string }` | `SearchQueueService` (`strategy-search/services/search-queue.service.ts`) | `SearchProcessor` (`strategy-search/search.processor.ts`) |
| `news-crawl` | `{}` (không cần tham số — worker Python tự biết crawl gì) | `NewsCrawlQueueService` (`news/crawl/news-crawl-queue.service.ts`) | `NewsCrawlProcessor` (`news/crawl/news-crawl.processor.ts`) |

Payload **không** bao giờ chứa candle data, kết quả backtest, hay secret — chỉ định danh + tham số nhỏ, đúng yêu cầu "never large data blobs and never secrets" của task-16. Toàn bộ dữ liệu thật (nến, candidate, trade) vẫn đọc/ghi qua Postgres bên trong `run()`, y hệt trước đây.

## 5. Concurrency — "một search/experiment, một crawl toàn cục"

### 5.1. Vì sao KHÔNG dùng `jobId = experimentId` cố định

Cách trực giác nhất để "một job cho mỗi experiment" là đặt `jobId = experimentId`, dựa vào việc BullMQ từ chối thêm job trùng id. Cách này **đã được thử và loại bỏ** sau khi verify thực tế với Redis của project (script tạm, chạy trực tiếp qua `bullmq` — không phải suy đoán từ tài liệu):

```
queue.add('run', {...}, { jobId: 'exp-y' })   // job chạy, complete
// ... job 'exp-y' đã completed ...
queue.add('run', {...}, { jobId: 'exp-y' })   // lần add thứ 2, SAU KHI job đầu đã complete
```

Kết quả đo được: lần `add()` thứ hai **không** ném lỗi, **cũng không** chạy lại — nó âm thầm trả về đúng job đã hoàn tất trước đó mà `process()` không được gọi lần nữa. Nếu dùng cách này cho `extend()` (chạy thêm N iteration sau khi experiment đã `COMPLETED`), job sẽ không bao giờ chạy lại — `extend()` sẽ luôn no-op mà không báo lỗi. Đây là loại bug im lặng nguy hiểm nhất.

### 5.2. Cách đang dùng: quét job đang in-flight rồi coalesce, jobId luôn mới

`SearchQueueService.enqueue(experimentId)`:
1. Gọi `queue.getJobs(['active','waiting','delayed','waiting-children','prioritized'])`, lọc theo `job.data.experimentId === experimentId`.
2. Nếu đã có → **không add gì cả** (coalesce) — đã có đúng 1 job đang chờ/chạy cho experiment này.
3. Nếu chưa có → `add()` với `jobId = \`${experimentId}-run-${Date.now()}\`` (một id **luôn mới**, tránh chính xác cái bẫy ở mục 5.1). Verify thực tế: khi một jobId đang `active`, `add()` lần 2 với cùng jobId đó **không** trigger `process()` lần thứ hai (chỉ 1 lần gọi đo được) — nên bước 1+2 ở trên đã đủ chặn double-run cho trường hợp còn đang chạy; bước 3 dùng id mới chỉ để đảm bảo lần chạy **kế tiếp** (sau khi job trước đã complete, ví dụ `extend()`) chắc chắn thực thi.

(`:` bị BullMQ cấm dùng trong jobId tuỳ chỉnh — dùng `-` làm dấu phân cách, đã sửa sau khi gặp lỗi `Custom Id cannot contain :` lúc verify sống với Redis thật.)

`NewsCrawlQueueService.trigger()` dùng đúng pattern quét-rồi-coalesce này cho queue `news-crawl` (không có `experimentId` để lọc — chỉ cần "có job nào đang in-flight hay không", vì crawl không có tham số phân biệt theo request).

### 5.3. Concurrency ở tầng Worker

- `SearchProcessor`: `@Processor(SEARCH_QUEUE, { concurrency: 5 })` — 1 worker process chạy tối đa 5 experiment song song (khác experiment, không phải khác lần chạy của cùng 1 experiment — điều đó đã bị chặn ở tầng producer, mục 5.2).
- `NewsCrawlProcessor`: `@Processor(NEWS_CRAWL_QUEUE, { concurrency: 1 })` — chốt chặn cuối cùng ở tầng worker cho "một crawl toàn cục", phòng trường hợp 2 API instance race `trigger()` gần như đồng thời trước khi job nào kịp ghi vào Redis.

## 6. Retry & thất bại

### 6.1. Search: `attempts: 3`, backoff exponential 10s

An toàn để retry vì `StrategySearchService.run()` đã **tự idempotent theo thiết kế cũ** (không phải thêm mới cho task-16): dòng đầu tiên của `run()` gọi `experiments.setRunning(experimentId)`, chỉ trả `true` khi experiment đang ở `PENDING`/`RUNNING`. Một lần retry của cùng job (job chết giữa chừng, ví dụ worker process bị kill) sẽ gọi lại `run()`; nếu lần chạy trước đã kịp đưa experiment sang `FAILED`/`COMPLETED`/`CANCELLED`, `setRunning()` trả `false` và `run()` return ngay — **không chạy lại vòng lặp, không tạo candidate trùng.** Nếu lần trước chết trước khi kịp update status (vẫn còn `RUNNING`), retry sẽ tiếp tục đúng vòng lặp — `generated = countByExperimentId()` đọc lại từ DB nên không đếm lại từ 0.

Nếu cả 3 lần thử đều thất bại (lỗi thật trong logic, không phải do worker chết), `run()`'s catch block (không đổi so với trước task-16) gọi `experiments.finish(experimentId, 'FAILED')` — **experiment không bao giờ bị bỏ lại ở `RUNNING` khi không còn job nào chạy nó nữa.** Đây là yêu cầu bắt buộc của task-16 ("A failed search must mark the experiment FAILED... job that dies silently while DB still says RUNNING is the worst outcome").

### 6.2. Crawl: `attempts: 1`, không backoff

Cố ý **không** retry. `NewsCrawlService.execute()` không idempotent theo cùng nghĩa — chạy lại ngay sau một lần fail có nguy cơ crawl trùng cùng cửa sổ RSS/HTML, tạo dữ liệu trùng hoặc tốn tài nguyên vô ích cho một lỗi có thể chỉ là mất mạng thoáng qua. `POST /news/crawl` gọi lại thủ công (con người quyết định retry) đơn giản và an toàn hơn một retry tự động mù.

## 7. Cancellation

`POST /strategy-search/experiments/:id/cancel` giữ nguyên **cơ chế polling qua DB** đã có từ trước task-16 — không đổi: `run()`'s vòng lặp `while` gọi `experiments.isCancelled(experimentId)` trước mỗi iteration (đọc lại `status` từ Postgres). task-16 chỉ thêm một bước:

`StrategySearchService.cancel()` sau khi `experiments.cancel()` thành công (UPDATE `status = 'CANCELLED'`), gọi thêm `SearchQueueService.cancelIfQueued(experimentId)`:
- Nếu job vẫn `waiting`/`delayed` (chưa có worker nào nhận) → `job.remove()` — huỷ có hiệu lực **ngay lập tức**, không tốn một lượt job chạy vào rồi tự thoát ở vòng lặp đầu tiên.
- Nếu job đã `active` (đang chạy trong worker) → **không đụng vào job** — để `run()`'s vòng lặp tự phát hiện `CANCELLED` ở lần kiểm tra tiếp theo (độ trễ tối đa 1 iteration, thường vài trăm ms tới vài giây tuỳ tốc độ backtest).

Không dùng cơ chế "kill job đang active" của BullMQ (`job.moveToFailed`, gửi signal qua Worker) vì vòng lặp tự-kiểm-tra-DB đã đủ, đơn giản hơn, và giữ nguyên hành vi cancel đã có/đã test từ trước.

## 8. Graceful shutdown

`worker.ts` gọi `app.enableShutdownHooks()` sau khi `NestFactory.createApplicationContext()`. `@nestjs/bullmq`'s `BullExplorer` đăng ký `onApplicationShutdown` — hook này chỉ được Nest gọi khi có `enableShutdownHooks()` — để đóng mọi `Worker` đã tạo. `Worker.close()` (bên trong BullMQ) đợi job đang active hoàn tất (hoặc nhả lại queue nếu không kịp) trước khi tiến trình thoát, thay vì bỏ lại job khoá vĩnh viễn trên Redis khi nhận `SIGTERM`.

## 9. Startup independence — API sống được khi Redis chết

`QueueModule` (`service/src/queue/queue.module.ts`) cấu hình kết nối Redis qua `ioredis` với `maxRetriesPerRequest: null` (bắt buộc theo tài liệu BullMQ cho `Worker`) và để mặc định `enableOfflineQueue: true` — `ioredis` tự đệm lệnh trong bộ nhớ và liên tục thử kết nối lại thay vì ném lỗi ngay khi `new Pool`/`new Redis()` được gọi. Vì vậy `NestFactory.create(AppModule)` không bao giờ throw chỉ vì Redis đang down lúc khởi động.

**Đánh đổi cần biết:** `maxRetriesPerRequest: null` cũng có nghĩa một lệnh Redis phát ra trong lúc mất kết nối sẽ **không tự reject** — nó chờ trong hàng đợi offline của `ioredis` cho tới khi kết nối lại được. Nếu để nguyên, một request HTTP gọi `SearchQueueService.enqueue()` lúc Redis down sẽ **treo vô thời hạn** thay vì trả lỗi nhanh — đúng thứ cần tránh. Khắc phục bằng `service/src/queue/with-timeout.ts`: mọi lệnh chạm tới queue từ phía API (enqueue, cancelIfQueued, trigger, getStatus, health snapshot) được race với timeout (1.5–2s); hết hạn → coi như lỗi/degraded thay vì treo request.

`GET /queue/health` áp dụng đúng cơ chế này — xem `artifacts/api-contract.md` mục 2b — để trạng thái "Redis down, API vẫn sống" quan sát được từ bên ngoài thay vì chỉ là một khẳng định trong tài liệu.

## 10. Chạy worker

```bash
# dev (ts-node, watch)
cd service && npm run start:worker:dev

# hoặc không watch
npm run start:worker

# production (sau `npm run build`)
npm run start:worker:prod   # = node dist/worker.js
```

`docker-compose.yml` (root) có service `worker` — cùng image Docker với `api` (build từ `service/Dockerfile`), chỉ khác `command: ["node", "dist/worker.js"]` — nên hai tiến trình không bao giờ lệch phiên bản dependency với nhau.

## 11. Đã verify sống (không chỉ chạy `npm test`)

1. `cd service && npx tsc --noEmit && npm test` — xanh, không cần Redis chạy thật (mọi test dùng `Queue`/`Job` giả lập qua `jest.fn()`).
2. Chạy `node dist/main.js` (API) và `node dist/worker.js` (Worker) làm 2 tiến trình riêng, trỏ cùng Redis (`crypto-strategy-lab-redis`, cổng `6381`). Gọi `POST /strategy-search/experiments` thật qua HTTP → log "Starting search job..." / "Search ... stopped: ..." chỉ xuất hiện trong log tiến trình **Worker**, log tiến trình API không có dòng nào nhắc tới search/iteration.
3. Bắt đầu một search lớn (`maxCandidates: 10000`), **kill tiến trình API ngay sau khi request `POST` trả về** (cùng giây, trước khi search kịp chạy xong), xác nhận `curl` tới API bị connection-refused trong lúc đó — rồi query trực tiếp Postgres: experiment vẫn tiếp tục chạy và đạt `status = 'COMPLETED'` dù API đang chết. Khởi động lại API, `GET /strategy-search/experiments/:id` đọc lại đúng `COMPLETED` từ DB — không cần bất kỳ hành động "resume" thủ công nào, vì việc thực thi chưa bao giờ phụ thuộc vào tiến trình API còn sống.
4. `GET .../top` sau bước 3 trả về leaderboard có `number_of_trades > 0` thật (không phải toàn 0).
5. `POST /news/crawl` → `GET /news/crawl/status` chuyển đúng `RUNNING` → `COMPLETED` (worker Python thật chạy xong, `exitCode: 0`).
6. `POST /strategy-search/experiments/:id/cancel` giữa lúc đang chạy → vòng lặp dừng sau đúng 1 iteration, `status = 'CANCELLED'`.

Chi tiết log/response đầy đủ của các bước trên nằm trong report `.superpowers/sdd/2026-08-24-full-stack-completion/task-16-report.md`.
