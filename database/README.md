# Crypto Strategy Lab — Database Schema

## 1. Overview

This document describes the PostgreSQL + TimescaleDB schema used by Crypto Strategy Lab, as actually created by `database/migrations/003_candidate_auth_schema.sql` (the source of truth — see `artifacts/database.md` for a deeper, Vietnamese-language walkthrough).

The current MVP intentionally uses a fixed market scope:

- **Exchange:** Binance
- **Symbol:** BTCUSDT

This replaces the project's earlier flat, session-based schema (`001_initial_schema.sql`): there is no more `sessions` table or cookie-based scoping. Every experiment belongs to an authenticated `users` row, and access control is by real user identity (JWT), not an anonymous session cookie.

```text
                    Database
                       │
          ┌────────────┴────────────┐
          │                         │
          ▼                         ▼
     Shared Data               User Data
          │                         │
       candles                   users
                             refresh_tokens
                              strategies
                             experiments
                          experiment_configs
                    experiment_config_strategies
                       experiment_iterations
                              candidates
                         candidate_strategies
                            backtest_runs
                                trades
                              evaluations
                             leaderboards
                          leaderboard_entries
                                 news
```

### Shared data

Shared data is not owned by an individual user and can be reused by everyone:

- `candles`

News (`news`) is stored in this same PostgreSQL schema rather than a separate NoSQL store — a deliberate change from the original design; see `artifacts/decisions.md`.

---

## 2. Authentication — real user accounts

Unlike the old cookie/session model, the backend now issues real JWTs:

- **`users`** — login accounts. `email` is unique, `password_hash` is a bcrypt hash (never plaintext), `status` (`ACTIVE` / `INACTIVE` / `SUSPENDED`) gates login.
- **`refresh_tokens`** — long-lived sessions. Only the SHA-256 **hash** of the refresh token is stored (`token_hash`, unique), never the raw token — if the DB leaked, the hash alone can't be used to log in. `revoked_at` marks a token dead on logout or rotation.

Access tokens are short-lived JWTs (default 15 minutes) verified by signature only — they are never persisted. Refresh tokens are longer-lived (default 30 days), stored hashed, and rotated on every `/auth/refresh` call.

Every `experiments` row now carries a `user_id` foreign key, and API endpoints scope reads/writes to the authenticated user (see `artifacts/api-contract.md`).

---

## 3. Shared Market Data — `candles`

The `candles` table stores OHLCV data for BTCUSDT from Binance.

```text
candles
├── timeframe   (enum app_timeframe: 1m / 5m / 15m / 1h / 4h)
├── timestamp
├── open
├── high
├── low
├── close
└── volume
```

There is intentionally no `candles.user_id` / `candles.symbol_id` / `candles.exchange_id` — the current MVP has only one market source and one trading pair (Binance / BTCUSDT), and market data is an objective shared fact, not owned by any one user.

### TimescaleDB Hypertable

`candles` is converted into a TimescaleDB hypertable, partitioned by `timestamp`:

```sql
SELECT create_hypertable('candles', by_range('timestamp'), if_not_exists => TRUE);
```

The primary key is `(timeframe, timestamp)` — a candle is uniquely identified by its timeframe and timestamp. For example, `5m + 2026-08-17 10:00:00` identifies one unique 5-minute candle.

`candles` predates this migration (created by `001_initial_schema.sql`) and is intentionally left untouched by `003` — its shape did not need to change.

---

## 4. The four core concepts

This is the schema's central design decision: separating four things a simpler system would collapse into one.

```text
Strategy    = WHICH ALGORITHM exists           → MA, RSI, BOLLINGER, SUPPORT_RESISTANCE
     │
Experiment  = ONE search run                    → "the search kicked off at 14:00 on 2026-08-24"
     │
Config      = HOW that search is configured     → timeframe 5m, 2026-01-01→2026-07-01, weights MA .3/RSI .3/BB .4, 50-iteration budget
     │
Candidate   = ONE concrete parameter combo      → MA(20,50) + RSI(14,30,70) + BB(20, 2.0)
```

**Why split them?** If Strategy and Candidate were the same table, every search run that generates 100 parameter combinations would insert 100 new "strategy" rows — `strategies` would grow without bound and stop meaning "algorithm". Splitting them keeps `strategies` at a small, stable set of immutable rows (4 SYSTEM strategies today), while every generated parameter variant lives in `candidate_strategies`.

**Where does weight live, and why?** `weight` — how much each strategy type counts toward a candidate's combined signal — belongs to the **Config**, not the Candidate. Within one search run the user fixes "I trust MA 30%, RSI 30%, BB 40%" and lets the engine search parameters; every candidate in that experiment shares that same weight set. Changing the weights is a different research question — it produces a new Experiment, leaving the old one intact for comparison.

---

## 5. Table groups

### 5.1 Authentication

| Table | Purpose |
|---|---|
| `users` | login accounts (email, bcrypt password hash, status, display name) |
| `refresh_tokens` | hashed long-lived refresh tokens, revocable |

### 5.2 Strategy

`strategies` holds a small, versioned, largely-immutable catalog — currently 4 `SYSTEM` rows (`MA`, `RSI`, `BOLLINGER`, `SUPPORT_RESISTANCE`). `owner_user_id` is `NULL` for `SYSTEM` strategies and required for `USER` / `AI_GENERATED` ones. Changing a strategy's logic/parameters creates a new `version` row rather than mutating an existing one, so a past experiment can always be traced back to the exact strategy version it used.

**Important:** the 4 `SYSTEM` strategy names must exactly match the `SearchStrategyType` union in `service/src/modules/strategy-search/domain/search.types.ts` — the application looks strategies up by name, so a mismatch fails at runtime, not at compile time.

### 5.3 Experiment & search configuration

- `experiments` — one search run, owned by a user (`user_id`), with a lifecycle `status` (`PENDING` / `RUNNING` / `COMPLETED` / `FAILED` / `CANCELLED`).
- `experiment_configs` — 1:1 with an experiment (`experiment_id` is `UNIQUE`); holds the dataset window (`timeframe`, `start_time`, `end_time`) and `iteration_limit`.
- `experiment_config_strategies` — which strategy types are enabled for this run and their `weight` (convention: `weight >= 0` and `SUM(weight) = 1` across a config, enforced at the application layer).

### 5.4 Iterations & Candidates

- `experiment_iterations` — one row per loop of the search engine, tracked with its own `status` and `error_message` (a failed iteration is still recorded, not discarded).
- `candidates` — the result of exactly one iteration (`iteration_id` is `UNIQUE`, a 1:1 relationship).
- `candidate_strategies` — the concrete generated `parameters` (as `jsonb`, since each strategy type has a different parameter shape) for each strategy member of a candidate. `jsonb` avoids an `ALTER TABLE` every time a new strategy type is added.

### 5.5 Backtest

- `backtest_runs` — 1:1 with a candidate; tracks background backtest execution status so the frontend can show progress without holding an HTTP request open.
- `trades` — simulated trades produced by a backtest run (side, entry/exit price and time, stop loss/take profit, P&L, exit reason).
- `evaluations` — 1:1 with a backtest run; the MVP-required metrics (total return, win rate, max drawdown, number of trades) plus profit factor, Sharpe ratio, and an `overall_score` used for ranking.

### 5.6 Leaderboard

- `leaderboards` — 1:1 with an experiment (not with a user). Ranking only makes sense among candidates evaluated under the *same* conditions (timeframe, date range, weights), so each experiment gets its own leaderboard; changing the configuration creates a new experiment and therefore a new leaderboard.
- `leaderboard_entries` — ranked candidates within a leaderboard, unique per `(leaderboard_id, candidate_id)` and per `(leaderboard_id, rank)`.

### 5.7 News

`news` stores crawled articles plus sentiment analysis output (`sentiment`, `sentiment_score`), deduplicated by `url`. The original design left this to a separate NoSQL store; the current schema keeps it in PostgreSQL to avoid operating a second database for this project's scope.

---

## 6. Business rules enforced at the application layer

SQL alone can't conveniently express these, so the backend enforces them:

1. `SUM(experiment_config_strategies.weight) = 1` within one config.
2. `weight >= 0`.
3. `end_time > start_time` in `experiment_configs`.
4. `iteration_limit > 0`.
5. `SYSTEM` strategies have no owner; `USER` / `AI_GENERATED` strategies require an authenticated owner.
6. A `leaderboard_entries.candidate_id` must belong to the same experiment as its leaderboard (a cross-table invariant a single FK can't express).
7. `strategies` rows are never updated in place — a change is a new `version` row.
8. `POST /market-data/import`'s `interval` must be one of the `app_timeframe` values (`1m` / `5m` / `15m` / `1h` / `4h`) — validated in `MarketDataService` before hitting Binance or the DB.

---

## 7. Related files

- `database/design.dbml` — the DBML schema kept in sync with this README and with the actual migration SQL.
- `database/migrations/003_candidate_auth_schema.sql` — the source of truth for the schema described here.
- `artifacts/database.md` — a more detailed Vietnamese-language walkthrough of this same schema, including the full relationship diagram.
- `docs/database/design.dbml` — the original target-schema design this migration was based on (kept for historical reference).
