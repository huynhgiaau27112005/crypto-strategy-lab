/**
 * The single market this frontend is showing.
 *
 * `'BTCUSDT'` used to be a literal in eight places — two hooks
 * (`useCandleHistory`, `useMarketSocket`) and six pieces of copy across
 * Backtest, Leaderboard, Realtime, the nav config, and the workspace
 * header. Widening the scope meant finding every one of them, and nothing
 * broke if you missed one: the app would simply request one pair and
 * label it as another.
 *
 * Mirrors `service/src/common/market-scope.ts`, which is the authority —
 * the backend rejects a symbol it is not configured for, so a mismatch
 * here surfaces as an error rather than as silently wrong data. Both read
 * an environment variable with the same default, so a deployment changes
 * the pair by setting `MARKET_SYMBOL` (API) and `VITE_MARKET_SYMBOL`
 * (frontend build) rather than by editing code.
 */
const DEFAULT_SYMBOL = 'BTCUSDT'
const DEFAULT_BASE_ASSET = 'BTC'

function fromEnv(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim()
  return trimmed ? trimmed.toUpperCase() : fallback
}

/** e.g. `BTCUSDT` — what every market request and every label uses. */
export const MARKET_SYMBOL = fromEnv(import.meta.env.VITE_MARKET_SYMBOL, DEFAULT_SYMBOL)

/** e.g. `BTC` — the coin news and sentiment panels are about. */
export const MARKET_BASE_ASSET = fromEnv(
  import.meta.env.VITE_MARKET_BASE_ASSET,
  DEFAULT_BASE_ASSET,
)
