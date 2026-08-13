# Crypto Strategy Lab — Project Boilerplate Design

**Date:** 2026-08-09  
**Status:** Approved — implemented 2026-08-09  
**Scope:** Repository scaffolding only — NestJS service, React web-platform, HTML UI prototype, README, `.gitignore`. No business logic, Binance integration, DB, or queue yet.

## Context

Đồ án **Kiến trúc phần mềm**: nền tảng Crypto Strategy Lab (realtime charts, plugin strategies, composite/search/backtest, leaderboard, news/sentiment). Trọng tâm là kiến trúc mở rộng được, không phải tối ưu trading.

Yêu cầu scaffold lần này:

- Modular monolithic backend
- Frontend SPA tách biệt
- HTML prototype để nhóm approve UI trước khi port sang React

## Goals

1. `service/` — NestJS + TypeScript modular monolith với 11 module stubs
2. `web-platform/` — Vite + React + TypeScript SPA skeleton
3. `docs/prototype/` — HTML clickable đủ màn hình demo scenario
4. Cập nhật `.gitignore` và README hướng dẫn chạy

## Non-goals (out of this scaffold)

- Logic strategy / backtest / sentiment thật
- Database, Redis, Kafka, job workers
- Binance WebSocket/API thật
- Lightweight Charts / chart library trong React
- Microservices hoặc monorepo tooling (Turborepo/pnpm workspace)

## Architecture overview

```
crypto-strategy-lab/
├── service/                 # NestJS modular monolith (one deployable)
├── web-platform/            # Vite + React + TypeScript SPA
├── docs/
│   ├── prototype/           # Static HTML UI for approval
│   └── superpowers/specs/   # Design docs
├── .gitignore
└── README.md
```

**Runtime boundaries:**

- Browser → `web-platform` (UI only)
- `web-platform` → HTTP/WebSocket API on `service` (future)
- `service` → exchange adapters (future); frontend never talks to Binance directly
- `docs/prototype` is static and independent of Nest/React

**Style:** Modular monolithic — one NestJS process; domain concerns isolated as Nest modules.

## Approach

**CLI generate then customize (Approach 1).** Package manager: **npm** everywhere.

1. Generate NestJS app into repo root folder `service/` (e.g. `@nestjs/cli` `nest new service`, npm, skip git init inside subfolder if prompted)
2. `npm create vite@latest web-platform -- --template react-ts`
3. Manually add Nest module stubs under `service/src/modules/`
4. Manually author HTML prototype pages under `docs/prototype/`
5. Update root `.gitignore` and `README.md`

Folder name is **`service`** (singular), not `services`, to avoid implying microservices.

## Backend design (`service/`)

### Stack

- NestJS + TypeScript
- Default Nest tooling (build, start:dev, lint as generated)

### Module map (11 stubs)

| Module folder | Responsibility (stub only) |
|---------------|----------------------------|
| `market-data` | Historical + realtime market data; adapter seam for Binance |
| `chart` | Multi-timeframe chart data/stream contracts (max 4 charts) |
| `strategy-engine` | Normalize signals to BUY / SELL / HOLD |
| `strategy-plugin` | Strategy registry / register API surface |
| `composite-strategy` | Majority vote / weighted combination |
| `strategy-search` | Candidate generation (Random Search placeholder) |
| `backtesting` | Historical trade simulation |
| `leaderboard` | Top-K ranking / sort / filter |
| `continuous-loop` | generate → backtest → evaluate → rank + stop condition |
| `news` | Collect / store news |
| `sentiment` | POSITIVE / NEUTRAL / NEGATIVE classification |

### Layout

```
service/src/
├── main.ts
├── app.module.ts          # imports all 11 modules
└── modules/
    ├── market-data/
    ├── chart/
    ├── strategy-engine/
    ├── strategy-plugin/
    ├── composite-strategy/
    ├── strategy-search/
    ├── backtesting/
    ├── leaderboard/
    ├── continuous-loop/
    ├── news/
    └── sentiment/
```

Each module includes at minimum:

- `*.module.ts`
- `*.controller.ts` — stub health/list endpoint (e.g. `GET /<module>/health` or equivalent)
- `*.service.ts` — empty / TODO placeholder
- `index.ts` — barrel export

No database modules, no real providers beyond Nest DI wiring.

## Frontend design (`web-platform/`)

### Stack

- Vite + React + TypeScript
- React Router for page stubs matching prototype IA

### Layout (minimal)

```
web-platform/src/
├── main.tsx
├── App.tsx
├── pages/
│   ├── DashboardPage.tsx
│   ├── StrategiesPage.tsx
│   ├── SearchPage.tsx
│   ├── LeaderboardPage.tsx
│   ├── StrategyDetailPage.tsx
│   └── NewsPage.tsx
└── ...
```

Pages are placeholders (title + short copy). No chart library, no API client beyond optional stub comments.

## HTML prototype (`docs/prototype/`)

Clickable static UI for stakeholder approval before React port. Visual direction: dark TradingView-like chart workspace (not production-polished design system).

### Pages

| File | Maps to demo scenario |
|------|------------------------|
| `index.html` | Hub + links to all screens |
| `dashboard.html` | 4-chart BTCUSDT (5m / 15m / 1h / 4h), per-chart TF controls |
| `strategies.html` | Toggle/select MA, RSI, Bollinger, Support/Resistance |
| `search.html` | START SEARCH, candidates tested, current combination |
| `leaderboard.html` | Top-K table with Return / Win Rate / Max Drawdown / Trades |
| `strategy-detail.html` | Selected strategy: chart overlays + trade metrics |
| `news.html` | News list + sentiment breakdown percentages |
| `assets/css/prototype.css` | Shared theme |
| `assets/js/nav.js` | Shared navigation helper (optional) |

Charts in HTML are SVG/CSS placeholders (no live market data). Shared header/nav across pages for app-like browsing.

## Root docs & ignore

### README

- Project one-liner + modular monolith note
- Prerequisites (Node.js version band)
- How to run `service` (`npm install`, `npm run start:dev`)
- How to run `web-platform` (`npm install`, `npm run dev`)
- How to open `docs/prototype` (open `index.html` or simple static server)
- Pointer to architecture/docs for later

### `.gitignore`

Keep existing Cursor/superpowers ignores; add Node/Nest/Vite standards:

- `node_modules/`
- `dist/`, `build/`, coverage
- `.env`, `.env.*`
- logs, OS junk, IDE local files as appropriate

Do not commit secrets.

## Success criteria

- `service` boots with Nest default entry and all 11 modules registered
- `web-platform` boots with Vite and navigable page stubs
- Prototype HTML set is browsable end-to-end for demo scenario screens
- README alone is enough to install and run both apps + open prototype
- No business logic implemented beyond stubs

## Follow-ups (after this scaffold)

1. Implementation plan via writing-plans
2. Port approved HTML → React
3. Implement market-data adapter, strategies, backtest pipeline, events, etc. per đồ án MVP
