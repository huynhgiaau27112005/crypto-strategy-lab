# observability.md — Logging, correlation, metrics, health (task-18)

> Tài liệu này mô tả **những gì thực sự được build**, khác với `docs/` (input/tham khảo). Cập nhật cùng lúc với code.

## 1. Vì sao "structured logging" thay vì để nguyên `Logger` mặc định

Trước task-18: mọi nơi trong code dùng `new Logger(X.name)` của Nest, in ra dòng text tự do, không field cố định, không có cách nào nối 1 request HTTP với các dòng log nó gây ra ở process khác (worker). Với 1 hệ thống có 2 process (API + worker, xem `queue.md`) liên lạc qua Redis, đây là điểm yếu quan sát lớn nhất — đúng thứ task-18 yêu cầu giải quyết trước tiên.

**Quyết định kiến trúc chính**: không viết `logger.log(...)` mới ở từng call site. Thay vào đó, đăng ký **một `StructuredLogger` duy nhất** làm logger toàn cục qua `app.useLogger(app.get(StructuredLogger))` (cả `main.ts` lẫn `worker.ts`). NestJS's `Logger` class (dùng bởi MỌI `new Logger(SomeClass.name)` có sẵn trong code) tự động **forward** vào logger đã đăng ký bằng `useLogger()` — nghĩa là ~40 file đang gọi `this.logger.log(...)` không cần sửa 1 dòng nào để trở thành structured JSON.

### 1.1. Format

`service/src/observability/logging/structured-logger.service.ts`:

- Mỗi dòng log là 1 JSON object: `{ timestamp, level, context, message, correlationId?, ...extra }`.
- `LOG_FORMAT=json` → in JSON 1 dòng/log (dùng ở production/CI). `LOG_FORMAT=pretty` (hoặc không set, ngoài `NODE_ENV=production`) → in dạng người đọc được: `2026-08-25T08:04:15Z INFO  [Context] cid=... message {...extra}`.
- Ví dụ log thật (chạy `LOG_FORMAT=json` mặc định lúc dev là `pretty`, xem mục 5 để có ví dụ JSON thật lấy từ log sống):
  ```
  2026-08-25T08:04:54.949Z INFO  [HTTP] cid=demo-trace-0001 POST /strategy-search/experiments 202 36.3ms {"method":"POST","route":"/strategy-search/experiments","status":202,"durationMs":36}
  ```

### 1.2. Redaction — bắt buộc, chạy tập trung ở 1 nơi

`service/src/observability/logging/redact.ts` là nơi DUY NHẤT quyết định field nào bị che. `StructuredLogger.write()` gọi `redact()` trên **mọi** `meta`/`message` dạng object trước khi serialize — 1 call site không thể "quên" redact vì không có đường nào ghi log bỏ qua bước này.

Hai chiến lược, vì secret lộ theo 2 cách khác nhau trong thực tế:

1. **Theo tên field** (case/underscore-insensitive): `authorization`, `password`, `token`, `jwt`, `apiKey`, `secret`, `cookie`, `refreshToken`, `accessToken`, ... — khớp cả `Authorization`, `AUTHORIZATION_HEADER`, `openai_api_key`, `BINANCE_API_SECRET`. Toàn bộ giá trị bị thay bằng `"[REDACTED]"` (kể cả object lồng bên trong — không đệ quy vào giá trị của 1 field đã nhạy cảm).
2. **Theo pattern trong chuỗi**: `Bearer <token>` và chuỗi hình dạng JWT (3 đoạn base64url phân cách bởi `.`) bị thay thế **dù không nằm dưới field tên nhạy cảm** — bắt trường hợp ai đó nối token thẳng vào 1 message string thay vì field có cấu trúc.

**Test buộc fail nếu có leak** (`redact.spec.ts`, `structured-logger.service.spec.ts`): dựng 1 object mang token thật giả lập (`Bearer eyJ...`), chạy qua `redact()`/`StructuredLogger`, `expect(...).not.toContain(secretToken)`. `structured-logger.service.spec.ts` còn spy thẳng `console.log` để đảm bảo **dòng log cuối cùng ghi ra** không chứa token, không chỉ object trung gian.

**Verify sống** (mục 5.5): gửi request thật với header `Authorization: Bearer <fake-secret>`, `grep` toàn bộ log file của cả API lẫn worker — 0 kết quả khớp chuỗi secret.

`service/.env` (API key LLM thật) **không bao giờ được đọc/in ra** trong suốt quá trình build task này — chỉ tra tên biến (`OPENAI_API_KEY`, `BINANCE_API_KEY`, `BINANCE_API_SECRET`) qua `grep` trên code, không `cat` file `.env`.

## 2. Correlation id — xuyên qua ranh giới process (phần kiến trúc quan trọng nhất)

### 2.1. Vấn đề

`POST /strategy-search/experiments` chạy trong **process API** — nó chỉ enqueue 1 job (`SearchQueueService.enqueue()`, xem `queue.md`) rồi trả `202` ngay. Việc thật sự chạy search (`StrategySearchService.run()`) xảy ra trong **process worker**, sau khi kéo job đó ra khỏi Redis — độc lập hoàn toàn về bộ nhớ với process API. Không có correlation id, log của 1 lần search bị chẻ làm 2 nửa không thể nối lại: nửa "ai gọi, khi nào" (API) và nửa "chuyện gì thật sự xảy ra" (worker).

### 2.2. Giải pháp

`service/src/observability/correlation/correlation-context.ts` — 1 `AsyncLocalStorage<{correlationId}>` module-level, với 2 hàm `runWithCorrelationId()` / `getCorrelationId()`. Không service nào nhận `correlationId` qua constructor hay tham số hàm — nó "trôi nổi" theo async context, `StructuredLogger` tự đọc nó ở mỗi lần ghi log.

**Ở process API** (`observability.middleware.ts`, áp dụng global qua `AppModule.configure()`):
1. Đọc header `X-Request-Id` gửi lên; nếu không có, sinh mới bằng `crypto.randomUUID()`.
2. Set lại `X-Request-Id` trên response (client luôn biết id để tự tra log nếu cần).
3. Chạy toàn bộ phần còn lại của request (`next()`) bên trong `runWithCorrelationId(id, ...)` — mọi log line trong suốt vòng đời request (kể cả sau khi `await` nhiều lớp service) tự động mang đúng id này.

**Vượt ranh giới process — điểm mấu chốt của task-18**: `SearchQueueService.enqueue()` gọi `getCorrelationId()` (đọc đúng id của request HTTP đang xử lý nó) và ghi thẳng vào **payload của BullMQ job** (`SearchJobData.correlationId`) trước khi `queue.add()`. Payload này đi qua Redis dưới dạng dữ liệu JSON bình thường — không có cơ chế đặc biệt nào của BullMQ, chỉ là 1 field thêm vào job data.

**Ở process worker** (`search.processor.ts`): `SearchProcessor.process(job)` đọc `job.data.correlationId` — chính cái id đã lưu ở trên — và bọc toàn bộ `StrategySearchService.run()` bên trong `runWithCorrelationId(job.data.correlationId, ...)`. Từ đây, mọi dòng log trong worker (kể cả các service sâu bên trong `run()` không hề biết observability tồn tại) tự động mang lại đúng id đó.

**Kết quả**: cùng 1 `correlationId` xuất hiện trong log của 2 process Node độc lập, nối bởi Redis — chứng minh sống ở mục 5.

Áp dụng tương tự cho `news-crawl` queue (`NewsCrawlQueueService` → `NewsCrawlProcessor`) — cùng pattern, không lặp code (cả 2 dùng chung `correlation-context.ts`).

### 2.3. Vì sao AsyncLocalStorage, không phải Nest REQUEST scope

Nest hỗ trợ `Scope.REQUEST` để có 1 instance provider mới mỗi request, nhưng: (1) chỉ hoạt động trong process HTTP — không giúp gì cho worker (nơi không có "request" Nest nào cả, chỉ có 1 lệnh gọi hàm từ `@Processor()`); (2) request-scoped provider lan truyền tính request-scoped lên MỌI provider phụ thuộc nó (toàn bộ cây DI bị "nhiễm" scope), làm chậm và phức tạp hoá toàn bộ app chỉ để mang 1 string. `AsyncLocalStorage` hoạt động y hệt trong cả HTTP request context lẫn 1 lời gọi hàm bất kỳ (`runWithCorrelationId()` chỉ là 1 hàm thường), nên dùng được cho cả 2 process bằng cùng 1 cơ chế.

## 3. Metrics — catalogue và lý do chọn loại

`service/src/observability/metrics/metrics.service.ts` là nơi duy nhất định nghĩa mọi Counter/Histogram/Gauge (dễ review 1 file để chắc không có label cardinality cao thay vì rải rác khắp code).

| Metric | Loại | Label | Vì sao loại này |
|---|---|---|---|
| `http_requests_total` | Counter | `method`, `route`, `status` | Đếm cộng dồn, không bao giờ giảm — đúng bản chất Counter. `route` là **template** (`/strategy-search/experiments/:id`), không phải URL đã resolve — path chứa UUID sẽ làm nổ số series nếu dùng URL thật. |
| `http_request_duration_seconds` | Histogram | như trên | Cần phân phối (p50/p95/p99), không chỉ trung bình — Counter/Gauge không cho việc đó. |
| `search_jobs_enqueued_total` / `_completed_total` / `_failed_total` | Counter | (không label) | 3 counter tách riêng thay vì 1 counter + label `outcome`: enqueue chạy ở API, completed/failed chạy ở worker — 2 Registry khác nhau (xem mục 3.1), gộp label không có lợi gì vì không bao giờ cùng xuất hiện trên 1 lần scrape. |
| `search_duration_seconds` | Histogram | (không label) | Thời lượng `StrategySearchService.run()` — 1 job có thể chạy vài giây tới vài chục phút (`maxDurationSeconds`), cần buckets rộng (1s → 1800s). |
| `candidates_generated_total`, `backtests_run_total` | Counter | (không label) | Đúng bản chất "đếm sự kiện đã xảy ra", chạy trong worker. |
| `cache_hits_total` / `cache_misses_total` | Counter | `namespace` | `namespace` = phần key trước dấu `:` đầu tiên (`market-data`, `leaderboard`, `strategy-search`) — tập hợp cố định nhỏ do chính call site quyết định qua format key, KHÔNG phải raw key (sẽ chứa id → cardinality không chặn được). |
| `queue_depth` | Gauge | `queue`, `state` | Độ sâu queue là **mức tại 1 thời điểm** (có thể tăng/giảm), đúng ngữ nghĩa Gauge — được set lại (không phải increment) mỗi lần `/metrics` bị scrape, đọc trực tiếp từ `queue.getJobCounts()` (dữ liệu Redis thật, cùng cơ chế `QueueHealthService` đã dùng cho `/queue/health`). |
| `binance_requests_total` | Counter | `endpoint`, `outcome` | `endpoint` chỉ có 1 giá trị hiện tại (`GET /api/v3/klines`) nhưng đặt label sẵn cho khi thêm endpoint khác (order book, ticker...) — vẫn tập hợp nhỏ cố định do code quyết định, không phải input người dùng. |
| `binance_request_duration_seconds` | Histogram | `endpoint` | Đo được cả latency bình thường lẫn khi Binance chậm/rate-limit. |
| Process default metrics (`process_cpu_*`, `nodejs_*`, ...) | — | — | `collectDefaultMetrics()` của `prom-client`, không tự viết lại. |

### 3.1. Vì sao worker có `/metrics` HTTP riêng, không chỉ dùng của API

Phần lớn metric "thú vị" nhất (search completed/failed, duration, candidates, backtests) **được tạo ra trong process worker**, không phải API. Worker theo thiết kế task-16 là 1 Nest **application context**, không có HTTP server (`worker.ts`, comment gốc "no app.listen()") — cố tình để worker không nhận traffic business logic.

**Quyết định**: giữ nguyên việc đó (không biến worker thành 1 app Nest HTTP thứ 2), nhưng thêm 1 HTTP listener **thuần `node:http`** rất nhỏ (`service/src/observability/worker-metrics-server.ts`) chỉ phục vụ đúng 2 route: `GET /metrics`, `GET /health/live` — dùng lại nguyên `MetricsService`/`HealthService` lấy từ chính application context đó (`app.get(...)`), không viết logic riêng. Mặc định cổng `3001`, đổi được qua `WORKER_METRICS_PORT`.

**Đồng thời** vẫn giữ cách 2 đã có sẵn từ task-16: `GET /queue/health` (process API) đã báo `workers: N` — số BullMQ Worker client đang kết nối, đọc trực tiếp từ Redis (`queue.getWorkers()`). Đây là **liveness gián tiếp qua Redis** — nếu số này về 0, worker đã chết dù chưa ai gọi `/health/live` của nó trực tiếp.

→ Quyết định cuối: **cả 2** — cả HTTP `/health/live` riêng của worker LẪN liveness gián tiếp qua Redis (`/queue/health`). Không chọn 1 trong 2 vì mỗi cái phủ 1 trường hợp khác nhau: HTTP riêng cho việc probe trực tiếp (đúng kiểu Kubernetes liveness probe cắm thẳng vào container worker), gián tiếp qua Redis cho việc "process API muốn tự biết worker có đang sống không mà không cần network riêng tới container worker".

### 3.2. `/metrics` public hay guarded — quyết định + lý do

**Public (không auth)**, đặt cùng nguyên tắc với `/queue/health`, `/strategy-search/health` đã có sẵn trong code trước task-18 (comment gốc: "Unauthenticated on purpose ... operational status, not user data"). Lý do:

- Nội dung `/metrics` là số đếm/độ trễ/tên route — không có PII, không có dữ liệu nghiệp vụ (không leaderboard, không candidate, không user data).
- Prometheus tự nó cần scrape endpoint không cần auth phức tạp (basic auth/mTLS thêm được, nhưng tăng độ phức tạp không cần thiết cho phạm vi đồ án).
- **Đánh đổi được thừa nhận rõ ràng**: `/metrics` LÀ rò rỉ cấu trúc nội bộ (route list, tên 3 queue, tên 2 dependency `postgres`/`redis`) cho bất kỳ ai gọi được API. Trong 1 triển khai thật có ingress công khai, cách đúng để giải quyết là **giới hạn ở tầng mạng** (reverse proxy/firewall chỉ cho phép IP của Prometheus scraper gọi `/metrics`), không phải thêm JWT guard vào chính route đó — vì Prometheus scrape không mang theo access token của user. Trong phạm vi đồ án (API chỉ chạy trong docker-compose network / localhost lúc chấm), không áp thêm gì.

## 4. Liveness vs readiness

`service/src/observability/health/health.controller.ts` + `health.service.ts`.

| | `GET /health/live` | `GET /health/ready` |
|---|---|---|
| Kiểm tra gì | Không gì cả bên ngoài — chỉ chứng minh event loop còn phản hồi (`process.uptime()`) | Postgres (`DatabaseService.isHealthy()`) VÀ Redis (`CacheService.ping()`), song song, timeout 1.5s mỗi cái (dùng lại `withTimeout()` đã có từ task-16) |
| Khi nào fail | Gần như không bao giờ (process đơ/deadlock thật sự) | Bất kỳ dependency nào lỗi/timeout |
| Mục đích | "Có nên **kill và khởi động lại** process này không?" | "Có nên **định tuyến traffic** tới instance này không?" |
| Redis down ảnh hưởng? | Không | **Có — trả 503** |

**Vì sao liveness không được phép fail vì Redis/Postgres down**: 1 outage dependency là vấn đề **của dependency đó**, khởi động lại process API không sửa được gì — chỉ tạo thêm 1 cửa sổ downtime do restart (mất connection pool, cold start) chồng lên downtime có sẵn. Đây đúng là cái mà tài liệu Kubernetes gọi là "liveness probe cascading failure": 1 Redis chập chờn khiến toàn bộ fleet API bị restart vòng lặp trong khi bản thân API instance hoàn toàn khoẻ mạnh.

**Vì sao readiness coi CẢ Postgres LẪN Redis là hard dependency**: hầu hết mọi read path chạm Postgres; Redis đứng sau cả response cache (`market-data`, `leaderboard`) lẫn 2 BullMQ queue (`search`, `news-crawl`) mà các write path (`POST /strategy-search/experiments`, `POST /news/crawl`) phụ thuộc để hoạt động đúng nghĩa (không phải chỉ "chậm hơn" mà là "job không chạy được nếu Redis chết hẳn"). 1 instance không tới được 1 trong 2 thì không đủ khả năng phục vụ sản phẩm đúng nghĩa — nên bị rút khỏi rotation cho tới khi phục hồi.

**Verify sống** (mục 5.4): `docker stop crypto-strategy-lab-redis` → `/health/ready` trả `503` với `checks.redis.status = "error"`, `/health/live` vẫn `200`; `docker start crypto-strategy-lab-redis` → `/health/ready` trở lại `200` trong vài giây (không cần restart process API).

## 5. Verify sống — bằng chứng thật, không chỉ khẳng định

Môi trường: Postgres (cổng 6543, đã seed ~5274 nến `BTCUSDT 5m` + các timeframe khác từ trước), Redis (cổng 6381, container `crypto-strategy-lab-redis`), API + worker chạy `nest start --watch` (`start:dev` / `start:worker:dev`).

### 5.1. `npx tsc --noEmit && npm test`

```
Test Suites: 40 passed, 40 total
Tests:       230 passed, 230 total
```
(baseline trước task-18: 37 suites / 209 tests — 3 suite mới: `redact.spec.ts`, `structured-logger.service.spec.ts`, `health.service.spec.ts`, cộng thêm test case mới trong `cache.service.spec.ts`/`search-queue.service.spec.ts`; không suite nào cần Redis/network thật — toàn bộ dùng mock.)

### 5.2. Cross-process correlation — bằng chứng chính

```
curl -X POST http://localhost:3000/strategy-search/experiments \
  -H 'Authorization: Bearer <token>' \
  -H 'X-Request-Id: demo-trace-0001' \
  -d '{"timeframe":"1h","startTime":"2026-06-02T01:00:00.000Z","endTime":"2026-08-24T14:00:00.000Z","maxCandidates":5,"maxDurationSeconds":60}'
→ {"experimentId":"c3a70424-f8b8-4c08-8d77-96bb7bf5f79d","status":"PENDING"}
```

**Log process API** (`grep demo-trace-0001` trên log của `main.ts`):
```
2026-08-25T08:04:54.949Z INFO  [HTTP] cid=demo-trace-0001 POST /strategy-search/experiments 202 36.3ms {"method":"POST","route":"/strategy-search/experiments","status":202,"durationMs":36}
```

**Log process worker** (`grep demo-trace-0001` trên log của `worker.ts` — process Node hoàn toàn khác, chỉ nối qua Redis):
```
2026-08-25T08:04:54.951Z INFO  [SearchProcessor] cid=demo-trace-0001 [worker] Starting search job c3a70424-f8b8-4c08-8d77-96bb7bf5f79d-run-1787645094946 (attempt 1) for experiment c3a70424-f8b8-4c08-8d77-96bb7bf5f79d
2026-08-25T08:04:55.191Z INFO  [StrategySearchService] cid=demo-trace-0001 Search c3a70424-f8b8-4c08-8d77-96bb7bf5f79d stopped: MAX_CANDIDATES
2026-08-25T08:04:55.191Z INFO  [SearchProcessor] cid=demo-trace-0001 [worker] Search job c3a70424-f8b8-4c08-8d77-96bb7bf5f79d-run-1787645094946 for experiment c3a70424-f8b8-4c08-8d77-96bb7bf5f79d finished
```

Cùng `cid=demo-trace-0001` — 1 request HTTP duy nhất, đi vào API, qua Redis, được worker xử lý xong — có thể trace nguyên vẹn từ log, dù đọc file log của 2 process khác nhau.

### 5.3. `/metrics` — excerpt thật sau khi exercise hệ thống

API (`curl http://localhost:3000/metrics`):
```
http_requests_total{method="GET",route="/health/live",status="200"} 2
http_requests_total{method="POST",route="/strategy-search/experiments",status="202"} 1
search_jobs_enqueued_total 1
cache_hits_total{namespace="leaderboard"} 2
cache_hits_total{namespace="strategy-search"} 1
cache_misses_total{namespace="strategy-search"} 1
queue_depth{queue="search",state="waiting"} 0
queue_depth{queue="search",state="active"} 0
```

Worker (`curl http://localhost:3001/metrics`):
```
search_jobs_completed_total 1
search_jobs_failed_total 0
search_duration_seconds_count 1
candidates_generated_total 5
backtests_run_total 5
```

### 5.4. Readiness fail/recover theo Redis, liveness không đổi

```
$ docker stop crypto-strategy-lab-redis
$ curl -w '\nHTTP %{http_code}\n' http://localhost:3000/health/live
{"status":"ok","uptimeSeconds":76}
HTTP 200

$ curl -w '\nHTTP %{http_code}\n' http://localhost:3000/health/ready
{"status":"error","checks":{"postgres":{"status":"ok","latencyMs":3},"redis":{"status":"error","message":"Stream isn't writeable and enableOfflineQueue options is false"}}}
HTTP 503

$ docker start crypto-strategy-lab-redis
$ curl -w '\nHTTP %{http_code}\n' http://localhost:3000/health/ready
{"status":"ok","checks":{"postgres":{"status":"ok","latencyMs":3},"redis":{"status":"ok","latencyMs":3}}}
HTTP 200
```

### 5.5. Redaction — request thật với Authorization header mang secret giả lập

```
$ curl -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.SUPER-SECRET-PAYLOAD-DO-NOT-LEAK.sig12345" \
    http://localhost:3000/strategy-search/experiments/nonexistent
→ HTTP 401

$ grep -c "SUPER-SECRET-PAYLOAD-DO-NOT-LEAK" api.log worker.log
api.log:0
worker.log:0
```
Dòng log tương ứng chỉ ghi route template và status, không có gì từ header:
```
2026-08-25T08:05:46.207Z INFO  [HTTP] cid=01a1976c-... GET /strategy-search/experiments/:id 401 1.1ms {"method":"GET","route":"/strategy-search/experiments/:id","status":401,"durationMs":1}
```

## 6. Cố tình KHÔNG đo (ngoài phạm vi task-18)

- **Distributed tracing (OpenTelemetry spans)**: correlation id đã đủ để nối log giữa 2 process cho nhu cầu đồ án này; span/trace thật cần thêm hạ tầng (collector, Jaeger/Tempo) không tương xứng với quy mô 2-process của hệ thống.
- **Log aggregation/shipping** (ELK, Loki...): log hiện chỉ ra `stdout`/`stderr` (đúng chuẩn 12-factor) — việc thu thập/lưu trữ log là trách nhiệm hạ tầng triển khai, không phải code app.
- **Alerting rules** (Prometheus Alertmanager): out of scope — task-18 chỉ yêu cầu *expose* metric, không yêu cầu định nghĩa ngưỡng cảnh báo.
- **Metric cho Python worker con** (`workers/` — news crawl, AI strategy run, spawn qua child process): các process con này không phải Node, không dùng chung `MetricsService`; `NewsCrawlService`/`AiStrategyService` (phía Nest gọi chúng) đã có timeout+log riêng từ trước, không thêm metric riêng cho nội bộ script Python trong task này.
- **Auth-side redaction ngoài log**: redaction chỉ áp dụng cho log — response HTTP thật (vd `/auth/login` trả `accessToken`) vẫn trả token bình thường cho client hợp lệ, đúng chức năng, không phải leak.

## 7. File đã thay đổi/thêm mới

| File | Thay đổi |
|---|---|
| `service/src/observability/correlation/correlation-context.ts` | MỚI — AsyncLocalStorage store |
| `service/src/observability/correlation/observability.middleware.ts` | MỚI — correlation id + HTTP metrics + access log, áp dụng global |
| `service/src/observability/logging/redact.ts` | MỚI — redaction tập trung |
| `service/src/observability/logging/redact.spec.ts` | MỚI |
| `service/src/observability/logging/structured-logger.service.ts` | MỚI — `LoggerService` implementation |
| `service/src/observability/logging/structured-logger.service.spec.ts` | MỚI |
| `service/src/observability/metrics/metrics.service.ts` | MỚI — Registry + toàn bộ metric catalogue |
| `service/src/observability/metrics/metrics.controller.ts` | MỚI — `GET /metrics` |
| `service/src/observability/health/health.service.ts` | MỚI |
| `service/src/observability/health/health.service.spec.ts` | MỚI |
| `service/src/observability/health/health.controller.ts` | MỚI — `GET /health/live`, `GET /health/ready` |
| `service/src/observability/observability.module.ts` | MỚI — `@Global()`, gắn kết mọi thứ trên |
| `service/src/observability/worker-metrics-server.ts` | MỚI — HTTP `node:http` riêng cho worker |
| `service/src/main.ts` | Sửa — `bufferLogs` + `useLogger(StructuredLogger)` |
| `service/src/worker.ts` | Sửa — như trên, + khởi động `worker-metrics-server.ts` |
| `service/src/app.module.ts` | Sửa — import `ObservabilityModule`, `configure()` áp `ObservabilityMiddleware` cho mọi route |
| `service/src/worker.module.ts` | Sửa — import `ObservabilityModule` |
| `service/src/modules/strategy-search/services/search-queue.service.ts` | Sửa — thêm `correlationId` vào job payload, `searchJobsEnqueuedTotal` |
| `service/src/modules/strategy-search/services/search-queue.service.spec.ts` | Sửa — mock `MetricsService`, test mới |
| `service/src/modules/strategy-search/search.processor.ts` | Sửa — `runWithCorrelationId`, `searchDurationSeconds`/`searchJobsCompletedTotal`/`searchJobsFailedTotal` |
| `service/src/modules/strategy-search/strategy-search.service.ts` | Sửa — `candidatesGeneratedTotal`/`backtestsRunTotal` |
| `service/src/modules/strategy-search/strategy-search.service.spec.ts` | Sửa — mock `MetricsService` |
| `service/src/modules/news/crawl/news-crawl-queue.service.ts` | Sửa — `correlationId` vào job payload (cùng pattern search) |
| `service/src/modules/news/crawl/news-crawl.processor.ts` | Sửa — `runWithCorrelationId` |
| `service/src/cache/cache.service.ts` | Sửa — `cacheHitsTotal`/`cacheMissesTotal`, thêm `ping()` cho health check |
| `service/src/cache/cache.service.spec.ts` | Sửa — mock `MetricsService`, test hit/miss/ping mới |
| `service/src/modules/market-data/clients/binance.client.ts` | Sửa — `binanceRequestsTotal`/`binanceRequestDurationSeconds` |
| `service/src/modules/market-data/clients/binance.client.spec.ts` | Sửa — mock `MetricsService` |
| `service/src/scripts/seed-candles.ts` | Sửa — `new BinanceClient()` cần `MetricsService` (script độc lập, không qua Nest DI) |
| `service/package.json` | Sửa — thêm dependency `prom-client` |
