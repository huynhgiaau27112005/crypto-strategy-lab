import { BadRequestException } from '@nestjs/common';
import { Spot } from '@binance/spot';

/**
 * Creates a client without making network calls during module import.
 * Public market-data requests work without credentials; authenticated
 * endpoints use the optional API key and secret supplied at runtime.
 */
export function createSpotClient(): Spot {
  const apiKey = process.env.BINANCE_API_KEY;
  const apiSecret = process.env.BINANCE_API_SECRET;
  return apiKey && apiSecret
    ? new Spot({ configurationRestAPI: { apiKey, apiSecret } })
    : new Spot({});
}

// Must match the app_timeframe enum in database/migrations/003_candidate_auth_schema.sql.
// Single source of truth: both MarketDataService (REST) and MarketDataGateway
// (WebSocket) import this instead of keeping their own copies.
export const ALLOWED_INTERVALS = ['1m', '5m', '15m', '1h', '4h'] as const;
export type AllowedInterval = (typeof ALLOWED_INTERVALS)[number];

export function assertAllowedInterval(
  interval: string,
): asserts interval is AllowedInterval {
  if (!ALLOWED_INTERVALS.includes(interval as AllowedInterval)) {
    throw new BadRequestException(
      `Unsupported interval "${interval}". Allowed values: ${ALLOWED_INTERVALS.join(', ')}.`,
    );
  }
}

const DEFAULT_CACHE_TTL_SECONDS = 30;
// Safety cap so a huge/unexpected interval string (e.g. "1w") can't pin a
// cached candle response for an unreasonably long time; every interval this
// API actually supports (see ALLOWED_INTERVALS) is well under this.
const MAX_CACHE_TTL_SECONDS = 6 * 60 * 60;

/**
 * Cache TTL for GET /market-data/candles, reasoned from the interval itself
 * rather than one global number (task-17 requirement): Binance only ever
 * closes a new candle for a given interval once per interval, and
 * MarketDataService already drops the still-forming candle
 * (see getCandles' doc comment) — so the set of *closed* candles for one
 * (symbol, interval, limit) is provably unchanged for the entire duration
 * of the current interval. Caching for exactly one interval's length can
 * therefore never resurrect a forming candle or serve a response that is
 * "supposed to have changed by now" — the underlying data genuinely hasn't.
 * Falls back to DEFAULT_CACHE_TTL_SECONDS for an interval string this
 * parser doesn't recognise (still deduplicates rapid repeat requests
 * without guessing how fresh unfamiliar data needs to be).
 */
export function candleCacheTtlSeconds(interval: string): number {
  const match = /^(\d+)([smhdw])$/.exec(interval);
  if (!match) return DEFAULT_CACHE_TTL_SECONDS;
  const amount = Number(match[1]);
  const unitSeconds: Record<string, number> = {
    s: 1,
    m: 60,
    h: 60 * 60,
    d: 24 * 60 * 60,
    w: 7 * 24 * 60 * 60,
  };
  const seconds = amount * unitSeconds[match[2]];
  return Math.min(seconds, MAX_CACHE_TTL_SECONDS);
}
