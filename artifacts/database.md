# Thiết kế Database thực tế

> Tài liệu này mô tả schema **đã thực sự migrate và chạy** trên PostgreSQL + TimescaleDB, không phải bản thiết kế dự kiến. Nguồn sự thật của schema là `database/migrations/*.sql`.
>
> Trạng thái: schema đã apply thành công (`003_candidate_auth_schema.sql`), seed 4 SYSTEM strategy đã chạy. Code backend đang được rewire sang schema này (xem `artifacts/decisions.md` mục 4c).

## 1. Hạ tầng & công cụ

| Hạng mục | Lựa chọn thực tế |
|---|---|
| CSDL | PostgreSQL 18 + **TimescaleDB** (image `timescale/timescaledb-ha:pg18`) |
| Khởi chạy | `docker-compose.yml` ở root, service `timescaledb`, cổng host **6543** → container 5432 |
| DB name | `crypto_strategy_lab` |
| Migration runner | `database/migrate.js` — script tự viết, **không dùng ORM, không dùng node-pg-migrate** |
| Cách chạy | `cd database && npm run db:migrate && npm run db:seed && npm run db:check` |
| Theo dõi migration | Bảng `schema_migrations` (tên file + thời điểm apply) — mỗi file `.sql` chỉ chạy đúng 1 lần |
| Truy cập từ backend | Raw `pg.Pool` qua `service/src/database/database.service.ts` — **không ORM** (không TypeORM/Prisma) |

**Vì sao không dùng ORM:** đồ án cần thể hiện rõ ranh giới module và quyền sở hữu dữ liệu ở tầng kiến trúc. Raw SQL + repository pattern làm ranh giới đó hiện rõ trong code (mỗi module chỉ có repository của riêng nó), đồng thời tránh "magic" của ORM che mất luồng truy vấn khi present.

### Danh sách file migration

| File | Nội dung |
|---|---|
| `001_initial_schema.sql` | Schema đời đầu: mô hình phẳng + `sessions` ẩn danh (do đồng đội viết) |
| `002_domain_guided_search.sql` | Bổ sung cột phục vụ domain-guided search cho mô hình cũ |
| `003_candidate_auth_schema.sql` | **Hiện hành** — thay thế mô hình phẳng bằng mô hình Candidate + Auth thật |
| `seeds/001_initial_seed.sql` | Seed candles mẫu (phần seed `sessions`/`leaderboards` cũ đã gỡ vì bảng không còn) |
| `seeds/002_system_strategies.sql` | Seed 4 SYSTEM strategy: MA, RSI, BOLLINGER, SUPPORT_RESISTANCE |

`003` là migration **thay thế cấu trúc** (drop 8 bảng cũ rồi tạo lại theo mô hình mới), có chủ đích phá huỷ dữ liệu cũ — chấp nhận được vì dữ liệu dev là dữ liệu vứt đi được. Toàn bộ `CREATE TABLE`/`CREATE INDEX` đều có `IF NOT EXISTS` và enum được bọc `DO $$ ... EXCEPTION WHEN duplicate_object` nên chạy lại nhiều lần vẫn an toàn.

## 2. Bốn khái niệm cốt lõi (quan trọng nhất khi vấn đáp)

Đây là điểm thiết kế đáng giá nhất của schema — tách bạch 4 thứ mà hệ thống non tay hay gộp làm một:

```
Strategy          = THUẬT TOÁN nào tồn tại        → MA, RSI, BOLLINGER, SUPPORT_RESISTANCE
     ↓
Experiment        = MỘT LẦN CHẠY search            → "chạy tìm kiếm lúc 14h ngày 24/8"
     ↓
Config            = TÌM KIẾM NHƯ THẾ NÀO           → timeframe 5m, 01/01→01/07, weight MA .3/RSI .3/BB .4, giới hạn 50 vòng
     ↓
Candidate         = MỘT TỔ HỢP THAM SỐ CỤ THỂ      → MA(20,50) + RSI(14,30,70) + BB(20, 2.0)
```

**Vì sao phải tách?** Nếu gộp Strategy và Candidate làm một, mỗi lần search sinh ra 100 tổ hợp tham số là 100 dòng "strategy" mới → bảng `strategies` phình vô hạn và mất ý nghĩa "thuật toán". Tách ra thì `strategies` mãi mãi chỉ có 4 dòng bất biến, còn mọi biến thể tham số nằm ở `candidate_strategies`.

**Weight nằm ở đâu và vì sao?** `weight` (tỉ trọng bỏ phiếu của từng strategy) thuộc về **Config**, không thuộc về Candidate. Vì trong một lần search, người dùng cố định "tôi tin MA 30%, RSI 30%, BB 40%" rồi để máy dò tham số; mọi candidate trong cùng experiment dùng chung bộ weight đó. Nếu đổi weight → đó là một câu hỏi nghiên cứu khác → tạo Experiment mới, giữ nguyên experiment cũ để so sánh.

## 3. Sơ đồ quan hệ

```
                    users
                      │
        ┌─────────────┼──────────────┬──────────────┐
        ▼             ▼              ▼              │
 refresh_tokens   strategies    experiments         │
                      │              │              │
                      │              ├──────────────┴──► leaderboards (1:1)
                      │              │                        │
                      │              ▼                        ▼
                      │      experiment_configs (1:1)   leaderboard_entries
                      │              │                        │
                      │              ▼                        │
                      └──► experiment_config_strategies       │
                      │      (weight ở đây)                   │
                      │                                       │
                      │      experiment_iterations            │
                      │              │ 1:1                    │
                      │              ▼                        │
                      │          candidates ◄─────────────────┘
                      │              │
                      └──► candidate_strategies (parameters ở đây)
                                     │ 1:1
                                     ▼
                              backtest_runs
                                     │
                          ┌──────────┴──────────┐
                          ▼ 1:n                 ▼ 1:1
                       trades              evaluations


   candles  ──  dữ liệu thị trường DÙNG CHUNG, không thuộc user nào
   (TimescaleDB hypertable)

   news     ──  tin tức + kết quả sentiment
```

## 4. Chi tiết từng nhóm bảng

### 4.1 Xác thực người dùng

**`users`** — tài khoản đăng nhập.

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `email` | varchar(255) | **UNIQUE** — định danh đăng nhập |
| `password_hash` | text | bcrypt cost 10. **Không bao giờ lưu plaintext** |
| `display_name` | varchar(100) | nullable |
| `status` | enum `user_status` | ACTIVE / INACTIVE / SUSPENDED |
| `created_at`, `updated_at` | timestamptz | |

**`refresh_tokens`** — phiên đăng nhập dài hạn.

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid FK → users | ON DELETE CASCADE |
| `token_hash` | text UNIQUE | **Chỉ lưu SHA-256 của token**, không lưu token gốc |
| `expires_at` | timestamptz | mặc định 30 ngày |
| `revoked_at` | timestamptz nullable | đánh dấu khi logout hoặc khi token được xoay vòng |
| `created_at` | timestamptz | |

**Vì sao chỉ lưu hash của refresh token?** Nếu DB bị lộ, kẻ tấn công có hash cũng không dùng để đăng nhập được (server so sánh bằng cách hash token client gửi lên rồi tra bảng). Đây là cùng một lý do với việc hash mật khẩu.

**Cơ chế:** access token là JWT ngắn hạn (15 phút, không lưu DB — server chỉ verify chữ ký). Refresh token dài hạn (30 ngày, lưu hash trong DB) dùng để xin access token mới. Khi refresh, token cũ bị `revoked_at` và cấp token mới (token rotation).

### 4.2 Dữ liệu thị trường

**`candles`** — nến OHLCV, **dùng chung cho mọi user**, không có `user_id`.

| Cột | Kiểu |
|---|---|
| `timeframe` | enum `app_timeframe` (1m/5m/15m/1h/4h) |
| `timestamp` | timestamptz |
| `open`, `high`, `low`, `close`, `volume` | numeric(30,12) |

PK: `(timeframe, timestamp)` — một cây nến được định danh duy nhất bởi khung thời gian + thời điểm mở.

**TimescaleDB hypertable:** bảng này được convert thành hypertable phân mảnh theo `timestamp` (`create_hypertable('candles', by_range('timestamp'))`). Lý do: dữ liệu nến là time-series ghi liên tục và luôn truy vấn theo khoảng thời gian (`WHERE timestamp >= X AND timestamp < Y`) — hypertable tự chia nhỏ theo chunk thời gian nên truy vấn khoảng chỉ quét đúng chunk liên quan thay vì cả bảng.

**Vì sao không có `user_id`/`symbol`:** MVP cố định phạm vi Binance / BTCUSDT, và dữ liệu thị trường là sự thật khách quan — không thuộc sở hữu ai. Mọi experiment của mọi user đều đọc chung một bộ nến, không nhân bản dữ liệu.

### 4.3 Strategy

**`strategies`** — chỉ chứa **4 dòng SYSTEM bất biến**.

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | uuid PK | |
| `owner_user_id` | uuid FK → users, nullable | NULL với SYSTEM; bắt buộc với USER/AI_GENERATED |
| `name` | varchar(255) | `MA`, `RSI`, `BOLLINGER`, `SUPPORT_RESISTANCE` |
| `type` | enum `strategy_type` | SYSTEM / USER / AI_GENERATED |
| `version` | int | UNIQUE cùng `name` |
| `parameters` | jsonb | tham số mặc định/metadata |
| `is_active` | boolean | |

**Ràng buộc quan trọng:** 4 giá trị `name` phải khớp **chính xác** với union type `SearchStrategyType` trong `service/src/modules/strategy-search/domain/search.types.ts`, vì code tra cứu strategy theo tên. Đổi tên ở một nơi mà không đổi nơi kia sẽ gãy lúc runtime chứ không phải lúc compile.

**Bất biến (immutable):** đổi tham số/logic của một strategy → tạo `version` mới, không UPDATE dòng cũ. Nhờ vậy một experiment cũ vẫn truy vết được chính xác phiên bản strategy đã sinh ra kết quả đó (yêu cầu reproducibility của đề bài).

### 4.4 Experiment & cấu hình tìm kiếm

**`experiments`** — một lần chạy search.

| Cột | Ghi chú |
|---|---|
| `id` | uuid PK |
| `user_id` | FK → users — ai sở hữu lần chạy này |
| `name` | nullable |
| `status` | enum: PENDING / RUNNING / COMPLETED / FAILED / CANCELLED |
| `started_at`, `completed_at`, `created_at` | |

**`experiment_configs`** — cấu hình, quan hệ **1:1** với experiment (`experiment_id` UNIQUE).

| Cột | Ghi chú |
|---|---|
| `timeframe` | enum app_timeframe |
| `start_time`, `end_time` | khoảng dữ liệu lịch sử để backtest |
| `iteration_limit` | số vòng tối đa (nút `+10` tăng giá trị này, **không** tạo experiment mới) |

**`experiment_config_strategies`** — chọn strategy nào + **weight**.

| Cột | Ghi chú |
|---|---|
| `experiment_config_id` | FK |
| `strategy_id` | FK → strategies |
| `weight` | numeric(8,6) — quy ước `weight >= 0` và `SUM(weight) = 1` |
| UNIQUE | `(experiment_config_id, strategy_id)` |

Ràng buộc tổng weight = 1 được kiểm ở tầng ứng dụng (SQL không tiện biểu diễn ràng buộc liên-dòng này).

### 4.5 Iteration & Candidate

**`experiment_iterations`** — mỗi vòng lặp của search engine.

| Cột | Ghi chú |
|---|---|
| `experiment_id` | FK |
| `iteration_number` | int, UNIQUE cùng `experiment_id` |
| `status` | PENDING / RUNNING / COMPLETED / FAILED |
| `error_message` | nullable — vòng lỗi vẫn được lưu lại để quan sát |

**`candidates`** — kết quả của đúng 1 iteration (`iteration_id` UNIQUE → quan hệ 1:1).

**`candidate_strategies`** — tham số cụ thể mà search engine sinh ra.

| Cột | Ghi chú |
|---|---|
| `candidate_id` | FK |
| `strategy_id` | FK → strategies |
| `parameters` | **jsonb** |

Dùng `jsonb` vì mỗi strategy có bộ tham số khác nhau:

```json
MA                 → {"fastPeriod": 20, "slowPeriod": 50}
RSI                → {"period": 14, "buyThreshold": 30, "sellThreshold": 70}
BOLLINGER          → {"period": 20, "standardDeviation": 2}
SUPPORT_RESISTANCE → {"lookback": 50, "proximityPercent": 1}
```

Nếu tách thành cột riêng cho từng tham số thì thêm một strategy mới = phải ALTER TABLE — vi phạm đúng mục tiêu "thêm strategy không ảnh hưởng module khác" của đồ án.

### 4.6 Backtest

**`backtest_runs`** — trạng thái chạy nền của một candidate (`candidate_id` UNIQUE → 1:1).

Status PENDING / RUNNING / COMPLETED / FAILED + `error_message`. Nhờ bảng này, frontend hiển thị được "Iteration 50 — candidate đã sinh ✓ — đang backtest…" mà không cần giữ HTTP request mở.

**`trades`** — các lệnh mô phỏng của một backtest run.

`side` (LONG/SHORT), `entry_time`/`entry_price`, `quantity`, `stop_loss`/`take_profit` (nullable), `exit_time`/`exit_price`, `profit_loss`, `return_pct`, `exit_reason` (SIGNAL / STOP_LOSS / TAKE_PROFIT / END_OF_BACKTEST).

**`evaluations`** — chỉ số đánh giá, 1:1 với backtest run.

`total_return`, `profit_loss`, `win_rate`, `max_drawdown`, `number_of_trades`, `profit_factor`, `sharpe_ratio`, `overall_score`.

4 chỉ số MVP bắt buộc theo đề bài: Return, Win Rate, Max Drawdown, Number of Trades. `overall_score` là điểm tổng hợp dùng để xếp hạng leaderboard.

### 4.7 Leaderboard

**`leaderboards`** — 1:1 với experiment (`experiment_id` UNIQUE), có `top_k` (mặc định 10).

**`leaderboard_entries`** — `leaderboard_id` + `candidate_id` + `rank` + `score`, với UNIQUE trên cả `(leaderboard_id, candidate_id)` và `(leaderboard_id, rank)`.

**Vì sao leaderboard gắn với Experiment chứ không gắn với User?** Vì xếp hạng chỉ có nghĩa khi so sánh các candidate **cùng điều kiện** (cùng timeframe, cùng khoảng thời gian, cùng bộ weight). So sánh candidate của experiment 5m với candidate của experiment 1h là so sánh khập khiễng. Đổi cấu hình → experiment mới → leaderboard mới; leaderboard cũ vẫn còn để đối chiếu.

### 4.8 News & Sentiment

**`news`** — `title`, `content`, `source`, `url` (UNIQUE, dùng để chống trùng), `published_at`, `crawled_at`, `sentiment` (enum POSITIVE/NEUTRAL/NEGATIVE), `sentiment_score`.

Lưu ý: thiết kế gốc của nhóm dự tính để news trong NoSQL. Quyết định hiện tại là **giữ trong PostgreSQL** (xem `artifacts/decisions.md`) để tránh vận hành thêm một CSDL nữa trong phạm vi đồ án.

## 5. Ràng buộc nghiệp vụ kiểm ở tầng ứng dụng

SQL không biểu diễn tiện các ràng buộc sau, backend phải tự đảm bảo:

1. `SUM(experiment_config_strategies.weight) = 1` trong cùng một config.
2. `weight >= 0`.
3. `end_time > start_time` trong `experiment_configs`.
4. `iteration_limit > 0`.
5. SYSTEM strategy không có owner; USER / AI_GENERATED bắt buộc có owner đã xác thực.
6. `leaderboard_entries.candidate_id` phải trỏ tới candidate **thuộc cùng experiment** với leaderboard đó (ràng buộc liên-bảng, FK đơn không diễn tả được).
7. `strategies` không bao giờ UPDATE — thay đổi thì INSERT version mới.

## 6. Khác biệt so với `docs/database/design.dbml`

`docs/database/design.dbml` là bản thiết kế đầu vào; schema thực tế bám sát nó, với các điều chỉnh:

| Điểm | Thiết kế | Thực tế | Lý do |
|---|---|---|---|
| Bảng `news` | ghi chú "tuỳ chọn, có thể để NoSQL" | **Có tạo** trong PostgreSQL | Tránh vận hành thêm CSDL thứ 2 |
| Enum `timeframe` | tên `timeframe` | đổi tên thành **`app_timeframe`** | Tránh trùng tên với cột `timeframe` gây nhập nhằng khi đọc SQL |
| `candles` | numeric(30,12) | giữ nguyên + hypertable | Khớp bảng `candles` đã tồn tại từ migration 001, không phá dữ liệu nến sẵn có |
| Sinh UUID | không nêu | `gen_random_uuid()` (pgcrypto) | Có sẵn trong PostgreSQL hiện đại, không cần extension uuid-ossp |
