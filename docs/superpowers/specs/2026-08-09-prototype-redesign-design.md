# Crypto Strategy Lab — HTML Prototype Redesign

**Date:** 2026-08-09  
**Status:** Implemented 2026-08-09 — **Superseded** by `2026-08-13-prototype-single-screen-design.md`  
**Scope:** Rebuild `docs/prototype` as a TradingView-like multi-page app shell aligned with đồ án demo scenario. Dark/light theme toggle. No React/Nest changes in this workstream.

## Context

Prototype hiện tại (hub + pages mỏng, line SVG) chưa khớp:

- Demo scenario 10 bước và MVP visualization (candlestick, volume, overlays, Buy/Sell)
- Cảm giác terminal TradingView
- Tổ chức nhiều HTML dễ review nhưng vẫn một product chrome

Tham chiếu: đề đồ án (Module 2, MVP, Demo §46), TradingView chart UI, ref v0 (cần login — không lấy được preview).

## Goals

1. App shell + **4 workspace HTML** (không nhét một file)
2. Charts dùng **Lightweight Charts** (CDN); Lab/News chủ yếu HTML tĩnh
3. TF MVP: đúng **4 options** `5m | 15m | 1h | 4h` trên tối đa **4 chart**
4. Dark mặc định + toggle light, persist `localStorage`
5. Copy UI: tiếng Việt + thuật ngữ trading EN

## Non-goals

- Binance / WebSocket thật
- Drawing tools, watchlist, social của TradingView
- Port sang React trong lần này
- Build tooling (11ty, bundler) cho prototype

## Information architecture

| File | Workspace tab | Demo steps |
|------|---------------|------------|
| `index.html` | Cổng vào ngắn | — |
| `charts.html` | Charts | 1 |
| `lab.html` | Lab | 2–5 |
| `strategy.html` | Strategy | 6–7 |
| `news.html` | News | 8–9 (+ CTA bước 9) |

Shared chrome on every page: brand, pair `BTCUSDT`, last price mock, realtime badge, nav tabs, theme toggle.

## Approach

**Approach 1 — Multi-page app chrome + shared assets**

- Duplicate header markup per HTML (readable when reviewing files)
- Shared `tokens.css`, `shell.css`, `pages.css`, `shell.js`, `mock-data.js`
- Remove or redirect obsolete files (`dashboard.html`, `strategies.html`, `search.html`, `leaderboard.html`, `strategy-detail.html`) to new names to avoid confusion

## File structure

```
docs/prototype/
├── index.html
├── charts.html
├── lab.html
├── strategy.html
├── news.html
└── assets/
    ├── css/
    │   ├── tokens.css
    │   ├── shell.css
    │   └── pages.css
    └── js/
        ├── shell.js
        ├── mock-data.js
        ├── charts-page.js
        └── strategy-page.js
```

Lightweight Charts loaded from official CDN on `charts.html` and `strategy.html` only.

## Workspace layouts

### `charts.html`

- 2×2 grid, near full viewport under top bar
- Each panel: pair label + TF chips **only** `5m`, `15m`, `1h`, `4h`
- Defaults: panel1 `5m`, panel2 `15m`, panel3 `1h`, panel4 `4h`
- Changing TF updates that panel only (swap mock series)
- Lightweight Charts: candlestick + volume pane
- Toolbar: toggle overlays MA / Bollinger / Support-Resistance (mock series/lines)

### `lab.html`

- Left: strategy plugin checklist — MA, RSI, Bollinger, Support/Resistance (+ Sentiment optional), short params + version
- Center: START/STOP search, candidates tested, current combination, progress, generator = Random Search
- Right: compact Top-K leaderboard (Return, Win Rate, Max Drawdown, Trades) linking to `strategy.html`

### `strategy.html`

- Main: one large Lightweight Charts instance with Buy/Sell markers, MA, support/resistance guides
- Side: metrics (Return, Win Rate, MDD, Trades), version/dataset meta, mock trades table

### `news.html`

- Sentiment breakdown Positive / Neutral / Negative %
- Headline list with badges
- CTA to enable SentimentStrategy → `lab.html`

### `index.html`

- Short intro + links to four workspaces (not a long marketing hub)

## Visual system (TradingView-like)

**Do:**

- Dense terminal chrome; chart-dominant on Charts/Strategy
- Candle up/down colors aligned with TV-style teal/red; accent blue `#2962ff`
- Expressive font via CDN (e.g. IBM Plex Sans / IBM Plex Mono) — avoid default Inter/Roboto/Arial stacks
- Theme via `data-theme="dark"|"light"` on `<html>`; CSS variables in `tokens.css`

**Don't:**

- Left drawing toolbar, watchlist, Ideas feed, auth
- Live exchange data

**Theme behavior:**

- Default: dark
- Toggle in header; persist key `csl-theme` in `localStorage`
- Chart themes follow `data-theme` when initializing/updating Lightweight Charts

## Timeframe clarification (from đề)

- “Tối đa 4 timeframe/chart trên một màn hình” = concurrent display limit
- Demo defaults = `5m | 15m | 1h | 4h`
- Prototype MVP chips = exactly those four (no `1m` / `1d` in this redesign)

## Success criteria

- Reviewer can walk demo steps 1–9 across the four HTML workspaces with shared chrome
- Charts look like real candlesticks (not line placeholders)
- Theme toggle works on all pages and persists
- Files remain separately openable for review
- README prototype section updated to new filenames

## Follow-ups

1. writing-plans → implement rebuild
2. Later: port approved UI into `web-platform`
