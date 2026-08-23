# Required Flows

This file lists behavior the brief requires the system to support. Optional advanced extensions are excluded unless they participate in a mandatory flow.

## 1. Historical market-data flow

`Binance -> Market Data Adapter/Service -> normalized candles -> storage or consuming modules`

- Covers pair, timeframe, timestamp, Open, High, Low, Close, and Volume.
- Supplies data for backtesting, indicator calculation, ML training, and historical analysis.
- Keeps Binance's native contract behind the market-data boundary.

## 2. Real-time market-data and UI flow

`Binance -> Market Data Adapter -> event/stream -> backend -> WebSocket -> frontend`

- New data reaches indicators, strategy processing, and the dashboard with low latency.
- The frontend receives pushed updates rather than repeatedly polling a price endpoint.
- Disconnect, reconnect, retry, and possible missing-candle handling are part of the required reliability design.

## 3. Multi-timeframe chart flow

`User selects pair and up to four timeframes -> each chart requests its own data -> only the changed chart refreshes`

- The dashboard supports no more than four simultaneous charts.
- Changing one timeframe does not reload the entire system or force the other charts to change.

## 4. Individual strategy-analysis flow

`Normalized market/context data -> selected Strategy -> normalized BUY/SELL/HOLD signal`

- Strategy context may include price, volume, candles, timeframe, indicators, market state, and sentiment.
- At least four individual strategies are required in the MVP.

## 5. Strategy plugin flow

`New Strategy implementation -> Strategy Registry registration -> availability to selection, combination, and backtesting`

- Adding a strategy affects the minimum possible existing code.
- The Strategy Engine does not gain a new hard-coded condition for each strategy.

## 6. Composite-strategy signal flow

`Multiple registered strategies -> individual signals -> combination rule -> one composite signal`

- The system must be able to create composite strategies.
- The combination rule may be majority vote, weighted scoring, or another clearly explained design.

## 7. Candidate-generation flow

`Search algorithm -> candidate strategy definition and parameters -> CandidateStrategy`

- At least one search method is required; Random Search is the stated minimum example.
- Search algorithms must remain replaceable without changing downstream backtesting.
- Domain-guided generation is described as a supported design example; advanced search algorithms are optional.

## 8. Search/backtest/evaluate/rank flow

`Generate candidate -> queue/work allocation -> backtest -> evaluate -> rank -> update Top-K leaderboard`

- Every generated candidate follows this lifecycle.
- Evaluation and strategy implementation remain separate.
- Candidate results can enter or displace entries in the Top-K leaderboard.

## 9. Historical trade-simulation flow

`Candidate + dataset + pair + timeframe + parameters -> chronological signals -> simulated entries/exits -> trades -> result`

- The output includes enough trade detail to support evaluation and visualization.
- The MVP must simulate trades over historical data.

## 10. Evaluation flow

`Backtest result and trades -> metrics -> ranking score`

- The MVP metrics are Return, Win Rate, Maximum Drawdown, and Number of Trades.
- The document also lists Profit/Loss, Profit Factor, and Sharpe Ratio as possible metrics.
- If an overall score is used, its calculation must be clearly presented.

## 11. Leaderboard update flow

`Strategy evaluated -> Ranking Service -> compare with current Top-K -> LeaderboardUpdated event -> frontend refresh`

- The leaderboard displays the current Top-K strategies.
- It can support sorting by Return, Win Rate, Maximum Drawdown, or Sharpe.
- Updates reach the frontend without a full page refresh.

## 12. Continuous strategy loop

`Generate -> execute/backtest -> measure/evaluate -> rank -> improve -> generate again`

- The loop repeats the candidate lifecycle in the background.
- It has a defined stop condition.
- Its state and progress are observable.
- It can be paused and resumed, and failed work can be retried.

## 13. Strategy-visualization flow

`User selects a strategy or leaderboard entry -> load its indicators, zones, signals, and trades -> overlay them on the chart`

- The MVP chart shows Buy/Sell and Entry/Exit.
- The document also describes MA, Bollinger Bands, Support/Resistance, Volume, Stop Loss, and Take Profit overlays where relevant to a strategy.

## 14. Trade-detail drill-down flow

`Strategy result -> trade table -> user selects one trade -> chart highlights its entry and exit`

- The trade table contains entry time and price, exit time and price, and result.

## 15. News collection and normalization flow

`RSS/News API/Crawler provider -> News Collector -> normalized NewsItem -> storage`

- A news item includes identity, title, content, source, timestamps, related coins, and URL.
- Changing the source does not change downstream consumers.

## 16. Sentiment-analysis flow

`Stored/collected news -> Sentiment Service/ML model -> POSITIVE, NEGATIVE, or NEUTRAL + score -> sentiment storage`

- Collection and sentiment analysis are separate stages.
- The MVP explicitly requires `Collect -> Store -> Analyze sentiment`.

## 17. Sentiment-as-strategy flow

`Aggregated sentiment -> NewsSentimentStrategy -> normalized trading signal -> normal combination/search path`

- This demonstrates that the Strategy Engine can include information beyond technical analysis.
- Sentiment combinations participate in the same composite, backtest, evaluation, and ranking lifecycle.

## 18. Event flow

The document identifies these possible domain events:

`MarketPriceUpdated -> CandleClosed -> StrategyGenerated -> BacktestStarted -> BacktestCompleted -> StrategyEvaluated -> LeaderboardUpdated`

It also identifies:

`NewsCollected -> SentimentAnalyzed`

The event names are examples for an event-driven architecture; the required architectural outcome is reduced coupling between producers and downstream consumers.

## 19. Experiment reproducibility flow

`Versioned strategy + parameters + dataset + timeframe -> experiment -> result + trades -> leaderboard traceability`

- Updating a strategy creates a new version rather than overwriting historical results.
- A leaderboard result remains traceable to the exact version that produced it.

## 20. Required end-to-end demo flow

`Open BTCUSDT with four real-time timeframes -> select strategies -> start search -> show tested/current candidates -> update leaderboard -> select the top strategy -> visualize signals and metrics -> show news sentiment -> add SentimentStrategy -> rerun search`

This demo flow joins the required market, strategy, search, backtest, evaluation, leaderboard, visualization, news, and sentiment capabilities.

## Flows explicitly required in the Architecture Document deliverable

The submitted Architecture Document must describe:

- Data Flow;
- Realtime Flow;
- Strategy Flow;
- Search/Backtest Flow.

