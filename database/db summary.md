# Crypto Strategy Lab — Database Schema

## 1. Overview

This document describes the PostgreSQL + TimescaleDB schema used by Crypto Strategy Lab.

The current MVP intentionally uses a fixed market scope:

- **Exchange:** Binance
- **Symbol:** BTCUSDT

The database is divided into two major categories:

```text
                    Database
                       │
          ┌────────────┴────────────┐
          │                         │
          ▼                         ▼
     Shared Data              Session Data
          │                         │
       candles             experiments
                            strategies
                            trades
                            evaluations
                            leaderboards
```

### Shared data

Shared data is not owned by an individual session and can be reused by all users:

- `candles`

News data is intentionally excluded from this PostgreSQL schema because it is stored in a NoSQL database.

### Session data

Data related to search, backtesting, strategies, and rankings is associated with a session:

- `sessions`
- `strategies`
- `experiments`
- `experiment_strategies`
- `trades`
- `evaluations`
- `leaderboards`
- `leaderboard_entries`

---

## 2. Session and Cookie-Based Isolation

The backend creates a `session_id` for a browser/session and stores it in a cookie.

The first request creates the session:

```http
Set-Cookie: session_id=<session-id>
```

Subsequent requests automatically send:

```http
Cookie: session_id=<session-id>
```

The backend uses this value to retrieve session-specific data.

A session represents an anonymous user workspace for the current MVP. It does not require a user account or authentication system.

The important rule is:

> `session_id` identifies the owner/scope of user-generated experiment data. It is not attached to shared market data.

---

## 3. Shared Market Data — `candles`

The `candles` table stores OHLCV data for BTCUSDT from Binance.

```text
candles
├── timeframe
├── timestamp
├── open
├── high
├── low
├── close
└── volume
```

There is intentionally no:

```text
candles.session_id
candles.symbol_id
candles.exchange_id
```

because the current MVP has only one market source and one trading pair:

```text
Binance / BTCUSDT
```

### TimescaleDB Hypertable

`candles` is implemented as a TimescaleDB hypertable.

The DBML describes the logical table, while the migration converts it into a hypertable:

```sql
SELECT create_hypertable(
    'candles',
    by_range('timestamp')
);
```

The primary key is:

```text
(timeframe, timestamp)
```

because a candle is uniquely identified by its timeframe and timestamp.

For example:

```text
5m + 2026-08-17 10:00:00
```

identifies one unique 5-minute candle.

---

## 4. How Historical Candles Are Used by Backtesting

Historical candles are not copied into experiments.

An experiment stores the specification of the dataset it wants to backtest:

```text
timeframe
start_time
end_time
```

For example:

```text
Experiment #182
────────────────────────
timeframe: 5m
start:     2026-01-01
end:       2026-07-01
```

The Backtest Engine retrieves the required historical candles from the TimescaleDB hypertable:

```sql
SELECT
    timestamp,
    open,
    high,
    low,
    close,
    volume
FROM candles
WHERE timeframe = '5m'
  AND timestamp >= '2026-01-01T00:00:00Z'
  AND timestamp <  '2026-07-01T00:00:00Z'
ORDER BY timestamp ASC;
```

The resulting dataset is then processed by the Backtest Engine.

Conceptually:

```text
TimescaleDB
     │
     │ historical candle query
     ▼
Backtest Worker
     │
     ├── Candle data
     │
     ├── Strategy
     │
     └── Trade Simulator
             │
             ▼
           Trades
             │
             ▼
         Evaluation
```

This allows many experiments to reuse the same historical market data without duplicating candles.

---

## 5. Strategy — `strategies`

A strategy record represents an immutable version of a strategy.

Example:

```text
MA + RSI v1
```

with:

```json
{
  "ma_fast": 20,
  "ma_slow": 50,
  "rsi_period": 14
}
```

If the parameters change, a new strategy version should be created instead of overwriting the existing one.

For example:

```text
MA + RSI v1
MA + RSI v2
```

This is important for reproducibility: an old experiment must continue to reference the exact strategy configuration that was used when it ran.

A strategy belongs to the session that created it.

---

## 6. Experiment — `experiments`

An experiment represents one Search/Backtest run.

Example:

```text
Experiment #182
────────────────────────
session_id:       A
timeframe:        5m
start_time:       2026-01-01
end_time:         2026-07-01
search_engine:    <selected implementation>
status:           COMPLETED
```

An experiment does **not** contain candle data.

Instead, it stores the dataset specification that the Backtest Engine uses to retrieve candles from the shared TimescaleDB hypertable.

### Search Engine

The system currently uses one Search Engine implementation, but the team has not decided which implementation to use yet.

Therefore the schema does not hard-code a particular algorithm.

The `search_engine` field records which implementation was used by an experiment.

Possible future values could include:

```text
RANDOM
GENETIC
DOMAIN_GUIDED
```

The exact value is an application-level decision.

---

## 7. Experiment Strategies — `experiment_strategies`

One experiment can test many candidate strategies.

For example:

```text
Experiment #182
│
├── MA20 + RSI14
├── MA50 + RSI14
├── MA20 + Bollinger
└── MA20 + RSI14 + SupportResistance
```

`experiment_strategies` maps an experiment to the strategy candidates tested by that experiment.

Conceptually:

```text
experiment
    │
    ├── candidate A
    ├── candidate B
    ├── candidate C
    └── candidate D
```

Each candidate has its own execution status.

---

## 8. Trades — `trades`

`trades` contains the simulated trades produced by a backtest candidate.

A single candidate can generate many trades:

```text
Candidate
   │
   ├── Trade #1
   ├── Trade #2
   ├── Trade #3
   └── ...
```

A trade can contain:

- Side
- Entry time
- Entry price
- Stop loss
- Take profit
- Exit time
- Exit price
- Quantity
- Profit/Loss
- Return
- Exit reason

Example:

```text
LONG

Entry       = 108000
Stop Loss   = 106000
Take Profit = 112000
Exit        = 112000

Profit      = +4000
```

`stop_loss` and `take_profit` are nullable because not every strategy necessarily uses them.

Possible exit reasons include:

```text
SIGNAL
STOP_LOSS
TAKE_PROFIT
END_OF_BACKTEST
```

---

## 9. Evaluation — `evaluations`

`evaluations` stores the evaluation result of one experiment candidate.

The MVP metrics include:

- Total Return
- Profit/Loss
- Win Rate
- Max Drawdown
- Number of Trades

The schema also provides:

- Profit Factor
- Sharpe Ratio
- Overall Score

The `overall_score` is used as the primary value for ranking candidates.

Relationship:

```text
experiment_strategy
        │
        └── evaluation
```

Each candidate has one evaluation result.

---

## 10. Leaderboards

Leaderboards are persisted in PostgreSQL instead of being calculated only at request time.

This allows the system to support different leaderboard scopes.

The schema contains:

```text
leaderboards
leaderboard_entries
```

### Personal Leaderboard

A session can own one or more personal leaderboards.

For example:

```text
Session A
│
├── My Best Strategies
├── My Latest Search
└── My Top 10
```

The `session_id` on `leaderboards` identifies the owner/scope of the leaderboard.

A personal leaderboard can contain strategies generated by that session.

Example:

```text
Rank    Strategy              Score
────────────────────────────────────
#1      MA20 + RSI14          91.2
#2      MA50 + RSI14          87.4
#3      MA20 + Bollinger      84.1
```

### Global Leaderboard

The system may also provide a leaderboard containing strategies searched by all sessions.

Conceptually:

```text
User A
  └── Strategy A

User B
  └── Strategy B

User C
  └── Strategy C

          ↓

   GLOBAL LEADERBOARD

   #1 Strategy B
   #2 Strategy A
   #3 Strategy C
```

A global leaderboard can be represented by a dedicated system-level session/owner while its `leaderboard_entries` reference candidates originating from multiple sessions.

This distinction is important:

> `leaderboards.session_id` defines the owner/scope of the leaderboard. It does not require every `leaderboard_entry` to originate from that same session.

Therefore:

```text
PERSONAL leaderboard
→ candidates from one session

GLOBAL leaderboard
→ candidates from multiple sessions
```

---

## 11. Leaderboard Entries

`leaderboard_entries` stores the ranking of an evaluated experiment candidate.

It contains:

```text
leaderboard_id
experiment_strategy_id
rank
score
```

The same candidate can appear in multiple leaderboards.

For example:

```text
Strategy A
   │
   ├── User A Personal Leaderboard
   └── Global Leaderboard
```

This avoids duplicating the actual experiment, strategy, trade, and evaluation data.

---

## 12. News Data

News is intentionally **not included in this PostgreSQL/TimescaleDB schema**.

The current architecture stores news in a NoSQL database.

Conceptually:

```text
Crawler
   │
   ▼
NoSQL
   │
   ▼
Sentiment Analysis
```

PostgreSQL/TimescaleDB is responsible for the relational trading experiment data:

```text
Market Data
Session
Strategy
Experiment
Backtest
Trade
Evaluation
Leaderboard
```

---

## 13. Complete Database Relationship

```text
                         ┌──────────────┐
                         │   sessions   │
                         └──────┬───────┘
                                │
                ┌───────────────┼────────────────┐
                │               │                │
                ▼               ▼                ▼
          strategies       experiments      leaderboards
                                │                │
                                ▼                ▼
                       experiment_strategies  leaderboard_entries
                                │                │
                         ┌──────┴──────┐         │
                         ▼             ▼         │
                       trades     evaluations ◄───┘


                 SHARED MARKET DATA
                        │
                        ▼
                     candles
                        │
                  TimescaleDB
                   hypertable
```

---

## 14. Complete Backtest Flow

The complete flow is:

```text
Session
   │
   ▼
Experiment
   │
   ├── timeframe
   ├── start_time
   ├── end_time
   └── search_engine
          │
          ▼
   Search Engine
          │
          ▼
   Candidate Strategies
          │
          ▼
   TimescaleDB candles
          │
          │ Binance BTCUSDT
          ▼
    Backtest Engine
          │
          ▼
    Trade Simulation
          │
          ▼
        Trades
          │
          ▼
      Evaluation
          │
          ▼
      Leaderboard
```

The important architectural separation is:

```text
Shared Market Data
        ≠
User/Session Experiment Data
```

Historical BTCUSDT candles are stored once and reused by all sessions, while each session maintains its own experiments, strategies, backtest results, and personal leaderboards.

---

## 15. Design Principles

The schema follows these principles:

### Shared market data is stored once

```text
Binance BTCUSDT candles
        │
        ├── Session A
        ├── Session B
        └── Session C
```

There is no per-session duplication of candle data.

### Session data is isolated

```text
Session A
    └── Experiments
          └── Strategies
                └── Trades
                      └── Evaluation
```

Backend APIs use the `session_id` from the cookie to scope access to session-owned data.

### Historical data is reproducible

An experiment records:

```text
timeframe
start_time
end_time
search_engine
strategy/version
```

so the system can determine which market dataset and strategy configuration were used.

### Strategy versions are immutable

Changing strategy parameters creates a new version instead of modifying an existing version used by an old experiment.

### Leaderboards are persistent

Leaderboards are stored explicitly because the system needs to support both personal and global ranking views.

### Market scope is intentionally limited

The current MVP does not create database abstractions for multiple exchanges or symbols because the project is currently restricted to:

```text
Binance
BTCUSDT
```

If the project is expanded later, exchange/symbol abstraction can be introduced at the application and database levels when there is an actual requirement for it.

---

## 16. Related Files

The DBML schema corresponding to this README is maintained separately as:

```text
crypto_strategy_lab.dbml
```

The PostgreSQL/TimescaleDB migration should subsequently:

1. Create the relational tables.
2. Create the `candles` table.
3. Convert `candles` into a TimescaleDB hypertable.
4. Create required indexes and constraints.
5. Create/update the required foreign keys.
