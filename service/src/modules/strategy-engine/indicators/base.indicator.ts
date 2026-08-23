import type { Candlestick, IndicatorDataPoint } from "../types";

export abstract class BaseIndicator {
  abstract calculate(candlesticks: Candlestick[], period: number): IndicatorDataPoint[];
}

/*
{
  value,
  timeframe,
  timestamp
}
*/
