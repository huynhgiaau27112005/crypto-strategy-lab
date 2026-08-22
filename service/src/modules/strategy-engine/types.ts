export enum StrategySignal {
  BUY = "BUY",
  SELL = "SELL",
  HOLD = "HOLD",
}

export interface Candlestick {
  timeframe: string, // should be enum
  timestamp: Date,
  openTime: number,
  closeTime: number,
  high: number,
  low: number,
  open: number,
  close: number,
};

export interface IndicatorDataPoint {
  value: number,
  timestamp: Date,
  timeframe: string,
};