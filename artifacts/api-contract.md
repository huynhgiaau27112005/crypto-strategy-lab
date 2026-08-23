# API Contract thực tế

> Mô tả các endpoint **đã thực sự tồn tại và chạy được** trong `service/`, không phải API dự kiến. Nguồn sự thật là các file `*.controller.ts`.
>
> Base URL mặc định: `http://localhost:3000`. CORS mở cho `WEB_ORIGIN` (mặc định `http://localhost:5173`).

## 0. Tổng quan trạng thái

| Nhóm | Endpoint | Trạng thái |
|---|---|---|
| Auth | 4 endpoint | ✅ Hoạt động, đã smoke test thật |
| Strategy Search | 4 endpoint + health | ✅ Hoạt động, đã smoke test full vòng |
| Market Data | 2 endpoint | ⚠️ Hoạt động nhưng **chưa có auth**, chưa có realtime WebSocket |
| Chart / News / Sentiment / Continuous Loop / Leaderboard / Strategy Engine / Strategy Plugin / Composite / Backtesting | chỉ có `GET /<module>/health` | ❌ Stub, chưa có API thật |

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

**Toàn bộ 4 endpoint dưới đây yêu cầu `Authorization: Bearer <accessToken>`.** Thiếu hoặc sai token → `401`.

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
  "enabledDomains": ["TREND", "MOMENTUM", "VOLATILITY", "STRUCTURE"],
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
| `strategyWeights` | ❌ | chia đều | tổng phải **= 1** (sai số ≤ 1e-4) |

**Response `202 Accepted`**
```json
{ "experimentId": "3f2a...-....", "status": "PENDING" }
```

**Lỗi**
| Mã | Khi nào |
|---|---|
| `400` | `timeframe` không hỗ trợ; khoảng thời gian không hợp lệ; số nằm ngoài khoảng; `strategyWeights` không tổng bằng 1; strategy type không tồn tại; thiếu ít nhất 1 domain "định hướng" (TREND/STRUCTURE) và 1 domain "xác nhận" (MOMENTUM/VOLATILITY); **dữ liệu nến không đủ** |
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

### `GET /strategy-search/health`

Không cần auth. Trả `{ "status": "ok", "module": "strategy-search" }`.

## 3. Market Data

> ⚠️ **Chưa có auth** — đây là nợ kỹ thuật đã biết, cần bổ sung `JwtAuthGuard` cho nhất quán với phần còn lại.

### `GET /market-data/candles?symbol=BTCUSDT&interval=5m&limit=500`

Lấy nến **trực tiếp từ Binance** (không đọc DB). `limit` mặc định 500.

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

**Request**
```json
{ "symbol": "BTCUSDT", "interval": "5m", "limit": 500 }
```

**Response `200`**
```json
{ "symbol": "BTCUSDT", "interval": "5m", "count": 500 }
```

## 4. Endpoint health (chưa có logic thật)

Các module sau hiện chỉ có `GET /<module>/health` trả `{ "status": "ok", "module": "<tên>" }`:

`chart`, `strategy-engine`, `strategy-plugin`, `composite-strategy`, `backtesting`, `leaderboard`, `continuous-loop`, `news`, `sentiment`

Lưu ý: `strategy-engine`, `composite-strategy`, `backtesting`, `leaderboard` **có logic thật** nhưng chỉ được gọi nội bộ qua DI từ `strategy-search` — chúng chưa expose API riêng ra ngoài. Còn `chart`, `continuous-loop`, `news`, `sentiment` thì rỗng hoàn toàn.

## 5. Quy ước lỗi

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

## 6. Nợ kỹ thuật đã biết

1. `market-data` chưa có auth guard.
2. Chưa có WebSocket — realtime chart và push leaderboard theo yêu cầu đề bài chưa làm; hiện frontend phải poll `GET /experiments/:id`.
3. Một phần cấu hình search (`maxDurationSeconds`, `maxNoImprovement`, `topK`, `minimumTrades`) chỉ nằm trong bộ nhớ tiến trình; chỉ `maxCandidates` được lưu xuống DB (cột `experiment_configs.iteration_limit`). Nếu service restart giữa chừng, vòng lặp resume sẽ dùng giá trị mặc định cho các tham số còn lại.
4. Chưa có validation pipe khai báo (dùng `class-validator`); hiện việc kiểm tra dữ liệu vào làm thủ công trong service.
