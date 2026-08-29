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

// Binance's documented cap for a single klines request; also doubles as
// the sane upper bound for this API's own `limit` query/body param so a
// caller cannot request an unbounded response (or an unbounded page for
// the Redis cache key — see candleCacheTtlSeconds).
export const MAX_CANDLE_LIMIT = 1000;

/**
 * Validates and coerces a caller-supplied `limit` (query string or body
 * value) to a positive integer within Binance's cap, throwing
 * BadRequestException for anything else — non-numeric ("abc" -> NaN),
 * zero, negative, non-integer, or above MAX_CANDLE_LIMIT. Used by both
 * GET /market-data/candles and POST /market-data/import so a bad `limit`
 * fails fast as a 400 instead of reaching Binance as `String(NaN)` and
 * surfacing as a 500 (see MarketDataService.getCandles vs importCandles).
 */
export function assertValidLimit(limit: unknown): number {
  const parsed = typeof limit === 'number' ? limit : Number(limit);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_CANDLE_LIMIT) {
    throw new BadRequestException(
      `limit must be an integer from 1 to ${MAX_CANDLE_LIMIT}.`,
    );
  }
  return parsed;
}

/**
 * Milliseconds covered by one candle of `interval`. Returns null for an
 * interval this parser does not recognise (every value in
 * ALLOWED_INTERVALS is recognised).
 */
export function intervalMs(interval: string): number | null {
  const match = /^(\d+)([smhdw])$/.exec(interval);
  if (!match) return null;
  const unitSeconds: Record<string, number> = {
    s: 1,
    m: 60,
    h: 60 * 60,
    d: 24 * 60 * 60,
    w: 7 * 24 * 60 * 60,
  };
  return Number(match[1]) * unitSeconds[match[2]] * 1000;
}

/**
 * Minimum number of candles this project wants in the database for every
 * timeframe before a backtest window is considered usable. Long timeframes
 * (1h, 4h) used to fail every search with "Dataset has N candles; at least
 * 202 are required" purely because nobody had ever backfilled that far
 * back — the requested window was legitimate, the local history was not.
 * MarketDataService.ensureCandleCoverage() backfills up to this floor.
 */
export const MIN_CANDLES_PER_TIMEFRAME = 300;

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
