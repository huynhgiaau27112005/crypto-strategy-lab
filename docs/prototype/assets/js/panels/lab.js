(function (global) {
  global.CSLPanels = global.CSLPanels || {};

  let timer = null;
  let candidates = 125;

  function formatScore(score) {
    return typeof score === 'number' ? score.toFixed(1) : String(score || '—');
  }

  function renderLeaderboard(tbody) {
    const rows = (global.CSLMock && global.CSLMock.leaderboard) || [];
    tbody.innerHTML = rows
      .map(
        (row) => `
      <tr data-rank="${row.rank}" tabindex="0" role="button">
        <td>${row.rank}</td>
        <td>${row.name}<div class="meta">${row.version}</div></td>
        <td class="score">${formatScore(row.score)}</td>
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
        <section class="lab-col lab-strategies">
          <button type="button" class="lab-col-header lab-strategies-toggle" id="strategies-toggle" aria-expanded="true">
            <span>Strategies</span>
            <span class="lab-strategies-meta">
              <span class="lab-count" id="strategy-count">0</span>
              <span class="lab-chevron" aria-hidden="true"></span>
            </span>
          </button>
          <div class="lab-col-body" id="strategies-body">
            <div class="plugin-list">
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
          </div>
        </section>

        <div class="lab-rest">
          <section class="lab-block">
            <h2 class="lab-block-title">Continuous search loop</h2>
            <button type="button" class="btn-cta" id="search-toggle">Start Search</button>
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
              <div class="combo-score">
                Overall score · <strong id="current-combo-score">86.2</strong>
              </div>
              <div class="progress" aria-hidden="true"><span id="search-progress" style="width: 0%"></span></div>
              <p style="margin: 0.65rem 0 0; font-size: 0.78rem; color: var(--text-muted)">
                generate → backtest → evaluate → rank · stop: 100 candidates / 1h / no improve
              </p>
            </div>
          </section>

          <section class="lab-block">
            <h2 class="lab-block-title">Leaderboard Top-K</h2>
            <div class="lab-table-scroll">
              <table class="data">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Strategy</th>
                    <th>Score</th>
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
      </div>
    `;

    if (sessionStorage.getItem('csl-enable-sentiment') === '1') {
      const el = root.querySelector('#sentiment-plugin');
      if (el) el.checked = true;
      sessionStorage.removeItem('csl-enable-sentiment');
    }

    function updateStrategyCount() {
      const n = root.querySelectorAll('.strategy-card input[type="checkbox"]:checked').length;
      const el = root.querySelector('#strategy-count');
      if (el) el.textContent = String(n);
    }

    function syncPluginCard(card) {
      const input = card.querySelector('input[type="checkbox"]');
      if (!input) return;
      card.classList.toggle('is-on', input.checked);
      card.classList.toggle('is-off', !input.checked);
    }

    root.querySelectorAll('.strategy-card').forEach((card) => {
      const input = card.querySelector('input[type="checkbox"]');
      syncPluginCard(card);
      if (input) {
        input.addEventListener('change', () => {
          syncPluginCard(card);
          updateStrategyCount();
        });
      }
    });
    updateStrategyCount();

    const strategiesSection = root.querySelector('.lab-strategies');
    const strategiesToggle = root.querySelector('#strategies-toggle');
    if (strategiesToggle && strategiesSection) {
      strategiesToggle.addEventListener('click', () => {
        const collapsed = strategiesSection.classList.toggle('is-collapsed');
        strategiesToggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      });
    }

    const statusEl = root.querySelector('#loop-status');
    const candidatesEl = root.querySelector('#candidates');
    const candidatePill = root.querySelector('#candidate-pill');
    const progressEl = root.querySelector('#search-progress');
    const comboScoreEl = root.querySelector('#current-combo-score');
    const searchBtn = root.querySelector('#search-toggle');
    const tbody = root.querySelector('#lab-leaderboard');

    renderLeaderboard(tbody);

    function stopSearch() {
      clearInterval(timer);
      timer = null;
      statusEl.textContent = 'Stopped';
      statusEl.classList.remove('warn');
      if (candidatePill) {
        candidatePill.textContent = 'IDLE';
        candidatePill.classList.remove('run');
      }
      if (progressEl) progressEl.style.width = '0%';
      if (searchBtn) {
        searchBtn.textContent = 'Start Search';
        searchBtn.classList.remove('is-stop');
      }
    }

    function startSearch() {
      if (timer) return;
      statusEl.textContent = 'Running';
      statusEl.classList.add('warn');
      if (candidatePill) {
        candidatePill.textContent = 'BACKTESTING';
        candidatePill.classList.add('run');
      }
      if (progressEl) progressEl.style.width = '62%';
      if (searchBtn) {
        searchBtn.textContent = 'Stop';
        searchBtn.classList.add('is-stop');
      }
      timer = setInterval(() => {
        candidates += 1;
        candidatesEl.textContent = String(candidates);
        if (comboScoreEl) {
          const jitter = 80 + Math.random() * 15;
          comboScoreEl.textContent = jitter.toFixed(1);
        }
      }, 800);
    }

    if (searchBtn) {
      searchBtn.addEventListener('click', () => {
        if (timer) stopSearch();
        else startSearch();
      });
    }

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
      if (!el) return;
      el.checked = !!checked;
      const card = el.closest('.strategy-card');
      if (card) {
        card.classList.toggle('is-on', el.checked);
        card.classList.toggle('is-off', !el.checked);
      }
      const countEl = document.getElementById('strategy-count');
      if (countEl) {
        const n = document.querySelectorAll('.strategy-card input[type="checkbox"]:checked').length;
        countEl.textContent = String(n);
      }
    },
  };
})(window);
