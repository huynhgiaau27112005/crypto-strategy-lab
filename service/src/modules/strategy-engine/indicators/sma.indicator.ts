import type { Candlestick, IndicatorDataPoint } from "../types";
import { BaseIndicator } from "./base.indicator";

export class SMAIndicator extends BaseIndicator {
  calculate(candlesticks: Candlestick[], period: number): IndicatorDataPoint[] {
    const results: IndicatorDataPoint[] = [];
    
    let windowSum = 0;
    for (let i = 0; i < period - 1; ++i) {
      windowSum += candlesticks[i].close;
    }

    for (let i = period - 1; i < candlesticks.length; ++i) {
      const {
        close,
        timeframe,
        timestamp,
      } = candlesticks[i];
      windowSum += close;
      const avg = windowSum / period; 
      const dataPoint: IndicatorDataPoint = {
        value: avg,
        timeframe: timeframe,
        timestamp: timestamp,
      }

      results.push(dataPoint);
    }

    return results;
  }
};