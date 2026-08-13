(function (global) {
  global.CSLPanels = global.CSLPanels || {};

  let timer = null;
  let candidates = 125;

  function renderLeaderboard(tbody) {
    const rows = (global.CSLMock && global.CSLMock.leaderboard) || [];
    tbody.innerHTML = rows
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

  function applyStrategyFromRow(tr) {
    const rank = Number(tr.getAttribute('data-rank'));
    const strategy =
      global.CSLMock && global.CSLMock.leaderboard
        ? global.CSLMock.leaderboard.find((r) => r.rank === rank)
        : null;
    if (!strategy) return;

    const tbody = tr.parentElement;
    if (tbody) {
      tbody.querySelectorAll('tr.is-active').forEach((row) => row.classList.remove('is-active'));
    }
    tr.classList.add('is-active');

    global.dispatchEvent(
      new CustomEvent('csl-apply-strategy', {
        detail: { strategy: strategy, trades: global.CSLMock.trades },
      }),
    );
    global.dispatchEvent(
      new CustomEvent('csl-open-panel', {
        detail: { panel: 'strategy', forceOpen: true },
      }),
    );
  }

  function mount(root) {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    candidates = 125;

    root.innerHTML = `
      <div class="lab-layout">
        <section class="lab-col">
          <div class="lab-col-header">Strategy plugins</div>
          <div class="lab-col-body">
            <article class="strategy-card">
              <label class="row">
                <input type="checkbox" checked />
                <span>
                  <strong>Moving Average (MA)</strong>
                  <span class="meta">fast=20 · slow=50 · version v1</span>
                </span>
              </label>
            </article>
            <article class="strategy-card">
              <label class="row">
                <input type="checkbox" checked />
                <span>
                  <strong>RSI</strong>
                  <span class="meta">period=14 · buy&lt;30 · sell&gt;70 · v1</span>
                </span>
              </label>
            </article>
            <article class="strategy-card">
              <label class="row">
                <input type="checkbox" checked />
                <span>
                  <strong>Bollinger Bands</strong>
                  <span class="meta">period=20 · std=2 · version v1</span>
                </span>
              </label>
            </article>
            <article class="strategy-card">
              <label class="row">
                <input type="checkbox" checked />
                <span>
                  <strong>Support / Resistance</strong>
                  <span class="meta">lookback=100 · proximity=0.4% · v1</span>
                </span>
              </label>
            </article>
            <article class="strategy-card">
              <label class="row">
                <input type="checkbox" id="sentiment-plugin" />
                <span>
                  <strong>Sentiment Strategy</strong>
                  <span class="meta">optional · từ News pipeline · v1</span>
                </span>
              </label>
            </article>
          </div>
        </section>

        <section class="lab-col">
          <div class="lab-col-header">Continuous search loop</div>
          <div class="lab-col-body">
            <div class="actions-row">
              <button type="button" class="primary" id="start-search">START SEARCH</button>
              <button type="button" id="stop-search">STOP</button>
            </div>
            <div class="stats-row">
              <div class="stat-card">
                <div class="k">Candidates tested</div>
                <div class="v" id="candidates">125</div>
              </div>
              <div class="stat-card">
                <div class="k">Loop status</div>
                <div class="v" id="loop-status">Idle</div>
              </div>
              <div class="stat-card">
                <div class="k">Generator</div>
                <div class="v" style="font-size: 0.92rem">Random Search</div>
              </div>
              <div class="stat-card">
                <div class="k">Dataset</div>
                <div class="v" style="font-size: 0.92rem">BTC 5m · 6 tháng</div>
              </div>
            </div>
            <div class="current-box">
              <div class="k" style="font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase">
                Current candidate · <span class="pill" id="candidate-pill">IDLE</span>
              </div>
              <div class="combo">MA20 + RSI14 + SR</div>
              <div class="progress" aria-hidden="true"><span id="search-progress" style="width: 0%"></span></div>
              <p style="margin: 0.65rem 0 0; font-size: 0.78rem; color: var(--text-muted)">
                generate → backtest → evaluate → rank · stop: 100 candidates / 1h / no improve
              </p>
            </div>
          </div>
        </section>

        <section class="lab-col">
          <div class="lab-col-header">Leaderboard Top-K</div>
          <div class="lab-col-body" style="padding: 0">
            <table class="data">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Strategy</th>
                  <th>Return</th>
                  <th>Win</th>
                  <th>MDD</th>
                  <th>Trades</th>
                </tr>
              </thead>
              <tbody id="lab-leaderboard"></tbody>
            </table>
          </div>
        </section>
      </div>
    `;

    if (sessionStorage.getItem('csl-enable-sentiment') === '1') {
      const el = root.querySelector('#sentiment-plugin');
      if (el) el.checked = true;
      sessionStorage.removeItem('csl-enable-sentiment');
    }

    const statusEl = root.querySelector('#loop-status');
    const candidatesEl = root.querySelector('#candidates');
    const candidatePill = root.querySelector('#candidate-pill');
    const progressEl = root.querySelector('#search-progress');
    const startBtn = root.querySelector('#start-search');
    const stopBtn = root.querySelector('#stop-search');
    const tbody = root.querySelector('#lab-leaderboard');

    renderLeaderboard(tbody);

    startBtn.addEventListener('click', () => {
      if (timer) return;
      statusEl.textContent = 'Running';
      statusEl.classList.add('warn');
      if (candidatePill) {
        candidatePill.textContent = 'BACKTESTING';
        candidatePill.classList.add('run');
      }
      if (progressEl) progressEl.style.width = '62%';
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
      if (candidatePill) {
        candidatePill.textContent = 'IDLE';
        candidatePill.classList.remove('run');
      }
      if (progressEl) progressEl.style.width = '0%';
    });

    tbody.addEventListener('click', (e) => {
      const tr = e.target.closest('tr[data-rank]');
      if (!tr) return;
      applyStrategyFromRow(tr);
    });

    tbody.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const tr = e.target.closest('tr[data-rank]');
      if (!tr) return;
      e.preventDefault();
      applyStrategyFromRow(tr);
    });
  }

  global.CSLPanels.lab = {
    title: 'Lab',
    mount: mount,
    setSentimentChecked: function (checked) {
      const el = document.getElementById('sentiment-plugin');
      if (el) el.checked = !!checked;
    },
  };
})(window);
