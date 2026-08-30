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
  /**
   * `false` while the candle is still forming. The gateway broadcasts both
   * states so the chart moves within an interval instead of only when a
   * bar closes; only `closed: true` bars are persisted server-side.
   */
  closed: boolean
}

/** Server -> client `trade` event on the /market namespace (Binance aggTrade). */
export interface MarketTradeEvent {
  tradeId: number
  timestamp: string
  price: string
  quantity: string
  /** True when the buyer was the maker, i.e. the aggressor was a seller. */
  buyerIsMaker: boolean
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
export type StrategyDomain =
  | 'TREND'
  | 'MOMENTUM'
  | 'VOLATILITY'
  | 'STRUCTURE'
  /** "Information (News Sentiment)" — the brief's fifth strategy group
   *  (04-examples-in-the-brief.md #17), backing required-flow #17. */
  | 'INFORMATION'

/**
 * The four built-in plugin types (service/src/modules/strategy-plugin/plugins/*)
 * plus the "AI:<strategyId>" namespace for a user's own saved AI-generated
 * strategy — see service/src/modules/strategy-search/domain/search.types.ts.
 */
export type SearchStrategyType =
  | 'MA'
  | 'RSI'
  | 'BOLLINGER'
  | 'SUPPORT_RESISTANCE'
  | 'NEWS_SENTIMENT'
  | `AI:${string}`

/** True for a catalog/weight entry that is a user's own AI-generated strategy rather than a built-in plugin. */
export function isAiStrategyType(type: string): type is `AI:${string}` {
  return type.startsWith('AI:')
}

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
 * Body of `POST /strategy-search/experiments/:id/regenerate` — the cascade
 * half of ParameterPanel's save. After a new strategy version is saved,
 * every combination on that experiment's Leaderboard containing the named
 * strategy is regenerated onto the new version.
 */
export interface RegenerateForStrategyRequest {
  strategyName: string
}

/** Response of `POST /strategy-search/experiments/:id/regenerate`. */
export interface RegenerateForStrategyResponse {
  regenerated: number
  skipped: number
  candidateIds: string[]
  /** Where each regenerated combination landed among ALL candidates. */
  summaries: RankedCandidateSummary[]
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
  /** Starting equity in USD. */
  initialCapital?: number
  /** Commission per side, percent of notional. */
  transactionCostPct?: number
  /** Execution slippage per side, basis points. */
  slippageBps?: number
  /** Stop-loss distance below entry in percent; `null`/omitted disables it. */
  stopLossPct?: number | null
  /** Take-profit distance above entry in percent; `null`/omitted disables it. */
  takeProfitPct?: number | null
  enabledDomains?: StrategyDomain[]
  strategyWeights?: StrategyWeight[]
}

/**
 * One regenerated candidate's placement against EVERY completed candidate
 * of the experiment (not just the Top-K) — returned by
 * `POST /strategy-search/experiments/:id/regenerate`.
 *
 * A parameter version the user saved often scores outside the leaderboard,
 * which used to make it look like nothing had been created. `rank`/`total`
 * give it a real, comparable placement instead.
 */
export interface RankedCandidateSummary {
  candidateId: string
  combo: string
  rank: number
  total: number
  overallScore: number | null
  profitLoss: number | null
  winRate: number | null
  maxDrawdown: number | null
  numberOfTrades: number
}

/** Response of `GET /ai-strategy/provider`. */
export interface AiProviderInfo {
  name: string
  /** False when no API key is configured and canned code is being returned. */
  live: boolean
  keySource: 'OPENAI_API_KEY' | 'OPENROUTER_API_KEY' | null
  baseUrl: string | null
  model: string | null
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
  /** Persisted search settings, plus `stopReason` once the run ends. */
  search_config: {
    topK?: number
    minimumTrades?: number
    maxNoImprovement?: number
    maxDurationSeconds?: number
    /**
     * Why the loop ended. Shown in the UI so a run that stops before
     * `maxCandidates` reads as a stop condition firing rather than as a
     * failure — the brief lists no-improvement-for-N as one of the three
     * example stop conditions (04-examples-in-the-brief.md #23).
     */
    stopReason?: SearchStopReason | null
  } | null
}

/** The four ways the search loop can end — see StrategySearchService.run(). */
export type SearchStopReason =
  | 'MAX_CANDIDATES'
  | 'MAX_DURATION'
  | 'NO_IMPROVEMENT'
  | 'SEARCH_SPACE_EXHAUSTED'

/** Vietnamese explanation shown next to the iteration counter. */
export const STOP_REASON_LABEL: Record<SearchStopReason, string> = {
  MAX_CANDIDATES: 'Đã chạy đủ số iteration tối đa.',
  MAX_DURATION: 'Dừng do chạm giới hạn thời gian.',
  NO_IMPROVEMENT: 'Dừng sớm: nhiều vòng liên tiếp không cải thiện được điểm tốt nhất.',
  SEARCH_SPACE_EXHAUSTED: 'Dừng sớm: đã thử hết không gian tổ hợp khả dĩ.',
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
  /** The exact `strategies` row version this candidate's member was pinned
   * to when it was generated — NOT necessarily the currently-latest version
   * for this type (that moves on every time the user saves a new parameter
   * version). Never substitute the live catalog's version here: doing so
   * silently relabels every older candidate as "using" whatever version is
   * newest right now. */
  version: number
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

// ---------------------------------------------------------------------
// AI Strategy — /ai-strategy/* (artifacts/api-contract.md, task-14).
// ---------------------------------------------------------------------

/** One row of the "Kiểm tra & validation" panel — mirrors the backend's ValidationCheck exactly. */
export interface AiValidationCheckDto {
  key: 'parses' | 'contract' | 'safety' | 'smoke'
  passed: boolean
  message: string
}

export interface AiValidationResultDto {
  valid: boolean
  checks: AiValidationCheckDto[]
}

/** Job lifecycle of POST /ai-strategy/generate and GET /ai-strategy/generate/status. */
export type AiGenerateJobStatus = 'RUNNING' | 'COMPLETED' | 'FAILED'

/** `result` of a COMPLETED generate job — same payload the old sync POST used to return. */
export interface AiGenerateJobResultDto {
  code: string
  raw: string
  providerName: string
  validation: AiValidationResultDto
}

/**
 * `202` of `POST /ai-strategy/generate` and `200` of `GET /ai-strategy/generate/status`.
 * `GET` returns `null` when this account has never enqueued a generate job.
 * `error` is non-null only when `status` is `FAILED`; `result` is non-null only when `COMPLETED`.
 */
export interface AiGenerateJobDto {
  jobId: string
  status: AiGenerateJobStatus
  prompt: string
  startedAt: string | null
  finishedAt: string | null
  error: string | null
  result: AiGenerateJobResultDto | null
}

/** Body of POST /ai-strategy/save — `domain` is required (task-15): a saved AI strategy needs one to be combinable in Strategy Search, never silently defaulted. */
export interface SaveAiStrategyRequest {
  name: string
  code: string
  domain: StrategyDomain
}

/** Response of GET /ai-strategy/mine (one row) — no source_code, for the account's strategy table. */
export interface AiStrategySummaryDto {
  id: string
  name: string
  version: number
  createdAt: string
  isActive: boolean
  /** null only for a strategy saved before domain selection existed. */
  domain: StrategyDomain | null
}

/** Response of GET /ai-strategy/:id and POST /ai-strategy/save — includes source. */
export interface AiStrategyDetailDto extends AiStrategySummaryDto {
  sourceCode: string
}

/** Response of POST /ai-strategy/:id/run. */
export interface RunAiStrategyResponse {
  candleCount: number
  signals: StrategySignal[]
}
