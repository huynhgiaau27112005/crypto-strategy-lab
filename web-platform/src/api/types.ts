/**
 * Types matching the real, running API — see artifacts/api-contract.md.
 * Field names here must match the backend's JSON exactly; do not rename
 * for frontend "convenience".
 */

/** Body of POST /auth/register. */
export interface RegisterRequest {
  email: string
  password: string
  displayName?: string
}

/** Body of POST /auth/login. */
export interface LoginRequest {
  email: string
  password: string
}

/** Body of POST /auth/refresh and POST /auth/logout. */
export interface RefreshRequest {
  refreshToken: string
}

/**
 * Response shape shared by POST /auth/register, POST /auth/login, and
 * POST /auth/refresh (refresh rotates both tokens and returns a new pair).
 */
export interface AuthTokens {
  accessToken: string
  refreshToken: string
}

/**
 * The backend has no GET /auth/me (or any user-profile endpoint) yet — see
 * artifacts/api-contract.md §1. `id` and `email` are the only claims the
 * access token carries (`{ sub, email }`, from service/src/modules/auth/auth.service.ts),
 * so this is what auth/jwt.ts decodes it into. Not a documented response
 * body; a minimal client-side derivation of what the token already proves.
 */
export interface User {
  id: string
  email: string
}

/** Default NestJS error body shape — artifacts/api-contract.md §6. */
export interface ApiErrorBody {
  statusCode: number
  message: string | string[]
  error: string
}

/** The five intervals the market-data REST endpoint and the /market socket both allow. */
export type MarketInterval = '1m' | '5m' | '15m' | '1h' | '4h'

/**
 * One element of GET /market-data/candles — artifacts/api-contract.md §3.
 * Prices/volume arrive as strings (Postgres `numeric` / Binance JSON), and
 * `timestamp` is ISO 8601. Only closed candles are ever included.
 */
export interface CandleDto {
  timeframe: string
  timestamp: string
  open: string
  high: string
  low: string
  close: string
  volume: string
}

/** Server -> client `candle` event on the /market namespace — same shape as CandleDto but keyed `interval` instead of `timeframe`. */
export interface MarketCandleEvent {
  interval: string
  timestamp: string
  open: string
  high: string
  low: string
  close: string
  volume: string
}

/** Server -> client `status` event on the /market namespace. */
export interface MarketStatusEvent {
  connected: boolean
  interval: string
  lastMessageAt: string | null
}

/** Server -> client `error` event on the /market namespace (invalid interval on subscribe). */
export interface MarketErrorEvent {
  message: string
}

/** Normalized Strategy Engine output — see artifacts/api-contract.md §3 (GET /strategy-engine/signal). */
export type StrategySignal = 'BUY' | 'SELL' | 'HOLD'

/** One registered plugin's individual signal, part of GET /strategy-engine/signal's response. */
export interface PerStrategySignal {
  type: string
  signal: StrategySignal
}

/**
 * GET /strategy-engine/signal?interval=... response — the registered
 * plugins run at their default parameters over the latest candle and
 * combined via CompositeStrategyService. The only source of BUY/SELL/HOLD
 * this app is allowed to render; never derive it from price direction
 * client-side.
 */
export interface RealtimeSignalDto {
  interval: string
  signal: StrategySignal
  perStrategy: PerStrategySignal[]
  ma20: number | null
  lastClose: number
  changePct: number | null
}

/**
 * Strategy domain — one plugin belongs to exactly one domain in this
 * system (TREND -> MA, MOMENTUM -> RSI, VOLATILITY -> BOLLINGER,
 * STRUCTURE -> SUPPORT_RESISTANCE). See
 * service/src/modules/strategy-search/domain/search.types.ts and
 * artifacts/api-contract.md §2 (`enabledDomains`).
 */
export type StrategyDomain = 'TREND' | 'MOMENTUM' | 'VOLATILITY' | 'STRUCTURE'

/** The four registered plugin types — service/src/modules/strategy-plugin/plugins/*. */
export type SearchStrategyType = 'MA' | 'RSI' | 'BOLLINGER' | 'SUPPORT_RESISTANCE'

/** One numeric parameter a plugin exposes, part of GET /strategy-plugin/strategies. */
export interface ParameterSpec {
  key: string
  label: string
  type: 'int' | 'float'
  min: number
  max: number
  step: number
  default: number
}

/**
 * One row of `GET /strategy-plugin/strategies` — requires auth, not yet
 * documented in artifacts/api-contract.md (stale on this endpoint); see
 * service/src/modules/strategy-plugin/strategy-plugin.controller.ts and
 * strategy-plugin.types.ts for the source of truth. `strategyId`/`version`
 * are null when the plugin has no matching row in the `strategies` DB
 * table yet (no persisted version history for it).
 */
export interface StrategyCatalogItem {
  type: SearchStrategyType
  domain: StrategyDomain
  displayName: string
  description: string
  parameterSchema: ParameterSpec[]
  strategyId: string | null
  version: number | null
}

/**
 * One row of `GET /strategy-plugin/strategies/:name/versions` /
 * `POST /strategy-plugin/strategies/:name/versions` — artifacts/api-contract.md
 * §2. `isMine` is `false` only for the shared SYSTEM row(s); every USER row
 * returned belongs to the caller (the backend never returns another user's
 * USER-owned version). Saving always produces a `type: 'USER'` row, even
 * when editing a SYSTEM strategy's parameters — the shared SYSTEM catalog
 * is never mutated.
 */
export interface StrategyVersionSummary {
  strategyId: string
  name: string
  version: number
  type: 'SYSTEM' | 'USER' | 'AI_GENERATED'
  parameters: Record<string, number>
  isMine: boolean
  createdAt: string
}

/** Body of `POST /strategy-plugin/strategies/:name/versions`. */
export interface SaveStrategyVersionRequest {
  parameters: Record<string, number>
}

/**
 * One entry of `POST /strategy-search/experiments`'s `strategyWeights`
 * field — artifacts/api-contract.md §2. Weights do NOT need to sum to 1 —
 * the composite score is a weighted average (divided by Σ weights), so any
 * positive weight set is normalized automatically. The backend rejects a
 * set with a negative or non-finite weight, all-zero weights, or whose
 * types don't exactly cover the strategy types implied by the enabled
 * domains.
 */
export interface StrategyWeight {
  type: SearchStrategyType
  weight: number
}

/**
 * The five states `experiments.status` can hold — artifacts/api-contract.md
 * §2 (`GET /strategy-search/experiments/:id`). `useExperiment` polls while
 * PENDING/RUNNING and stops on any of the other three.
 */
export type ExperimentStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED'

/**
 * Body of `POST /strategy-search/experiments` — only the fields the
 * approved Backtest config form actually collects (Coin is fixed
 * BTCUSDT and not part of the request). `maxCandidates`,
 * `maxDurationSeconds`, `maxNoImprovement`, `minimumTrades` have no field
 * in the form, so they are always omitted and the backend's own defaults
 * apply (artifacts/api-contract.md §2).
 */
export interface StartSearchRequest {
  timeframe: MarketInterval
  startTime: string
  endTime: string
  topK?: number
  enabledDomains?: StrategyDomain[]
  strategyWeights?: StrategyWeight[]
}

/** Response `202` of `POST /strategy-search/experiments`. */
export interface StartSearchResponse {
  experimentId: string
  status: ExperimentStatus
}

/**
 * `GET /strategy-search/experiments/:id` response — polled by
 * `useExperiment`. Numeric-looking fields (`best_score`) arrive as strings
 * (Postgres `numeric`), same convention as the rest of this module.
 */
export interface ExperimentStatusDto {
  id: string
  user_id: string
  name: string | null
  status: ExperimentStatus
  started_at: string | null
  completed_at: string | null
  created_at: string
  generated: number
  completed: number
  failed: number
  running: number
  best_score: string | null
  current_candidate_id: string | null
}

/**
 * Body of `POST /strategy-search/experiments/:id/extend` — "Chạy thêm N
 * iteration" on an existing COMPLETED experiment, reusing its persisted
 * config. `iterations` defaults to 10 server-side (the Leaderboard tab's
 * fixed "Chạy thêm 10 iteration" button never sends anything else),
 * clamped 1-50 — artifacts/api-contract.md §2.
 */
export interface ExtendSearchRequest {
  iterations?: number
}

/** Response `202` of `POST /strategy-search/experiments/:id/extend` — same shape as `StartSearchResponse`, status is always `PENDING`. */
export interface ExtendSearchResponse {
  id: string
  status: ExperimentStatus
}

/** One row of `GET /strategy-search/experiments/:id/top` — artifacts/api-contract.md §2. */
export interface TopCandidateRow {
  rank: number
  candidate_id: string
  total_return: string
  profit_loss: string
  win_rate: string
  max_drawdown: string
  number_of_trades: number
  profit_factor: string | null
  sharpe_ratio: string | null
  overall_score: string
}

/** One member of `GET /strategy-search/candidates/:id`'s `members` array. */
export interface CandidateMemberDto {
  type: SearchStrategyType
  parameters: Record<string, number>
  weight: number
}

/** `GET /strategy-search/candidates/:id`'s `evaluation` — null until the candidate's backtest completes. */
export interface CandidateEvaluationDto {
  totalReturn: number
  profitLoss: number
  winRate: number
  maxDrawdown: number
  numberOfTrades: number
  profitFactor: number
  sharpeRatio: number
  overallScore: number
}

export type TradeSide = 'LONG' | 'SHORT'
export type TradeExitReason = 'SIGNAL' | 'STOP_LOSS' | 'TAKE_PROFIT' | 'END_OF_BACKTEST'

/** One element of `GET /strategy-search/candidates/:id`'s paginated `trades` array. */
export interface TradeDto {
  id: string
  side: TradeSide
  entryTime: string
  entryPrice: number
  quantity: number
  stopLoss: number | null
  takeProfit: number | null
  exitTime: string | null
  exitPrice: number | null
  profitLoss: number | null
  returnPct: number | null
  exitReason: TradeExitReason | null
}

/**
 * `GET /strategy-search/candidates/:id?tradePage=&tradePageSize=` response —
 * the data source for the Backtest tab's "02" candidate detail section.
 */
export interface CandidateDetailDto {
  candidateId: string
  experimentId: string
  iterationNumber: number
  members: CandidateMemberDto[]
  evaluation: CandidateEvaluationDto | null
  trades: TradeDto[]
  tradeTotal: number
}

/** `news.sentiment` enum (`sentiment_label`) — artifacts/api-contract.md §4. */
export type SentimentLabel = 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE'

/**
 * One element of `GET /news`'s `items` — artifacts/api-contract.md §4.
 * `summary`, `coin` are service-derived (not DB columns); `sentimentScore`
 * is the raw `sentiment_score` column, aliased as "confidence" for display.
 * `sentiment`/`sentimentScore` can both be null for an unanalyzed article,
 * even though the contract's example always shows a classified one.
 */
export interface NewsItemDto {
  id: string
  title: string
  summary: string
  source: string
  url: string
  publishedAt: string
  sentiment: SentimentLabel | null
  sentimentScore: number | null
  coin: string
}

/** `GET /news?sentiment=&page=&pageSize=` response — artifacts/api-contract.md §4. */
export interface NewsListResponse {
  items: NewsItemDto[]
  total: number
}

/**
 * `GET /sentiment/summary?hours=` response — artifacts/api-contract.md §4.
 * `positive`/`neutral`/`negative` are FRACTIONS in [0, 1] (of `analyzed`),
 * not percentages — multiply by 100 only at render time. All fields are 0
 * (not NaN) when `analyzed` is 0, e.g. an empty `news` table.
 */
export interface SentimentSummaryDto {
  positive: number
  neutral: number
  negative: number
  analyzed: number
  averageConfidence: number
  model: string
}

/** Status of the out-of-process crawl worker — artifacts/api-contract.md §4. */
export type NewsCrawlStatus = 'RUNNING' | 'COMPLETED' | 'FAILED'

/**
 * `POST /news/crawl` (202) and `GET /news/crawl/status` (200) response
 * shape — artifacts/api-contract.md §4. `error` is non-null only when
 * `status` is `FAILED`.
 */
export interface NewsCrawlJobDto {
  jobId: string
  status: NewsCrawlStatus
  startedAt: string
  finishedAt: string | null
  exitCode: number | null
  error: string | null
}
