# Crypto Strategy Lab — Single-Screen Prototype Rebuild

**Date:** 2026-08-13  
**Status:** Approved (design dialogue) — awaiting implementation plan  
**Scope:** Tear down multi-tab `docs/prototype` and rebuild as one TradingView-like control screen with exclusive right panels. HTML/CSS/JS prototype only; no React/Nest changes.  
**Supersedes:** `2026-08-09-prototype-redesign-design.md` (multi-page Charts/Lab/Strategy/News tabs).

## Context

Prototype hiện tại chia 4 workspace tab (`charts.html`, `lab.html`, `strategy.html`, `news.html`) + gate `index.html`. Stakeholder muốn **một màn hình điều khiển chính**; tính năng phụ mở/đóng bằng panel — tham chiếu TradingView chart UI. Phạm vi đồ án nhỏ → chỉ panel cần thiết.

## Goals

1. Một màn hình chính: chart-dominant, mở bằng `file://` (double-click `app.html`).
2. Ba panel phải, exclusive: **Lab**, **Strategy**, **News**.
3. Chart layout mặc định 1 khung; có thể tách **1 / 2 / 4**; TF mỗi ô: `5m | 15m | 1h | 4h`.
4. Chọn row trên Lab leaderboard → tự mở Strategy + apply Buy/Sell overlays lên chart đang focus.
5. Tách nội dung panel thành file JS (dễ quản lý) nhưng vẫn cùng document — không cần local server.
6. Giữ dark/light theme + sàn/pair mock trong header.

## Non-goals

- Data/WebSocket/Binance thật
- Drawing tools, watchlist, social của TradingView
- Nhiều panel phải mở đồng thời / dock dưới
- `fetch()` HTML partials hoặc bundler
- Port sang `web-platform` trong workstream này

## Decisions (from dialogue)

| Topic | Choice |
|-------|--------|
| Panels | Lab + Strategy + News |
| Dock | Cột phải |
| Panel exclusivity | Một panel tại một thời điểm |
| Chart count | Mặc định 1; nút layout 1/2/4 |
| Lab → Strategy | Auto-open Strategy + apply overlay lên chart focus |
| File split | Panel modules `.js` + classic `<script src>` (file:// OK) |
| Entry | `app.html`; `index.html` chỉ redirect |

## Information architecture

```
┌─ Header: brand · exchange/pair · price · theme ──────────────┐
├─ Left rail ─┬─ Chart workspace ──────────────────┬─ Right dock ─┤
│ Lab         │ Default: 1 chart                   │ Hidden until │
│ Strategy    │ Layout control: 1 / 2 / 4          │ a rail icon  │
│ News        │ Per-pane TF + shared overlays bar  │ is active    │
│             │ Focus = clicked pane (active ring) │ One panel    │
└─────────────┴────────────────────────────────────┴──────────────┘
```

- Rail icon toggles its panel; clicking the active icon closes the dock.
- Closing dock restores chart to full remaining width.
- No top-level workspace tabs.

## Panel contents

### Lab

- Strategy plugin checklist: MA, RSI, Bollinger, Support/Resistance, optional Sentiment (params + version meta).
- START / STOP search with mock progress (candidates tested, current combination, generator = Random Search).
- Compact Top-K leaderboard (Return, Win Rate, Max Drawdown, Trades).
- Selecting a leaderboard row: switch dock to Strategy and dispatch apply-overlay for the focused chart pane.

### Strategy

- Metrics: Return, Win Rate, MDD, Trades; version/dataset meta.
- Mock trades table; legend for Buy / Sell / Entry / Exit / SL / TP.
- Renders markers/lines on the focused Lightweight Charts instance.
- Changing that pane’s TF keeps the same mock overlay semantics (regenerate/attach on new series).

### News

- Sentiment breakdown Positive / Neutral / Negative %.
- Headline list with sentiment badges.
- CTA “Bật SentimentStrategy” → open Lab with Sentiment plugin pre-checked.

### Chart workspace

- Lightweight Charts (CDN): candlestick + volume.
- Toolbar overlays independent of strategy overlay: MA / Bollinger / S/R toggles.
- Layout 1 / 2 / 4 grid; each pane has its own TF chips.
- Focused pane receives strategy apply and visual active state.

## Approach

**Single `app.html` shell + JS panel modules (classic scripts)**

- Same document as charts → Lab→overlay without `postMessage`.
- Works on `file://` (no CORS/`fetch` of HTML).
- Markup for panels lives in JS render functions / template strings — accepted trade-off for offline open + split files.

Rejected: multi-page tabs; `fetch` HTML partials (needs server); iframes (harder chart coupling).

## File structure

```
docs/prototype/
├── app.html
├── index.html                 # redirect → app.html
└── assets/
    ├── css/
    │   ├── tokens.css         # keep / lightly adapt
    │   ├── shell.css          # header, rail, dock chrome
    │   └── app.css            # chart grid, panel interiors
    └── js/
        ├── shell.js           # theme, exchange/pair persistence
        ├── mock-data.js
        ├── app.js             # rail, exclusive dock, layout, focus
        ├── chart-workspace.js # Lightweight Charts panes + overlays
        └── panels/
            ├── lab.js
            ├── strategy.js
            └── news.js
```

**Delete** (after `app.html` works): `charts.html`, `lab.html`, `strategy.html`, `news.html`, and obsolete page scripts (`charts-page.js`, `strategy-page.js`) plus unused page-only CSS.

## Visual system

- Dense TradingView-like terminal; chart is the hero surface.
- Candle colors TV-style; accent blue `#2962ff`.
- Expressive fonts via CDN (e.g. IBM Plex Sans / Mono) — avoid Inter/Roboto/Arial defaults.
- `data-theme="dark"|"light"`; persist `csl-theme`; chart theme follows.
- Copy: Vietnamese UI + English trading terms.

## Error / edge behavior (prototype)

- If no chart focus yet, first pane is focus by default.
- Opening Strategy with no selection shows empty/placeholder state until a Lab pick (or mock default #1).
- Layout shrink from 4→1/2 destroys extra pane instances cleanly; focus falls back to pane 0 if needed.
- Theme toggle re-applies chart options without losing mock series identity.

## Success criteria

- Open `docs/prototype/app.html` via file:// → single control screen, no workspace tabs.
- Rail toggles Lab / Strategy / News exclusively on the right dock.
- Layout 1/2/4 works; TF per pane; overlays toggle.
- Lab leaderboard → Strategy panel + markers on focused chart.
- News CTA pre-checks Sentiment in Lab.
- Theme + pair/exchange persist as today.
- README prototype section updated to single-screen model.

## Follow-ups

1. writing-plans → implementation plan for this rebuild  
2. Later: port approved UI into `web-platform`
