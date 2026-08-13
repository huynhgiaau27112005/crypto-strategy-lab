(function () {
  const { createChart } = LightweightCharts;
  const mock = window.CSLMock;
  const grid = document.getElementById('charts-grid');
  const frame = document.getElementById('app-frame');
  if (!grid || !mock) return;

  const DEFAULT_TFS = ['5m', '15m', '1h', '4h'];
  const panes = [];
  let paneSeq = 0;
  let focusedId = null;

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

  function setFocused(pane) {
    if (!pane) return;
    focusedId = pane.id;
    panes.forEach((p) => {
      p.root.classList.toggle('is-focused', p.id === focusedId);
    });
  }

  function getFocusedPaneId() {
    return focusedId;
  }

  function buildPanelEl(tf) {
    const el = document.createElement('section');
    el.className = 'chart-panel';
    el.innerHTML = `
      <div class="chart-panel-header">
        <span class="title"><span data-pair-label>${currentPair()}</span> · <span data-tf-label>${tf}</span></span>
        <div class="panel-actions">
          <div class="tf-group">
            ${DEFAULT_TFS.map(
              (t) =>
                `<button type="button" data-tf="${t}" class="${t === tf ? 'active' : ''}">${t}</button>`,
            ).join('')}
          </div>
        </div>
      </div>
      <div class="chart-host"></div>
    `;
    return el;
  }

  function mountPane(root, tf) {
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
    const strategyMaSeries = chart.addLineSeries({
      color: '#3d7eff',
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    const strategySupportSeries = chart.addLineSeries({
      color: colors.up,
      lineWidth: 1,
      lineStyle: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    const strategyResistanceSeries = chart.addLineSeries({
      color: colors.down,
      lineWidth: 1,
      lineStyle: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    const id = paneSeq;
    paneSeq += 1;
    root.dataset.paneId = String(id);

    const pane = {
      id,
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
      strategyMaSeries,
      strategySupportSeries,
      strategyResistanceSeries,
      tf,
      colors,
      appliedStrategy: null,
    };

    function render() {
      const { candles, volumes } = mock.seriesFor(pane.tf);
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

    root.addEventListener('click', () => setFocused(pane));

    root.querySelectorAll('.tf-group button').forEach((btn) => {
      btn.addEventListener('click', () => {
        root.querySelectorAll('.tf-group button').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        pane.tf = btn.dataset.tf;
        const label = root.querySelector('[data-tf-label]');
        if (label) label.textContent = pane.tf;
        render();
        if (pane.appliedStrategy && pane.id === focusedId) {
          applyStrategyOverlay({ strategy: pane.appliedStrategy });
        } else if (pane.appliedStrategy) {
          paintStrategyOnPane(pane);
        }
      });
    });

    pane.render = render;
    pane.destroy = function destroy() {
      chart.remove();
      root.remove();
    };
    pane.applyTheme = function applyTheme() {
      const c = chartColors();
      pane.colors = c;
      chart.applyOptions({ layout: c.layout, grid: c.grid });
      candleSeries.applyOptions({
        upColor: c.up,
        downColor: c.down,
        wickUpColor: c.up,
        wickDownColor: c.down,
      });
      supportSeries.applyOptions({ color: c.up });
      resistanceSeries.applyOptions({ color: c.down });
      strategySupportSeries.applyOptions({ color: c.up });
      strategyResistanceSeries.applyOptions({ color: c.down });
    };

    render();
    panes.push(pane);
    return pane;
  }

  function setLayout(n) {
    const count = n === 2 || n === 4 ? n : 1;
    while (panes.length > count) {
      const pane = panes.pop();
      pane.destroy();
    }
    while (panes.length < count) {
      const i = panes.length;
      const tf = DEFAULT_TFS[i] || '5m';
      const el = buildPanelEl(tf);
      grid.appendChild(el);
      mountPane(el, tf);
    }
    grid.dataset.count = String(count);
    const stillFocused = panes.find((p) => p.id === focusedId);
    setFocused(stillFocused || panes[0]);
    requestAnimationFrame(() => panes.forEach((p) => p.chart.timeScale().fitContent()));
  }

  function paintStrategyOnPane(pane) {
    const { candles } = window.CSLMock.seriesFor(pane.tf);
    const marks = window.CSLMock.markerTimes(candles);
    pane.candleSeries.setMarkers([
      { time: marks.buy, position: 'belowBar', color: pane.colors.up, shape: 'arrowUp', text: 'BUY' },
      { time: marks.sell, position: 'aboveBar', color: pane.colors.down, shape: 'arrowDown', text: 'SELL' },
    ]);
    // Avoid dual MA: toolbar overlay owns SMA when MA checkbox is on.
    if (overlayState().ma) {
      pane.strategyMaSeries.setData([]);
    } else {
      pane.strategyMaSeries.setData(window.CSLMock.sma(candles, 20));
    }
    const sr = window.CSLMock.supportResistance(candles);
    pane.strategySupportSeries.setData(sr.support);
    pane.strategyResistanceSeries.setData(sr.resistance);
  }

  function applyStrategyOverlay(payload) {
    const pane = panes.find((p) => p.id === focusedId) || panes[0];
    if (!pane) return;
    paintStrategyOnPane(pane);
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

  document.querySelectorAll('[data-overlay]').forEach((input) => {
    input.addEventListener('change', () => {
      panes.forEach((p) => {
        p.render();
        if (p.appliedStrategy) paintStrategyOnPane(p);
      });
    });
  });

  window.addEventListener('csl-apply-strategy', (e) => {
    applyStrategyOverlay(e.detail || {});
  });

  window.addEventListener('csl-theme-change', () => {
    panes.forEach((p) => {
      p.applyTheme();
      p.render();
      if (p.appliedStrategy) paintStrategyOnPane(p);
    });
  });

  window.addEventListener('csl-market-change', () => {
    document.querySelectorAll('[data-pair-label]').forEach((el) => {
      el.textContent = currentPair();
    });
  });

  setLayout(1);
  if (panes[0]) setFocused(panes[0]);

  window.CSLCharts = {
    setLayout,
    getFocusedPaneId,
    applyStrategyOverlay,
    clearStrategyOverlay,
  };
})();
