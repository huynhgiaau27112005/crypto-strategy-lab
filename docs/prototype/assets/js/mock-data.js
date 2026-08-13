(function (global) {
  const TIMEFRAMES = ['5m', '15m', '1h', '4h'];

  function mulberry32(seed) {
    let t = seed >>> 0;
    return function () {
      t += 0x6d2b79f5;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  function tfSeconds(tf) {
    switch (tf) {
      case '5m':
        return 300;
      case '15m':
        return 900;
      case '1h':
        return 3600;
      case '4h':
        return 14400;
      default:
        return 300;
    }
  }

  function generateCandles(tf, count, seed) {
    const rand = mulberry32(seed);
    const step = tfSeconds(tf);
    const now = Math.floor(Date.now() / 1000);
    const start = now - count * step;
    let price = 118000 + rand() * 800;
    const candles = [];
    const volumes = [];

    for (let i = 0; i < count; i += 1) {
      const time = start + i * step;
      const drift = (rand() - 0.48) * (tf === '4h' ? 420 : tf === '1h' ? 220 : 90);
      const open = price;
      const close = Math.max(1000, open + drift);
      const high = Math.max(open, close) + rand() * 60;
      const low = Math.min(open, close) - rand() * 60;
      candles.push({ time, open, high, low, close });
      volumes.push({
        time,
        value: 20 + rand() * 120,
        color:
          close >= open
            ? 'rgba(38, 166, 154, 0.55)'
            : 'rgba(239, 83, 80, 0.55)',
      });
      price = close;
    }

    return { candles, volumes };
  }

  function sma(candles, period) {
    const out = [];
    for (let i = 0; i < candles.length; i += 1) {
      if (i + 1 < period) continue;
      let sum = 0;
      for (let j = i - period + 1; j <= i; j += 1) sum += candles[j].close;
      out.push({ time: candles[i].time, value: sum / period });
    }
    return out;
  }

  function bollinger(candles, period, mult) {
    const mid = [];
    const upper = [];
    const lower = [];
    for (let i = 0; i < candles.length; i += 1) {
      if (i + 1 < period) continue;
      const slice = candles.slice(i - period + 1, i + 1).map((c) => c.close);
      const mean = slice.reduce((a, b) => a + b, 0) / period;
      const variance =
        slice.reduce((a, b) => a + (b - mean) * (b - mean), 0) / period;
      const std = Math.sqrt(variance);
      mid.push({ time: candles[i].time, value: mean });
      upper.push({ time: candles[i].time, value: mean + mult * std });
      lower.push({ time: candles[i].time, value: mean - mult * std });
    }
    return { mid, upper, lower };
  }

  function supportResistance(candles) {
    const lows = candles.map((c) => c.low);
    const highs = candles.map((c) => c.high);
    const support = Math.min(...lows.slice(-40));
    const resistance = Math.max(...highs.slice(-40));
    const last = candles[candles.length - 1].time;
    const first = candles[Math.max(0, candles.length - 80)].time;
    return {
      support: [
        { time: first, value: support },
        { time: last, value: support },
      ],
      resistance: [
        { time: first, value: resistance },
        { time: last, value: resistance },
      ],
    };
  }

  const cache = {};
  function seriesFor(tf) {
    if (!cache[tf]) {
      const seed = { '5m': 11, '15m': 22, '1h': 33, '4h': 44 }[tf] || 11;
      cache[tf] = generateCandles(tf, 160, seed);
    }
    return cache[tf];
  }

  const leaderboard = [
    {
      rank: 1,
      name: 'MA20 + RSI14 + SR',
      version: 'v1',
      score: 92.4,
      ret: '+18.2%',
      win: '61%',
      mdd: '-6.1%',
      trades: 81,
    },
    {
      rank: 2,
      name: 'MA50 + Bollinger',
      version: 'v1',
      score: 88.1,
      ret: '+15.7%',
      win: '58%',
      mdd: '-8.4%',
      trades: 64,
    },
    {
      rank: 3,
      name: 'RSI + SR',
      version: 'v1',
      score: 85.6,
      ret: '+13.1%',
      win: '64%',
      mdd: '-7.2%',
      trades: 72,
    },
    {
      rank: 4,
      name: 'MA + RSI + Bollinger',
      version: 'v2',
      score: 81.3,
      ret: '+11.4%',
      win: '55%',
      mdd: '-9.0%',
      trades: 93,
    },
    {
      rank: 5,
      name: 'Bollinger + SR',
      version: 'v1',
      score: 78.9,
      ret: '+9.8%',
      win: '57%',
      mdd: '-5.5%',
      trades: 48,
    },
  ];

  const trades = [
    {
      id: 1,
      side: 'BUY',
      entry: '116,420',
      exit: '117,850',
      sl: '115,800',
      tp: '118,200',
      pnl: '+1.23%',
      note: 'Entry gần Support · Exit trước Resistance',
    },
    {
      id: 2,
      side: 'SELL',
      entry: '118,900',
      exit: '117,610',
      sl: '119,450',
      tp: '117,200',
      pnl: '+1.08%',
      note: 'Breakout giả · cắt lời tại vùng trung bình',
    },
    {
      id: 3,
      side: 'BUY',
      entry: '115,200',
      exit: '116,040',
      sl: '114,650',
      tp: '116,800',
      pnl: '+0.73%',
      note: 'RSI oversold + MA cross',
    },
    {
      id: 4,
      side: 'BUY',
      entry: '116,880',
      exit: '116,210',
      sl: '116,100',
      tp: '118,000',
      pnl: '-0.57%',
      note: 'Stop Loss kích hoạt · trend đảo chiều',
    },
    {
      id: 5,
      side: 'SELL',
      entry: '119,100',
      exit: '118,020',
      sl: '119,700',
      tp: '117,500',
      pnl: '+0.91%',
      note: 'Sell tại Resistance · Take Profit một phần',
    },
  ];

  const news = [
    {
      title: 'Spot ETF inflows climb as BTC holds above 118k',
      source: 'CoinDesk',
      when: '2h trước',
      sentiment: 'POSITIVE',
    },
    {
      title: 'Miners rotate inventory amid fee compression',
      source: 'The Block',
      when: '5h trước',
      sentiment: 'NEUTRAL',
    },
    {
      title: 'Regulatory probe rumors weigh on weekend liquidity',
      source: 'Reuters',
      when: '9h trước',
      sentiment: 'NEGATIVE',
    },
    {
      title: 'On-chain accumulation clusters near prior range high',
      source: 'Glassnode',
      when: '12h trước',
      sentiment: 'POSITIVE',
    },
  ];

  function markerTimes(candles) {
    const n = candles.length;
    return {
      buy: candles[Math.floor(n * 0.42)].time,
      sell: candles[Math.floor(n * 0.72)].time,
    };
  }

  global.CSLMock = {
    TIMEFRAMES,
    seriesFor,
    sma,
    bollinger,
    supportResistance,
    leaderboard,
    trades,
    news,
    markerTimes,
    lastPrice: '118,150.2',
    change24h: '+2.41%',
  };
})(window);
