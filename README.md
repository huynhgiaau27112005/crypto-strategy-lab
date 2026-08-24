# Crypto Strategy Lab

Nền tảng phân tích, kết hợp và đánh giá chiến lược giao dịch crypto — đồ án **Kiến trúc phần mềm**.

Kiến trúc hiện tại: **modular monolithic** (một NestJS backend + React SPA). UI HTML prototype nằm ở `docs/prototype` để approve trước khi port sang Frontend.

## Cấu trúc

| Thư mục | Mô tả |
|---------|--------|
| `service/` | NestJS + TypeScript modular monolith (11 module stubs) |
| `web-platform/` | Vite + React + TypeScript SPA (page stubs) |
| `database/` | SQL migrations, seed, & check scripts cho PostgreSQL + TimescaleDB |
| `docs/prototype/` | HTML clickable UI cho stakeholder approve |
| `docs/superpowers/` | Design specs & implementation plans |

## Yêu cầu

- Node.js **20+** (đã kiểm tra với Node 24)
- npm

## 🚀 Chạy Docker Compose backend

Xem chi tiết tại [DOCKER_GUIDE.md](file:///home/van/dev/Architecture/crypto-strategy-lab/DOCKER_GUIDE.md).

Khởi động toàn bộ hệ thống (Database TimescaleDB & NestJS API):

```bash
docker compose up -d --build
```

- **Backend NestJS API**: `http://localhost:3000`
- **Database TimescaleDB**: `localhost:6543`

Thử nghiệm nhanh qua `curl`:

```bash
curl "http://localhost:3000/market-data/candles?symbol=BTCUSDT&interval=5m&limit=5"
```

---

## 💻 Chạy Backend cục bộ (`service`)

```bash
cd service
npm install
npm run start:dev
```

API mặc định: `http://localhost:3000`

### ⚠️ Bắt buộc: nạp dữ liệu nến lịch sử trước khi chạy search/backtest

Database mới khởi tạo gần như **không có nến** — mọi strategy cần tối thiểu 20–50 nến lookback mới sinh tín hiệu đầu tiên, nên chạy search trên DB rỗng sẽ cho kết quả 0 trade, leaderboard trống. Chạy lệnh sau **một lần** sau khi database đã lên (xem mục Docker Compose ở trên) để nạp lịch sử BTCUSDT thật từ Binance cho cả 5 khung thời gian (`1m, 5m, 15m, 1h, 4h`):

```bash
cd service
npm run seed:candles
```

An toàn chạy lại nhiều lần (idempotent — upsert theo khoá `(timeframe, timestamp)`, không tạo trùng dòng). In tiến độ theo từng khung thời gian và tổng số nến cuối cùng khi chạy xong.

Health stub ví dụ:

```bash
curl http://localhost:3000/market-data/health
# {"status":"ok","module":"market-data"}
```

Các module domain (stub): `market-data`, `chart`, `strategy-engine`, `strategy-plugin`, `composite-strategy`, `strategy-search`, `backtesting`, `leaderboard`, `continuous-loop`, `news`, `sentiment`.

---

## Chạy Frontend (`web-platform`)

```bash
cd web-platform
npm install
npm run dev
```

Mở URL Vite in ra terminal (thường `http://localhost:5173`).

Routes stub: `/`, `/strategies`, `/search`, `/leaderboard`, `/strategy/:id`, `/news`.

## Xem HTML Prototype

Prototype là app shell TradingView-like, tách 4 workspace HTML (có Dark/Light toggle):

| File | Nội dung |
|------|----------|
| `docs/prototype/index.html` | Cổng vào |
| `docs/prototype/charts.html` | 4 chart · TF `5m/15m/1h/4h` · Lightweight Charts |
| `docs/prototype/lab.html` | Strategies + Search + Leaderboard |
| `docs/prototype/strategy.html` | Chi tiết strategy · Buy/Sell overlays |
| `docs/prototype/news.html` | News + Sentiment |

```bash
open docs/prototype/index.html
# hoặc
npx --yes serve docs/prototype
```

Luồng demo đề xuất: Charts → Lab → Strategy → News.

## Tài liệu thiết kế

- Hướng dẫn Docker & API: `DOCKER_GUIDE.md`
- Spec scaffold: `docs/superpowers/specs/2026-08-09-project-boilerplate-design.md`
- Spec prototype redesign: `docs/superpowers/specs/2026-08-09-prototype-redesign-design.md`
- Plan boilerplate: `docs/superpowers/plans/2026-08-09-project-boilerplate.md`
- Plan prototype: `docs/superpowers/plans/2026-08-09-prototype-redesign.md`
