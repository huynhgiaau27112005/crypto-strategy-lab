// The whole system's market scope is fixed to Binance BTCUSDT (see
// artifacts/decisions.md and docs/about-projects). News is not tagged to a
// coin in the `news` table — there is only one coin in scope — so this is a
// system-wide constant rather than a per-row derivation from any column.
export const NEWS_MARKET_SCOPE_COIN = 'BTC';

// `news.content` has no dedicated summary column; the list view shows a
// truncated preview instead of the full article body.
export const NEWS_SUMMARY_MAX_LENGTH = 240;
