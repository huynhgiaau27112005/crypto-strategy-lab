# What Is This Project?

## Project definition

**Crypto Strategy Lab** is a final-term software architecture project for building a platform that can analyze, combine, backtest, compare, and visualize cryptocurrency trading strategies.

The platform uses cryptocurrency market data from Binance, supports real-time and historical analysis, and treats a trading strategy as a replaceable component that produces a normalized signal such as `BUY`, `SELL`, or `HOLD`. Multiple strategies can be combined into composite strategies, evaluated through historical trade simulation, ranked on a leaderboard, and repeatedly searched for better candidates.

The project is **not** intended to prove that any strategy can make real money. Its purpose is to demonstrate a software architecture that can systematically test strategy ideas and remain workable when strategies, search algorithms, market-data providers, data volume, and machine-learning models change.

## Functional scope described by the brief

The platform is expected to provide:

1. Historical and real-time cryptocurrency market data from Binance.
2. A real-time candlestick dashboard with up to four independently selectable timeframes.
3. A strategy engine with a normalized signal contract.
4. Easy registration of new strategy plugins.
5. Composite strategies made from multiple individual strategies.
6. Historical backtesting and simulated trades.
7. Evaluation using both return and risk-related metrics.
8. A Top-K strategy leaderboard.
9. Automated candidate generation and continuous strategy search.
10. Chart visualization of signals, entries, exits, and relevant indicators or zones.
11. Cryptocurrency news collection through interchangeable providers.
12. Machine-learning sentiment analysis whose output can also participate as a strategy.

## Minimum required product (MVP)

The brief defines this minimum scope:

- **Market:** Binance data, candlestick charts, real-time updates, and up to four timeframes.
- **Strategies:** at least four individual strategies, with MA, RSI, Bollinger Bands, and Support/Resistance given as examples.
- **Combination:** the ability to create composite strategies.
- **Backtesting:** simulated trading over historical data.
- **Evaluation:** at least Return, Win Rate, Maximum Drawdown, and Number of Trades.
- **Search:** at least one search method; Random Search is the stated example.
- **Leaderboard:** Top-K strategies.
- **Visualization:** Buy/Sell and Entry/Exit markers on charts.
- **News:** a Collect -> Store -> Analyze Sentiment pipeline.

## Optional extensions, not minimum requirements

The document labels the following as extensions rather than mandatory scope: genetic/evolutionary/Bayesian/LLM-based search, long/short and advanced order management, multiple coins or exchanges, price prediction, market-regime detection, and architecture technologies such as Redis, Kafka/RabbitMQ, worker pools, microservices, CQRS, and Event Sourcing.

## One-sentence summary

The project is an extensible, observable experiment platform that turns a new strategy into a repeatable lifecycle: **plug in -> combine -> backtest -> evaluate -> compare -> rank -> visualize -> improve**.

