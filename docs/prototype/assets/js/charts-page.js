(function () {
  const { createChart } = LightweightCharts;
  const mock = window.CSLMock;
  const grid = document.getElementById('charts-grid');
  const countLabel = document.getElementById('panel-count');
  const addBtn = document.getElementById('add-panel');
  const removeBtn = document.getElementById('remove-panel');
  if (!grid) return;

  const DEFAULTS = ['5m', '15m', '1h', '4h'];
  const panels = [];
  let panelSeq = 0;

  function chartColors() {
    const dark = document.documentElement.getAttribute('data-theme') !== 'light';
    return {
      layout: {
        background: { color: dark ? '#141b26' : '#ffffff' },
        textColor: dark ? '#7d8798' : '#64748b',
      },
      grid: {
        vertLines: { color: dark ? 'rgba(255,255,255,0.05)' : 'rgba(15,23,42,0.06)' },
        horzLines: { color: dark ? 'rgba(255,255,255,0.05)' : 'rgba(15,23,42,0.06)' },
      },
      up: dark ? '#2dd4bf' : '#059669',
      down: dark ? '#fb7185' : '#e11d48',
    };
  }

  function overlayState() {
    return {
      ma: document.querySelector('[data-overlay="ma"]')?.checked ?? true,
      bb: document.querySelector('[data-overlay="bb"]')?.checked ?? false,
      sr: document.querySelector('[data-overlay="sr"]')?.checked ?? false,
    };
  }

  function currentPair() {
    return localStorage.getItem('csl-pair') || 'BTCUSDT';
  }

  function updateChrome() {
    const n = panels.length;
    grid.dataset.count = String(n);
    if (countLabel) countLabel.textContent = `${n} / 4 panel`;
    if (addBtn) addBtn.disabled = n >= 4;
    if (removeBtn) removeBtn.disabled = n <= 1;
    panels.forEach((p) => {
      const close = p.root.querySelector('[data-close-panel]');
      if (close) close.disabled = n <= 1;
    });
  }

  function buildPanelEl(tf) {
    panelSeq += 1;
    const el = document.createElement('section');
    el.className = 'chart-panel';
    el.dataset.panelId = String(panelSeq);
    el.innerHTML = `
      <div class="chart-panel-header">
        <span class="title"><span data-pair-label>${currentPair()}</span> · <span data-tf-label>${tf}</span></span>
        <div class="panel-actions">
          <div class="tf-group">
            ${DEFAULTS.map(
              (t) =>
                `<button type="button" data-tf="${t}" class="${t === tf ? 'active' : ''}">${t}</button>`,
            ).join('')}
          </div>
          <button type="button" class="btn-icon" data-close-panel title="Đóng panel">×</button>
        </div>
      </div>
      <div class="chart-host"></div>
    `;
    return el;
  }

  function mountPanel(root, tf) {
    const host = root.querySelector('.chart-host');
    const colors = chartColors();
    const chart = createChart(host, {
      autoSize: true,
      layout: colors.layout,
      grid: colors.grid,
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, timeVisible: true },
      crosshair: { mode: 0 },
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: colors.up,
      downColor: colors.down,
      borderVisible: false,
      wickUpColor: colors.up,
      wickDownColor: colors.down,
    });
    const volumeSeries = chart.addHistogramSeries({
      priceFormat: { type: 'volume' },
      priceScaleId: '',
    });
    volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });

    const maSeries = chart.addLineSeries({
      color: '#3d7eff',
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    const bbMid = chart.addLineSeries({
      color: '#a78bfa',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    const bbUpper = chart.addLineSeries({
      color: '#a78bfa',
      lineWidth: 1,
      lineStyle: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    const bbLower = chart.addLineSeries({
      color: '#a78bfa',
      lineWidth: 1,
      lineStyle: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    const supportSeries = chart.addLineSeries({
      color: colors.up,
      lineWidth: 1,
      lineStyle: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    const resistanceSeries = chart.addLineSeries({
      color: colors.down,
      lineWidth: 1,
      lineStyle: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    const state = {
      root,
      chart,
      candleSeries,
      volumeSeries,
      maSeries,
      bbMid,
      bbUpper,
      bbLower,
      supportSeries,
      resistanceSeries,
      tf,
    };

    function render() {
      const { candles, volumes } = mock.seriesFor(state.tf);
      candleSeries.setData(candles);
      volumeSeries.setData(volumes);
      const ov = overlayState();
      maSeries.setData(ov.ma ? mock.sma(candles, 20) : []);
      if (ov.bb) {
        const bb = mock.bollinger(candles, 20, 2);
        bbMid.setData(bb.mid);
        bbUpper.setData(bb.upper);
        bbLower.setData(bb.lower);
      } else {
        bbMid.setData([]);
        bbUpper.setData([]);
        bbLower.setData([]);
      }
      if (ov.sr) {
        const sr = mock.supportResistance(candles);
        supportSeries.setData(sr.support);
        resistanceSeries.setData(sr.resistance);
      } else {
        supportSeries.setData([]);
        resistanceSeries.setData([]);
      }
      chart.timeScale().fitContent();
    }

    root.querySelectorAll('.tf-group button').forEach((btn) => {
      btn.addEventListener('click', () => {
        root.querySelectorAll('.tf-group button').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        state.tf = btn.dataset.tf;
        const label = root.querySelector('[data-tf-label]');
        if (label) label.textContent = state.tf;
        render();
      });
    });

    root.querySelector('[data-close-panel]')?.addEventListener('click', () => {
      if (panels.length <= 1) return;
      removePanel(state);
    });

    state.render = render;
    state.destroy = function destroy() {
      chart.remove();
      root.remove();
    };
    state.applyTheme = function applyTheme() {
      const c = chartColors();
      chart.applyOptions({ layout: c.layout, grid: c.grid });
      candleSeries.applyOptions({
        upColor: c.up,
        downColor: c.down,
        wickUpColor: c.up,
        wickDownColor: c.down,
      });
      supportSeries.applyOptions({ color: c.up });
      resistanceSeries.applyOptions({ color: c.down });
    };

    render();
    panels.push(state);
    updateChrome();
    return state;
  }

  function addPanel(tf) {
    if (panels.length >= 4) return;
    const nextTf = tf || DEFAULTS[panels.length] || '5m';
    const el = buildPanelEl(nextTf);
    grid.appendChild(el);
    mountPanel(el, nextTf);
  }

  function removePanel(state) {
    const idx = panels.indexOf(state);
    if (idx >= 0) panels.splice(idx, 1);
    state.destroy();
    updateChrome();
    requestAnimationFrame(() => panels.forEach((p) => p.chart.timeScale().fitContent()));
  }

  addBtn?.addEventListener('click', () => addPanel());
  removeBtn?.addEventListener('click', () => {
    if (panels.length <= 1) return;
    removePanel(panels[panels.length - 1]);
  });

  document.querySelectorAll('[data-overlay]').forEach((input) => {
    input.addEventListener('change', () => panels.forEach((p) => p.render()));
  });

  window.addEventListener('csl-theme-change', () => {
    panels.forEach((p) => {
      p.applyTheme();
      p.render();
    });
  });

  window.addEventListener('csl-market-change', () => {
    document.querySelectorAll('[data-pair-label]').forEach((el) => {
      el.textContent = currentPair();
    });
  });

  DEFAULTS.forEach((tf) => addPanel(tf));
})();
