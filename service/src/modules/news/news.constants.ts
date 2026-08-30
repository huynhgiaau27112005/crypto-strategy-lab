import { MARKET_SCOPE } from '../../common/market-scope';

// News is not tagged to a coin in the `news` table — there is only one
// coin in scope — so this is derived from the system-wide market scope
// rather than from any column. It used to be its own hard-coded 'BTC',
// with no link to the 'BTCUSDT' the rest of the system traded, so the two
// could silently drift apart.
export const NEWS_MARKET_SCOPE_COIN = MARKET_SCOPE.baseAsset;

// `news.content` has no dedicated summary column; the list view shows a
// truncated preview instead of the full article body.
export const NEWS_SUMMARY_MAX_LENGTH = 240;
