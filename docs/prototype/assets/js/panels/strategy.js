(function (global) {
  global.CSLPanels = global.CSLPanels || {};

  let lastStrategy =
    global.CSLMock && global.CSLMock.leaderboard ? global.CSLMock.leaderboard[0] : null;
  let selectedTradeId =
    global.CSLMock && global.CSLMock.trades && global.CSLMock.trades[0]
      ? global.CSLMock.trades[0].id
      : 1;

  function board() {
    return (global.CSLMock && global.CSLMock.leaderboard) || [];
  }

  function formatScore(score) {
    return typeof score === 'number' ? score.toFixed(1) : String(score || '—');
  }

  function tradesList() {
    return (global.CSLMock && global.CSLMock.trades) || [];
  }

  function selectedTrade() {
    const trades = tradesList();
    return trades.find((t) => t.id === selectedTradeId) || trades[0] || null;
  }

  function applyStrategy(strategy, opts) {
    if (!strategy) return;
    lastStrategy = strategy;
    global.dispatchEvent(
      new CustomEvent('csl-apply-strategy', {
        detail: {
          strategy: strategy,
          trades: tradesList(),
          silent: !!(opts && opts.silent),
        },
      }),
    );
  }

  function renderDetail(detailRoot) {
    const trade = selectedTrade();
    if (!detailRoot || !trade) return;
    detailRoot.innerHTML = `
      <h3>Trade detail #${trade.id}</h3>
      <dl>
        <div><dt>Side</dt><dd class="${trade.side === 'BUY' ? 'up' : 'down'}">${trade.side}</dd></div>
        <div><dt>PnL</dt><dd class="${String(trade.pnl).startsWith('-') ? 'down' : 'up'}">${trade.pnl}</dd></div>
        <div><dt>Entry</dt><dd>${trade.entry}</dd></div>
        <div><dt>Exit</dt><dd>${trade.exit}</dd></div>
        <div><dt>Stop Loss</dt><dd class="down">${trade.sl}</dd></div>
        <div><dt>Take Profit</dt><dd class="up">${trade.tp}</dd></div>
        <div style="grid-column:1/-1"><dt>Ghi chú</dt><dd style="font-family:var(--font);font-size:0.82rem">${trade.note}</dd></div>
      </dl>
    `;
  }

  function renderTradesTable(tbody, detailRoot) {
    if (!tbody) return;
    const trades = tradesList();
    tbody.innerHTML = trades
      .map(
        (t) => `
      <tr data-trade-id="${t.id}" class="${t.id === selectedTradeId ? 'is-active' : ''}">
        <td>${t.id}</td>
        <td class="${t.side === 'BUY' ? 'up' : 'down'}">${t.side}</td>
        <td>${t.entry}</td>
        <td>${t.exit}</td>
        <td class="${String(t.pnl).startsWith('-') ? 'down' : 'up'}">${t.pnl}</td>
      </tr>`,
      )
      .join('');
    tbody.querySelectorAll('tr').forEach((row) => {
      row.addEventListener('click', () => {
        selectedTradeId = Number(row.dataset.tradeId);
        renderTradesTable(tbody, detailRoot);
        renderDetail(detailRoot);
      });
    });
  }

  function render(root) {
    const rows = board();
    if (!rows.length) {
      root.innerHTML = '<p class="panel-placeholder">Chưa có strategy trên leaderboard.</p>';
      return;
    }

    if (!lastStrategy) lastStrategy = rows[0];
    const s = lastStrategy;
    const options = rows
      .map(
        (row) =>
          `<option value="${row.rank}" ${row.rank === s.rank ? 'selected' : ''}>#${row.rank} · ${row.name}</option>`,
      )
      .join('');

    root.innerHTML = `
      <div class="strategy-panel">
        <label class="strategy-picker">
          <span>Tổ hợp strategy</span>
          <select id="strategy-select" aria-label="Chọn tổ hợp strategy">
            ${options}
          </select>
        </label>
        <p class="meta">${s.version} · dataset BTC mock · Binance BTCUSDT</p>
        <div class="stats-row">
          <div class="stat-card"><div class="k">Overall score</div><div class="v score">${formatScore(s.score)}</div></div>
          <div class="stat-card"><div class="k">Return</div><div class="v up">${s.ret}</div></div>
          <div class="stat-card"><div class="k">Win Rate</div><div class="v">${s.win}</div></div>
          <div class="stat-card"><div class="k">Max DD</div><div class="v down">${s.mdd}</div></div>
          <div class="stat-card"><div class="k">Trades</div><div class="v">${s.trades}</div></div>
        </div>
        <div class="legend-bar">
          <span><i style="background: var(--up)"></i>BUY</span>
          <span><i style="background: var(--down)"></i>SELL</span>
          <span><i style="background: #fbbf24"></i>Entry / Exit</span>
          <span><i style="background: var(--down)"></i>SL</span>
          <span><i style="background: var(--up)"></i>TP</span>
        </div>
        <table class="data">
          <thead>
            <tr>
              <th>#</th>
              <th>Side</th>
              <th>Entry</th>
              <th>Exit</th>
              <th>PnL</th>
            </tr>
          </thead>
          <tbody id="strategy-trades-body"></tbody>
        </table>
        <div class="trade-detail" id="trade-detail"></div>
      </div>`;

    const select = root.querySelector('#strategy-select');
    select.addEventListener('change', () => {
      const rank = Number(select.value);
      const next = rows.find((r) => r.rank === rank);
      if (!next) return;
      applyStrategy(next);
      render(root);
    });

    const tbody = root.querySelector('#strategy-trades-body');
    const detailRoot = root.querySelector('#trade-detail');
    renderTradesTable(tbody, detailRoot);
    renderDetail(detailRoot);
  }

  global.addEventListener('csl-apply-strategy', (e) => {
    if (e.detail && e.detail.strategy) lastStrategy = e.detail.strategy;
    if (e.detail && e.detail.silent) return;
    const body = document.getElementById('dock-body');
    if (global.CSLApp && global.CSLApp.getActivePanel() === 'strategy' && body) {
      render(body);
    }
  });

  global.CSLPanels.strategy = {
    title: 'Strategy',
    mount: function (root) {
      if (!lastStrategy && board()[0]) lastStrategy = board()[0];
      if (lastStrategy) applyStrategy(lastStrategy, { silent: true });
      render(root);
    },
  };
})(window);
