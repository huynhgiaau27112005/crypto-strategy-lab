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
| News | 1 endpoint + health | ✅ Hoạt động |
| Sentiment | 1 endpoint + health | ✅ Hoạt động |
| Strategy Engine | `GET /strategy-engine/signal` + health | ✅ Hoạt động — realtime signal, có auth |
| Chart / Continuous Loop / Leaderboard / Strategy Plugin / Composite / Backtesting | chỉ có `GET /<module>/health` | ❌ Stub, chưa có API thật |

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

Bắt đầu một lần chạy tìm kiếm. Chạy **bất đồng bộ**: trả về ngay `202`, vòng lặp search chạy nền.

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
  "minimumTrades": 20,
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
| `minimumTrades` | ❌ | 20 | số nguyên 0–10000 |
| `enabledDomains` | ❌ | cả 4 | `TREND` / `MOMENTUM` / `VOLATILITY` / `STRUCTURE` |
| `strategyWeights` | ❌ | chia đều | mỗi trọng số là số hữu hạn, `>= 0`; không được **tất cả bằng 0** |

> **Công thức điểm tổng hợp (`CompositeStrategyService.analyze`):** `Điểm tổng hợp = Σ (trọng số × tín hiệu) / Σ trọng số` — một **weighted average**, không phải weighted sum. Vì có chia cho tổng trọng số, **`strategyWeights` không bắt buộc phải tổng bằng 1** — công thức tự chuẩn hoá, điểm luôn nằm trong `[-1, 1]` với bất kỳ bộ trọng số dương nào (vd. `0.25/0.25/0.20/0.45`, tổng 1.15, vẫn hợp lệ). Mẫu số là tổng trọng số của **toàn bộ member có trọng số** (không chỉ member ra tín hiệu BUY/SELL) — một member HOLD vẫn tính vào mẫu số, đúng nghĩa "phiếu trắng" kéo điểm về gần 0. Nếu mẫu số bằng 0 (không có trọng số nào, hoặc tất cả bằng 0), service trả về `score = 0` và `signal = HOLD` thay vì `NaN` — nhưng trường hợp này bị chặn sớm hơn, ngay ở `POST /strategy-search/experiments` (xem lỗi `400` bên dưới), không để lọt xuống tầng tính điểm.
>
> **Ràng buộc coverage:** `strategyWeights` phải khớp **chính xác** với tập strategy type suy ra từ `enabledDomains` (TREND→MA, MOMENTUM→RSI, VOLATILITY→BOLLINGER, STRUCTURE→SUPPORT_RESISTANCE) — theo cả hai chiều: thiếu weight cho domain đã bật, hoặc thừa weight cho domain chưa bật, đều bị từ chối với `400`.

**Response `202 Accepted`**
```json
{ "experimentId": "3f2a...-....", "status": "PENDING" }
```

**Lỗi**
| Mã | Khi nào |
|---|---|
| `400` | `timeframe` không hỗ trợ; khoảng thời gian không hợp lệ; số nằm ngoài khoảng; `strategyWeights` có trọng số âm hoặc không phải số hữu hạn; `strategyWeights` tất cả bằng 0; `strategyWeights` không khớp chính xác với các type suy ra từ `enabledDomains` (thiếu hoặc thừa type, xem ghi chú coverage phía trên); strategy type không tồn tại; thiếu ít nhất 1 domain "định hướng" (TREND/STRUCTURE) và 1 domain "xác nhận" (MOMENTUM/VOLATILITY); **dữ liệu nến không đủ** |
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

`limit` không bắt buộc, mặc định 10, tự kẹp vào khoảng 1–100.

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

Chỉ trả candidate có `backtest_runs.status = 'COMPLETED'` **và** `number_of_trades >= minimumTrades` — lọc bỏ những chiến lược ăn may vài lệnh.

**Lỗi:** `404` / `401` như trên.

### `POST /strategy-search/experiments/:id/cancel`

Dừng vòng lặp đang chạy.

**Response `200`**
```json
{ "id": "3f2a...", "cancelled": true }
```

`cancelled: false` nghĩa là experiment đã ở trạng thái kết thúc (không còn gì để huỷ).

**Lỗi:** `404` / `401` như trên.

### `POST /strategy-search/experiments/:id/extend`

"Chạy thêm N iteration" — nút **Chạy thêm 10 iteration** ở tab Leaderboard. Tiếp tục vòng lặp search của một experiment **đã `COMPLETED`**, tái sử dụng nguyên config đã lưu (`experiment_configs` + `experiment_config_strategies`: timeframe, khoảng ngày, weights, domains) — **không** tạo experiment mới, **không** dựng lại config, **không** xoá leaderboard hiện có. Đây là điểm khác biệt duy nhất với "Đổi config & tạo lại" (`POST /strategy-search/experiments`), vốn luôn tạo một experiment mới từ đầu.

Chạy **bất đồng bộ** giống `POST /strategy-search/experiments`: trả về ngay `202`, vòng lặp search tiếp tục chạy nền bằng đúng `run()` đã dùng cho lần chạy gốc (không có vòng lặp thứ hai).

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

Yêu cầu `Authorization: Bearer <accessToken>` (`JwtAuthGuard`). Trả danh mục strategy — nguồn dữ liệu cho bảng weighted-voting ở frontend (`StrategySelectionContext`) và cho việc dựng `strategyWeights` khi gọi `POST /strategy-search/experiments`. **Đây không còn là stub chỉ có health** — `StrategyPluginService.listCatalog()` trộn 2 nguồn: metadata tĩnh từ từng `StrategyPlugin` đã đăng ký trong `StrategyRegistry` (`MA`, `RSI`, `BOLLINGER`, `SUPPORT_RESISTANCE`) với `id`/`version` thật đọc từ bảng `strategies` qua `StrategyRepository.listSystemStrategies()`.

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
  }
]
```

`strategyId`/`version` là `null` nếu plugin đã đăng ký trong registry nhưng chưa có row tương ứng trong bảng `strategies` (lệch dữ liệu giữa code và DB) — trường hợp này không bị chặn ở tầng API, frontend cần tự chịu `null`.

**Lỗi:** `401` nếu thiếu/sai token.

### `GET /strategy-plugin/strategies/:name/versions`

Yêu cầu `Authorization: Bearer <accessToken>`. Trả **mọi version** của strategy `:name` (vd. `MA`) mà user hiện tại được phép xem: dòng SYSTEM dùng chung cho mọi user, cộng với các dòng USER do chính user này lưu — **không bao giờ trả về dòng USER của user khác** (`StrategyRepository.listVersions` lọc bằng `owner_user_id = $2` ngay trong WHERE, không lọc lại ở tầng service). Sắp theo `version ASC`.

**Response `200`**
```json
[
  { "strategyId": "0d14...", "name": "MA", "version": 1, "type": "SYSTEM", "parameters": {}, "isMine": false, "createdAt": "2026-08-23T17:06:44.145Z" },
  { "strategyId": "e314...", "name": "MA", "version": 2, "type": "USER", "parameters": { "fastPeriod": 15, "slowPeriod": 40 }, "isMine": true, "createdAt": "2026-08-25T02:53:43.711Z" }
]
```

**Lỗi:** `404` nếu `:name` không khớp plugin nào đã đăng ký trong `StrategyRegistry`; `401` nếu thiếu/sai token.

### `POST /strategy-plugin/strategies/:name/versions`

Yêu cầu `Authorization: Bearer <accessToken>`. **Lưu một version tham số mới cho strategy `:name` — luôn INSERT một row mới, không bao giờ UPDATE row đã tồn tại.** Đây là bất biến quan trọng nhất của endpoint này: một Experiment đã tham chiếu version cũ (qua `candidate_strategies.strategy_id`/`experiment_config_strategies.strategy_id`) tiếp tục tham chiếu đúng row cũ, kết quả đã backtest không bị thay đổi retroactively.

Kể cả khi `:name` đang là strategy `SYSTEM`, row mới lưu ra luôn có `type = 'USER'` và `owner_user_id` = user hiện tại — danh mục SYSTEM dùng chung cho mọi user **không bao giờ bị sửa** bởi thao tác lưu version của một user.

**Request**
```json
{ "parameters": { "fastPeriod": 15, "slowPeriod": 40 } }
```

Validate 2 lớp:
- `zod` ở tầng controller: `parameters` phải là object, mọi value phải là số hữu hạn.
- **`StrategyPluginService.validateParameters` (tầng service, authoritative — không tin client):** so khớp với `parameterSchema` thật của plugin đọc từ `StrategyRegistry` — từ chối key lạ (`unknown`), thiếu key (`missing`), sai kiểu (`int` mà không phải số nguyên), ngoài khoảng `[min, max]`, hoặc không phải bội số của `step` tính từ `min`.

**Response `201`** — row vừa tạo, cùng shape với 1 phần tử của `GET .../versions`:
```json
{ "strategyId": "c2c2...", "name": "MA", "version": 3, "type": "USER", "parameters": { "fastPeriod": 10, "slowPeriod": 30 }, "isMine": true, "createdAt": "2026-08-25T02:55:10.000Z" }
```

**Concurrency:** version tiếp theo được tính bằng `MAX(version) + 1` tại thời điểm insert, trong 1 transaction. Nếu 2 request lưu đồng thời cùng tính ra cùng 1 số version, unique index `uk_strategies_name_version` sẽ chặn request thua ở lỗi Postgres `23505`; `StrategyRepository.createVersion` bắt lỗi này và **tự động retry** (tính lại `MAX(version)+1`, insert lại), tối đa 5 lần, thay vì để request thua thất bại.

**Không nằm trong phạm vi endpoint này:** prototype UI mô tả "mỗi lần lưu tạo version mới, hệ thống sinh lại mọi tổ hợp có chứa strategy này thành version tổ hợp mới trong Leaderboard" — hành vi sinh lại tổ hợp Leaderboard **chưa được implement**. Lưu version tham số ở đây chỉ ảnh hưởng tới bảng `strategies`, không đụng tới `experiments`/`leaderboards` đã có.

**Lỗi:** `400` nếu tham số sai kiểu/ngoài khoảng/thiếu/thừa key (theo `parameterSchema`); `404` nếu `:name` không khớp plugin nào đã đăng ký; `401` nếu thiếu/sai token.

## 3. Market Data

> ⚠️ **Chưa có auth** — đây là nợ kỹ thuật đã biết, cần bổ sung `JwtAuthGuard` cho nhất quán với phần còn lại.

### `GET /market-data/candles?symbol=BTCUSDT&interval=5m&limit=500`

Lấy nến **trực tiếp từ Binance** (không đọc DB). `limit` mặc định 500.

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

`interval` không hợp lệ (vd `"2h"`) → server emit `error`, **không** mở kết nối lên Binance, **không** join room.

**Server → Client**

| Event | Payload | Khi nào bắn |
|---|---|---|
| `candle` | `{ interval, timestamp, open, high, low, close, volume }` — cùng shape với phần tử mảng của `GET /market-data/candles` (`timestamp` là ISO 8601, các giá trị giá/khối lượng là chuỗi) | Chỉ khi nến của Binance đã **đóng** (kline `x: true` phía Binance — chi tiết wire-format này không lộ ra ngoài `binance.client.ts`). Chỉ gửi tới room `interval:<value>` tương ứng, không broadcast toàn namespace. |
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

Tổng hợp sentiment trong `hours` giờ gần nhất (mặc định `24`, kẹp tối đa 1 năm, giá trị không hợp lệ bị từ chối `400`).

Câu SQL nhóm theo `sentiment` (`GROUP BY sentiment`), giới hạn `published_at >= now() - make_interval(hours => $1::int)`, và loại các bài **chưa được phân tích** (`sentiment IS NULL`) — bài chưa qua sentiment worker không được tính là bất kỳ nhãn nào.

**Phần trăm được tính ở tầng service, không phải SQL, không phải frontend** (đúng nguyên tắc "business logic không nằm ở frontend"). Khi `analyzed = 0` (DB rỗng hoặc không có bài nào trong khung giờ) — trạng thái bình thường của lần demo đầu — trả về **0 cho mọi trường tỷ lệ**, không chia cho 0 (tránh `NaN`/`Infinity` hiển thị vỡ giao diện).

**Response `200`**
```json
{
  "positive": 0.75,
  "neutral": 0.125,
  "negative": 0.125,
  "analyzed": 8,
  "averageConfidence": 0.8123,
  "model": "FinBERT"
}
```

| Trường | Ý nghĩa |
|---|---|
| `positive`/`neutral`/`negative` | Tỷ lệ (0–1) trong số bài **đã phân tích** (`analyzed`), tính bằng `count / analyzed` ở service |
| `analyzed` | Tổng số bài có `sentiment IS NOT NULL` trong khung giờ — có thể `0` |
| `averageConfidence` | Trung bình `sentiment_score`, tính theo trọng số (weighted mean) qua các nhóm nhãn; `0` khi `analyzed = 0` |
| `model` | Fact cấu hình (`FinBERT`), không phải trường trên từng bài — xem bảng suy ra ở trên |

**DB rỗng:** `{ "positive": 0, "neutral": 0, "negative": 0, "analyzed": 0, "averageConfidence": 0, "model": "FinBERT" }`.

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
3. Một phần cấu hình search (`maxDurationSeconds`, `maxNoImprovement`, `topK`, `minimumTrades`) chỉ nằm trong bộ nhớ tiến trình; chỉ `maxCandidates` được lưu xuống DB (cột `experiment_configs.iteration_limit`). Nếu service restart giữa chừng, vòng lặp resume sẽ dùng giá trị mặc định cho các tham số còn lại.
4. Chưa có validation pipe khai báo (dùng `class-validator`); hiện việc kiểm tra dữ liệu vào làm thủ công trong service (endpoint mới `news`/`sentiment` dùng `zod`, giống `auth`, thay vì `class-validator`).
5. `SentimentModule` phụ thuộc `NewsRepository` (export từ `NewsModule`) thay vì có repository sentiment riêng — hợp lý vì cả hai đọc cùng bảng `news`, nhưng nghĩa là ranh giới module "Sentiment" hiện chỉ là ranh giới đọc/tổng hợp, không có bảng riêng của nó.
