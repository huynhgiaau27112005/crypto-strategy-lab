(function () {
  const { createChart } = LightweightCharts;
  const mock = window.CSLMock;
  const host = document.getElementById('strategy-chart');
  const tfGroup = document.getElementById('strategy-tf');
  const detailRoot = document.getElementById('trade-detail');
  const tradesBody = document.getElementById('trades-body');
  if (!host) return;

  let activeTf = '5m';
  let selectedTradeId = mock.trades[0]?.id || 1;

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

  let colors = chartColors();
  const chart = createChart(host, {
    autoSize: true,
    layout: colors.layout,
    grid: colors.grid,
    rightPriceScale: { borderVisible: false },
    timeScale: { borderVisible: false, timeVisible: true },
  });

  const candlesSeries = chart.addCandlestickSeries({
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
  volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.78, bottom: 0 } });
  const maSeries = chart.addLineSeries({
    color: '#3d7eff',
    lineWidth: 2,
    lastValueVisible: false,
    priceLineVisible: false,
  });
  const supportSeries = chart.addLineSeries({
    color: colors.up,
    lineWidth: 1,
    lineStyle: 2,
    lastValueVisible: false,
    priceLineVisible: false,
  });
  const resistanceSeries = chart.addLineSeries({
    color: colors.down,
    lineWidth: 1,
    lineStyle: 2,
    lastValueVisible: false,
    priceLineVisible: false,
  });
  const entryLine = chart.addLineSeries({
    color: '#fbbf24',
    lineWidth: 1,
    lineStyle: 2,
    lastValueVisible: false,
    priceLineVisible: false,
  });
  const slLine = chart.addLineSeries({
    color: colors.down,
    lineWidth: 1,
    lineStyle: 1,
    lastValueVisible: false,
    priceLineVisible: false,
  });
  const tpLine = chart.addLineSeries({
    color: colors.up,
    lineWidth: 1,
    lineStyle: 1,
    lastValueVisible: false,
    priceLineVisible: false,
  });

  function selectedTrade() {
    return mock.trades.find((t) => t.id === selectedTradeId) || mock.trades[0];
  }

  function renderDetail() {
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

  function renderTradesTable() {
    if (!tradesBody) return;
    tradesBody.innerHTML = mock.trades
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
    tradesBody.querySelectorAll('tr').forEach((row) => {
      row.addEventListener('click', () => {
        selectedTradeId = Number(row.dataset.tradeId);
        renderTradesTable();
        renderDetail();
        renderChart();
      });
    });
  }

  function parsePrice(text) {
    return Number(String(text).replace(/,/g, ''));
  }

  function renderChart() {
    colors = chartColors();
    const { candles, volumes } = mock.seriesFor(activeTf);
    candlesSeries.setData(candles);
    volumeSeries.setData(volumes);
    maSeries.setData(mock.sma(candles, 20));
    const sr = mock.supportResistance(candles);
    supportSeries.setData(sr.support);
    resistanceSeries.setData(sr.resistance);

    const trade = selectedTrade();
    const markersMeta = mock.markerTimes(candles);
    const entryTime = candles[Math.floor(candles.length * (trade.side === 'BUY' ? 0.4 : 0.55))].time;
    const exitTime = candles[Math.floor(candles.length * (trade.side === 'BUY' ? 0.62 : 0.78))].time;
    const entry = parsePrice(trade.entry);
    const sl = parsePrice(trade.sl);
    const tp = parsePrice(trade.tp);

    entryLine.setData([
      { time: entryTime, value: entry },
      { time: exitTime, value: entry },
    ]);
    slLine.setData([
      { time: entryTime, value: sl },
      { time: exitTime, value: sl },
    ]);
    tpLine.setData([
      { time: entryTime, value: tp },
      { time: exitTime, value: tp },
    ]);

    candlesSeries.setMarkers([
      {
        time: entryTime,
        position: trade.side === 'BUY' ? 'belowBar' : 'aboveBar',
        color: trade.side === 'BUY' ? colors.up : colors.down,
        shape: trade.side === 'BUY' ? 'arrowUp' : 'arrowDown',
        text: 'Entry',
      },
      {
        time: exitTime,
        position: trade.side === 'BUY' ? 'aboveBar' : 'belowBar',
        color: '#fbbf24',
        shape: 'circle',
        text: 'Exit',
      },
      {
        time: markersMeta.buy,
        position: 'belowBar',
        color: colors.up,
        shape: 'arrowUp',
        text: 'BUY',
      },
      {
        time: markersMeta.sell,
        position: 'aboveBar',
        color: colors.down,
        shape: 'arrowDown',
        text: 'SELL',
      },
    ]);
    chart.timeScale().fitContent();
  }

  tfGroup?.querySelectorAll('button[data-tf]').forEach((btn) => {
    btn.addEventListener('click', () => {
      tfGroup.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      activeTf = btn.dataset.tf;
      const label = document.querySelector('[data-strategy-tf-label]');
      if (label) label.textContent = activeTf;
      renderChart();
    });
  });

  window.addEventListener('csl-theme-change', () => {
    colors = chartColors();
    chart.applyOptions({ layout: colors.layout, grid: colors.grid });
    candlesSeries.applyOptions({
      upColor: colors.up,
      downColor: colors.down,
      wickUpColor: colors.up,
      wickDownColor: colors.down,
    });
    supportSeries.applyOptions({ color: colors.up });
    resistanceSeries.applyOptions({ color: colors.down });
    slLine.applyOptions({ color: colors.down });
    tpLine.applyOptions({ color: colors.up });
    renderChart();
  });

  renderTradesTable();
  renderDetail();
  renderChart();
})();
