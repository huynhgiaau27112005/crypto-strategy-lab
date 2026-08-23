# Architecture Goals

## Primary goal

The primary goal is to prove that the system's parts can **change, expand, and operate independently** while the full platform remains correct, observable, maintainable, and capable of long-term development. Finding the most profitable investment strategy is explicitly not the goal.

## Required architectural qualities

### 1. Modifiability and extensibility

- A new strategy, such as MACD, SMC, Wyckoff, or Sentiment, should be addable with minimal impact on existing components.
- Adding a strategy must not require rewriting the Strategy Engine or changing unrelated modules.
- A new search algorithm must be replaceable without rewriting the Backtester, Evaluator, Leaderboard, or Visualization components.
- A new market-data provider must not force the frontend to change.

### 2. Separation of responsibilities

- A strategy is responsible only for its analysis logic.
- Strategy implementation and strategy evaluation are separate concerns.
- Candidate generation, job handling, backtesting, evaluation, ranking, visualization, persistence, news collection, and sentiment analysis are separate responsibilities.
- The frontend presents information and interactions; it does not own trading, backtesting, profit, or ranking rules.

### 3. Stable abstractions and low coupling

- The frontend depends on a market-data service rather than Binance's native data structure.
- Exchange-specific behavior sits behind market-data adapters.
- Strategies receive the data they need through an appropriate abstraction rather than directly reading a database.
- News providers return one normalized news format.
- News collection is independent from the machine-learning sentiment model.
- Downstream components consume a common candidate-strategy representation and do not need to know how a candidate was generated.

### 4. Scalability and performance

- The architecture must have a credible path from a small number of strategies to as many as 100,000 candidates.
- Large backtest workloads must be separable into independently processable work rather than one monolithic function.
- The architecture should allow additional workers and future scaling without changing strategy definitions or evaluation rules.

### 5. Real-time behavior

- New Binance data must be able to flow through market data, indicators, strategies, and the UI with low latency.
- Dashboard and leaderboard updates must arrive without full-page refreshes.
- Each of the four charts must be independently refreshable when its timeframe changes.

### 6. Reliability and recoverability

- The architecture must address exchange disconnections, reconnection, retry behavior, and the possibility of missing candles.
- Failure of the News Service should not prevent the charting path from continuing.
- Backtest work should support failure isolation and retry.
- The continuous search loop must have an explicit stop condition and must be pausable and resumable.

### 7. Maintainability

- Strategy Search must not be tightly coupled to one Backtesting implementation.
- The architecture must allow a search method such as Random Search to be replaced by Genetic Search while leaving downstream components intact.
- Component responsibilities and data boundaries must remain explicit.

### 8. Observability

The system should expose at least:

- whether the search loop is running or stopped;
- how many strategies have been tested;
- backtest duration;
- failed-job count;
- progress and current candidate;
- the current top-ranked strategy.

### 9. Reproducibility and correctness

- Every strategy definition has a version.
- Old experiment results are not overwritten when a strategy changes.
- Every experiment remains traceable to the exact strategy version, parameters, dataset, timeframe, result, and trades that produced it.
- Leaderboard results must be attributable to their originating strategy version.

## Architectural shape stated by the brief

The brief characterizes the project as a combination of:

- a real-time system;
- plugin architecture;
- a data pipeline;
- event-driven architecture;
- an experiment platform;
- a verification and improvement loop.

Its suggested logical decomposition includes Frontend Dashboard, Backend, Market Data Service and adapters, Strategy Service and registry, Combination Engine, Backtester, Evaluator, Leaderboard, News Service and providers, Sentiment Service, and sentiment persistence. This decomposition is a reference, not a mandated topology; the group may propose another architecture if its choices are justified.

