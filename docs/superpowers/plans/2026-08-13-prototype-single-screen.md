# Single-Screen Prototype Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `docs/prototype` into one TradingView-like `app.html` with exclusive right panels (Lab / Strategy / News), openable via `file://`.

**Architecture:** Single shell HTML + classic `<script src>` panel modules (no ES modules, no `fetch` HTML). `app.js` owns rail/dock/layout/focus; `chart-workspace.js` owns Lightweight Charts panes and strategy overlays; each panel file exports `window.CSLPanels.<name> = { mount, onShow?, setSentimentChecked? }`. Shared bus: `CustomEvent` on `window` (`csl-open-panel`, `csl-apply-strategy`, `csl-theme-change`, `csl-market-change`).

**Tech Stack:** Static HTML/CSS/JS, Lightweight Charts 4.2 CDN, IBM Plex Sans/Mono CDN, existing `CSLMock` / `shell.js` patterns.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-13-prototype-single-screen-design.md`
- TF chips only: `5m`, `15m`, `1h`, `4h`
- Layout counts only: `1`, `2`, `4` (default `1`)
- Panels exclusive; dock right; rail left
- Must work on `file://` (classic scripts only — no `type="module"`, no `fetch` of local HTML)
- Copy: Vietnamese UI + English trading terms
- No React/Nest changes; no live exchange data
- Do **not** `git commit` unless the user explicitly asks
- Reuse `window.CSLMock` APIs: `TIMEFRAMES`, `seriesFor`, `sma`, `bollinger`, `supportResistance`, `leaderboard`, `trades`, `news`, `markerTimes`

## File map

| Path | Responsibility |
|------|----------------|
| `docs/prototype/app.html` | Shell: header, rail, chart host, dock root, script tags |
| `docs/prototype/index.html` | Redirect to `app.html` |
| `docs/prototype/assets/css/tokens.css` | Keep tokens; tweak if needed for rail/dock vars |
| `docs/prototype/assets/css/shell.css` | Header + base; remove workspace-nav reliance; add rail/dock chrome |
| `docs/prototype/assets/css/app.css` | Chart grid, toolbar, panel interiors (replace `pages.css` usage) |
| `docs/prototype/assets/js/shell.js` | Theme + exchange/pair (keep; drop nav-active if unused) |
| `docs/prototype/assets/js/mock-data.js` | Keep as-is |
| `docs/prototype/assets/js/app.js` | Rail toggle, exclusive dock, layout 1/2/4 wiring, focus handoff |
| `docs/prototype/assets/js/chart-workspace.js` | Panes, TF, indicator overlays, strategy markers API |
| `docs/prototype/assets/js/panels/lab.js` | Lab panel render + search mock + leaderboard → events |
| `docs/prototype/assets/js/panels/strategy.js` | Strategy metrics/trades UI + listen apply |
| `docs/prototype/assets/js/panels/news.js` | Sentiment + headlines + CTA → Lab |
| Delete after green | `charts.html`, `lab.html`, `strategy.html`, `news.html`, `pages.css`, `charts-page.js`, `strategy-page.js` |

### Shared event contracts

```js
// Open or toggle a panel from anywhere
// detail: { panel: 'lab' | 'strategy' | 'news', forceOpen?: boolean }
window.dispatchEvent(new CustomEvent('csl-open-panel', { detail: { panel: 'strategy', forceOpen: true } }));

// Apply strategy overlay to focused chart pane
// detail: { strategy: CSLMock.leaderboard[i], trades?: CSLMock.trades }
window.dispatchEvent(new CustomEvent('csl-apply-strategy', { detail: { strategy, trades: window.CSLMock.trades } }));
```

```js
// window.CSLApp (from app.js)
// openPanel(id: 'lab'|'strategy'|'news', opts?: { forceOpen?: boolean }): void
// closeDock(): void
// getActivePanel(): null | 'lab' | 'strategy' | 'news'

// window.CSLCharts (from chart-workspace.js)
// setLayout(n: 1|2|4): void
// getFocusedPaneId(): number
// applyStrategyOverlay(payload: { strategy, trades }): void
// clearStrategyOverlay(): void
```

---

### Task 1: Shell HTML + CSS chrome (rail / dock / chart stage)

**Files:**
- Create: `docs/prototype/app.html`
- Create: `docs/prototype/assets/css/app.css`
- Modify: `docs/prototype/assets/css/tokens.css` (add `--rail-w`, `--dock-w`, `--workspace-h` if missing)
- Modify: `docs/prototype/assets/css/shell.css` (app-frame, rail, dock; remove dependence on `.workspace-nav` for this screen)
- Modify: `docs/prototype/index.html` → redirect only

**Interfaces:**
- Consumes: existing CSS variables in `tokens.css` (`--header-h`, `--bg`, `--accent`, fonts)
- Produces: DOM ids/classes that later JS binds: `#app-frame`, `#left-rail`, `#chart-stage`, `#chart-toolbar`, `#charts-grid`, `#right-dock`, `#dock-title`, `#dock-body`, `[data-panel-btn]`

- [ ] **Step 1: Add layout tokens**

In `tokens.css`, ensure:

```css
--rail-w: 48px;
--dock-w: 360px;
--header-h: 52px;
```

- [ ] **Step 2: Write `app.html` shell**

Create `docs/prototype/app.html` with this structure (keep brand/exchange/pair/theme from current header; **no** Charts/Lab/Strategy/News nav links):

```html
<!DOCTYPE html>
<html lang="vi" data-theme="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Crypto Strategy Lab</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap"
      rel="stylesheet"
    />
    <link rel="stylesheet" href="assets/css/tokens.css" />
    <link rel="stylesheet" href="assets/css/shell.css" />
    <link rel="stylesheet" href="assets/css/app.css" />
  </head>
  <body>
    <header class="app-header">
      <!-- same market-context + theme-toggle as current pages; NO workspace-nav -->
      <div class="brand">Crypto <em>Strategy Lab</em></div>
      <div class="market-context">
        <label class="ctx">
          <span>Sàn</span>
          <select data-exchange aria-label="Exchange">
            <option value="binance">Binance</option>
            <option value="okx">OKX (mở rộng)</option>
            <option value="bybit">Bybit (mở rộng)</option>
          </select>
        </label>
        <label class="ctx">
          <span>Pair</span>
          <select data-pair aria-label="Trading pair">
            <option value="BTCUSDT">BTCUSDT</option>
            <option value="ETHUSDT">ETHUSDT</option>
          </select>
        </label>
        <div class="price-stack">
          <span class="price">118,150.2</span>
          <span class="change up">+2.41%</span>
        </div>
        <span class="badge-live">Realtime</span>
      </div>
      <div class="header-spacer"></div>
      <button type="button" class="theme-toggle" data-theme-toggle>
        Theme · <strong data-theme-label>Dark</strong>
      </button>
    </header>

    <div class="app-frame" id="app-frame" data-dock="closed" data-layout="1">
      <aside class="left-rail" id="left-rail" aria-label="Panels">
        <button type="button" class="rail-btn" data-panel-btn="lab" title="Lab" aria-pressed="false">Lab</button>
        <button type="button" class="rail-btn" data-panel-btn="strategy" title="Strategy" aria-pressed="false">Strat</button>
        <button type="button" class="rail-btn" data-panel-btn="news" title="News" aria-pressed="false">News</button>
      </aside>

      <main class="chart-stage" id="chart-stage">
        <div class="chart-toolbar" id="chart-toolbar">
          <span class="label">Overlays</span>
          <div class="overlay-toggles">
            <label><input type="checkbox" data-overlay="ma" checked /> MA</label>
            <label><input type="checkbox" data-overlay="bb" /> Bollinger</label>
            <label><input type="checkbox" data-overlay="sr" /> Support / Resistance</label>
          </div>
          <div class="layout-controls">
            <span class="label">Layout</span>
            <button type="button" data-layout-btn="1" class="active">1</button>
            <button type="button" data-layout-btn="2">2</button>
            <button type="button" data-layout-btn="4">4</button>
          </div>
        </div>
        <div class="charts-grid" id="charts-grid" data-count="1"></div>
      </main>

      <aside class="right-dock" id="right-dock" hidden>
        <div class="dock-header">
          <strong id="dock-title">Lab</strong>
          <button type="button" class="btn-icon" id="dock-close" title="Đóng">×</button>
        </div>
        <div class="dock-body" id="dock-body"></div>
      </aside>
    </div>

    <script src="https://unpkg.com/lightweight-charts@4.2.0/dist/lightweight-charts.standalone.production.js"></script>
    <script src="assets/js/mock-data.js"></script>
    <script src="assets/js/shell.js"></script>
    <!-- panel + app scripts added in later tasks -->
  </body>
</html>
```

- [ ] **Step 3: Write rail/dock/stage CSS in `app.css` + `shell.css`**

Minimum rules:

```css
/* app.css */
.app-frame {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: var(--rail-w) 1fr;
  height: calc(100vh - var(--header-h));
}
.app-frame[data-dock="open"] {
  grid-template-columns: var(--rail-w) 1fr var(--dock-w);
}
.left-rail {
  border-right: 1px solid var(--border);
  background: var(--bg-elevated);
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding: 0.5rem 0.35rem;
}
.rail-btn {
  writing-mode: horizontal-tb;
  padding: 0.55rem 0.25rem;
  font-size: 0.68rem;
  font-weight: 600;
}
.rail-btn[aria-pressed="true"] {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--bg-hover);
}
.chart-stage {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.chart-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
  padding: 0.45rem 0.75rem;
  border-bottom: 1px solid var(--border);
}
.charts-grid {
  flex: 1;
  min-height: 0;
  display: grid;
  gap: 1px;
  background: var(--border);
}
.charts-grid[data-count="1"] { grid-template-columns: 1fr; grid-template-rows: 1fr; }
.charts-grid[data-count="2"] { grid-template-columns: 1fr 1fr; grid-template-rows: 1fr; }
.charts-grid[data-count="4"] { grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; }
.chart-panel {
  background: var(--bg-panel);
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.chart-panel.is-focused {
  outline: 1px solid var(--accent);
  outline-offset: -1px;
  z-index: 1;
}
.chart-host { flex: 1; min-height: 0; }
.right-dock {
  border-left: 1px solid var(--border);
  background: var(--bg-elevated);
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.right-dock[hidden] { display: none !important; }
.dock-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.55rem 0.75rem;
  border-bottom: 1px solid var(--border);
}
.dock-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 0.75rem;
}
```

Port useful rules from `pages.css` (`.lab-col`, `.data`, `.sentiment-*`, `.news-item`, `.strategy-card`, etc.) into `app.css` so panel JS can reuse class names.

- [ ] **Step 4: Replace `index.html` with redirect**

```html
<!DOCTYPE html>
<html lang="vi">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="refresh" content="0; url=app.html" />
    <title>Crypto Strategy Lab</title>
    <script>location.replace('app.html');</script>
  </head>
  <body>
    <p><a href="app.html">Mở Crypto Strategy Lab</a></p>
  </body>
</html>
```

- [ ] **Step 5: Smoke-check chrome**

Open `docs/prototype/app.html` in the browser (double-click / `open app.html`).

Expected: header + left rail + empty chart stage + no right dock; no tab nav; theme toggle still works after `shell.js` is present.

- [ ] **Step 6: Commit only if user asks**

```bash
git add docs/prototype/app.html docs/prototype/index.html docs/prototype/assets/css/
# git commit only when user requests
```

---

### Task 2: `app.js` — exclusive dock + panel registry

**Files:**
- Create: `docs/prototype/assets/js/app.js`
- Modify: `docs/prototype/app.html` (script order)
- Create stub: `docs/prototype/assets/js/panels/lab.js`, `strategy.js`, `news.js` (mount placeholders)

**Interfaces:**
- Consumes: `#app-frame`, `#right-dock`, `#dock-title`, `#dock-body`, `#dock-close`, `[data-panel-btn]`
- Produces: `window.CSLApp = { openPanel, closeDock, getActivePanel }`; events `csl-open-panel`

- [ ] **Step 1: Create panel stubs**

`docs/prototype/assets/js/panels/lab.js`:

```js
(function (global) {
  global.CSLPanels = global.CSLPanels || {};
  global.CSLPanels.lab = {
    title: 'Lab',
    mount: function (root) {
      root.innerHTML = '<p class="panel-placeholder">Lab panel</p>';
    },
  };
})(window);
```

`strategy.js` and `news.js` analogously with titles `Strategy` / `News`.

- [ ] **Step 2: Implement `app.js`**

```js
(function (global) {
  const frame = document.getElementById('app-frame');
  const dock = document.getElementById('right-dock');
  const dockTitle = document.getElementById('dock-title');
  const dockBody = document.getElementById('dock-body');
  const dockClose = document.getElementById('dock-close');
  const buttons = Array.from(document.querySelectorAll('[data-panel-btn]'));

  let active = null; // 'lab' | 'strategy' | 'news' | null

  function setRailPressed(id) {
    buttons.forEach((btn) => {
      const on = btn.getAttribute('data-panel-btn') === id;
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  function closeDock() {
    active = null;
    setRailPressed(null);
    if (dock) dock.hidden = true;
    if (frame) frame.dataset.dock = 'closed';
    if (dockBody) dockBody.innerHTML = '';
  }

  function openPanel(id, opts) {
    const forceOpen = opts && opts.forceOpen;
    const panels = global.CSLPanels || {};
    const panel = panels[id];
    if (!panel || !panel.mount) return;

    if (active === id && !forceOpen) {
      closeDock();
      return;
    }

    active = id;
    setRailPressed(id);
    if (dock) dock.hidden = false;
    if (frame) frame.dataset.dock = 'open';
    if (dockTitle) dockTitle.textContent = panel.title || id;
    if (dockBody) {
      dockBody.innerHTML = '';
      panel.mount(dockBody);
    }
  }

  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      openPanel(btn.getAttribute('data-panel-btn'));
    });
  });
  if (dockClose) dockClose.addEventListener('click', closeDock);

  global.addEventListener('csl-open-panel', (e) => {
    const detail = e.detail || {};
    if (!detail.panel) return;
    openPanel(detail.panel, { forceOpen: !!detail.forceOpen });
  });

  global.CSLApp = {
    openPanel: openPanel,
    closeDock: closeDock,
    getActivePanel: function () {
      return active;
    },
  };
})(window);
```

- [ ] **Step 3: Wire script tags in `app.html` (before end of body)**

Order:

```html
<script src="assets/js/panels/lab.js"></script>
<script src="assets/js/panels/strategy.js"></script>
<script src="assets/js/panels/news.js"></script>
<script src="assets/js/app.js"></script>
```

(`chart-workspace.js` added in Task 3 after `app.js` or before — prefer **after** `mock-data` / `shell`, **before** panels if panels call `CSLCharts`; actually panels need charts for apply — load charts **before** panels, app last:)

```html
<script src="assets/js/mock-data.js"></script>
<script src="assets/js/shell.js"></script>
<script src="assets/js/chart-workspace.js"></script>
<script src="assets/js/panels/lab.js"></script>
<script src="assets/js/panels/strategy.js"></script>
<script src="assets/js/panels/news.js"></script>
<script src="assets/js/app.js"></script>
```

For Task 2 only, omit `chart-workspace.js` until Task 3; stubs still work.

- [ ] **Step 4: Smoke-check dock**

Open `app.html` → click Lab → dock opens with placeholder → click Lab again → closes → click News → opens News → click Strategy → replaces (exclusive) → × closes.

Expected: only one panel; `data-dock` flips `open`/`closed`; chart stage widens when closed.

---

### Task 3: `chart-workspace.js` — layout 1/2/4 + overlays + strategy API

**Files:**
- Create: `docs/prototype/assets/js/chart-workspace.js`
- Modify: `docs/prototype/app.html` (include script)
- Reuse logic from: `docs/prototype/assets/js/charts-page.js`, `strategy-page.js`

**Interfaces:**
- Consumes: `#charts-grid`, `[data-layout-btn]`, `[data-overlay]`, `window.CSLMock`, `LightweightCharts`, `csl-theme-change`, `csl-market-change`, `csl-apply-strategy`
- Produces: `window.CSLCharts = { setLayout, getFocusedPaneId, applyStrategyOverlay, clearStrategyOverlay }`

- [ ] **Step 1: Port pane mount from `charts-page.js`**

Implement pane list with:

- `DEFAULT_TFS = ['5m', '15m', '1h', '4h']`
- `setLayout(n)` where `n` is 1, 2, or 4: destroy extra panes / create missing; set `#charts-grid` `data-count`; default TFs for new panes from `DEFAULT_TFS[i]`
- Click on `.chart-panel` → `is-focused` on that pane only; `focusedId` state
- On init: `setLayout(1)` and focus pane 0

- [ ] **Step 2: Indicator overlays**

Same as current charts page: MA / BB / S/R from checkbox state; re-apply on TF change and theme change.

- [ ] **Step 3: Strategy overlay API**

On focused pane’s candle series:

```js
function applyStrategyOverlay(payload) {
  const pane = panes.find((p) => p.id === focusedId) || panes[0];
  if (!pane) return;
  const { candles } = window.CSLMock.seriesFor(pane.tf);
  const marks = window.CSLMock.markerTimes(candles);
  pane.candleSeries.setMarkers([
    { time: marks.buy, position: 'belowBar', color: pane.colors.up, shape: 'arrowUp', text: 'BUY' },
    { time: marks.sell, position: 'aboveBar', color: pane.colors.down, shape: 'arrowDown', text: 'SELL' },
  ]);
  // Optional: keep MA + S/R from strategy-page for the applied view
  const ma = window.CSLMock.sma(candles, 20);
  pane.strategyMaSeries.setData(ma);
  const sr = window.CSLMock.supportResistance(candles);
  pane.strategySupportSeries.setData(sr.support);
  pane.strategyResistanceSeries.setData(sr.resistance);
  pane.appliedStrategy = payload && payload.strategy ? payload.strategy : null;
}

function clearStrategyOverlay() {
  panes.forEach((pane) => {
    pane.candleSeries.setMarkers([]);
    pane.strategyMaSeries.setData([]);
    pane.strategySupportSeries.setData([]);
    pane.strategyResistanceSeries.setData([]);
    pane.appliedStrategy = null;
  });
}
```

Listen:

```js
window.addEventListener('csl-apply-strategy', (e) => {
  applyStrategyOverlay(e.detail || {});
});
```

When focused pane TF changes, if `pane.appliedStrategy`, re-call `applyStrategyOverlay` for that strategy.

- [ ] **Step 4: Wire layout buttons**

```js
document.querySelectorAll('[data-layout-btn]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const n = Number(btn.getAttribute('data-layout-btn'));
    setLayout(n);
    document.querySelectorAll('[data-layout-btn]').forEach((b) => {
      b.classList.toggle('active', b === btn);
    });
    if (frame) frame.dataset.layout = String(n);
  });
});
```

- [ ] **Step 5: Smoke-check charts**

Open `app.html`:

1. One candlestick chart visible  
2. Click layout `4` → 2×2 with TFs 5m/15m/1h/4h  
3. Toggle Bollinger → bands appear  
4. Theme toggle → chart colors update  
5. In console:  
   `window.dispatchEvent(new CustomEvent('csl-apply-strategy', { detail: { strategy: CSLMock.leaderboard[0] } }))`  
   → BUY/SELL markers on focused pane

---

### Task 4: Lab panel (plugins, search, leaderboard → Strategy)

**Files:**
- Modify: `docs/prototype/assets/js/panels/lab.js`
- CSS: reuse ported lab classes in `app.css`

**Interfaces:**
- Consumes: `CSLMock.leaderboard`, `CSLApp.openPanel` / `csl-open-panel`, `csl-apply-strategy`
- Produces: full Lab UI; `#sentiment-plugin` checkbox for News CTA; selecting leaderboard row opens Strategy + apply

- [ ] **Step 1: Replace stub `mount` with full Lab markup**

Port content from old `lab.html` into `root.innerHTML = \`...\`` (plugins + search + table). Use `CSLMock.leaderboard` to build rows:

```js
function renderLeaderboard(tbody) {
  tbody.innerHTML = window.CSLMock.leaderboard
    .map(
      (row) => `
      <tr data-rank="${row.rank}" tabindex="0" role="button">
        <td>${row.rank}</td>
        <td>${row.name}<div class="meta">${row.version}</div></td>
        <td class="up">${row.ret}</td>
        <td>${row.win}</td>
        <td>${row.mdd}</td>
        <td>${row.trades}</td>
      </tr>`,
    )
    .join('');
}
```

- [ ] **Step 2: Wire START/STOP mock**

Reuse interval pattern from old lab page if present; otherwise:

```js
let timer = null;
let candidates = 125;
startBtn.addEventListener('click', () => {
  if (timer) return;
  statusEl.textContent = 'Running';
  statusEl.classList.add('warn');
  timer = setInterval(() => {
    candidates += 1;
    candidatesEl.textContent = String(candidates);
  }, 800);
});
stopBtn.addEventListener('click', () => {
  clearInterval(timer);
  timer = null;
  statusEl.textContent = 'Stopped';
  statusEl.classList.remove('warn');
});
```

- [ ] **Step 3: Leaderboard selection**

```js
tbody.addEventListener('click', (e) => {
  const tr = e.target.closest('tr[data-rank]');
  if (!tr) return;
  const rank = Number(tr.getAttribute('data-rank'));
  const strategy = window.CSLMock.leaderboard.find((r) => r.rank === rank);
  if (!strategy) return;
  window.dispatchEvent(
    new CustomEvent('csl-apply-strategy', {
      detail: { strategy: strategy, trades: window.CSLMock.trades },
    }),
  );
  window.dispatchEvent(
    new CustomEvent('csl-open-panel', {
      detail: { panel: 'strategy', forceOpen: true },
    }),
  );
});
```

- [ ] **Step 4: Expose Sentiment checkbox API**

```js
global.CSLPanels.lab = {
  title: 'Lab',
  mount: mount,
  setSentimentChecked: function (checked) {
    const el = document.getElementById('sentiment-plugin');
    if (el) el.checked = !!checked;
  },
};
```

Note: `setSentimentChecked` must run **after** mount; News CTA will `openPanel('lab', { forceOpen: true })` then call it (or Lab reads `sessionStorage` flag `csl-enable-sentiment` on mount).

Prefer sessionStorage to avoid race:

```js
// in mount, after building DOM:
if (sessionStorage.getItem('csl-enable-sentiment') === '1') {
  const el = root.querySelector('#sentiment-plugin');
  if (el) el.checked = true;
  sessionStorage.removeItem('csl-enable-sentiment');
}
```

- [ ] **Step 5: Smoke-check Lab**

Open Lab → START increases candidates → click rank #1 → Strategy dock opens + markers on chart.

---

### Task 5: Strategy + News panels

**Files:**
- Modify: `docs/prototype/assets/js/panels/strategy.js`
- Modify: `docs/prototype/assets/js/panels/news.js`

**Interfaces:**
- Strategy consumes: `csl-apply-strategy` detail + `CSLMock.trades`
- News produces: sets `sessionStorage csl-enable-sentiment=1` and opens Lab

- [ ] **Step 1: Strategy panel UI**

On mount, render metrics from `lastStrategy` (module-level var) or placeholder:

```js
let lastStrategy = window.CSLMock.leaderboard[0];

function render(root) {
  const s = lastStrategy;
  if (!s) {
    root.innerHTML = '<p class="panel-placeholder">Chọn strategy từ Lab leaderboard.</p>';
    return;
  }
  root.innerHTML = `
    <div class="strategy-panel">
      <h3>${s.name}</h3>
      <p class="meta">${s.version} · dataset BTC mock</p>
      <div class="stats-row">
        <div class="stat-card"><div class="k">Return</div><div class="v up">${s.ret}</div></div>
        <div class="stat-card"><div class="k">Win Rate</div><div class="v">${s.win}</div></div>
        <div class="stat-card"><div class="k">Max DD</div><div class="v">${s.mdd}</div></div>
        <div class="stat-card"><div class="k">Trades</div><div class="v">${s.trades}</div></div>
      </div>
      <div class="legend-bar">…BUY/SELL/Entry/Exit/SL/TP…</div>
      <table class="data"><thead>…</thead><tbody id="strategy-trades-body"></tbody></table>
      <div id="trade-detail"></div>
    </div>`;
  // fill trades from CSLMock.trades; row click updates detail (port from strategy-page.js)
}

window.addEventListener('csl-apply-strategy', (e) => {
  if (e.detail && e.detail.strategy) lastStrategy = e.detail.strategy;
  const body = document.getElementById('dock-body');
  if (window.CSLApp && window.CSLApp.getActivePanel() === 'strategy' && body) {
    render(body);
  }
});
```

- [ ] **Step 2: News panel UI**

```js
mount: function (root) {
  const items = window.CSLMock.news
    .map(
      (n) => `
      <article class="news-item">
        <h3>${n.title}</h3>
        <div class="news-meta">${n.source} · ${n.when} · <span class="badge ${n.sentiment === 'POSITIVE' ? 'pos' : n.sentiment === 'NEGATIVE' ? 'neg' : 'neu'}">${n.sentiment}</span></div>
      </article>`,
    )
    .join('');
  root.innerHTML = `
    <div class="news-panel">
      <div class="sentiment-block">…42% / 38% / 20% tracks…</div>
      <button type="button" class="btn primary" id="enable-sentiment">Bật SentimentStrategy</button>
      <div class="news-list">${items}</div>
    </div>`;
  root.querySelector('#enable-sentiment').addEventListener('click', () => {
    sessionStorage.setItem('csl-enable-sentiment', '1');
    window.dispatchEvent(
      new CustomEvent('csl-open-panel', { detail: { panel: 'lab', forceOpen: true } }),
    );
  });
}
```

- [ ] **Step 3: Smoke-check cross-panel flow**

1. News → Bật SentimentStrategy → Lab opens with Sentiment checked  
2. Lab → pick #2 → Strategy shows that name/metrics + chart markers update  
3. Close dock → chart full width; markers remain on chart

---

### Task 6: Delete obsolete pages + update README + mark spec done

**Files:**
- Delete: `docs/prototype/charts.html`, `lab.html`, `strategy.html`, `news.html`
- Delete: `docs/prototype/assets/js/charts-page.js`, `strategy-page.js`
- Delete: `docs/prototype/assets/css/pages.css` (only after all rules needed were moved to `app.css`)
- Modify: `README.md` prototype section
- Modify: `docs/superpowers/specs/2026-08-13-prototype-single-screen-design.md` status → Implemented

- [ ] **Step 1: Verify no remaining references**

```bash
rg -n "charts\.html|lab\.html|strategy\.html|news\.html|pages\.css|charts-page|strategy-page" docs README.md
```

Expected: only historical mentions inside superseded specs/plans (optional cleanup).

- [ ] **Step 2: Delete obsolete prototype files listed above**

- [ ] **Step 3: Update README prototype section**

Replace multi-tab table with:

```markdown
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
```

- [ ] **Step 4: Final smoke checklist**

| # | Action | Expected |
|---|--------|----------|
| 1 | Open `app.html` via file:// | Single screen, no tabs |
| 2 | Layout 1→2→4 | Grid updates; charts render |
| 3 | Rail Lab/Strategy/News | Exclusive dock |
| 4 | Lab row → Strategy | Panel + markers |
| 5 | News CTA | Lab + Sentiment checked |
| 6 | Theme + pair | Persist / labels update |

- [ ] **Step 5: Commit only if user asks**

---

## Self-review (plan vs spec)

| Spec requirement | Task |
|------------------|------|
| Single `app.html` / file:// | 1, 2 |
| Rail + exclusive right dock | 2 |
| Panels Lab + Strategy + News | 4, 5 |
| Layout default 1; 1/2/4 | 3 |
| Lab → Strategy + overlay on focus | 3, 4 |
| News → Sentiment in Lab | 5 |
| JS panel modules (classic scripts) | 2–5 |
| Delete old multi-tab pages | 6 |
| README update | 6 |
| Theme / pair persist | 1 + existing `shell.js` |

No TBDs. Event and `CSLApp` / `CSLCharts` / `CSLPanels` names consistent across tasks.
