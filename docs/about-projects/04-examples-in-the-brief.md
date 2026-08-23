# Examples Mentioned in the Brief

## Naming note

Where the PDF provides a numbered heading, that heading is retained as the title below. Where it says only “Example,” the title below is a descriptive label derived directly from the example's content; it does not add a new requirement.

## Project context and dashboard examples

### Five-Minute BTCUSDT Candlestick

A 09:00 BTCUSDT candle contains Open 118,000, High 118,200, Low 117,900, Close 118,150, and Volume 125 BTC.

### Strategy Behavior Under Different Market Conditions

MA is described as stronger in trending markets and weaker in sideways markets; RSI may identify overbought or oversold conditions but can produce false signals in a strong trend; Support/Resistance can identify important price areas, although the result depends on the algorithm.

### 3. A Complete Overall Example (`Một ví dụ tổng thể`)

The user selects BTCUSDT with 5m, 15m, 1h, and 4h charts; changes timeframes without a full reload; enables MA, RSI, Bollinger Bands, and Support/Resistance; creates Strategies A-E from their combinations; backtests them; and receives a ranked leaderboard.

### Historical BTCUSDT Dataset

BTCUSDT data from 01/07 to 30/07 is available at 1m, 5m, 15m, 1h, 4h, and 1d intervals for backtesting, indicators, ML training, and historical analysis.

### Real-Time BTC Price Ticks

The brief shows BTC changing from 118,021 to 118,028 to 118,017 across three seconds and rejects repeated `GET /price` polling as the frontend update model.

### Four Independent BTCUSDT Charts

Four charts show BTCUSDT at 5m, 15m, 1h, and 4h; each chart can independently switch among 1m, 5m, 15m, 1h, 4h, and 1d.

### Chart Overlay Example

A candlestick chart displays Resistance, Support, MA, BUY, and SELL information. The broader visualization list also includes Volume, Bollinger Bands, Entry, Stop Loss, and Take Profit.

## Market-data and strategy architecture examples

### Direct Binance Dependency Versus Market Data Adapter

The rejected example is `Frontend -> Binance API`. The preferred example is `Frontend -> Market Data Service -> Binance Adapter -> Binance`, allowing future Binance, OKX, Bybit, and Coinbase adapters without frontend changes.

### Normalized Strategy Contract

A `Strategy` analyzes a context and returns `BUY`, `SELL`, or `HOLD`; the context may include price, volume, candles, timeframe, indicators, market state, and sentiment.

### 7. Strategy Example 1 - Moving Average

MA20 and MA50 are used in a crossover strategy: MA20 crossing above MA50 produces BUY; crossing below produces SELL. `MAStrategy` has `fastPeriod = 20` and `slowPeriod = 50`, and contains only MA logic.

### 8. Strategy Example 2 - RSI

RSI below 30 produces BUY and RSI above 70 produces SELL. Parameter variants include RSI(14, 30, 70), RSI(14, 25, 75), and RSI(21, 30, 70).

### 9. Strategy Example 3 - Bollinger Bands

One rule buys below the Lower Band and sells above the Upper Band. A different rule buys when price breaks above the Upper Band, showing that one indicator can support multiple strategies.

### 10. Strategy Example 4 - Support/Resistance

A 110K Support and 120K Resistance area is shown. Price near Support produces BUY, price near Resistance produces SELL, and a breakout above Resistance can produce BUY.

### 11. Advanced Strategy - SMC and Wyckoff

MA, RSI, Bollinger, SMC, Wyckoff, and Sentiment strategies share the same Strategy abstraction. Full SMC and Wyckoff implementations are not mandatory; they demonstrate extensibility.

### Strategy Plugin Registration

After MA, RSI, and Bollinger exist, Support/Resistance is added by registering it instead of expanding a central `if/else` chain.

## Combination and search examples

### Composite Strategy Set

From MA, RSI, Bollinger, and Support/Resistance, the system can form MA+RSI, MA+Bollinger, MA+SR, RSI+Bollinger, RSI+SR, MA+RSI+SR, and other combinations.

### Majority Vote

MA=BUY, RSI=BUY, and SR=HOLD results in BUY. MA=BUY, RSI=SELL, and SR=BUY also results in BUY.

### 14. Weighted Combination

MA, RSI, and SR have weights 0.2, 0.3, and 0.5. BUY is +1, HOLD is 0, and SELL is -1. For MA=BUY, RSI=SELL, and SR=BUY, the score is 0.4; scores above 0.3 mean BUY, below -0.3 mean SELL, and otherwise HOLD.

### Four-Strategy Combination Search Space

MA, RSI, BB, and SR already produce many two- and three-strategy combinations. Parameter variants such as MA 10/20, 20/50, 50/200 and RSI 14/30/70, 14/20/80, 21/30/70 expand the space further.

### 16. Search Method 1 - Random Search

Successive loops randomly generate MA+RSI, BB+SR, MA+RSI+SR, and MA+BB+SR. Every combination is generated, backtested, evaluated, and ranked.

### 17. Search Method 2 - Domain-Guided Search

Strategies are grouped as Trend (MA, MACD), Momentum (RSI, Stochastic), Volatility (Bollinger, ATR), Structure (Support/Resistance, SMC, Wyckoff), and Information (News Sentiment). A composite may be required to contain one Trend, one Momentum, and one Structure strategy, producing MA+RSI+Support/Resistance rather than MA10+MA20+MA50.

### 18. Advanced Search Methods

Optional examples are Genetic Algorithm, Bayesian Optimization, Evolutionary Search, Reinforcement Learning, LLM-generated Strategy, Agent-based Search, AlphaEvolve-style optimization, and Loop Engineering.

## Backtesting, evaluation, and ranking examples

### 19. Backtesting Engine

Historical BTC prices from 01/01 to 01/03 are paired with four BUY/SELL signals. Two example trades produce one profit and one loss.

### 20. Evaluation Beyond Profit

Strategy A returns +30% but reaches -45% drawdown; Strategy B returns +25% with -8% maximum drawdown and may therefore be more stable. Example metrics include Total Return, Profit/Loss, Win Rate, Number of Trades, Maximum Drawdown, Profit Factor, and Sharpe Ratio.

### 21. Leaderboard

MA+RSI+SR, MA+BB, RSI+SR, and MA are ranked by Return, Win Rate, Maximum Drawdown, and Trades. The table may be sorted by Return, Win Rate, Max Drawdown, or Sharpe.

### Overall Score

An example ranking formula is `0.5 x Return + 0.2 x WinRate + 0.3 x RiskScore`; the group must clearly state its own calculation.

### 22. Top-K Strategies

With `K = 10`, a candidate scoring 82.1 replaces the current tenth-ranked strategy scoring 78.4.

### 23. Continuous Strategy Loop

Candidates #182-#185 pass through Generate, Backtest, Evaluate, Rank, and Leaderboard; candidate #184 becomes a new top strategy. Example stop conditions are 100 candidates, one hour, or no improvement for 50 iterations.

## Visualization, news, and sentiment examples

### 25. Strategy Visualization

Selecting `MA20 + RSI14 + SupportResistance` shows MA20, RSI signals, support zones, and buy/sell points on the BTCUSDT 15m chart.

### 26. Trade Detail

A table lists three trades with entry time, entry price, exit time, exit price, and result. Selecting Trade #3 highlights its ENTRY and EXIT on the chart.

### Cryptocurrency News Topics

Examples include Bitcoin ETF news, Federal Reserve interest rates, crypto regulation, an exchange hack, a blockchain upgrade, and institutional adoption.

### Normalized News Record

A collected item contains id, title, content, source, published and crawl times, related coins, and URL. The sample item is related to BTC and has a publication timestamp.

### Interchangeable News Providers

RSS, News API, and crawler providers all return the same `NewsItem` format so downstream modules do not depend on the source.

### 29. Sentiment Analysis

Institutional-adoption news is classified POSITIVE, a major exchange security breach is NEGATIVE, and a scheduled network upgrade is NEUTRAL. A stored result includes `sentiment: POSITIVE` and `score: 0.82`.

### 30. Sentiment Can Become a Strategy

Average one-hour sentiment above 0.7 produces BUY and below -0.7 produces SELL. `NewsSentimentStrategy` can combine with MA and RSI or with Support/Resistance.

## Architecture, data, and change examples

### 31. Suggested Overall Architecture

The reference example connects Frontend Dashboard through API/WebSocket to Backend, then separates Market Data, Strategy, and News services and the Combination, Backtesting, Evaluation, Ranking, and Sentiment paths.

### Replacing Random Search With Genetic Search

The maintainability example changes the search method while keeping the Backtester unchanged.

### 33. A Complete System Flow

For BTCUSDT at 5m, the system retrieves candles, generates MA20+RSI14+Support/Resistance, backtests 01/01-01/07, simulates 82 trades, evaluates Return 18.2%, Win Rate 61%, and MDD -6.1%, computes Score 81.4 and Rank #2, publishes `LEADERBOARD_UPDATED`, and refreshes the leaderboard without a page reload.

### 34. Event-Driven Decoupling

Instead of a Backtest Worker directly calling `LeaderboardService.update()`, it publishes `StrategyEvaluatedEvent`, which the Ranking Service receives.

### 35. Database Groups

The example data groups are Market Data, Strategy, Experiment, Trades, News, and Leaderboard. The Leaderboard may be stored directly or calculated from Experiment Results.

### 36. Versioned Strategy

`MA-RSI Strategy v1` uses MA20, MA50, and RSI14; version 2 uses MA10, MA30, and RSI21. Experiment #122 must remain linked to the exact version it used.

### 39. An Example for Understanding the Project Goal Correctly

The project is not “write MA+RSI to make money.” It is a system where MA+RSI can later be extended with SMC, Wyckoff, Sentiment, or a new strategy, and Random Search can later become Genetic Algorithm without rewriting downstream components.

### 41. Extensibility Evaluation Scenario

Adding MACD should require a `MACDStrategy` implementation and registry entry, not changes to the Controller, Backtester, UI, Database, Combination Engine, and Evaluator.

### 42. Changeability Evaluation Scenario

`RandomStrategyGenerator` is supplemented by `DomainGuidedStrategyGenerator`. Random, Domain-Guided, and Genetic generators share a `StrategyGenerator` contract, and downstream components receive only `CandidateStrategy`.

### 43. Scalability Evaluation Scenario

At two seconds per candidate, one worker takes 20,000 seconds for 10,000 candidates. The architecture example expands through a job queue to multiple workers.

### Architectural Decision Record Examples

The suggested ADR topics are WebSocket use, Plugin Architecture for strategies, Queue use for backtesting, and separation of the Sentiment Service.

### 46. Proposed Demo Scenario

The ten-step demo opens four real-time BTCUSDT charts, selects four strategies, starts search, shows tested/current candidates, updates the leaderboard, visualizes the top strategy, displays its metrics, shows news sentiment distribution, adds `SentimentStrategy`, and reruns the search with sentiment combinations.

