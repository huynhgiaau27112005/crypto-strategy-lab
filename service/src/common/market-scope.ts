/**
 * The single market this deployment operates on.
 *
 * `docs/about-projects` scopes the MVP to one pair, and the code honoured
 * that by hard-coding `'BTCUSDT'` in six unrelated files
 * (`MarketDataGateway`, `RealtimeSignalService`, `StrategySearchService`,
 * `scripts/seed-candles.ts`, and both frontend market hooks) plus a
 * seventh, separately hard-coded `'BTC'` for the news module — none of
 * which knew about the others. "One pair" is a legitimate scope decision;
 * expressing it as six independent literals is not, because widening the
 * scope then means finding all of them, and nothing fails if you miss one.
 *
 * This module is the one definition. It lives in `common/` rather than in
 * `market-data/` on purpose: the news module needs the base asset and must
 * not have to import the market-data module to get it.
 *
 * Overridable by environment so a second pair needs no code change, but
 * the default keeps the documented MVP scope intact.
 */

/** The exchange symbol used for candles, streams, and backtests. */
const DEFAULT_SYMBOL = 'BTCUSDT';
/** The asset the news crawler and sentiment aggregation are about. */
const DEFAULT_BASE_ASSET = 'BTC';
const DEFAULT_QUOTE_ASSET = 'USDT';

export interface MarketScope {
  /** e.g. `BTCUSDT` — what the market-data provider is asked for. */
  readonly symbol: string;
  /** e.g. `BTC` — the coin news and sentiment are tagged with. */
  readonly baseAsset: string;
  /** e.g. `USDT` — the currency P/L and capital are denominated in. */
  readonly quoteAsset: string;
}

function fromEnv(name: string, fallback: string): string {
  const value = process.env[name]?.trim();
  return value ? value.toUpperCase() : fallback;
}

/**
 * Resolved once at module load. Reading it lazily would let one process
 * observe two different scopes if the environment were mutated mid-run,
 * which is never a behaviour anyone wants from "which market are we on".
 */
export const MARKET_SCOPE: MarketScope = {
  symbol: fromEnv('MARKET_SYMBOL', DEFAULT_SYMBOL),
  baseAsset: fromEnv('MARKET_BASE_ASSET', DEFAULT_BASE_ASSET),
  quoteAsset: fromEnv('MARKET_QUOTE_ASSET', DEFAULT_QUOTE_ASSET),
};
