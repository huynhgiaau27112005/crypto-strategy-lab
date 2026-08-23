# Hướng dẫn chạy ứng dụng bằng Docker Compose & Kiểm thử API

Tài liệu này hướng dẫn chi tiết cách khởi chạy toàn bộ hệ thống (gồm CSDL **TimescaleDB** và Backend **NestJS API**) bằng Docker Compose, kèm theo danh sách API endpoint và lệnh test qua `curl` / `Postman`.

---

## 1. Kiến trúc Docker Container

Khi chạy `docker compose up -d`, Docker sẽ khởi tạo 2 service chính:

| Service | Port ngoài host | Port nội bộ container | Mô tả |
| :--- | :--- | :--- | :--- |
| **`crypto-strategy-lab-api`** | `3000` | `3000` | NestJS Backend API Service |
| **`crypto-strategy-lab-db`** | `6543` | `5432` | TimescaleDB (PostgreSQL + TimescaleDB extension) |

---

## 2. Hướng dẫn chạy Hệ thống

### Bước 1: Khởi động hệ thống Docker Containers
Đứng tại thư mục gốc của dự án (`crypto-strategy-lab`), chạy lệnh:

```bash
docker compose up -d --build
```

- Lệnh này sẽ build image của NestJS backend và chạy cả 2 container dưới nền (`-d`).

### Bước 2: Kiểm tra trạng thái các Container
```bash
docker compose ps
```

Nếu cả 2 container `crypto-strategy-lab-db` và `crypto-strategy-lab-api` đều báo trạng thái **Up / Healthy** là thành công.

### Bước 3: Khởi tạo Database Schema & Seed Data (Nếu chạy lần đầu)
Nếu database trong container mới hoàn toàn, bạn chạy migration và seed dữ liệu bằng lệnh:

```bash
cd database
node migrate.js
node seed.js
```

---

## 3. Danh sách Endpoint & Hướng dẫn Test API

Gốc API (Base URL): `http://localhost:3000`

### 📊 3.1. Market Data (Dữ liệu thị trường Binance & Database)

#### 1. Lấy dữ liệu nến nến OHLCV (candles)
- **URL**: `GET http://localhost:3000/market-data/candles`
- **Query Params**:
  - `symbol` (bắt buộc): Ví dụ `BTCUSDT`
  - `interval` (mặc định: `5m`): Ví dụ `1m`, `5m`, `15m`, `1h`
  - `limit` (mặc định: `500`): Số lượng nến
- **Ví dụ lệnh `curl`**:
  ```bash
  curl "http://localhost:3000/market-data/candles?symbol=BTCUSDT&interval=5m&limit=5"
  ```
- **Response mẫu**:
  ```json
  [
    {
      "timeframe": "5m",
      "timestamp": "2026-08-17T09:00:00.000Z",
      "open": "63380.83000000",
      "high": "63408.72000000",
      "low": "63380.83000000",
      "close": "63393.99000000",
      "volume": "13.77591000"
    }
  ]
  ```

#### 2. Import nến mới từ Binance lưu vào TimescaleDB
- **URL**: `POST http://localhost:3000/market-data/import`
- **Header**: `Content-Type: application/json`
- **Body JSON**:
  ```json
  {
    "symbol": "BTCUSDT",
    "interval": "5m",
    "limit": 100
  }
  ```
- **Ví dụ lệnh `curl`**:
  ```bash
  curl -X POST "http://localhost:3000/market-data/import" \
    -H "Content-Type: application/json" \
    -d '{"symbol": "BTCUSDT", "interval": "5m", "limit": 100}'
  ```

---

### 🏥 3.2. Health Check các Modules

Bạn có thể gọi các API Health Check bằng `curl` hoặc nhập trực tiếp vào trình duyệt / Postman:

| Module | URL Test (GET) | Ví dụ Lệnh `curl` |
| :--- | :--- | :--- |
| **Leaderboard** | `http://localhost:3000/leaderboard/health` | `curl http://localhost:3000/leaderboard/health` |
| **Chart** | `http://localhost:3000/chart/health` | `curl http://localhost:3000/chart/health` |
| **Strategy Engine** | `http://localhost:3000/strategy-engine/health` | `curl http://localhost:3000/strategy-engine/health` |
| **Strategy Plugin** | `http://localhost:3000/strategy-plugin/health` | `curl http://localhost:3000/strategy-plugin/health` |
| **Backtesting** | `http://localhost:3000/backtesting/health` | `curl http://localhost:3000/backtesting/health` |
| **Strategy Search** | `http://localhost:3000/strategy-search/health` | `curl http://localhost:3000/strategy-search/health` |

---

## 4. Quản lý Docker Logs và Dừng Containers

### Xem log trực tiếp của Backend API
```bash
docker compose logs -f api
```

### Xem log của Database
```bash
docker compose logs -f timescaledb
```

### Dừng các Containers
```bash
docker compose down
```

---

## 5. Cấu hình Postman

Để test bằng Postman:
1. Tạo một Request mới trong Postman.
2. Đổi HTTP Method thành `GET` hoặc `POST`.
3. Nhập URL `http://localhost:3000/market-data/candles?symbol=BTCUSDT&interval=5m&limit=5`.
4. Nhấn **Send** để xem dữ liệu JSON phản hồi.
