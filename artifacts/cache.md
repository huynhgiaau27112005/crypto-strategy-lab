# cache.md — Response cache cho candles và leaderboard (task-17)

> Tài liệu này mô tả **những gì thực sự được build**, khác với `docs/` (input/tham khảo). Cập nhật cùng lúc với code.

## 1. Tại sao chỉ cache 2 thứ này (và không cache thêm để tăng số lượng)

Nguyên tắc chọn: cache theo **chi phí thật** phải gánh mỗi request, không phải theo "cái gì dễ cache".

### 1.1. `GET /market-data/candles` — case mạnh nhất

`MarketDataService.getCandles()` gọi thẳng `BinanceClient.getKlines()` — **không đọc bảng `candles` trong Postgres** (xem comment trong `market-data.service.ts` và `artifacts/api-contract.md`). Nghĩa là mỗi lần 1 chart pane trên FE load (mỗi khung 1m/5m/15m/1h/4h — UI hiện tối đa 4 khung 1 lúc theo `docs/ui-prototype/`), backend gọi Binance **ngay lập tức, không có gì đứng giữa**. Chi phí thật: độ trễ mạng ra ngoài + rate limit Binance + độ ổn định của UI phụ thuộc vào 1 service bên thứ ba. Đo được: cold ~130-240ms/request (xem mục 5).

### 1.2. `GET /strategy-search/experiments/:id/top`

`LeaderboardService.rebuildForExperiment()` được gọi lại **sau mỗi iteration** trong `StrategySearchService.run()` (search.processor.ts chạy nó trong worker). Trong lúc 1 search đang `RUNNING`, FE poll `top` liên tục (UI Leaderboard — `docs/ui-prototype/`) để cập nhật bảng xếp hạng. Mỗi lần poll là 1 query JOIN 4 bảng (`experiments` → `experiment_iterations` → `candidates` → `backtest_runs` → `evaluations`) — không phải free, và với nhiều client cùng theo dõi 1 experiment thì trùng lặp hoàn toàn.

### 1.3. Không cache thêm gì khác

- `GET /strategy-search/experiments/:id` (status/progress) — đổi mỗi vài trăm ms lúc `RUNNING` (generated/completed/failed tăng liên tục); cache ở đây chỉ để phục vụ UI polling tần suất cao hơn cả TTL hợp lý sẽ chịu được — không đáng, vì bản thân query status là 1 lần `SELECT` có `GROUP BY`, không JOIN nặng bằng `top`.
- `POST /market-data/import`, `POST /strategy-search/experiments`, `/cancel`, `/extend` — đều là ghi (side effect), không phải điểm đọc lặp lại.
- `GET /strategy-search/candidates/:id` (candidate detail + trade page) — đọc 1 lần khi user click vào 1 candidate cụ thể, không phải endpoint bị poll lặp lại như `top`; thêm cache ở đây tăng số cache mà không cắt được chi phí lặp lại nào đáng kể.

## 2. Kiến trúc: một CacheService, dùng chung kết nối Redis với QueueModule

```
service/src/cache/
  redis-connection.ts   — redisConnectionOptions(): { host, port } đọc từ REDIS_HOST/REDIS_PORT
                           (dùng chung bởi CẢ QueueModule/BullMQ LẪN CacheModule — không có
                           Redis client thứ 2 cấu hình độc lập, đúng yêu cầu task-17 #1)
  cache.constants.ts    — REDIS_CLIENT: injection token cho ioredis client thô
  cache.service.ts      — CacheService: get/set/del/incr, nơi DUY NHẤT gọi thẳng ioredis
  cache.module.ts        — @Global(), tạo ioredis client + export CacheService
```

`CacheModule` được import ở cả `AppModule` (API process, `main.ts`) và `WorkerModule` (worker process, `worker.ts`) — lý do ở mục 4.

**Vì sao 1 ioredis client riêng, không tái dùng chính client của BullMQ:** BullMQ tự quản lý vòng đời client Queue/Worker của nó nội bộ (không thể mượn để tự ý gọi GET/SET tuỳ ý mà không phá vỡ cách `@nestjs/bullmq` inject). "Tái dùng cấu hình kết nối" (yêu cầu #1) được hiểu là **tái dùng `host`/`port`/logic đọc `.env`**, không phải chia sẻ chung 1 instance `Redis` — `redisConnectionOptions()` là nơi duy nhất đọc `REDIS_HOST`/`REDIS_PORT`, cả `QueueModule.forRootAsync` và `CacheModule`'s factory đều gọi hàm này.

**Vì sao tradeoff `enableOfflineQueue` ngược với QueueModule:**

| | QueueModule (BullMQ) | CacheModule (cache) |
|---|---|---|
| `enableOfflineQueue` | `true` (mặc định ioredis) | `false` |
| Vì sao | Một search job **không được phép mất** — nếu Redis down lúc enqueue, ioredis đệm lệnh trong bộ nhớ và tự retry, boot API vẫn thành công (task-16 "Startup independence") | Một GET/SET cache là **disposable** — nếu Redis down, muốn lệnh **fail ngay lập tức** để `CacheService` rơi vào `catch` và trả lời request bằng dữ liệu thật, thay vì để HTTP request treo chờ ioredis đệm/retry |

`maxRetriesPerRequest: 1` + `connectTimeout: 1000ms` cho cùng lý do: fail nhanh, không giữ request chờ.

## 3. Từng cái được cache: key, TTL, và tại sao

### 3.1. `market-data:candles:{symbol}:{interval}:{limit}`

- **Key gồm**: `symbol`, `interval`, `limit` — đúng 3 tham số duy nhất ảnh hưởng tới kết quả trả về của `getCandles()`. Không có `userId` — đây là dữ liệu thị trường công khai, mọi user thấy cùng 1 câu trả lời từ Binance.
- **TTL — `candleCacheTtlSeconds(interval)`** (`market-data/config.ts`), **không phải 1 số cố định cho mọi interval**:
  - `MarketDataService.getCandles()` đã loại bỏ nến đang hình thành (`row.isClosed === false`, xem comment gốc trong code) trước khi trả về — Binance chỉ **đóng** 1 nến mới cho 1 interval đúng 1 lần mỗi khi hết interval đó.
  - Vì vậy tập nến-đã-đóng cho 1 `(symbol, interval, limit)` **không đổi trong suốt 1 interval** — cache trong đúng độ dài 1 interval (`1m`→60s, `5m`→300s, `15m`→900s, `1h`→3600s, `4h`→14400s, parse tổng quát từ chuỗi interval, không hardcode danh sách) **không thể** làm hồi sinh 1 nến đang hình thành, và cũng không thể trả về 1 response "đáng lẽ đã đổi" — dữ liệu thật sự chưa đổi.
  - Interval lạ (không match `\d+[smhdw]`) fallback 30s; có trần an toàn 6 giờ cho interval bất thường (`MAX_CACHE_TTL_SECONDS`) dù mọi interval hệ thống hỗ trợ (`ALLOWED_INTERVALS`) đều thấp hơn trần này rất nhiều.
- **Invalidation**: không cần chủ động — TTL tự hết đúng lúc dữ liệu có thể đã đổi (nến kế tiếp đóng). Không có write path nào khác làm nến "cũ" thay đổi ngược (Binance không sửa lại nến đã đóng).

### 3.2. Leaderboard "top N" — `strategy-search:top:{experimentId}:{userId}:v{version}`

- **Key gồm**: `experimentId`, `userId` (bắt buộc — dữ liệu leaderboard gắn với experiment sở hữu bởi 1 user, xem mục "User scoping" bên dưới), và **version** — KHÔNG gồm `limit`.
  - Lý do bỏ `limit` khỏi key: giá trị luôn cache là **top `LEADERBOARD_TOP_CACHE_MAX_ENTRIES` (100)** — danh sách đã sắp theo `overall_score DESC`. Cắt (`slice`) 1 danh sách top-100 đã sắp xếp xuống top-N cho đúng kết quả y hệt query trực tiếp top-N (vì N ≤ 100 luôn — `getTop()` đã clamp `limit` vào `[1, 100]`). Giảm số biến thể key từ (số giá trị limit khác nhau) xuống 1, mà vẫn đúng cho mọi `limit`.
- **TTL: 60s** (`LEADERBOARD_TOP_CACHE_TTL_SECONDS`) — vai trò **lưới an toàn phụ**, không phải cơ chế invalidation chính (xem mục 4). Chọn 60s vì đó là biên trên chấp nhận được cho "worst case nếu việc bump version bị lỗi" — không phải con số suy luận từ tốc độ đổi dữ liệu (bump version mới là cơ chế chính cho việc đó).
- **Invalidation chính: version counter `leaderboard:version:{experimentId}`**, xem mục 4.

## 4. Bài toán cross-process invalidation — và cách giải

**Vấn đề cụ thể của task-17**: `LeaderboardService.rebuildForExperiment()` — hàm ghi lại bảng `leaderboards`/`leaderboard_entries` — chạy trong **process worker** (`SearchProcessor.process()` → `StrategySearchService.run()`, xem `queue.md` mục 3 để hiểu vì sao `run()` chỉ chạy ở worker). Còn `StrategySearchService.getTop()` — hàm đọc cache — chạy trong **process API** (HTTP request). Đây là 2 process Node độc lập, không chia sẻ bộ nhớ — 1 event emitter / callback trong process worker **không thể** báo cho process API biết "leaderboard vừa đổi".

**Cách đã thử và loại bỏ**: TTL-only (không có version). Nếu chỉ dựa vào TTL 60s, trong 1 search đang chạy nhanh (nhiều iteration/giây, đã đo thực tế: 1 số search hoàn tất 50+ iteration trong ~1 giây — xem mục 5.3), UI sẽ thấy 1 bảng xếp hạng **đứng yên tới 60 giây** trong khi trạng thái experiment (`generated`, `completed`) vẫn tăng — đúng cái "leaderboard đóng băng trong khi search đang chạy" mà task-17 cảnh báo là tệ hơn không cache.

**Giải pháp đang dùng: version counter lưu trong chính Redis** (`leaderboard-cache-keys.ts`):

1. `LeaderboardService.rebuildForExperiment()` — sau khi transaction Postgres ghi xong — gọi `cache.incr('leaderboard:version:{experimentId}')`. Chạy trong worker.
2. `StrategySearchService.getTop()` — trước khi đọc — gọi `cache.get('leaderboard:version:{experimentId}')` để lấy version hiện tại (mặc định `0` nếu chưa từng rebuild hoặc Redis vừa down), rồi đọc/ghi key dữ liệu `strategy-search:top:{experimentId}:{userId}:v{version}`. Chạy trong API.

**Vì sao cách này giải quyết đúng vấn đề cross-process**: cả 2 process đọc/ghi **cùng 1 Redis instance** qua `CacheService` (cùng `redisConnectionOptions()`). `INCR` là 1 lệnh Redis nguyên tử, hiệu lực ngay khi worker gọi xong — không cần event/message queue riêng, không cần polling giữa 2 process, không cần API tự chạy 1 cron kiểm tra. Ngay lần đọc kế tiếp của bất kỳ API instance nào (kể cả chạy nhiều instance API sau này), version đã đổi → key dữ liệu cũ (`v{N}`) không còn được đọc tới nữa (tự hết hạn theo TTL, không cần dọn tay) → cache miss → query lại DB → cache lại dưới `v{N+1}`.

**Đã verify sống** (không chỉ suy luận — xem mục 5.2): chạy 1 search 52 iteration, `leaderboard:version:{experimentId}` trong Redis đúng bằng `52` sau khi search `COMPLETED`, khớp 1-1 với số lần `rebuildForExperiment()` được gọi.

## 5. Đo đạc — trước/sau, không chỉ khẳng định

Môi trường đo: Redis (`crypto-strategy-lab-redis`, cổng 6381), Postgres (cổng 6543), API + Worker chạy `nest start --watch`, dữ liệu nến `BTCUSDT 5m` đã import (~5274 nến trong DB).

### 5.1. `GET /market-data/candles?symbol=...&interval=5m&limit=200`

| Symbol | Cold (gọi Binance thật) | Warm (cache hit) |
|---|---|---|
| BTCUSDT | 237ms | 3.1ms |
| ETHUSDT | 211ms | 3.8-4.5ms |
| BNBUSDT | 173ms | — |
| SOLUSDT | 134ms | — |
| DOGEUSDT (đo lại sau khi restart Redis) | 144ms | 4.0ms |

Cold dao động 130-240ms (phụ thuộc độ trễ tới Binance lúc đo); warm ổn định 3-14ms. Tỷ lệ cải thiện: **~35-70 lần** cho request lặp lại trong cùng 1 interval.

### 5.2. Leaderboard: chứng minh KHÔNG đứng yên khi search đang chạy

Chạy 1 experiment thật (`POST /strategy-search/experiments`, `minimumTrades: 0` để candidate sớm lọt top), rồi gọi `extend()` để chạy thêm 50 iteration, đồng thời bắn 60 request `GET .../top?limit=1` liên tiếp không nghỉ (không sleep giữa các lần gọi, để bắt kịp tốc độ rebuild thật của worker):

- 11 request đầu: `rank 1 = candidate fa7bb97e... (score 83.729)`
- 49 request tiếp theo: `rank 1 = candidate 3fc2674f... (score 83.468)`

→ Đúng 2 trạng thái leaderboard khác nhau được phục vụ trong 60 lần poll liên tiếp — cache **đổi theo rebuild thật**, không đứng yên ở kết quả của lần đọc đầu tiên. (Việc rank 1 đổi từ candidate 11 lệnh sang candidate 25 lệnh phản ánh 1 hành vi có sẵn từ trước task-17, không liên quan tới cache: `minimumTrades` không được persist đầy đủ giữa API/worker process khi `loadConfig()` phục hồi config sau `extend()` — nằm ngoài phạm vi task này, không sửa ở đây.)

Kiểm tra chéo bằng Redis trực tiếp sau khi search hoàn tất 52 iteration:
```
GET leaderboard:version:{experimentId}  → "52"
KEYS strategy-search:top:{experimentId}:*  → ...:v52   (đúng version mới nhất, không còn key v0..v51 nào sống sót ngoài TTL)
```

### 5.3. Redis down — API không chết

```
docker stop crypto-strategy-lab-redis
GET /market-data/candles?...      → 200, 195ms (fallback thẳng Binance, không cache)
GET /strategy-search/.../top?...  → 200, 26ms (fallback thẳng Postgres)
```
Log ghi `[CacheModule] Redis connection error: ...ECONNREFUSED...` (warning, không phải uncaught exception) — process API **không crash**, cổng 3000 vẫn `LISTEN`.

```
docker start crypto-strategy-lab-redis
GET /market-data/candles?symbol=BTCUSDT...   → 162ms (lần đầu sau khi Redis sống lại — miss, phải fetch)
GET (lặp lại)                                 → 3.8-14ms (cache hoạt động lại bình thường)
GET /market-data/candles?symbol=DOGEUSDT...  → 144ms cold, 4.0ms warm
```

### 5.4. Frontend end-to-end

Đăng nhập `demo@csl.local` qua UI (`http://localhost:5174`), trang Realtime hiển thị đúng 2 chart pane (1m, 5m) với dữ liệu nến thật, không có console error. Trang Leaderboard tải bình thường.

## 6. Non-negotiables — cách đã đáp ứng

- **Redis down không làm sập API**: mọi method của `CacheService` (`get/set/del/incr`) bọc `try/catch`, log `Logger.warn`, trả về giá trị an toàn (`null`/`undefined`) thay vì throw — chứng minh bằng `cache.service.spec.ts` ("Redis-down resilience" describe block) và bằng live test ở mục 5.3.
- **Không cache quyết định auth**: `JwtAuthGuard` chạy per-request như cũ trên mọi route có `@UseGuards(JwtAuthGuard)` (`strategy-search.controller.ts`) — `CacheService` không hề được gọi trong guard, chỉ trong service layer sau khi đã qua guard.
- **1 nơi sở hữu cache access**: `CacheService` là nơi duy nhất gọi ioredis; `market-data.service.ts` và `strategy-search.service.ts`/`leaderboard.service.ts` chỉ gọi `cache.get/set/incr` với key đã build sẵn từ `config.ts` (candles) hoặc `leaderboard-cache-keys.ts` (leaderboard) — không nơi nào tự ghép chuỗi key hay TTL riêng.
- **Test chạy được khi không có Redis**: mọi test dùng mock (`jest.fn()`) cho `CacheService`/ioredis client — `npm test` không mở kết nối Redis thật (xem `cache.service.spec.ts`, `market-data.service.spec.ts`, `leaderboard.service.spec.ts`, `strategy-search.service.spec.ts`).

## 7. File đã thay đổi

| File | Thay đổi |
|---|---|
| `service/src/cache/redis-connection.ts` | MỚI — `redisConnectionOptions()` dùng chung |
| `service/src/cache/cache.constants.ts` | MỚI — `REDIS_CLIENT` token |
| `service/src/cache/cache.service.ts` | MỚI — get/set/del/incr, không throw |
| `service/src/cache/cache.module.ts` | MỚI — `@Global()`, tạo ioredis client |
| `service/src/cache/cache.service.spec.ts` | MỚI |
| `service/src/queue/queue.module.ts` | Sửa — dùng `redisConnectionOptions()` thay vì đọc env riêng |
| `service/src/app.module.ts` | Sửa — import `CacheModule` |
| `service/src/worker.module.ts` | Sửa — import `CacheModule` |
| `service/src/modules/market-data/config.ts` | Sửa — thêm `candleCacheTtlSeconds()` |
| `service/src/modules/market-data/market-data.service.ts` | Sửa — `getCandles()` đọc/ghi cache |
| `service/src/modules/market-data/market-data.service.spec.ts` | Sửa — mock `CacheService`, thêm test hit/miss/lỗi |
| `service/src/modules/leaderboard/leaderboard-cache-keys.ts` | MỚI — key/TTL dùng chung giữa LeaderboardService và StrategySearchService |
| `service/src/modules/leaderboard/leaderboard.service.ts` | Sửa — bump version sau rebuild |
| `service/src/modules/leaderboard/leaderboard.service.spec.ts` | MỚI |
| `service/src/modules/strategy-search/strategy-search.service.ts` | Sửa — `getTop()` đọc/ghi cache theo version |
| `service/src/modules/strategy-search/strategy-search.service.spec.ts` | Sửa — mock `CacheService`, thêm describe `getTop() caching` |
