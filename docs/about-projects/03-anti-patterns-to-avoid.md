# Anti-Patterns to Avoid

## Anti-patterns explicitly named in the brief

### 1. God Service

Do not create one `TradingService` that simultaneously retrieves Binance data, calculates indicators, crawls news, runs machine learning, performs backtests, ranks strategies, saves data, and pushes WebSocket updates. This collapses unrelated responsibilities into one highly coupled component.

### 2. Hard-coded Strategy

Do not encode every supported combination as branches such as `if MA && RSI`, `else if MA && Bollinger`, and `else if RSI && Bollinger`. Adding or combining strategies must not require extending a central chain of conditions.

### 3. Frontend Contains Business Logic

Do not make React, Vue, or another frontend calculate trading strategies, execute backtests, calculate profit, or rank candidates. Those are domain responsibilities outside the presentation layer.

### 4. Strategy Accesses the Database Directly

Do not let a strategy such as `RSIStrategy` connect directly to MySQL or another database. A strategy should receive the market and contextual data it needs through an appropriate abstraction.

### 5. Crawler Is Tightly Coupled to Machine Learning

Do not connect a crawler directly to a specific model such as BERT. The crawler collects news; a separate Sentiment Service analyzes it.

## Other designs the brief explicitly rejects

### 6. Frontend Coupled Directly to Binance

Do not use `Frontend -> Binance API` or expose Binance's native data contract to the frontend. That design makes provider replacement affect the UI.

### 7. News System Coupled to One Crawler

Do not make the trading system depend directly on one website crawler. RSS, News API, and crawler providers must be replaceable behind a normalized news-provider contract.

### 8. Uncontrolled Infinite Search Loop

Do not run an unbounded `while (true)` search. The loop requires a defined stop condition, such as a candidate limit, time limit, or lack-of-improvement limit.

### 9. Monolithic Search and Backtest Function

Do not place indicator calculation, backtesting, database writes, and UI updates for every candidate inside one function. The document treats this as the poor implementation of the continuous loop because it obstructs workers, retries, pause/resume, progress tracking, search replacement, and future scaling.

### 10. Overwriting Strategy History

Do not overwrite old strategy results when parameters or logic change. A changed strategy receives a new version so previous experiments remain reproducible.

### 11. Technology for Its Own Sake

Do not treat the use of complex technology as an architectural achievement by itself. The group must show which architectural problem a technology solves.

