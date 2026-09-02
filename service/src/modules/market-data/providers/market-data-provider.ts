/**
 * The exchange-agnostic contract every market-data source must satisfy.
 *
 * `docs/about-projects/02-architecture-goals.md` names swapping the
 * market-data provider as one of the extension axes the architecture has
 * to survive, and `03-anti-patterns-to-avoid.md` forbids the shape this
 * replaces: `BinanceClient` was a concrete class injected directly into
 * `MarketDataService`, `MarketDataGateway`, and `scripts/seed-candles.ts`,
 * so adding a second exchange meant editing all three.
 *
 * Everything here is already in normalized form — no `k.t/o/h/l/c/v/x`,
 * no exchange-specific envelope, no vendor field names. An implementation
 * is responsible for translating its own wire format into these shapes;
 * nothing above this line ever learns which exchange answered.
 *
 * Wiring: implementations bind to {@link MARKET_DATA_PROVIDER} in
 * `MarketDataCoreModule`. Adding an exchange = one new class implementing
 * this interface + one line changed in that module. No consumer changes.
 */

/** One historical candle, as returned by a REST/bulk history call. */
export interface Kline {
  openTime: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  closeTime: number;
  /**
   * True once this candle's close time has passed. Providers whose history
   * endpoint does not expose a "closed" flag derive it from `closeTime`
   * once, inside the provider, instead of every caller re-deriving (or
   * forgetting to derive) it independently.
   */
  isClosed: boolean;
}

/** One live candle update pushed by a streaming connection. */
export interface KlineUpdate {
  timestamp: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  /** True only when this update represents the candle's final, closed state. */
  isClosed: boolean;
}

/**
 * One executed trade. This is the real per-tick feed: a candle stream only
 * ever reports the state of the bar being built, so a "Recent ticks" table
 * fed from klines can never show more than one row per interval.
 */
export interface TradeUpdate {
  tradeId: number;
  timestamp: number;
  price: string;
  quantity: string;
  /**
   * True when the BUYER was the market maker, i.e. the aggressor was a
   * seller. Named here so no caller has to know any exchange's field name
   * for it.
   */
  buyerIsMaker: boolean;
}

export interface TradeStreamCallbacks {
  onTrade: (trade: TradeUpdate) => void;
  onConnectionChange?: (connected: boolean) => void;
}

export interface KlineStreamCallbacks {
  onUpdate: (update: KlineUpdate) => void;
  /** Fired whenever the upstream connection transitions between open and closed. */
  onConnectionChange?: (connected: boolean) => void;
}

export interface KlineStreamHandle {
  /** Stops the stream permanently — no further reconnect attempts happen after this. */
  stop: () => void;
  getLastMessageAt: () => Date | null;
}

export interface MarketDataProvider {
  /**
   * Which exchange is answering — for logs, metrics labels, and the
   * "provenance" line the UI shows. Never branched on: code that switches
   * on this value has re-introduced the coupling this interface removes.
   */
  readonly name: string;

  /**
   * Historical candles, oldest first. `limit` is the provider's page size;
   * `startTime`/`endTime` are inclusive-ish millisecond bounds handled per
   * provider (they differ subtly between exchanges, which is exactly why
   * that difference is absorbed here rather than at the call site).
   */
  getKlines(
    symbol: string,
    interval: string,
    limit?: number,
    endTime?: number,
    startTime?: number,
  ): Promise<Kline[]>;

  /** Live candle stream for one symbol/interval, reconnecting on its own. */
  streamCandles(
    symbol: string,
    interval: string,
    callbacks: KlineStreamCallbacks,
  ): KlineStreamHandle;

  /** Live tick stream for one symbol, reconnecting on its own. */
  streamTrades(symbol: string, callbacks: TradeStreamCallbacks): KlineStreamHandle;
}

/**
 * Nest DI token for the bound {@link MarketDataProvider}.
 *
 * A string token (not the class) is what makes the swap real: consumers
 * write `@Inject(MARKET_DATA_PROVIDER)` and never name an exchange, so the
 * binding in `MarketDataCoreModule` is the single place that decides which
 * implementation the whole application runs on.
 */
export const MARKET_DATA_PROVIDER = 'MARKET_DATA_PROVIDER';
