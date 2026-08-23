# data.md — Data Architecture & Persistence Specification

## 1. Data Architecture & Logical Ownership

In alignment with the **NestJS Modular Monolith** architecture, all persistent application state is housed in a single **PostgreSQL** relational database instance.

Logical boundaries are maintained at the software module level:

- Each database table is assigned a single **Owner Module**.
- Non-owner modules must not issue direct `INSERT`, `UPDATE`, or `DELETE` mutations on foreign tables; they interact via the owning module's exported domain services or in-process events.
- **Redis** operates as an auxiliary high-performance in-memory cache (for hot Leaderboard reads) and task queue storage.

| Domain                | Owner Module                | Worker Generated?                | Primary Entities          | PostgreSQL Table            | Redis Key(s)             |
| --------------------- | --------------------------- | -------------------------------- | ------------------------- | --------------------------- | ------------------------ |
| **Market Data** | `MarketModule`            | No (Binance API)                 | `Candlestick`           | `candles`                 | —                       |
| **Strategy**    | `StrategyModule`          | No (User / Search)               | `StrategyDefinition`    | `strategies`              | —                       |
| **Experiment**  | `BacktestModule`          | No (Backtest Engine)             | `Experiment`, `Trade` | `experiments`, `trades` | —                       |
| **Leaderboard** | `LeaderboardModule`       | No (Ranking Engine)              | `LeaderboardRow`        | `leaderboard`             | `leaderboard:top10`    |
| **News**        | `NewsOrchestrationModule` | **Yes (Crawler Worker)**   | `NewsItem`              | `news`                    | `news:crawl_queue`     |
| **Sentiment**   | `NewsOrchestrationModule` | **Yes (Sentiment Worker)** | `SentimentResult`       | `sentiment_results`       | `sentiment:task_queue` |

---

## 2. Entity Schemas & Invariants

### 2.1 `Candlestick` (Domain: Market Data)

Represents a standardized OHLCV bar for a specific trading pair, timeframe, and timestamp.

| Column        | Type           | Constraints                 | Description                                                  |
| ------------- | -------------- | --------------------------- | ------------------------------------------------------------ |
| `id`        | BIGINT         | PRIMARY KEY, AUTO_INCREMENT | Internal row ID                                              |
| `pair`      | VARCHAR(20)    | NOT NULL, INDEX             | Trading symbol (e.g.,`BTCUSDT`)                            |
| `timeframe` | VARCHAR(5)     | NOT NULL, INDEX             | Bar interval:`1m`, `5m`, `15m`, `1h`, `4h`, `1d` |
| `timestamp` | DATETIME       | NOT NULL, INDEX             | Candle opening timestamp (UTC)                               |
| `open`      | DECIMAL(18, 8) | NOT NULL                    | Open price                                                   |
| `high`      | DECIMAL(18, 8) | NOT NULL                    | High price                                                   |
| `low`       | DECIMAL(18, 8) | NOT NULL                    | Low price                                                    |
| `close`     | DECIMAL(18, 8) | NOT NULL                    | Close price                                                  |
| `volume`    | DECIMAL(24, 8) | NOT NULL                    | Traded base volume                                           |

- **Uniqueness Constraint:** `UNIQUE KEY uk_pair_tf_time (pair, timeframe, timestamp)`
- **Lifecycle & Access:** Written by `MarketModule` on `CandleClosed` events and batch historical loads. Read by `BacktestModule` and `MarketGateway`. Historical records are permanent.

---

### 2.2 `StrategyDefinition` (Domain: Strategy)

Represents an immutable, versioned specification of a trading strategy logic.

| Column         | Type         | Constraints | Description                                              |
| -------------- | ------------ | ----------- | -------------------------------------------------------- |
| `id`         | VARCHAR(36)  | PRIMARY KEY | UUIDv4 identifier                                        |
| `name`       | VARCHAR(100) | NOT NULL    | Human-readable strategy name                             |
| `version`    | VARCHAR(20)  | NOT NULL    | Semantic version (e.g.,`1.0.0`, `1.0.1`)             |
| `definition` | JSON         | NOT NULL    | Strategy AST/schema (indicators, rules, risk management) |
| `source`     | ENUM         | NOT NULL    | `USER_PROMPT`, `WEB_IMPORT`, `SYSTEM_GENERATED`    |
| `tags`       | JSON         | NULL        | Array of tag strings (`["RSI", "Bollinger", "Long"]`)  |
| `created_at` | DATETIME     | NOT NULL    | Creation timestamp (UTC)                                 |
| `created_by` | VARCHAR(50)  | NOT NULL    | User ID or`SYSTEM`                                     |

- **Uniqueness Constraint:** `UNIQUE KEY uk_name_version (name, version)`
- **Immutability Invariant:** Once committed, records in `strategies` are **never updated**. Any modification creates a new row with an incremented version number. This guarantees **100% deterministic reproducibility** for all historical backtest experiments.

---

### 2.3 `Experiment` (Domain: Experimentation)

Represents the summary outcome of a completed backtesting run.

| Column               | Type           | Constraints                      | Description                        |
| -------------------- | -------------- | -------------------------------- | ---------------------------------- |
| `id`               | VARCHAR(36)    | PRIMARY KEY                      | UUIDv4 identifier                  |
| `strategy_id`      | VARCHAR(36)    | NOT NULL, FK →`strategies.id` | Tested strategy ID                 |
| `strategy_version` | VARCHAR(20)    | NOT NULL                         | Snapshot of strategy version       |
| `pair`             | VARCHAR(20)    | NOT NULL                         | Tested symbol (e.g.,`BTCUSDT`)   |
| `timeframe`        | VARCHAR(5)     | NOT NULL                         | Tested timeframe (e.g.,`5m`)     |
| `from_date`        | DATETIME       | NOT NULL                         | Simulation start timestamp         |
| `to_date`          | DATETIME       | NOT NULL                         | Simulation end timestamp           |
| `initial_capital`  | DECIMAL(14, 2) | NOT NULL, DEFAULT 100.00         | Simulated starting capital (USD)   |
| `fee_pct`          | DECIMAL(6, 4)  | NOT NULL, DEFAULT 0.0800         | Exchange fee percentage (0.08%)    |
| `slippage_bps`     | INT            | NOT NULL, DEFAULT 5              | Slippage in basis points (5 bps)   |
| `net_profit`       | DECIMAL(14, 4) | NOT NULL                         | Total net return in USD            |
| `return_pct`       | DECIMAL(8, 4)  | NOT NULL                         | Net profit percentage              |
| `win_rate`         | DECIMAL(6, 4)  | NOT NULL                         | Win rate ratio`[0.0, 1.0]`       |
| `max_drawdown`     | DECIMAL(8, 4)  | NOT NULL                         | Maximum equity drawdown percentage |
| `sharpe_ratio`     | DECIMAL(8, 4)  | NULL                             | Annualized Sharpe ratio            |
| `profit_factor`    | DECIMAL(8, 4)  | NULL                             | Gross Profit / Gross Loss ratio    |
| `total_trades`     | INT            | NOT NULL                         | Total executed trades count        |
| `overall_score`    | DECIMAL(8, 4)  | NOT NULL, INDEX                  | Weighted ranking score             |
| `completed_at`     | DATETIME       | NOT NULL                         | Completion timestamp               |
| `triggered_by`     | ENUM           | NOT NULL                         | `USER`, `DISCOVERY_LOOP`       |

- **Ranking Formula:** `overall_score = (0.50 * return_pct) + (0.20 * win_rate * 100) + (0.30 * (100 - max_drawdown))`

---

### 2.4 `Trade` (Domain: Experimentation)

Represents an individual simulated trade execution belonging to an `Experiment`.

| Column            | Type           | Constraints                       | Description                      |
| ----------------- | -------------- | --------------------------------- | -------------------------------- |
| `id`            | VARCHAR(36)    | PRIMARY KEY                       | UUIDv4 identifier                |
| `experiment_id` | VARCHAR(36)    | NOT NULL, FK →`experiments.id` | Parent experiment ID             |
| `pair`          | VARCHAR(20)    | NOT NULL                          | Symbol (e.g.,`BTCUSDT`)        |
| `direction`     | ENUM           | NOT NULL                          | `LONG`, `SHORT`              |
| `entry_time`    | DATETIME       | NOT NULL                          | Order entry timestamp            |
| `entry_price`   | DECIMAL(18, 8) | NOT NULL                          | Filled entry price               |
| `exit_time`     | DATETIME       | NOT NULL                          | Order exit timestamp             |
| `exit_price`    | DECIMAL(18, 8) | NOT NULL                          | Filled exit price                |
| `stop_loss`     | DECIMAL(18, 8) | NULL                              | Stop-loss price trigger          |
| `take_profit`   | DECIMAL(18, 8) | NULL                              | Take-profit price trigger        |
| `capital_used`  | DECIMAL(14, 2) | NOT NULL                          | Capital allocated to trade (USD) |
| `fee`           | DECIMAL(10, 4) | NOT NULL                          | Transaction fees deducted        |
| `slippage`      | DECIMAL(10, 4) | NOT NULL                          | Slippage cost deducted           |
| `net_profit`    | DECIMAL(14, 4) | NOT NULL                          | Realized net profit (USD)        |

- **Net Profit Formula:** `net_profit = gross_profit - fee - slippage`
- **UI Integration:** Clicking any trade row in the Backtest table sends entry/exit timestamps to the chart to draw trade highlight markers.

---

### 2.5 `LeaderboardRow` (Domain: Leaderboard)

Maintains the materialized Top-K (K=10) leaderboard ranking.

| Column            | Type          | Constraints                       | Description                 |
| ----------------- | ------------- | --------------------------------- | --------------------------- |
| `rank`          | INT           | PRIMARY KEY                       | Ranking position (1 to 10)  |
| `strategy_id`   | VARCHAR(36)   | NOT NULL, FK →`strategies.id`  | Strategy reference          |
| `strategy_name` | VARCHAR(100)  | NOT NULL                          | Strategy display name       |
| `overall_score` | DECIMAL(8, 4) | NOT NULL                          | Evaluator ranking score     |
| `return_pct`    | DECIMAL(8, 4) | NOT NULL                          | Net profit percentage       |
| `win_rate`      | DECIMAL(6, 4) | NOT NULL                          | Win rate percentage         |
| `max_drawdown`  | DECIMAL(8, 4) | NOT NULL                          | Maximum drawdown percentage |
| `experiment_id` | VARCHAR(36)   | NOT NULL, FK →`experiments.id` | Qualifying experiment       |
| `updated_at`    | DATETIME      | NOT NULL                          | Last rank change timestamp  |

---

### 2.6 `NewsItem` (Domain: News & Content)

Represents a structured crypto news article ingested by the Python Crawler Worker.

| Column            | Type         | Constraints     | Description                                      |
| ----------------- | ------------ | --------------- | ------------------------------------------------ |
| `id`            | VARCHAR(36)  | PRIMARY KEY     | UUIDv4 identifier                                |
| `title`         | VARCHAR(255) | NOT NULL        | News headline                                    |
| `content`       | TEXT         | NOT NULL        | Extracted article body / summary                 |
| `source`        | VARCHAR(100) | NOT NULL        | Publisher (e.g.,`Cointelegraph`, `Bankless`) |
| `url`           | VARCHAR(500) | NOT NULL        | Canonical article link                           |
| `published_at`  | DATETIME     | NOT NULL, INDEX | Article publish timestamp                        |
| `crawled_at`    | DATETIME     | NOT NULL        | Extraction timestamp                             |
| `related_coins` | JSON         | NOT NULL        | Tagged symbols (`["BTC", "ETH", "SOL"]`)       |

- **Uniqueness / Deduplication:** `UNIQUE KEY uk_url_published (url(255), published_at)`

---

### 2.7 `SentimentResult` (Domain: Sentiment Analysis)

Represents the quantitative sentiment analysis score generated by the Python Sentiment Worker.

| Column               | Type          | Constraints                | Description                                               |
| -------------------- | ------------- | -------------------------- | --------------------------------------------------------- |
| `id`               | VARCHAR(36)   | PRIMARY KEY                | UUIDv4 identifier                                         |
| `news_item_id`     | VARCHAR(36)   | NOT NULL, FK →`news.id` | Reference to parent article                               |
| `label`            | ENUM          | NOT NULL                   | `POSITIVE`, `NEGATIVE`, `NEUTRAL`                   |
| `confidence_score` | DECIMAL(5, 4) | NOT NULL                   | Classification confidence`[0.0000, 1.0000]`             |
| `model_name`       | VARCHAR(50)   | NOT NULL                   | Engine model (e.g.,`FinBERT-local`, `OpenRouter-LLM`) |
| `analyzed_at`      | DATETIME      | NOT NULL                   | Classification timestamp                                  |

---

## 3. Data Crossing Worker Boundaries

```text
[ External Sources (Web/RSS/API) ]
                │
                ▼ (Scraping / LLM Parsing)
┌───────────────────────────────────────────────────────────┐
│               PYTHON CRAWLER WORKER                       │
│  - Builds standardized NewsItem JSON payload              │
│  - Executes self-healing template retry if error >= 10%   │
└───────────────────────────┬───────────────────────────────┘
                            │ (Process Boundary: HTTP / PostgreSQL Write)
                            ▼
┌───────────────────────────────────────────────────────────┐
│             NESTJS MONOLITH / PostgreSQL (news table)          │
│  - Persists NewsItem entity                               │
│  - Emits in-process event: `NewsCollected`                │
└───────────────────────────┬───────────────────────────────┘
                            │ (Process Boundary: Task Dispatch)
                            ▼
┌───────────────────────────────────────────────────────────┐
│              PYTHON SENTIMENT WORKER                      │
│  - Runs local FinBERT classification                      │
│  - Generates { label, confidence_score }                  │
└───────────────────────────┬───────────────────────────────┘
                            │ (Process Boundary: HTTP / PostgreSQL Write)
                            ▼
┌───────────────────────────────────────────────────────────┐
│       NESTJS MONOLITH / PostgreSQL (sentiment_results table)   │
│  - Persists SentimentResult entity                        │
│  - Computes 1h rolling average for NewsSentimentStrategy  │
└───────────────────────────────────────────────────────────┘
```

---

## 4. Redis In-Memory Caching & Queue Keys

| Key / Pattern                    | Type           | Purpose                                           | TTL       | Invalidation Trigger                                 |
| -------------------------------- | -------------- | ------------------------------------------------- | --------- | ---------------------------------------------------- |
| `leaderboard:top10`            | String (JSON)  | Serialized Top-10 Leaderboard snapshot            | No TTL    | Invalidated & updated on`LeaderboardUpdated` event |
| `candle:latest:{pair}:{tf}`    | String (JSON)  | Latest tick cache for fast chart handshake        | 60s       | Updated on every incoming WebSocket tick             |
| `sentiment:rolling:1h:{asset}` | String (Float) | Rolling 1h average sentiment score for asset      | 5m        | Recalculated on`SentimentAnalyzed` event           |
| `queue:backtest:jobs`          | List / Stream  | BullMQ queue for parallel backtest candidate jobs | Ephemeral | Popped by backtest worker execution threads          |
| `queue:news:crawl`             | List           | Task dispatch queue for Python Crawler Worker     | Ephemeral | Consumed by crawler worker on cron trigger           |

---

## 5. Transaction & Consistency Rules

1. **Backtest Experiment Persistence:** Saving an `Experiment` and its associated `Trade` records is wrapped in a single database transaction. If trade logging fails, the experiment record is rolled back.
2. **Strategy Immutability:** Any update to a strategy definition must execute as an `INSERT` with an incremented version number (`v1.0.0` → `v1.1.0`). `UPDATE` commands on `strategies` are blocked at the repository level.
3. **Leaderboard Consistency:** Leaderboard table updates and Redis cache refreshes are synchronized by the `LeaderboardModule`. PostgreSQL acts as the source of truth, and Redis acts as the read-through cache.
4. **Candlestick Deduplication:** Inbound WebSocket candle updates use `INSERT ... ON DUPLICATE KEY UPDATE close = VALUES(close), high = GREATEST(high, VALUES(high)), low = LEAST(low, VALUES(low)), volume = VALUES(volume)`.
