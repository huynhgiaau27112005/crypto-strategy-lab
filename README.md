# Crypto Strategy Lab

Nền tảng phân tích, kết hợp và đánh giá chiến lược giao dịch crypto — đồ án **Kiến trúc phần mềm**.

Kiến trúc hiện tại: **modular monolithic** (một NestJS backend + React SPA). UI HTML prototype nằm ở `docs/prototype` để approve trước khi port sang Frontend.

## Cấu trúc

| Thư mục | Mô tả |
|---------|--------|
| `service/` | NestJS + TypeScript modular monolith (11 module stubs) |
| `web-platform/` | Vite + React + TypeScript SPA (page stubs) |
| `docs/prototype/` | HTML clickable UI cho stakeholder approve |
| `docs/superpowers/` | Design specs & implementation plans |

## Yêu cầu

- Node.js **20+** (đã kiểm tra với Node 24)
- npm

## Chạy Backend (`service`)

```bash
cd service
npm install
npm run start:dev
```

API mặc định: `http://localhost:3000`

Health stub ví dụ:

```bash
curl http://localhost:3000/market-data/health
# {"status":"ok","module":"market-data"}
```

Các module domain (stub): `market-data`, `chart`, `strategy-engine`, `strategy-plugin`, `composite-strategy`, `strategy-search`, `backtesting`, `leaderboard`, `continuous-loop`, `news`, `sentiment`.

## Chạy Frontend (`web-platform`)

```bash
cd web-platform
npm install
npm run dev
```

Mở URL Vite in ra terminal (thường `http://localhost:5173`).

Routes stub: `/`, `/strategies`, `/search`, `/leaderboard`, `/strategy/:id`, `/news`.

## Xem HTML Prototype

Một màn hình TradingView-like (`app.html`), panel Lab / Strategy / News mở từ rail trái.

```bash
open docs/prototype/app.html
```

| File | Nội dung |
|------|----------|
| `docs/prototype/app.html` | Shell + chart + panels |
| `docs/prototype/index.html` | Redirect → `app.html` |
| `assets/js/panels/*.js` | Lab / Strategy / News |

Luồng demo: Chart → Lab (START SEARCH) → chọn leaderboard → Strategy overlays → News → bật Sentiment.

## Tài liệu thiết kế

- Spec scaffold: `docs/superpowers/specs/2026-08-09-project-boilerplate-design.md`
- Spec prototype redesign: `docs/superpowers/specs/2026-08-09-prototype-redesign-design.md`
- Spec single-screen prototype: `docs/superpowers/specs/2026-08-13-prototype-single-screen-design.md`
- Plan boilerplate: `docs/superpowers/plans/2026-08-09-project-boilerplate.md`
- Plan prototype: `docs/superpowers/plans/2026-08-09-prototype-redesign.md`
- Plan single-screen: `docs/superpowers/plans/2026-08-13-prototype-single-screen.md`
