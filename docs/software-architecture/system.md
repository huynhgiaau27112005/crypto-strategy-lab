# system.md — System Architecture (Modular Monolith)

## 1. Architectural Style

> **Architectural Style: NestJS Modular Monolith + Specialized Python Auxiliary Workers**

The platform backend is implemented as a single, cohesive **NestJS Modular Monolith** application deployed as the primary application unit. It is augmented by specialized **Python Workers** running as auxiliary processes to isolate heavy Machine Learning frameworks and web scraping runtimes.

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                   EXTERNAL ECOSYSTEM                                   │
│                                                                                        │
│  ┌───────────────────────┐  ┌────────────────────────┐  ┌───────────────────────────┐  │
│  │ Binance API / WS      │  │ OpenRouter / LLM APIs  │  │ External News Sources     │  │
│  │ (Live Ticks & Klines) │  │ (Prompt Parser/Scrape) │  │ (CoinDesk, RSS, HTML)     │  │
│  └───────────┬───────────┘  └───────────┬────────────┘  └─────────────┬─────────────┘  │
└──────────────┼──────────────────────────┼─────────────────────────────┼────────────────┘
               │                          │                             │
┌──────────────▼──────────────────────────▼─────────────────────────────▼────────────────┐
│                           NESTJS MODULAR MONOLITH (Backend App)                        │
│                                                                                        │
│  ┌──────────────────────────────────────────────────────────────────────────────────┐  │
│  │               In-Process Event Bus (@nestjs/event-emitter)                       │  │
│  └──────────┬──────────────┬──────────────┬──────────────┬──────────────┬───────────┘  │
│             │              │              │              │              │              │
│  ┌──────────▼───┐  ┌───────▼─────┐  ┌─────▼────────┐  ┌──▼──────────┐ ┌─▼───────────┐  │
│  │ MarketModule │  │ StrategyMod │  │ BacktestMod  │  │ Leaderboard │ │ News & Sent │  │
│  │-BinanceAdaptr│  │-Registry    │  │-Engine & Eval│  │-Top-K Rank  │ │Orchestrator │  │
│  │-WS Gateway   │  │-Indicators  │  │-Task Queue   │  │-Redis Sync  │ │-Ingestion   │  │
│  └──────────────┘  └─────────────┘  └──────────────┘  └─────────────┘ └──────┬──────┘  │
│  ┌────────────────────────────────────────────────────────────────────────┐  │         │
│  │ DiscoveryLoopController | LLMStrategyParser | AuthModule (Pro Student) │  │         │
│  └────────────────────────────────────────────────────────────────────────┘  │         │
└───────────────────────────────────────┬──────────────────────────────────────┼─────────┘
                                        │                                      │
                                        │ REST / WS Push                       │ Process Boundary
                                        │                                      │ (HTTP / Queue)
┌───────────────────────────────────────▼──────┐                      ┌────────▼─────────┐
│              FRONTEND (Browser SPA)          │                      │  PYTHON WORKERS  │
│   (Display-only: 4-Chart Grid, Backtest UI,  │                      │ ┌──────────────┐ │
│    Discovery Studio, News & Sentiment Feed)  │                      │ │Crawler Worker│ │
└──────────────────────────────────────────────┘                      │ └──────┬───────┘ │
                                                                      │ ┌──────▼───────┐ │
                                                                      │ │Sentiment Wkr │ │
                                                                      │ │(FinBERT+LLM) │ │
                                                                      │ └──────────────┘ │
                                                                      └────────┬─────────┘
                                                                               │
┌──────────────────────────────────────────────────────────────────────────────▼─────────┐
│                              SHARED PERSISTENCE LAYER                                  │
│  ┌────────────────────────────────────────────┐  ┌──────────────────────────────────┐  │
│  │ PostgreSQL Database (Relational Store)          │  │ Redis (In-Memory Cache & Queue)  │  │
│  │ - Candles, Strategies, Experiments,        │  │ - Top-K Leaderboard Cache        │  │
│  │   Trades, NewsItems, SentimentResults      │  │ - BullMQ Job Queues & Locks      │  │
│  └────────────────────────────────────────────┘  └──────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. System Boundaries

### 2.1 Inside the NestJS Monolith

The NestJS application represents the single operational core and hosts all primary business logic:

- **`MarketModule`:** Connects to external exchanges via `BinanceAdapter`, normalizes candles, and broadcasts live feeds to the frontend via WebSocket.
- **`StrategyModule`:** Hosts `StrategyRegistry`, indicator computation pipelines, single strategy execution, and `CompositeStrategy` decision engines.
- **`BacktestModule`:** Coordinates historical backtesting simulation, trade execution modeling (fees, slippage, SL/TP), financial metrics evaluation, and parallel worker dispatch.
- **`StrategySearchModule` & `DiscoveryLoopController`:** Orchestrates automated candidate search (Random, Domain-guided, Genetic) and enforces execution stop conditions.
- **`LeaderboardModule`:** Calculates rankings (`Overall Score`), maintains Top-K (K=10), updates Redis cache, and triggers live updates.
- **`NewsOrchestrationModule`:** Triggers crawler schedules, receives normalized news records, coordinates sentiment tasks, and injects sentiment into strategy contexts.
- **`LLMStrategyParser`:** Handles user prompts and URL scripts, interacting with LLM providers to produce validated strategy schemas.
- **`AuthModule`:** Manages user context and plan authorization (e.g., "Pro Student").
- **`In-Process Event Bus` (`@nestjs/event-emitter`):** Transports internal domain events (`MarketPriceUpdated`, `CandleClosed`, `StrategyEvaluatedEvent`, `LeaderboardUpdated`, `NewsCollected`, `SentimentAnalyzed`) in-memory.

### 2.2 Outside the NestJS Monolith (Auxiliary & External)

- **Python Crawler Worker:** Independent worker process running Scrapy / Playwright / BeautifulSoup + LLM self-healing templates.
- **Python Sentiment Worker:** Independent worker process hosting local FinBERT models and OpenRouter LLM adapters for sentiment scoring.
- **Backtest Execution Workers:** Optional worker execution pool (Node.js Worker Threads or BullMQ consumers) for large-scale backtesting sweeps.
- **External Systems:** Binance WebSocket / REST API, OpenRouter / External LLM API, News sources (RSS feeds, HTML sites, News APIs).
- **Persistence Infrastructure:** PostgreSQL 8.x (single source of truth) and Redis 7.x (hot cache + job queue).

---

## 3. Communication Contracts

### 3.1 Intra-Monolith Communication (In-Process)

Modules within the NestJS Monolith communicate using standard software boundaries:

1. **Direct Dependency Injection (DI):** Invoking exported methods on imported module domain services (e.g., `BacktestService` invoking `StrategyEngineService.analyze()`).
2. **In-Process Domain Events (`@nestjs/event-emitter`):** Loose coupling for asynchronous lifecycle notifications within the application runtime.
   - Example: `MarketModule` emits `CandleClosed` → `StrategyEngineService` recalculates real-time signals without tight direct coupling.

### 3.2 Monolith-to-Worker Communication (Inter-Process)

Cross-process communication between NestJS and Python Workers uses clean, lightweight boundaries:

- **HTTP REST / RPC:** NestJS triggers crawling/sentiment jobs or polls worker status via local HTTP endpoints.
- **Redis Task Queue (BullMQ / Celery compatible):** NestJS enqueues payload tasks (e.g., `news:crawl_task`, `sentiment:analyze_task`), which Python workers consume asynchronously.
- **Database Writeback:** Python workers write normalized items (`NewsItem`, `SentimentResult`) directly into PostgreSQL or return JSON payloads to NestJS for transactional insertion.

### 3.3 Backend-to-Frontend Communication

- **WebSocket Gateway (`@nestjs/websockets`):** Real-time push channel delivering price ticks (<102ms latency) and live Leaderboard updates (`LeaderboardUpdated`).
- **HTTP REST API:** Standard request-response interface for chart history initialization, manual backtest execution, prompt parsing, and dashboard settings.

---

## 4. End-to-End Runtime Flows

### Flow 1: Real-Time Market Streaming & Multi-Timeframe Charting

```text
Binance WebSocket Stream
  │ (Realtime ticks & klines)
  ▼
BinanceAdapter (MarketModule)
  │ (Normalize to Candlestick Schema)
  ├─────────────────────────────────────────┐
  ▼ (In-Process Event)                      ▼ (WebSocket Push)
In-Process Event Bus (`MarketPriceUpdated`)  Frontend WebSocket Gateway
  │                                         │
  ▼                                         ▼
StrategyEngineService                       Frontend Candlestick Grid
(Evaluates live indicators & signals)       (Candle Update / Append Logic)
                                            - Timestamp matches: Overwrite last candle
                                            - Newer timestamp: Append new candle
```

### Flow 2: AI-Assisted Strategy Creation & Compilation

```text
User (Prompt / Script URL)
  │ (HTTP POST /api/strategies/parse)
  ▼
LLMStrategyParser (NestJS Backend)
  │ (HTTP Request to OpenRouter / LLM API)
  ▼
External LLM Provider
  │ (Structured JSON Strategy Definition)
  ▼
Schema Validation Pipe (NestJS)
  │ (Validates indicators, condition logic, risk params)
  ▼
StrategyRepository.save() (PostgreSQL)
  │ (Immutable record: Version v1.0.0, tags, author)
  ▼
Available in StrategyRegistry for Backtest & Discovery
```

### Flow 3: Deterministic Historical Backtest Execution

```text
User / Discovery Loop
  │ (HTTP POST /api/backtest/run)
  ▼
BacktestService (BacktestModule)
  │
  ├─► Fetch historical candles from PostgreSQL (Candles Table)
  │
  ├─► Execute Simulation Loop:
  │     For each candle in range:
  │       - Build MarketContext (OHLCV + computed indicators)
  │       - Invoke StrategyEngineService.analyze(context)
  │       - Resolve Entry / Exit / SL / TP on OHLC prices
  │       - Deduct Fee (0.08%) and Slippage (5 bps)
  │       - Log Trade entity
  │
  ├─► Invoke Evaluator:
  │     - Calculate Net Return, Winrate, Max Drawdown, Sharpe, Trades
  │     - Compute Overall Score = 0.5×Return + 0.2×WinRate + 0.3×RiskScore
  │
  └─► Transactionally persist Experiment + Trade records to PostgreSQL
        │
        └─► Emit `StrategyEvaluatedEvent` (In-Process)
```

### Flow 4: Continuous Discovery Loop & Leaderboard Promotion

```text
User: "START SEARCH"
  │
  ▼
DiscoveryLoopController (NestJS)
  │
  ┌──► 1. StrategySearchModule generates candidate (Domain-guided: Trend + Momentum + Structure)
  │    2. Dispatch backtest task to BacktestEngine / Worker Pool
  │    3. Evaluator generates Overall Score
  │    4. Emit `StrategyEvaluatedEvent`
  │    5. LeaderboardModule receives event:
  │         - Compare Overall Score against Rank[10]
  │         - If Score > Rank[10]: Promote candidate, evict Rank[10], update PostgreSQL + Redis
  │         - Emit `LeaderboardUpdated` event -> WebSocket pushes update to Frontend
  │    6. DiscoveryLoopController checks Stop Conditions:
  │         - Tested >= 100 candidates  OR
  │         - Elapsed >= 1 hour         OR
  │         - Iterations with no improvement >= 50
  │         - If condition met: Transition state to COMPLETED
  │         - Else: Repeat step 1
  └─── Loop until stopped
```

### Flow 5: News Crawling, Sentiment Analysis & Strategy Integration

```text
Cron Schedule / User Trigger
  │
  ▼
NewsOrchestratorModule (NestJS)
  │ (Dispatch crawl task via HTTP/Queue)
  ▼
Python Crawler Worker
  │ (Scrapes CoinDesk, RSS, HTML; uses LLM self-healing if error rate >= 10%)
  │ (Normalizes raw data to NewsItem: 8 standard fields)
  ▼
Persist NewsItem to PostgreSQL & Emit `NewsCollected`
  │
  ▼
Python Sentiment Worker
  │ (Classifies via local FinBERT model or OpenRouter LLM adapter)
  │ (Generates label: POSITIVE/NEGATIVE/NEUTRAL + confidence score)
  ▼
Persist SentimentResult to PostgreSQL & Emit `SentimentAnalyzed`
  │
  ▼
NewsSentimentStrategy (StrategyModule)
  (Computes 1h rolling average: >0.7 -> BUY, <-0.7 -> SELL, else HOLD)
```

---

## 5. Deployment Topology

### 5.1 MVP Deployment (Single Server)

```text
┌─────────────────────────────────────────────────────────────┐
│                       HOST / SERVER                         │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ NestJS Application Process (Node.js)                  │  │
│  │ (Serves REST API, WebSockets, all core modules)       │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌────────────────────────────┐  ┌───────────────────────┐  │
│  │ Python Crawler Process     │  │ Python Sentiment Proc │  │
│  │ (Scrapy / Asyncio)         │  │ (PyTorch / FinBERT)   │  │
│  └────────────────────────────┘  └───────────────────────┘  │
│                                                             │
│  ┌────────────────────────────┐  ┌───────────────────────┐  │
│  │ PostgreSQL 8.x Database         │  │ Redis 7.x Instance    │  │
│  └────────────────────────────┘  └───────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 Scale-Out Scenario (50k Users, 100k Backtests/day)

- **NestJS App:** Scale horizontally behind an NGINX / Cloud Load Balancer with Redis sticky sessions for WebSockets.
- **Backtest Workers:** Offload heavy backtest computation to dedicated Node.js BullMQ worker processes.
- **Python Workers:** Run multiple crawler/sentiment worker containers scaling on Redis queue depth.
- **Storage:** Read-replica PostgreSQL for historical candle queries + Redis Cluster for Leaderboard hot reads.

---

## 6. Failure Isolation and Fault Tolerance

| Subsystem Failure                         | System Impact                                                        | Mitigation & Recovery                                                                                                  |
| ----------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Binance WebSocket Disconnect**    | Real-time chart tick streaming pauses.                               | `BinanceAdapter` initiates exponential backoff reconnect + gap-fill REST queries. No candle data lost.               |
| **Python Crawler Worker Crash**     | News ingestion temporarily pauses.                                   | Monolith catches connection timeout; chart and trading engines operate without disruption; supervisor restarts worker. |
| **Python Sentiment Worker Crash**   | Sentiment labeling delayed.                                          | Monolith isolates failure;`NewsSentimentStrategy` defaults to `HOLD` until worker recovers.                        |
| **OpenRouter / LLM Outage**         | Prompt-based strategy creation fails; self-healing scraper disabled. | Fallback to rule-based parser and existing static HTML templates; UI shows graceful error toast.                       |
| **Backtest Worker Execution Error** | Single candidate evaluation fails.                                   | Task queue automatically retries job on another worker; Discovery Loop does not crash.                                 |
