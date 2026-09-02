# API Contract thực tế

> Mô tả các endpoint **đã thực sự tồn tại và chạy được** trong `service/`, không phải API dự kiến. Nguồn sự thật là các file `*.controller.ts`.
>
> Base URL mặc định: `http://localhost:3000`. CORS mở cho `WEB_ORIGIN` (mặc định `http://localhost:5173`).

## 0. Tổng quan trạng thái

| Nhóm | Endpoint | Trạng thái |
|---|---|---|
| Auth | 4 endpoint | ✅ Hoạt động, đã smoke test thật |
| Strategy Search | 5 endpoint + health | ✅ Hoạt động, đã smoke test full vòng |
| Market Data | 2 endpoint + WebSocket `/market` | ⚠️ Hoạt động nhưng **chưa có auth** trên REST; WebSocket đã push realtime |
| News | 4 endpoint + health (`GET /news`, `POST /news/crawl`, `GET /news/crawl/status`, `POST /news/crawl/cancel`) | ✅ Hoạt động — crawl thật, chạy trong tiến trình **worker** riêng, API chỉ enqueue (task-16, xem `artifacts/queue.md`) |
| Sentiment | 1 endpoint + health | ✅ Hoạt động |
| Strategy Engine | `GET /strategy-engine/signal` + health | ✅ Hoạt động — realtime signal, có auth |
| Queue | `GET /queue/health` | ✅ Hoạt động — không auth, xem mục 2b |
| Strategy Plugin | `GET /strategy-plugin/strategies[/:name/versions]` + health | ✅ Hoạt động — từ task-15 gồm cả strategy AI của user, xem mục 2 |
| AI Strategy | `generate/validate/save/mine/:id/:id/run` + health, `samples`, `provider`, `generate/status` | ✅ Hoạt động — `POST /generate` trả **202** async (queue `ai-generate`); `save` từ task-15 bắt buộc `domain` |
| Chart / Continuous Loop / Leaderboard / Composite / Backtesting | chỉ có `GET /<module>/health` | ❌ Stub, chưa có API thật |

## 1. Xác thực

Mô hình: **JWT access token ngắn hạn + refresh token dài hạn**.

- Access token: JWT, mặc định sống **15 phút**, không lưu DB (server chỉ verify chữ ký). Gửi kèm mọi request cần quyền qua header `Authorization: Bearer <accessToken>`.
- Refresh token: chuỗi ngẫu nhiên, sống **30 ngày**, chỉ lưu **SHA-256 hash** trong bảng `refresh_tokens`. Dùng để xin access token mới khi hết hạn.
- Khi refresh, token cũ bị thu hồi (`revoked_at`) và cấp cặp token mới — token rotation.

### `POST /auth/register`

Đăng ký tài khoản mới.

**Request**
```json
{
  "email": "demo@example.com",
  "password": "password123",
  "displayName": "Demo User"
}
```
`displayName` không bắt buộc.

**Response `201`**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "0a1b2c3d-...-...."
}
```

**Lỗi**
| Mã | Khi nào |
|---|---|
| `409 Conflict` | Email đã tồn tại (`"Email is already registered."`) |

### `POST /auth/login`

**Request**
```json
{ "email": "demo@example.com", "password": "password123" }
```

**Response `200`** — giống `register`: `{ accessToken, refreshToken }`.

**Lỗi**
| Mã | Khi nào |
|---|---|
| `401 Unauthorized` | Sai email hoặc sai mật khẩu (`"Invalid credentials."` — **cố ý không phân biệt** email sai với mật khẩu sai, tránh lộ thông tin tài khoản nào tồn tại) |

### `POST /auth/refresh`

**Request**
```json
{ "refreshToken": "0a1b2c3d-...-...." }
```

**Response `200`** — cặp token mới `{ accessToken, refreshToken }`. Refresh token cũ bị thu hồi.

**Lỗi**
| Mã | Khi nào |
|---|---|
| `401 Unauthorized` | Token không tồn tại, đã bị thu hồi, hoặc đã hết hạn |

### `POST /auth/logout`

**Request**
```json
{ "refreshToken": "0a1b2c3d-...-...." }
```

**Response `204 No Content`** — thu hồi refresh token. Access token đang cầm vẫn còn hiệu lực tới khi hết hạn (bản chất của JWT không lưu trạng thái).

## 2. Strategy Search

**Toàn bộ 6 endpoint dưới đây yêu cầu `Authorization: Bearer <accessToken>`.** Thiếu hoặc sai token → `401`.

Mọi truy vấn đều **giới hạn theo chủ sở hữu**: user chỉ thấy được experiment của chính mình. Truy cập experiment của người khác trả `404` (không phải `403`) — cố ý không tiết lộ rằng experiment đó có tồn tại.

### `POST /strategy-search/experiments`

Bắt đầu một lần chạy tìm kiếm. Chạy **bất đồng bộ**: trả về ngay `202` sau khi tạo experiment row và **enqueue** một job lên queue `search` (BullMQ/Redis) — vòng lặp search thật (`StrategySearchService.run()`) chạy trong **tiến trình worker riêng** (`service/src/worker.ts`), không chạy trong tiến trình API xử lý request này. Xem `artifacts/queue.md` để biết chi tiết queue/worker/retry/cancel. Nếu Redis không thể enqueue được (ví dụ Redis đang down), experiment row vẫn được tạo nhưng lỗi enqueue chỉ được log — client cần theo dõi qua `GET /strategy-search/experiments/:id` để biết search có bắt đầu hay không.

**Request**
```json
{
  "timeframe": "5m",
  "startTime": "2026-07-01T00:00:00Z",
  "endTime": "2026-07-30T00:00:00Z",
  "maxCandidates": 100,
  "maxDurationSeconds": 3600,
  "maxNoImprovement": 50,
  "topK": 10,
  "enabledDomains": ["TREND", "MOMENTUM", "VOLATILITY"],
  "strategyWeights": [
    { "type": "MA", "weight": 0.3 },
    { "type": "RSI", "weight": 0.3 },
    { "type": "BOLLINGER", "weight": 0.4 }
  ]
}
```

| Trường | Bắt buộc | Mặc định | Ràng buộc |
|---|---|---|---|
| `timeframe` | ✅ | — | `1m` / `5m` / `15m` / `1h` / `4h` |
| `startTime`, `endTime` | ✅ | — | ISO 8601; `startTime < endTime` |
| `maxCandidates` | ❌ | 100 | số nguyên 1–10000 |
| `maxDurationSeconds` | ❌ | 3600 | số nguyên 1–86400 |
| `maxNoImprovement` | ❌ | 50 | số nguyên 1–10000 |
| `topK` | ❌ | 10 | số nguyên 1–100 |
| `enabledDomains` | ❌ | cả 4 | `TREND` / `MOMENTUM` / `VOLATILITY` / `STRUCTURE` |
| `strategyWeights` | ❌ | chia đều trên 4 built-in | mỗi trọng số là số hữu hạn, `>= 0`; không được **tất cả bằng 0** |

> **`strategyWeights[].type` (task-15):** không còn giới hạn ở 4 literal built-in — chấp nhận cả `"AI:<strategyId>"`, trỏ tới một strategy `AI_GENERATED` **của chính user gọi request này** (kiểm tra ownership + `is_active`, `404`/`400` nếu không thuộc user hoặc không tồn tại). Domain của một entry `AI:<id>` không tra theo bảng cố định như built-in mà đọc trực tiếp từ `strategies.parameters.domain` — trường bắt buộc chọn lúc `POST /ai-strategy/save` (xem mục AI Strategy bên dưới). Nếu bỏ trống `strategyWeights`, mặc định **chỉ chia đều trên 4 strategy built-in** — muốn đưa strategy AI vào một search cụ thể phải khai báo tường minh trong `strategyWeights`, hệ thống không tự ý gộp mọi strategy AI của user vào mặc định.
>
> **Công thức điểm tổng hợp (`CompositeStrategyService.analyze`):** `Điểm tổng hợp = Σ (trọng số × tín hiệu) / Σ trọng số` — một **weighted average**, không phải weighted sum. Vì có chia cho tổng trọng số, **`strategyWeights` không bắt buộc phải tổng bằng 1** — công thức tự chuẩn hoá, điểm luôn nằm trong `[-1, 1]` với bất kỳ bộ trọng số dương nào (vd. `0.25/0.25/0.20/0.45`, tổng 1.15, vẫn hợp lệ). Mẫu số là tổng trọng số của **toàn bộ member có trọng số** (không chỉ member ra tín hiệu BUY/SELL) — một member HOLD vẫn tính vào mẫu số, đúng nghĩa "phiếu trắng" kéo điểm về gần 0. Nếu mẫu số bằng 0 (không có trọng số nào, hoặc tất cả bằng 0), service trả về `score = 0` và `signal = HOLD` thay vì `NaN` — nhưng trường hợp này bị chặn sớm hơn, ngay ở `POST /strategy-search/experiments` (xem lỗi `400` bên dưới), không để lọt xuống tầng tính điểm.
>
> **Ràng buộc coverage:** `strategyWeights` phải khớp **chính xác** tập `StrategyDomain` mà `enabledDomains` bật — theo domain THẬT của từng entry đã resolve (built-in tra theo tên cố định, AI tra theo `parameters.domain`), không còn theo một bảng domain→type cố định 4 phần tử. Một domain có thể được phủ bởi built-in, bởi 1+ strategy AI của user, hoặc cả hai. Thiếu weight cho domain đã bật, hoặc thừa weight cho domain chưa bật, đều bị từ chối với `400`.
>
> **Precompute + loại strategy AI lỗi khỏi run (task-15):** trước khi vòng lặp candidate bắt đầu, mọi strategy AI có trong `strategyWeights` được chạy **1 lần cho cả chuỗi nến** (`AiStrategySignalPrecomputeService`, tuần tự từng strategy, không song song). Một strategy AI lỗi ở bước này (subprocess timeout, code đã hỏng từ lúc lưu tới lúc chạy, output sai định dạng) **không** làm hỏng cả request — nó bị loại khỏi run này, có log cảnh báo, và domain của nó chỉ mất khả dụng nếu không còn strategy nào khác (built-in hoặc AI khác) phủ domain đó. Nếu sau khi loại, không còn đủ 1 domain định hướng + 1 domain xác nhận khả dụng, experiment kết thúc `FAILED` với lý do rõ ràng thay vì treo hoặc chạy một search rỗng.

**Response `202 Accepted`**
```json
{ "experimentId": "3f2a...-....", "status": "PENDING" }
```

**Lỗi**
| Mã | Khi nào |
|---|---|
| `400` | `timeframe` không hỗ trợ; khoảng thời gian không hợp lệ; số nằm ngoài khoảng; `strategyWeights` có trọng số âm hoặc không phải số hữu hạn; `strategyWeights` tất cả bằng 0; `strategyWeights` không khớp chính xác domain suy ra từ `enabledDomains` (thiếu hoặc thừa domain, xem ghi chú coverage phía trên); strategy type không tồn tại, hoặc `AI:<id>` không thuộc/không active với user hiện tại; thiếu ít nhất 1 domain "định hướng" (TREND/STRUCTURE) và 1 domain "xác nhận" (MOMENTUM/VOLATILITY); **dữ liệu nến không đủ** |
| `401` | Thiếu/sai token |

**Về lỗi "không đủ nến"** — thông báo dạng `"Dataset has 0 candles; at least 202 are required."`. Số nến tối thiểu phụ thuộc domain được bật: TREND cần 202, STRUCTURE 102, VOLATILITY 31, MOMENTUM 23 (lấy giá trị lớn nhất trong các domain đã bật). Đây **không phải bug** — nghĩa là bảng `candles` chưa có đủ dữ liệu lịch sử cho khoảng thời gian yêu cầu, cần nạp dữ liệu trước (xem `POST /market-data/import`).

**Về ràng buộc domain:** search bắt buộc phải có ít nhất một strategy *định hướng* (MA hoặc Support/Resistance) và một strategy *xác nhận* (RSI hoặc Bollinger). Đây là ràng buộc "domain-guided" — tránh sinh ra tổ hợp vô nghĩa kiểu ba biến thể MA chồng nhau.

### `GET /strategy-search/experiments/:id`

Trạng thái + tiến độ của một lần chạy. Dùng để poll cho UI.

**Response `200`**
```json
{
  "id": "3f2a...",
  "user_id": "9c8b...",
  "name": null,
  "status": "RUNNING",
  "started_at": "2026-08-24T09:15:02.000Z",
  "completed_at": null,
  "created_at": "2026-08-24T09:15:01.000Z",
  "generated": 12,
  "completed": 11,
  "failed": 0,
  "running": 1,
  "best_score": "72.418000",
  "current_candidate_id": "b41e..."
}
```

| Trường | Ý nghĩa |
|---|---|
| `status` | `PENDING` / `RUNNING` / `COMPLETED` / `FAILED` / `CANCELLED` |
| `generated` | số iteration đã sinh |
| `completed` / `failed` / `running` | phân rã theo trạng thái iteration |
| `best_score` | điểm cao nhất đạt được (chuỗi, vì kiểu `numeric` của Postgres) |
| `current_candidate_id` | candidate đang được backtest |

Các trường này phục vụ đúng yêu cầu **observability** của đề bài: biết vòng lặp đang chạy hay đã dừng, đã test bao nhiêu chiến lược, bao nhiêu job lỗi, đang ở candidate nào.

**Lỗi:** `404` nếu không tồn tại hoặc không thuộc user hiện tại; `401` nếu thiếu token.

### `GET /strategy-search/experiments/:id/top?limit=10`

Bảng xếp hạng Top-K của lần chạy đó.

`limit` không bắt buộc. Nếu **không** truyền, mặc định là `topK` đã lưu của chính experiment đó
(`experiments.search_config.topK` — cùng giá trị worker dùng để rebuild `leaderboards.top_k` /
`leaderboard_entries`), **không phải** một con số cố định — nhờ vậy response luôn khớp với
leaderboard đã persist, kể cả khi gọi lại sau khi reload trang hoặc từ một phiên browser khác.
Nếu có truyền `limit`, giá trị đó ghi đè lên (dùng cho phân trang thật) và vẫn tự kẹp vào
khoảng 1–100.

**Response `200`**
```json
[
  {
    "rank": 1,
    "candidate_id": "b41e...",
    "total_return": "18.240000",
    "profit_loss": "1824.000000",
    "win_rate": "0.610000",
    "max_drawdown": "-6.100000",
    "number_of_trades": 82,
    "profit_factor": "1.940000",
    "sharpe_ratio": "1.120000",
    "overall_score": "81.400000"
  }
]
```

Chỉ trả candidate có `backtest_runs.status = 'COMPLETED'`, xếp theo `overall_score` giảm dần.

> **Đã bỏ `minimumTrades`.** Trước đây mọi truy vấn xếp hạng (endpoint này, `LeaderboardService.rebuildForExperiment`, và `listTopCandidateMembers`) đều lọc thêm `number_of_trades >= minimumTrades` với mặc định 20, trong khi form Backtest không hề gửi trường này. Với khung thời gian ngắn hoặc timeframe lớn (vd. 4h × 2 tuần ≈ 100 nến), không candidate nào đủ 20 lệnh → **Leaderboard rỗng hoàn toàn** dù 100 tổ hợp đã backtest xong, và UI không giải thích gì. Ngưỡng này cũng dùng để đếm `noImprovement`, nên còn cắt ngắn cả vòng search (`stopReason: NO_IMPROVEMENT`).
>
> `docs/about-projects/05-required-flows.md` §8 chỉ yêu cầu "candidate results can enter or displace entries in the Top-K leaderboard" và §10 liệt kê `Number of Trades` là **metric để hiển thị**, không phải bộ lọc — ngưỡng này là do nhóm tự thêm. Đã gỡ hẳn khái niệm (không phải đặt = 0): khỏi `SearchConfig`, `StartSearchRequest`, `experiments.search_config`, payload của `backtest.completed`/`backtest.failed`/`candidates.regenerated`, và cả 3 câu SQL. Số lệnh vẫn hiển thị ở cột Trades để người dùng tự đánh giá độ tin cậy.

**Lỗi:** `404` / `401` như trên.

### `POST /strategy-search/experiments/:id/cancel`

Dừng vòng lặp đang chạy.

**Response `200`**
```json
{ "id": "3f2a...", "cancelled": true }
```

`cancelled: false` nghĩa là experiment đã ở trạng thái kết thúc (không còn gì để huỷ).

**Cơ chế (sau task-16):** đánh dấu `experiments.status = 'CANCELLED'` trong Postgres, sau đó cố gắng xoá job khỏi queue `search` nếu job **chưa** được worker nhận (`waiting`/`delayed`) — huỷ có hiệu lực ngay, không tốn 1 lượt job. Nếu job **đang chạy** trong worker (`active`), job không bị can thiệp trực tiếp: vòng lặp `run()` tự kiểm tra `experiments.status` trước mỗi iteration và tự dừng khi thấy `CANCELLED` — nghĩa là việc huỷ có độ trễ tối đa 1 iteration, không phải tức thời. Chi tiết ở `artifacts/queue.md` mục "Cancellation".

**Lỗi:** `404` / `401` như trên.

### `POST /strategy-search/experiments/:id/extend`

"Chạy thêm N iteration" — nút **Chạy thêm 10 iteration** ở tab Leaderboard. Tiếp tục vòng lặp search của một experiment **đã `COMPLETED`**, tái sử dụng nguyên config đã lưu (`experiment_configs` + `experiment_config_strategies`: timeframe, khoảng ngày, weights, domains) — **không** tạo experiment mới, **không** dựng lại config, **không** xoá leaderboard hiện có. Đây là điểm khác biệt duy nhất với "Đổi config & tạo lại" (`POST /strategy-search/experiments`), vốn luôn tạo một experiment mới từ đầu.

Chạy **bất đồng bộ** giống `POST /strategy-search/experiments`: trả về ngay `202` sau khi enqueue một job **mới** lên queue `search` (task-16) — worker chạy đúng `run()` đã dùng cho lần chạy gốc (không có vòng lặp thứ hai, không có bản sao logic).

**Request**
```json
{ "iterations": 10 }
```

| Trường | Bắt buộc | Mặc định | Ràng buộc |
|---|---|---|---|
| `iterations` | ❌ | 10 | số nguyên 1–50 |

**Response `202 Accepted`**
```json
{ "id": "3f2a...", "status": "PENDING" }
```

**Cơ chế:**
- **Trạng thái:** `COMPLETED` → `PENDING` (giống hệt trạng thái khởi tạo của `POST /strategy-search/experiments`) — `useExperiment` ở frontend không cần biết trạng thái mới nào cả, `PENDING`/`RUNNING` vẫn poll, và khi vòng lặp lại dừng, `run()` tự đưa về `COMPLETED`/`FAILED` như bình thường.
- **Đánh số iteration:** tiếp tục đúng dãy hiện có (`MAX(iteration_number) + 1`) — không reset về 1, không đổi gì ở `ExperimentIterationRepository`.
- **Đồng thời:** việc chuyển `COMPLETED → PENDING` là một `UPDATE ... WHERE status = 'COMPLETED'` nguyên tử, ràng buộc luôn cả `user_id`. Hai lần bấm liên tiếp: chỉ một request thắng race và lên lịch chạy, request còn lại nhận `409` — không có 2 vòng lặp cùng chạy trên 1 experiment.
- **Leaderboard:** rebuild lại trên **toàn bộ** candidate của experiment (cũ + mới), không chỉ các candidate vừa sinh thêm.

**Lỗi**
| Mã | Khi nào |
|---|---|
| `400` | `iterations` không phải số nguyên trong khoảng 1–50 |
| `404` | experiment không tồn tại hoặc không thuộc user hiện tại |
| `409` | experiment chưa `COMPLETED` (đang `PENDING`/`RUNNING`, hoặc đã `FAILED`/`CANCELLED` — hai trạng thái sau không cho extend, phải chạy lại từ đầu qua "Đổi config & tạo lại") |
| `401` | Thiếu/sai token |

### `GET /strategy-search/candidates/:id?tradePage=1&tradePageSize=20`

Chi tiết đầy đủ của **một candidate**: metrics đánh giá, danh sách strategy cấu thành (kèm `weight` lấy từ config của experiment sở hữu candidate đó, không phải từ candidate), và danh sách trade có phân trang. Đây là nguồn dữ liệu cho phần "02" của tab Backtest trên UI.

`id` là uuid của candidate (bảng `candidates`), **không** phải experiment id.

`tradePage` (mặc định `1`) và `tradePageSize` (mặc định `20`, **kẹp tối đa 200** để client không thể xin một trang không giới hạn) đều không bắt buộc; giá trị không phải số nguyên dương tự động rơi về mặc định.

**Truy vấn giới hạn theo chủ sở hữu:** join `candidates → experiment_iterations → experiments` và ràng buộc `experiments.user_id = <user hiện tại>` ngay trong `WHERE`, nên không thể đọc candidate của user khác bằng cách đoán/copy uuid — trả `404` giống các endpoint khác trong module này.

**Response `200`**
```json
{
  "candidateId": "b41e...",
  "experimentId": "3f2a...",
  "iterationNumber": 12,
  "members": [
    { "type": "MA", "parameters": { "fastPeriod": 20, "slowPeriod": 50 }, "weight": 0.5 },
    { "type": "RSI", "parameters": { "period": 14 }, "weight": 0.5 }
  ],
  "evaluation": {
    "totalReturn": 18.24,
    "profitLoss": 1824,
    "winRate": 0.61,
    "maxDrawdown": -6.1,
    "numberOfTrades": 82,
    "profitFactor": 1.94,
    "sharpeRatio": 1.12,
    "overallScore": 81.4
  },
  "trades": [
    {
      "id": "t1...",
      "side": "LONG",
      "entryTime": "2026-07-01T00:05:00.000Z",
      "entryPrice": 65000,
      "quantity": 0.1,
      "stopLoss": null,
      "takeProfit": null,
      "exitTime": "2026-07-01T02:10:00.000Z",
      "exitPrice": 65500,
      "profitLoss": 50,
      "returnPct": 0.77,
      "exitReason": "SIGNAL"
    }
  ],
  "tradeTotal": 82
}
```

`members[].type` dùng đúng vocabulary `SearchStrategyType` (`MA` / `RSI` / `BOLLINGER` / `SUPPORT_RESISTANCE`). `evaluation` là `null` nếu candidate chưa có `backtest_runs`/`evaluations` (ví dụ candidate vừa tạo, chưa backtest xong). `trades` chỉ chứa trang hiện tại (sắp theo `entry_time ASC`); `tradeTotal` là tổng số trade thật của candidate đó, dùng để tính số trang ở frontend.

**Lỗi:** `404` nếu candidate không tồn tại hoặc không thuộc experiment của user hiện tại; `401` nếu thiếu token.

### `GET /strategy-search/health`

Không cần auth. Trả `{ "status": "ok", "module": "strategy-search" }`.

### `GET /strategy-plugin/strategies`

Yêu cầu `Authorization: Bearer <accessToken>` (`JwtAuthGuard`). Trả danh mục strategy — nguồn dữ liệu cho bảng weighted-voting ở frontend (`StrategySelectionContext`) và cho việc dựng `strategyWeights` khi gọi `POST /strategy-search/experiments`. `StrategyPluginService.listCatalog(userId)` **trộn 2 nguồn**: metadata tĩnh từ từng `StrategyPlugin` đã đăng ký trong `StrategyRegistry` (`MA`, `RSI`, `BOLLINGER`, `SUPPORT_RESISTANCE`) với `id`/`version` thật đọc từ bảng `strategies` qua `StrategyRepository.listLatestForUser(userId)` — **ưu tiên version tham số mà chính user này đã lưu** (`type='USER'`, `owner_user_id=userId`), rơi về row `SYSTEM` gốc nếu user chưa từng lưu — cộng với **danh sách strategy AI của chính user gọi request này** (`AiStrategyRepository.listLatestPerName`, chỉ version mới nhất mỗi tên, chỉ `is_active`). Một strategy AI hiển thị với `type = "AI:<strategyId>"`, `domain` đọc từ `parameters.domain` — một dòng AI lưu trước khi có domain bắt buộc (không có `parameters.domain` hợp lệ) bị **loại khỏi danh mục này** (log warning) chứ không làm hỏng cả response, vì nó không combinable trong search nếu chưa có domain.

**Response `200`**
```json
[
  {
    "type": "MA",
    "domain": "TREND",
    "displayName": "Moving Average Crossover",
    "description": "Fast MA cắt lên Slow MA thì BUY, cắt xuống thì SELL.",
    "parameterSchema": [
      { "key": "fastPeriod", "label": "Fast period", "type": "int", "min": 10, "max": 50, "step": 1, "default": 10 },
      { "key": "slowPeriod", "label": "Slow period", "type": "int", "min": 30, "max": 200, "step": 1, "default": 30 }
    ],
    "strategyId": "3f2a...-....",
    "version": 1
  },
  {
    "type": "AI:6001f162-9a57-4972-90cf-07a594c732a7",
    "domain": "TREND",
    "displayName": "demo_ma_crossover",
    "description": "Strategy do AI sinh — chạy qua subprocess Python, không có tham số điều chỉnh ở đây.",
    "parameterSchema": [],
    "strategyId": "6001f162-9a57-4972-90cf-07a594c732a7",
    "version": 1
  }
]
```

`strategyId`/`version` là `null` nếu plugin đã đăng ký trong registry nhưng chưa có row tương ứng trong bảng `strategies` (lệch dữ liệu giữa code và DB) — trường hợp này không bị chặn ở tầng API, frontend cần tự chịu `null`. Với entry AI, `strategyId`/`version` luôn có giá trị (chính là `strategies.id`/`strategies.version` của dòng đó — không có khái niệm "chưa có row" cho AI, vì entry chỉ tồn tại sau khi đã lưu row).

**Lỗi:** `401` nếu thiếu/sai token.

### `GET /strategy-plugin/strategies/:name/versions`

Yêu cầu `Authorization: Bearer <accessToken>`. Trả **mọi version** của strategy `:name` mà user hiện tại được phép xem: dòng SYSTEM dùng chung, cộng các dòng USER do **chính user này** lưu — không bao giờ trả dòng USER của user khác (`StrategyRepository.listVersions` lọc bằng `owner_user_id = $2` ngay trong WHERE). Sắp theo `version ASC`.

**Response `200`**
```json
[
  { "strategyId": "0d14...", "name": "MA", "version": 1, "type": "SYSTEM", "parameters": {}, "isMine": false, "createdAt": "2026-08-23T17:06:44.145Z" },
  { "strategyId": "dfc3...", "name": "MA", "version": 8, "type": "USER", "parameters": { "fastPeriod": 12, "slowPeriod": 60 }, "isMine": true, "createdAt": "2026-08-26T09:01:47.696Z" }
]
```

**Lỗi:** `404` nếu `:name` không khớp plugin nào đã đăng ký; `401` nếu thiếu/sai token.

### `POST /strategy-plugin/strategies/:name/versions`

Yêu cầu `Authorization: Bearer <accessToken>`. **Luôn INSERT một row mới, không bao giờ UPDATE** — bất biến quan trọng nhất của endpoint này (`docs/about-projects/03-anti-patterns-to-avoid.md` #10 "Overwriting Strategy History"): một Experiment đã tham chiếu version cũ qua `candidate_strategies.strategy_id` tiếp tục trỏ đúng row cũ, kết quả đã backtest không bị đổi ngược.

Kể cả khi `:name` là strategy `SYSTEM`, row mới luôn có `type='USER'` + `owner_user_id` = user hiện tại — danh mục SYSTEM dùng chung **không bao giờ bị sửa** bởi thao tác của một user.

**Request** — `{ "parameters": { "fastPeriod": 12, "slowPeriod": 60 } }`

Validate 2 lớp: `zod` ở controller, và `StrategyPluginService.validateParameters` ở service (authoritative, so với `parameterSchema` thật đọc từ `StrategyRegistry` — từ chối key lạ/thiếu key/sai kiểu/ngoài khoảng/không đúng `step`).

**Response `201`** — row vừa tạo, cùng shape 1 phần tử của `GET .../versions`.

**Concurrency:** version kế tiếp = `MAX(version)+1` trong 1 transaction; nếu 2 request đua và unique index `uk_strategies_name_version` chặn (`23505`), repository **tự retry** tối đa 5 lần.

**Endpoint này KHÔNG tự sinh lại Leaderboard** — đó là việc của `POST /strategy-search/experiments/:id/regenerate` ngay dưới. Tách 2 endpoint để module `StrategyPlugin` (sở hữu version) không phụ thuộc `StrategySearch` (sở hữu experiment/leaderboard). Frontend gọi lần lượt cả hai.

### `POST /strategy-search/experiments/:id/regenerate`

Yêu cầu `Authorization: Bearer <accessToken>`, `:id` phải thuộc user gọi. Nửa sau của "Lưu tham số → tạo version mới": sinh lại **mọi tổ hợp trên Leaderboard của experiment này có chứa strategy vừa lưu version mới**, đúng câu prototype in ra khi bấm lưu — *"hệ thống sinh lại N tổ hợp có chứa strategy này thành version tổ hợp mới trong Leaderboard"*.

**Request** — `{ "strategyName": "MA" }`

Hành vi (`StrategySearchService.regenerateForStrategyVersion`):
- Lấy các candidate đang trên Leaderboard (`listTopCandidateMembers`, giới hạn đúng `topK` của experiment) — nên cascade **không bao giờ fan-out** thành hàng trăm backtest đồng bộ.
- Gộp theo **tổ hợp** (tập tên strategy thành phần), mỗi tổ hợp sinh **đúng 1** candidate mới, seed từ candidate xếp hạng cao nhất của tổ hợp đó.
- **Chỉ thay strategy vừa đổi** (row version mới + tham số mới); mọi thành phần khác giữ nguyên row và tham số ⇒ so sánh táo-với-táo với version tổ hợp trước.
- Backtest ngay (đồng bộ, dùng đúng `BacktestingService.run()` mà vòng Search dùng), rồi rebuild leaderboard 1 lần ở cuối.
- **Idempotent theo tổ hợp:** tổ hợp nào đã có candidate chạy version mới thì bỏ qua — gọi lại nhiều lần không đẻ thêm bản trùng.
- Candidate lỗi (backtest ném lỗi, AI member precompute thất bại, domain không resolve được) bị đánh `FAILED` và **bỏ qua**, không làm hỏng cả cascade.

**Response `201`**
```json
{ "regenerated": 1, "skipped": 0, "candidateIds": ["d0bfc631-9a96-49d1-ae2f-b15f52e3a658"] }
```

**Trọng số của version mới:** `CandidateRepository.findDetail()` resolve weight theo **`name`** chứ không theo `strategy_id`, vì candidate do cascade sinh trỏ tới row `strategies` mới hơn row đã ghim trong `experiment_config_strategies`. Weight là thuộc tính của strategy trong Search Configuration, không phải của từng version tham số — nhờ vậy version mới kế thừa đúng trọng số mà **không phải sửa `experiment_configs`** (vốn bất biến theo `docs/database`).

**Lỗi:** `404` nếu experiment không tồn tại/không thuộc user; `400` nếu `strategyName` rỗng hoặc không có row nào user này thấy được; `401` nếu thiếu/sai token.

## 2b. Queue Health

Thêm ở task-16 để làm queue **nhìn thấy được** thay vì chỉ là một khẳng định trong tài liệu — hữu ích khi bảo vệ đồ án (chứng minh worker thật sự đang chạy, không phải chỉ code chết).

### `GET /queue/health`

Không cần auth (giống các endpoint `.../health` khác trong repo — đây là trạng thái vận hành, không phải dữ liệu người dùng).

**Response `200`**
```json
{
  "redis": "up",
  "queues": [
    { "name": "search", "counts": { "waiting": 0, "active": 1, "completed": 12, "failed": 0, "delayed": 0 }, "workers": 1 },
    { "name": "news-crawl", "counts": { "waiting": 0, "active": 0, "completed": 3, "failed": 1, "delayed": 0 }, "workers": 1 },
    { "name": "ai-generate", "counts": { "waiting": 0, "active": 0, "completed": 2, "failed": 0, "delayed": 0 }, "workers": 1 }
  ]
}
```

- `counts` đọc trực tiếp từ Redis (`Queue.getJobCounts`) tại thời điểm gọi — không phải số đếm cache trong tiến trình API.
- `workers` là số tiến trình worker **đang thực sự kết nối** tới queue đó (`Queue.getWorkers()`, đọc danh sách client Redis) — không phải một cờ tự báo cáo có thể sai lệch khi worker treo.
- Nếu Redis không phản hồi trong 1.5s (không kết nối được, hoặc đang bận reconnect), response vẫn trả `200` với `"redis": "down"` và mọi `counts`/`workers` bằng 0, **không bao giờ trả lỗi 5xx hay treo request** — endpoint này chính là cách "Startup independence" (API vẫn khởi động được khi Redis down) được quan sát từ bên ngoài.

## 3. Market Data

> ⚠️ **Chưa có auth** — đây là nợ kỹ thuật đã biết, cần bổ sung `JwtAuthGuard` cho nhất quán với phần còn lại.

### `GET /market-data/candles?symbol=BTCUSDT&interval=5m&limit=500[&startTime=&endTime=]`

Lấy nến **trực tiếp từ Binance** (không đọc DB). `limit` mặc định 500.

`startTime` / `endTime` (tuỳ chọn, nhận **ISO 8601 hoặc epoch milliseconds**) giới
hạn cửa sổ lịch sử. Bỏ trống cả hai → trả về `limit` nến đã đóng **mới nhất** như
trước. Có tham số → trả về đúng khoảng đó. Đây là thứ tab Backtest cần: trước khi
có 2 tham số này, chart mục 02 luôn vẽ 300 nến mới nhất bất kể khoảng ngày đã
backtest, nên các lệnh liệt kê bên dưới thường nằm ngoài hẳn vùng giá đang hiện.
`startTime >= endTime` → `400`. Cache key có chứa cả hai mốc, nên request có cửa
sổ không bao giờ bị phục vụ bằng response "mới nhất" đã cache.

**Nến đang hình thành (chưa đóng) bị loại khỏi response.** Trang mới nhất Binance trả về luôn có phần tử cuối là cây nến hiện tại còn đang chạy — `close`/`volume` của nó còn thay đổi, chưa phải giá trị cuối cùng. Nếu trả về lẫn với các nến đã đóng mà không phân biệt được, mọi consumer (chart, tính toán phía sau) đều có nguy cơ đọc nhầm số liệu tạm là số liệu thật. Do endpoint này chưa có field nào để đánh dấu "chưa đóng", lựa chọn là **loại bỏ hẳn** nến đó khỏi mảng trả về (cùng tiêu chí `isClosed` dùng bởi `POST /market-data/import` và WebSocket) thay vì trả về kèm cờ — giữ bất biến "mọi nến endpoint này trả về đều đã đóng" cho toàn bộ consumer, không cần nhớ check thêm field. Hệ quả: mảng trả về có thể ngắn hơn `limit` tối đa 1 phần tử.

**Response `200`** — mảng:
```json
[
  {
    "timeframe": "5m",
    "timestamp": "2026-07-01T00:00:00.000Z",
    "open": "65000.00000000",
    "high": "65200.00000000",
    "low": "64900.00000000",
    "close": "65150.00000000",
    "volume": "12.50000000"
  }
]
```

### `POST /market-data/import`

Tải nến từ Binance và **ghi vào bảng `candles`**. Đây là cách nạp dữ liệu lịch sử trước khi chạy search.

**Nến đang hình thành (chưa đóng) không được ghi xuống DB** — cùng tiêu chí `isClosed` như `GET /market-data/candles`, `MarketDataGateway` (WebSocket), và script `npm run seed:candles` (một nguồn sự thật duy nhất, tính một lần trong `binance.client.ts`). `count` trong response là số nến **thực sự ghi được** (đã đóng), có thể nhỏ hơn `limit` yêu cầu tối đa 1 nếu trang cuối chứa nến chưa đóng.

**Request**
```json
{ "symbol": "BTCUSDT", "interval": "5m", "limit": 500 }
```

**Response `200`**
```json
{ "symbol": "BTCUSDT", "interval": "5m", "count": 500 }
```

### WebSocket: push nến realtime — namespace `/market`

Đáp ứng yêu cầu luồng #2 của đề bài: **frontend nhận nến mới qua push**, không polling `GET /market-data/candles`. Không cần auth (giống 2 endpoint REST ở trên — cùng nợ kỹ thuật #1 ở mục 7).

Kết nối Socket.IO tới namespace `/market` (ví dụ `io("http://localhost:3000/market")`). CORS dùng chung `WEB_ORIGIN` như REST.

Phạm vi cố định: chỉ **Binance / BTCUSDT**; `interval` chỉ nhận đúng 5 giá trị `1m`, `5m`, `15m`, `1h`, `4h` (cùng allow-list `assertAllowedInterval` dùng bởi `POST /market-data/import`, định nghĩa một chỗ duy nhất ở `market-data/config.ts`).

**Client → Server**

| Event | Payload | Ý nghĩa |
|---|---|---|
| `subscribe` | `{ "interval": "1m" \| "5m" \| "15m" \| "1h" \| "4h" }` | Tham gia room nhận nến của khung thời gian đó. |
| `unsubscribe` | `{ "interval": "..." }` | Rời room; nếu là subscriber cuối cùng của interval đó, upstream stream Binance cho interval này bị đóng. |
| `subscribeTrades` | *(không payload)* | Tham gia room `trades` để nhận từng lệnh khớp. Tách riêng khỏi `subscribe` để client chỉ vẽ chart không phải gánh luồng trade vốn dày hơn nhiều. |
| `unsubscribeTrades` | *(không payload)* | Rời room `trades`; subscriber cuối cùng rời đi thì đóng stream aggTrade upstream. |

`interval` không hợp lệ (vd `"2h"`) → server emit `error`, **không** mở kết nối lên Binance, **không** join room.

**Server → Client**

| Event | Payload | Khi nào bắn |
|---|---|---|
| `candle` | `{ interval, timestamp, open, high, low, close, volume, closed }` — cùng shape với phần tử mảng của `GET /market-data/candles`, **thêm cờ `closed`** | Bắn cho **mọi** update của Binance, kể cả nến đang hình thành (`closed: false`). Đây là thứ làm chart chuyển động liên tục trong một interval; trước đây chỉ bắn nến đã đóng nên pane 1m trễ tới 1 phút, pane 4h trễ tới 4 giờ. Client vẽ đè lên đúng cây nến cùng `timestamp`. Chỉ gửi tới room `interval:<value>`, không broadcast toàn namespace. **Chỉ nến `closed: true` mới được ghi DB.** |
| `trade` | `{ tradeId, timestamp, price, quantity, buyerIsMaker }` | Mỗi lệnh khớp thật (Binance `btcusdt@aggTrade`), gửi tới room `trades`. Nguồn cho panel "Recent ticks" — trước đây panel này ăn từ stream nến nên không thể có quá 1 dòng mỗi timeframe. `buyerIsMaker: true` nghĩa là bên chủ động là người bán. |
| `status` | `{ connected: boolean, interval: string, lastMessageAt: string \| null }` | Gửi cho client ngay khi `subscribe` thành công (snapshot trạng thái hiện tại), và bắn lại cho cả room mỗi khi upstream đổi trạng thái kết nối (mở/rớt/reconnect). `lastMessageAt` là thời điểm nhận message gần nhất từ Binance, dùng cho panel "Trạng thái kết nối" trên UI — không phải trạng thái lạc quan cố định `connected: true`. |
| `error` | `{ message: string }` | `subscribe` với interval không hợp lệ. |

**Cơ chế 1 stream upstream / interval, đếm tham chiếu theo room:** nhiều client cùng subscribe `5m` chỉ mở **một** kết nối WebSocket lên Binance (`wss://stream.binance.com:9443/ws/btcusdt@kline_5m`), dùng chung. Subscriber cuối cùng rời đi (`unsubscribe` hoặc disconnect) → đóng stream upstream ngay, tránh rò rỉ kết nối theo từng tab trình duyệt bị đóng không sạch.

**Reconnect:** nếu kết nối lên Binance rớt, `BinanceClient.streamCandles` tự kết nối lại với backoff tăng dần theo cấp số nhân (bắt đầu 1s, tối đa 30s, reset về 1s khi kết nối lại thành công) — không gọi lại liên tục ("uncontrolled infinite loop" là anti-pattern bị cấm ở `docs/about-projects/03-anti-patterns-to-avoid.md`).

**Ghi DB:** chỉ nến đã đóng mới được ghi qua `CandleRepository.insertCandles` (upsert theo khoá `(timeframe, timestamp)`) — nến đang hình thành (chưa đóng) không được ghi, tránh làm hỏng chuỗi lịch sử mà backtest đọc.

## 3b. Strategy Engine — Realtime Signal

Fix cho anti-pattern "business logic ở frontend": trước đây `RealtimePage.tsx` tự suy ra badge `BUY`/`SELL` từ chiều tăng/giảm giá và tự tính MA(20) ngay trong component React — không đi qua Strategy Engine, không có strategy nào thực sự sinh ra tín hiệu đó. Endpoint dưới đây thay thế hoàn toàn logic đó bằng tín hiệu thật từ registry plugin.

### `GET /strategy-engine/signal?interval=5m`

Yêu cầu `Authorization: Bearer <accessToken>` (`JwtAuthGuard`).

`interval` bắt buộc, validate qua **đúng một** allow-list dùng chung với market-data (`assertAllowedInterval`, `market-data/config.ts`) — không có allow-list thứ hai. Giá trị ngoài `1m`/`5m`/`15m`/`1h`/`4h` → `400 Bad Request`.

**Cách tính (`RealtimeSignalService`, `service/src/modules/strategy-engine/realtime-signal.service.ts`):**
1. Lấy tối đa 300 nến gần nhất (BTCUSDT, đã đóng) qua `MarketDataService.getCandles` — cùng đường REST candles đã dùng, không đọc DB riêng.
2. Dựng 1 `CandidateDefinition` gồm **cả 4 plugin đang đăng ký** trong `StrategyRegistry` (`MA`, `RSI`, `BOLLINGER`, `SUPPORT_RESISTANCE`), mỗi plugin chạy ở **tham số mặc định** khai báo trong `parameterSchema` của chính nó — không có `if MA && RSI...` viết tay ở controller.
3. Gọi `CompositeStrategyService.analyze(...)` (module `composite-strategy`, cùng service dùng cho search/backtest) với `combination.method = 'WEIGHTED_VOTE'`, `buyThreshold = 0.3`, `sellThreshold = -0.3` (cùng ngưỡng mặc định `DomainGuidedRandomGenerator` dùng khi sinh candidate cho Search — một định nghĩa duy nhất, không phát minh ngưỡng thứ hai) và trọng số chia đều 4 plugin (`defaultEqualWeights`).
4. `ma20` tính server-side (SMA đóng trên nến gần nhất), `changePct` tính trên cùng cửa sổ 300 nến vừa lấy (`(lastClose − firstOpen) / firstOpen`).

**Response `200`**
```json
{
  "interval": "5m",
  "signal": "HOLD",
  "perStrategy": [
    { "type": "MA", "signal": "HOLD" },
    { "type": "RSI", "signal": "HOLD" },
    { "type": "BOLLINGER", "signal": "HOLD" },
    { "type": "SUPPORT_RESISTANCE", "signal": "SELL" }
  ],
  "ma20": 78878.823,
  "lastClose": 79151.65,
  "changePct": 1.946985838873539
}
```

`signal` là kết quả `WEIGHTED_VOTE` cuối cùng (giống trường `perStrategy[].signal` của mỗi plugin) — **luôn là output thật của Strategy Engine**, không có đường nào trong service này suy ra `BUY`/`SELL` từ chiều giá. Bằng chứng bằng test: `realtime-signal.service.spec.ts` dựng một chuỗi nến giảm giá liên tục nhưng ép các plugin trả `BUY`, và assert `signal` trả về vẫn là `BUY` — chứng minh kết quả đến từ plugin, không phải từ xu hướng giá.

Chưa có candle nào (thị trường/interval quá mới) → trả về placeholder trung lập, không đoán: `{ interval, signal: "HOLD", perStrategy: [], ma20: null, lastClose: 0, changePct: null }`.

**Lỗi:** `400` nếu `interval` không hợp lệ; `401` nếu thiếu/sai token.

**Frontend:** `web-platform/src/hooks/useStrategySignal.ts` — một instance/pane, fetch keyed theo `interval` riêng của pane đó (cùng kiểu isolation với `useMarketSocket`), abort request khi đổi interval/unmount. Badge hiển thị placeholder trung lập (`···` lúc đang tải, `—` khi lỗi) — không bao giờ mặc định `BUY`.

## 3c. AI Strategy

Toàn bộ endpoint yêu cầu `Authorization: Bearer <accessToken>` trừ `GET /ai-strategy/health` và `GET /ai-strategy/samples`. Sinh/lưu/chạy strategy do LLM viết bằng Python (contract `generate_signals(candles) -> [BUY|SELL|HOLD]`, một lời gọi cho cả chuỗi nến — xem `artifacts/ai-strategy.md`).

| Endpoint | Việc gì |
|---|---|
| `GET /ai-strategy/samples` | Vài prompt mẫu tĩnh cho panel "Mẫu mô tả" |
| `GET /ai-strategy/provider` | LLM nào đang được nối (`live`, `keySource`, `baseUrl`, `model`) |
| `POST /ai-strategy/generate` | `{ prompt }` → **enqueue** job `ai-generate`, trả `202` + trạng thái job — **không** trả `{ code, validation }` trong body POST |
| `GET /ai-strategy/generate/status` | Poll trạng thái job generate của user hiện tại; khi `COMPLETED`, `result` chứa `{ code, raw, providerName, validation }` |
| `POST /ai-strategy/validate` | `{ code }` → chạy lại 4 bước validate (parses/contract/safety/smoke) qua `validate.py`, không lưu |
| `POST /ai-strategy/save` | Lưu — xem chi tiết dưới |
| `GET /ai-strategy/mine` | Danh sách strategy AI **của user hiện tại**, không kèm `sourceCode` |
| `GET /ai-strategy/:id` | Chi tiết 1 strategy (kèm `sourceCode`), chỉ nếu thuộc user hiện tại |
| `POST /ai-strategy/:id/run` | Chạy thử 1 strategy đã lưu trên nến thật (`{ timeframe, limit }`), trả tín hiệu cho từng nến — endpoint "chạy thử" độc lập, khác với precompute nội bộ mà Strategy Search tự gọi |

### `POST /ai-strategy/generate`

Sinh strategy từ mô tả tự nhiên — **bất đồng bộ** qua queue `ai-generate` (BullMQ/Redis). API chỉ enqueue; gọi LLM + validate chạy trong **tiến trình worker** (`AiGenerateProcessor` → `AiStrategyService.generate()`). Xem `artifacts/queue.md` mục 4.1.

Frontend poll `GET /ai-strategy/generate/status` mỗi **2 giây** cho tới khi `status` khác `RUNNING` (`AiGenerateProvider`, cùng cadence với crawl/experiment).

**Request**
```json
{ "prompt": "Chiến lược MA crossover khi RSI quá mua..." }
```

**Response `202 Accepted`**
```json
{
  "jobId": "9c8b...-gen-1787629110884",
  "status": "RUNNING",
  "prompt": "Chiến lược MA crossover khi RSI quá mua...",
  "startedAt": null,
  "finishedAt": null,
  "error": null,
  "result": null
}
```

**Lỗi**
| Mã | Khi nào |
|---|---|
| `400` | `prompt` rỗng hoặc không hợp lệ |
| `401` | Thiếu/sai token |
| `409 Conflict` | User đã có job generate đang `RUNNING`/chờ — message chính xác: `"A generate job is already running for this account."` (không enqueue job mới, không thay thế job cũ) |

### `GET /ai-strategy/generate/status`

Trả job generate **in-flight** của user hiện tại, hoặc job **finished gần nhất** (completed/failed) nếu không còn job đang chạy. Client poll endpoint này sau `POST /ai-strategy/generate`.

**Response `200`** — cùng shape với response `202` của POST ở trên. Khi hoàn tất:

```json
{
  "jobId": "9c8b...-gen-1787629110884",
  "status": "COMPLETED",
  "prompt": "...",
  "startedAt": "2026-08-29T10:15:02.000Z",
  "finishedAt": "2026-08-29T10:15:18.000Z",
  "error": null,
  "result": {
    "code": "def generate_signals(candles):\n    ...",
    "raw": "...",
    "providerName": "openai-compatible",
    "validation": {
      "valid": true,
      "checks": [
        { "key": "parses", "passed": true, "message": "OK" },
        { "key": "contract", "passed": true, "message": "OK" },
        { "key": "safety", "passed": true, "message": "OK" },
        { "key": "smoke", "passed": true, "message": "OK" }
      ]
    }
  }
}
```

`status = FAILED` → `error` chứa lý do (LLM lỗi, timeout worker, v.v.), `result = null`.

**Response khi chưa từng generate** (không có job nào của user trong queue): trả `null` — trạng thái bình thường trước lần sinh đầu tiên.

**Lỗi:** `401` nếu thiếu/sai token.

### `POST /ai-strategy/save`

**Request** (task-15 thêm `domain`, **bắt buộc**)
```json
{ "name": "demo_ma_crossover", "code": "def generate_signals(candles):\n    ...", "domain": "TREND" }
```

`domain` ∈ `TREND` / `MOMENTUM` / `VOLATILITY` / `STRUCTURE` — không có giá trị mặc định, không suy đoán từ code. Lý do: một strategy AI cần domain để combinable trong Strategy Search (generator bắt buộc ≥ 1 domain định hướng + 1 domain xác nhận, xem mục 2), và domain của code Python là điều chỉ người viết prompt mới biết ý định thật ("đây là tín hiệu định hướng hay tín hiệu xác nhận"). Lưu vào cột `parameters` (jsonb) đã có sẵn của bảng `strategies`, dạng `{ "domain": "TREND" }` — không cần cột mới, không cần migration.

Trước khi lưu, code vẫn phải qua đủ 4 bước validate (parses/contract/safety/smoke) như cũ — `domain` không thay thế hay bỏ qua bước này. Mỗi lần lưu tạo **version mới**, không update đè (immutable, cùng quy tắc với strategy hệ thống).

**Response `201`**
```json
{
  "id": "6001f162-9a57-4972-90cf-07a594c732a7",
  "name": "demo_ma_crossover",
  "version": 1,
  "createdAt": "2026-08-25T08:41:09.559Z",
  "isActive": true,
  "domain": "TREND",
  "sourceCode": "def generate_signals(candles):\n    ..."
}
```

**Lỗi:** `400` nếu code không qua validate, hoặc thiếu/sai `domain`; `401` nếu thiếu/sai token.

`GET /ai-strategy/mine`/`GET /ai-strategy/:id` cũng trả thêm `domain` (kiểu `StrategyDomain | null` — `null` chỉ với dòng lưu trước khi `domain` bắt buộc; dòng này vẫn hiển thị được ở "Danh sách của tôi" nhưng bị loại khỏi danh mục Strategy Search, xem mục 2 `GET /strategy-plugin/strategies`).

## 4. News & Sentiment

**Cả 2 endpoint dưới đây yêu cầu `Authorization: Bearer <accessToken>`** (`JwtAuthGuard`), nhưng **không** giới hạn theo `user_id` — news là **dữ liệu dùng chung**, không thuộc sở hữu riêng của user nào, nên bất kỳ user đã đăng nhập nào cũng thấy toàn bộ news.

Bảng `news` (migration `003_candidate_auth_schema.sql`) chỉ có đúng các cột: `id, title, content, source, published_at, crawled_at, url, sentiment, sentiment_score` (`sentiment` là enum `sentiment_label`: `POSITIVE` / `NEUTRAL` / `NEGATIVE`). UI cần thêm `summary`, `coin`, `model`, `confidence` — **4 trường này không phải cột DB, không thêm migration cho chúng** (đổi schema sẽ ảnh hưởng mọi nhánh khác của đồng đội đang chạy song song). Chúng được **suy ra** ở tầng service:

| Trường UI cần | Suy ra từ | Vì sao không phải cột |
|---|---|---|
| `summary` | Cắt ngắn `content` (tối đa 240 ký tự, thêm `...`) | Bài viết gốc không có tóm tắt riêng trong DB |
| `coin` | Hằng số `"BTC"` | Toàn bộ hệ thống chỉ giới hạn phạm vi Binance BTCUSDT — không có khái niệm coin theo từng bài viết, nên đây là hằng số hệ thống, không phải giá trị theo hàng |
| `model` | Cấu hình (`SENTIMENT_MODEL_NAME`, mặc định `"FinBERT"` — chỉ là **nhãn hiển thị cấu hình**, xem ghi chú bên dưới) | Model dùng để phân loại là **thuộc tính của pipeline hiện tại**, không lưu theo từng hàng — trả về như một fact cấu hình trong response tổng hợp, không lặp lại trên từng `NewsItem` |
| `confidence` | Cột `sentiment_score` (đổi tên) | Không cần suy luận gì thêm, chỉ là alias tên trường theo hợp đồng UI |

> **Đính chính:** bản trước của tài liệu này ghi rằng `artifacts/decisions.md` "chốt" model sentiment là FinBERT — **sai**, người viết tài liệu này viết nhầm. `decisions.md` §3 nói ngược lại: **từ chối** phương án tự host/fine-tune FinBERT, và **để ngỏ** việc chọn model/API cụ thể ("cần chốt cụ thể model/API nào... khi bắt đầu code module này"). `"FinBERT"` ở đây chỉ là **giá trị mặc định của biến cấu hình** `SENTIMENT_MODEL_NAME` — một nhãn hiển thị do API báo cáo lại, không phải model sentiment thật đang chạy. Lựa chọn model/pipeline sentiment thật vẫn còn mở, theo đúng `decisions.md` §3.
>
> **Cập nhật (task-13):** điểm trên đã được chốt lại sau, xem `decisions.md` §8 — **FinBERT local là model thật đang chạy**, không chỉ là giá trị mặc định của config. Worker Python (`workers/news/`) tải model về `workers/news/models/finbert` và chạy qua `transformers`, đứng sau interface `SentimentProvider` (`workers/news/src/core/sentiment/provider.py`) để đổi model/API khác không cần sửa code crawler. `SENTIMENT_MODEL_NAME` ở service vẫn chỉ là nhãn hiển thị cấu hình cho response — service không tự chạy model, chỉ đọc lại `news.sentiment`/`news.sentiment_score` mà worker Python đã ghi.

### `POST /news/crawl`

Kích hoạt worker crawl tin tức + sentiment (`workers/news/main.py`) như một **tiến trình hệ điều hành riêng** — đúng ADR-005 (`decisions.md` §7): API không tự crawl, không tự `spawn` process Python nữa (từ task-16). API chỉ **enqueue** một job lên queue `news-crawl` (BullMQ/Redis) và trả về ngay lập tức; `spawn` process Python thật diễn ra bên trong **tiến trình worker riêng** (`service/src/worker.ts`), không block request HTTP trong lúc crawl chạy (có thể mất vài giây tới vài phút). Xem `artifacts/queue.md`.

Yêu cầu `Authorization: Bearer <accessToken>` (`JwtAuthGuard`) — không giới hạn theo `user_id` (crawl là hành động dùng chung, giống news).

**Request:** không có body.

**Response `202`**
```json
{
  "jobId": "crawl-1787629110884",
  "status": "RUNNING",
  "startedAt": "2026-08-25T03:38:30.884Z",
  "finishedAt": null,
  "exitCode": null,
  "error": null,
  "stopping": false,
  "summary": null
}
```

- Nếu đã có 1 crawl đang `RUNNING`/chờ trong queue, gọi lại endpoint này **không** enqueue thêm job song song — trả về **cùng job** đang chạy (coalesce, quét job đang in-flight trước khi `add()`), tránh nhiều crawler cùng đọc/ghi cùng lúc trên cùng nguồn RSS. **Ngoại lệ:** job đang trong trạng thái bị hủy (`cancelRequested`) thì **không** coalesce — trả về job sắp dừng để trả lời cho "bắt đầu crawl" là vô nghĩa; enqueue job mới, nó tự đợi job cũ thoát (concurrency = 1).
- Worker Python bị **kill (SIGKILL)** nếu chạy quá `NEWS_WORKER_TIMEOUT_MS` (mặc định 10 phút) — job BullMQ chuyển sang `failed` với lý do timeout, không treo tiến trình vô thời hạn (đúng nguyên tắc chống "uncontrolled infinite loop"). Job không tự động retry (`attempts: 1`) — một crawl lỗi giữa chừng không nên âm thầm chạy lại và crawl trùng cùng cửa sổ thời gian; người dùng bấm lại `POST /news/crawl` khi cần.
- **Trạng thái job lưu trong Redis** (BullMQ), không phải bộ nhớ tiến trình API — API restart giữa lúc crawl đang chạy **không** làm mất trạng thái, `GET /news/crawl/status` sau khi API khởi động lại vẫn đọc đúng job đang chạy trong worker.

### `GET /news/crawl/status`

Trả về job **gần nhất** (đang chạy/chờ, hoặc đã kết thúc gần nhất) đọc trực tiếp từ queue `news-crawl` trong Redis — client poll endpoint này sau `POST /news/crawl` để biết khi nào crawl xong.

Yêu cầu `Authorization: Bearer <accessToken>`.

**Response `200`** — cùng shape với response của `POST /news/crawl` ở trên. `status` là `RUNNING` / `COMPLETED` / `FAILED` / `CANCELLED`. `exitCode`/`error` chỉ có giá trị sau khi worker kết thúc; `error` chỉ khác `null` khi `status = FAILED` (worker exit code khác 0, timeout, hoặc lỗi spawn process — luôn kèm `stderr` thật của worker, không phải lỗi giả).

Hai trường bổ sung:

| Trường | Ý nghĩa |
|---|---|
| `stopping` | `true` khi đã yêu cầu dừng nhưng worker chưa thoát. UI hiển thị "Đang dừng worker…" thay vì nói dối là đã dừng hẳn. |
| `summary` | `{ new, updated, scored }` — lô vừa xong ghi thực sự bao nhiêu tin **mới** so với bao nhiêu tin chỉ được làm mới. `null` khi job đang chạy hoặc khi worker không in ra dòng tổng kết (crash) — **khác** với `new: 0`. |

> **Tại sao cần `summary`.** Nguồn RSS chỉ mang ~20-30 bài mới nhất, và worker upsert theo `url` (`ON CONFLICT DO UPDATE`). Một lần crawl chạy sau lần trước vài phút **hợp lệ** ghi 0 dòng mới — nhưng trước đây worker chỉ log "Upserted 42 article(s)" gộp cả cũ lẫn mới, và UI không hiển thị gì, nên trường hợp này **không phân biệt được với crawler hỏng**. Worker giờ in một dòng `NEWS_CRAWL_SUMMARY {...}` ra **stdout** (log đi stderr nên không lẫn), tách mới/cũ bằng `RETURNING (xmax = 0)` của Postgres; `NewsCrawlService` parse dòng đó và gắn vào kết quả job.

**Response khi chưa từng crawl lần nào** (chưa có job nào trong queue): trả `null` (không phải `404`) — trạng thái bình thường trước lần crawl đầu tiên.

**Lỗi:** `401` nếu thiếu/sai token.

### `POST /news/crawl/cancel`

Dừng crawl đang chạy ("Dừng Crawl" trên tab News & Sentiment). Yêu cầu `Authorization: Bearer <accessToken>`.

**Response `202`**: `{ "cancelled": true, "state": "active" }` — hoặc `{ "cancelled": false, "state": null }` khi không có job nào đang in-flight.

Cơ chế:

- Job **đang chờ trong queue** → xóa hẳn khỏi queue.
- Job **đang chạy** → ghi cờ `cancelRequested: true` vào job data. `NewsCrawlProcessor` đọc lại job từ Redis **mỗi giây**, thấy cờ thì `abort()` → `NewsCrawlService` gửi **SIGTERM** cho tiến trình Python, và **SIGKILL** sau 3 giây nếu nó chưa thoát. Job kết thúc với `status: CANCELLED` (không phải `FAILED` — người dùng chủ động dừng thì không phải lỗi).

> **Lỗi đã sửa.** Trước đây `cancel()` chỉ **ghi cờ** — không có chỗ nào đọc nó. Tiến trình Python chạy tiếp cho tới khi xong (tối đa 10 phút), nên bấm "Dừng Crawl" trên thực tế không có tác dụng. Kèm theo đó, UI chỉ hiện nút Dừng khi `crawlState === 'polling'`, nên trong 3 giây nghỉ giữa 2 lô tự động nút đó biến mất — nhấn vào đúng lúc đó lại là nút **Bật**.

**Lỗi:** `401` nếu thiếu/sai token.

### `GET /news?sentiment=POSITIVE\|NEUTRAL\|NEGATIVE&page=1&pageSize=20`

Danh sách bài báo đã crawl, mới nhất trước (`published_at DESC NULLS LAST, crawled_at DESC`).

Tất cả tham số đều **không bắt buộc**:
- `sentiment` — lọc theo nhãn. Nếu bỏ trống, câu SQL **không có mệnh đề `WHERE sentiment = ...`** (chứ không phải so sánh với `NULL`, việc đó sẽ âm thầm trả về 0 dòng). Giá trị không thuộc 3 nhãn hợp lệ bị từ chối `400` ngay ở tầng validate (`zod`), không truyền xuống SQL.
- `page` — mặc định `1`. Giá trị không phải số nguyên dương (`0`, âm, hoặc không phải số) bị từ chối `400`.
- `pageSize` — mặc định `20`, **kẹp tối đa 100** (không reject, chỉ kẹp) để client không xin một trang không giới hạn.

`LIMIT`/`OFFSET` được bind như tham số (`$n`), không nối chuỗi vào SQL.

**Response `200`**
```json
{
  "items": [
    {
      "id": "d2a4...",
      "title": "Bitcoin breaks $65k as ETF inflows accelerate",
      "summary": "Bitcoin climbed past $65,000 on Thursday as spot ETF inflows...",
      "source": "CoinDesk",
      "url": "https://example.com/article",
      "publishedAt": "2026-08-24T08:00:00.000Z",
      "sentiment": "POSITIVE",
      "sentimentScore": 0.874521,
      "coin": "BTC"
    }
  ],
  "total": 137
}
```

`total` luôn đến từ một câu `COUNT(*)` riêng trên cùng điều kiện lọc, **không** phải độ dài của `items` trả về (một trang chỉ có tối đa `pageSize` phần tử, `total` là tổng thật trên toàn bộ tập lọc).

**Trường hợp DB rỗng (0 bài news)** — trạng thái bình thường của lần demo đầu tiên: trả `{ "items": [], "total": 0 }`, không lỗi.

**Lỗi:** `400` nếu `sentiment`/`page`/`pageSize` không hợp lệ; `401` nếu thiếu/sai token.

### `GET /sentiment/summary?hours=24`

Tổng hợp sentiment trong `hours` giờ gần nhất (mặc định `24`, kẹp tối đa 1 năm, giá trị không hợp lệ bị từ chối `400`). **UI gọi với `hours=168` (7 ngày)** — trước là 24h, nhưng nguồn RSS chỉ mang ~20-30 bài mới nhất và phần lớn cũ hơn 1 ngày, nên panel chỉ phủ 5/39 bài trong khi danh sách bên cạnh hiện cả 39 — trông hệt như panel hỏng.

Câu SQL nhóm theo `sentiment` (`GROUP BY sentiment`), giới hạn `published_at >= now() - make_interval(hours => $1::int)`, và loại các bài **chưa được phân tích** (`sentiment IS NULL`) — bài chưa qua sentiment worker không được tính là bất kỳ nhãn nào.

**Phần trăm được tính ở tầng service, không phải SQL, không phải frontend** (đúng nguyên tắc "business logic không nằm ở frontend"). Khi `analyzed = 0` (DB rỗng hoặc không có bài nào trong khung giờ) — trạng thái bình thường của lần demo đầu — trả về **0 cho mọi trường tỷ lệ**, không chia cho 0 (tránh `NaN`/`Infinity` hiển thị vỡ giao diện).

**Response `200`**
```json
{
  "positive": 0.75,
  "neutral": 0.125,
  "negative": 0.125,
  "analyzed": 30,
  "total": 39,
  "averageConfidence": 0.8123,
  "model": "lexicon-v1",
  "hours": 168
}
```

| Trường | Ý nghĩa |
|---|---|
| `positive`/`neutral`/`negative` | Tỷ lệ (0–1) trong số bài **đã phân tích** (`analyzed`), tính bằng `count / analyzed` ở service |
| `analyzed` | Tổng số bài có `sentiment IS NOT NULL` trong khung giờ — có thể `0` |
| `total` | Tổng số bài trong khung giờ, **đã chấm hay chưa**. Mẫu số để UI hiện "30/39 tin đã phân tích" |
| `averageConfidence` | Trung bình `sentiment_score`, tính theo trọng số (weighted mean) qua các nhóm nhãn; `0` khi `analyzed = 0` |
| `model` | Provider **được cấu hình** (suy từ `SENTIMENT_PROVIDER`), không phải trường trên từng bài |
| `hours` | Khung giờ đã dùng, trả lại để UI tự gắn nhãn |

> **`analyzed` vs `total` — vì sao cần cả hai.** Panel từng chỉ có `analyzed`, nên khi nó bằng 0 thì màn hình chỉ nói "Chưa có tin tức nào được phân tích" cho **ba** tình huống khác hẳn nhau: (a) không có tin nào trong khung giờ, (b) có tin nhưng worker chưa chấm kịp, (c) provider sentiment không chạy được. Thực tế suốt thời gian dài nó là (c) — xem ghi chú provider bên dưới.

> **`model` ở đây là provider ĐƯỢC CẤU HÌNH, không phải bằng chứng đã chạy.** Bảng `news` không có cột model. Provider **thực sự** chấm từng lô được worker báo qua `GET /news/crawl/status` → `summary.model`, và UI ưu tiên giá trị đó. Trước đây trường này hard-code `'FinBERT'` — sai hẳn, vì FinBERT chưa bao giờ được cài.

**DB rỗng:** `{ "positive": 0, "neutral": 0, "negative": 0, "analyzed": 0, "total": 0, "averageConfidence": 0, "model": "FinBERT", "hours": 168 }`.

#### Provider sentiment — thứ tự xuống cấp

`workers/news/src/core/sentiment/factory.py` chọn theo `SENTIMENT_PROVIDER`, mặc định `finbert`:

| Provider | Điều kiện | Ghi chú |
|---|---|---|
| `FinBERT` | cần extra `[sentiment]` (torch + transformers) **và** file model trong `workers/news/models/finbert/` | Chính xác nhất, ~440MB weights |
| `lexicon-v1` | không cần gì | Từ điển tài chính/crypto có xử lý phủ định + từ nhấn mạnh. Chính xác thấp hơn nhưng **luôn chạy được** |
| `none` | chỉ khi `SENTIMENT_PROVIDER=none/noop/disabled` | Không chấm gì, mọi bài `sentiment = NULL` |

> **Lỗi đã sửa.** Thứ tự cũ là FinBERT → **no-op**. Vì `models/finbert/` chưa bao giờ được tạo và torch nằm trong extra không được cài, nhánh no-op **luôn luôn** được chọn: toàn bộ 39 bài trong DB có `sentiment = NULL`, panel Sentiment rỗng vĩnh viễn, **và** strategy `NEWS_SENTIMENT` (domain INFORMATION) abstain trên mọi candidate của mọi backtest — không có gì trên màn hình nói ra điều đó. No-op giờ chỉ còn đạt được khi **chủ động yêu cầu**: cố tình tắt sentiment thì ổn, vô tình tắt mới là vấn đề.

**Lỗi:** `400` nếu `hours` không hợp lệ; `401` nếu thiếu/sai token.

## 5. Endpoint health (chưa có logic thật)

Các module sau hiện chỉ có `GET /<module>/health` trả `{ "status": "ok", "module": "<tên>" }`:

`chart`, `composite-strategy`, `backtesting`, `leaderboard`, `continuous-loop`

Lưu ý: `composite-strategy`, `backtesting`, `leaderboard` **có logic thật** nhưng chỉ được gọi nội bộ qua DI từ `strategy-search` (và, từ mục 3b, từ `RealtimeSignalService`) — chúng chưa expose API riêng ra ngoài. Còn `chart`, `continuous-loop` thì rỗng hoàn toàn. `strategy-engine` **đã có API thật** (`GET /strategy-engine/signal`, xem mục 3b) bên cạnh `health`. `strategy-plugin` **đã có API thật** (`GET /strategy-plugin/strategies`, xem mục 2) bên cạnh `health`. `news`/`sentiment` đã có API thật, xem mục 4.

## 6. Quy ước lỗi

Dùng định dạng lỗi mặc định của NestJS:

```json
{
  "statusCode": 400,
  "message": "startTime and endTime must define a valid range.",
  "error": "Bad Request"
}
```

| Mã | Ý nghĩa trong hệ thống này |
|---|---|
| `400` | Dữ liệu vào không hợp lệ, hoặc điều kiện tiên quyết không thoả (thiếu nến) |
| `401` | Thiếu / sai / hết hạn access token |
| `404` | Không tồn tại **hoặc** không thuộc quyền sở hữu của user hiện tại |
| `409` | Xung đột (email đã đăng ký) |
| `500` | Lỗi không lường trước |

**Vì sao dùng `404` thay vì `403` cho tài nguyên của người khác:** trả `403` sẽ xác nhận "experiment này có tồn tại, chỉ là bạn không được xem" — rò rỉ thông tin. `404` không tiết lộ gì.

## 7. Nợ kỹ thuật đã biết

1. `market-data` chưa có auth guard.
2. WebSocket `/market` đã push nến realtime (xem mục 3). Push **leaderboard/experiment progress** thì chưa làm; frontend vẫn phải poll `GET /experiments/:id`.
3. **[Đã sửa — final-review finding #1]** Trước bản sửa cuối, `maxDurationSeconds`/`maxNoImprovement`/`topK` (và `minimumTrades`, trường đã bị gỡ sau này) chỉ nằm trong `configCache` (bộ nhớ trong tiến trình) do `start()` set, còn `run()` thực thi ở tiến trình **worker** riêng — worker không bao giờ gọi `start()` nên `configCache` của nó luôn rỗng, và **mọi search** (không chỉ trường hợp worker restart) đều âm thầm chạy với `DEFAULT_SEARCH_CONFIG` cho 4 tham số này. Hệ quả nghiêm trọng hơn: `getTop()` (chạy ở API, đọc `configCache` thật) và `leaderboard_entries` (worker ghi bằng default) trả về hai câu trả lời khác nhau cho cùng một experiment.
   Đã sửa bằng cách lưu 4 giá trị này vào cột mới `experiments.search_config` (JSONB, thêm bằng migration additive `004_experiment_search_config.sql` — `ALTER TABLE ... ADD COLUMN ... DEFAULT`, không đổi/xoá gì hiện có). Lưu ý: migration `002_domain_guided_search.sql` từng thêm một cột cùng tên, nhưng `003_candidate_auth_schema.sql` `DROP TABLE experiments CASCADE` rồi tạo lại **không có** cột đó — nên trên DB thật (đã chạy 003), cột của 002 không còn tồn tại; `004` mới là cột đang thực sự được dùng. Giá trị được ghi ngay lúc `start()` tạo experiment. `loadConfig()` giờ luôn đọc lại từ DB (`experiments.search_config` + `experiment_configs.iteration_limit` + `experiment_config_strategies`) thay vì tin tưởng `configCache`, nên API và worker — dù ở tiến trình nào, dù trước/sau restart — luôn thấy cùng một giá trị. `configCache` vẫn giữ lại như một optimization thuần tuý (tránh query lại trong cùng tiến trình), không còn là nơi duy nhất giữ sự thật. Xem `StrategySearchService.loadConfig`/`persistableSearchConfig`/`sanitizeSearchConfig`.
4. Chưa có validation pipe khai báo (dùng `class-validator`); hiện việc kiểm tra dữ liệu vào làm thủ công trong service (endpoint mới `news`/`sentiment` dùng `zod`, giống `auth`, thay vì `class-validator`).
5. `SentimentModule` phụ thuộc `NewsRepository` (export từ `NewsModule`) thay vì có repository sentiment riêng — hợp lý vì cả hai đọc cùng bảng `news`, nhưng nghĩa là ranh giới module "Sentiment" hiện chỉ là ranh giới đọc/tổng hợp, không có bảng riêng của nó.
6. (task-16) `POST /news/crawl` không tự động retry khi worker Python lỗi (`attempts: 1`, xem mục 4). Người dùng phải tự bấm lại. Đây là lựa chọn có chủ đích (một crawl thất bại retry mù có thể crawl trùng cùng cửa sổ thời gian), không phải thiếu sót — nhưng nghĩa là một lỗi thoáng qua (mất mạng RSS tạm thời) cần thao tác thủ công thay vì tự phục hồi.


## 8. Bổ sung sau đợt sửa theo tab "Flow" (2026-08-28)

### `POST /strategy-search/experiments` — tham số chi phí giao dịch

Body nhận thêm (tất cả đều tuỳ chọn, bỏ trống = hành vi cũ):

| Field | Kiểu | Mặc định | Miền giá trị |
|---|---|---|---|
| `initialCapital` | number | `10000` | 1 … 1 000 000 000 |
| `transactionCostPct` | number | `0` | 0 … 10 (phần trăm notional, **mỗi chiều**) |
| `slippageBps` | number | `0` | 0 … 1000 (basis point, **mỗi chiều**) |
| `stopLossPct` | number \| null | `null` (tắt) | 0.01 … 100 |
| `takeProfitPct` | number \| null | `null` (tắt) | 0.01 … 1000 |
| `topK` | int | `10` | **1 … 20** (trước đây 1…100) |

Lưu trong `experiments.search_config` JSONB dưới khoá `costs`, nên mọi process
(`API`, `worker`) dựng lại được đúng cấu hình — không cần migration. Row cũ không có
khoá `costs` → rơi về mặc định, tái lập đúng kết quả trước đây.

Cách áp dụng: mua khớp `close × (1 + slippage)`, bán khớp `close × (1 − slippage)`;
phí tính trên notional cả hai chiều; `notional = capital / (1 + fee)`. SL/TP kiểm tra
theo `low`/`high` **trong chính cây nến** (không chờ `close`), một nến chạm cả hai
thì lấy Stop Loss.

### `POST /strategy-search/experiments/:id/regenerate` — trường mới `summaries`

Response bổ sung `summaries`: mỗi tổ hợp vừa sinh lại kèm **hạng thật trên tổng số**
candidate của experiment (`RANK() OVER` trên toàn bộ, không chỉ Top-K).

```json
{
  "regenerated": 2,
  "skipped": 0,
  "candidateIds": ["…"],
  "summaries": [
    { "candidateId": "…", "combo": "MA + RSI", "rank": 37, "total": 100,
      "overallScore": 54.2, "profitLoss": -12.5, "winRate": 0.41,
      "maxDrawdown": -8.2, "numberOfTrades": 24 }
  ]
}
```

Lý do: version tham số người dùng tự chỉnh thường **không lọt Top-K**, nên trước đây
nhìn như hệ thống không tạo gì cả. FE hiển thị chúng ở mục riêng **"Version của
tôi"** dưới bảng Top-K.

### `GET /ai-strategy/provider`

Cho biết LLM nào đang thực sự được nối. Không có endpoint này thì không phân biệt
được "key đúng" với "không có key" — provider giả lập trả về Python **hợp lệ**.

```json
{ "name": "openai-compatible", "live": true, "keySource": "OPENROUTER_API_KEY",
  "baseUrl": "https://openrouter.ai/api/v1", "model": "openai/gpt-4o-mini" }
```

`live: false` ⇒ chưa cấu hình key nào (hoặc key đặt dưới tên biến backend không
đọc). Backend chấp nhận **`OPENAI_API_KEY`** hoặc **`OPENROUTER_API_KEY`**.
