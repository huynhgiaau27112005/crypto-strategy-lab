# Strategy Engine Module Specification

## 1. Purpose

The Strategy Engine is the module through which external modules use trading strategies.

It accepts market input, applies the selected strategy, and returns the strategy's desired output. A strategy receives market data and produces a state or signal. The project brief allows signals to be standardized as either:

- `BUY`, `SELL`, `HOLD`; or
- `LONG`, `SHORT`, `NONE`.

The Strategy Engine must support different strategies without exposing their internal formulas or analysis rules. A new strategy must be addable without changing other modules or existing strategies.

## 2. Scope of this specification

This specification is limited to:

- the Strategy Engine description in the project brief;
- the requirement that a strategy contains Validation, Indicator, and Analyzer responsibilities;
- the proposed use of Abstract Factory to construct those components; and
- the proposed use of Facade as the single interface exposed to external modules.

It does not define programming-language syntax, concrete data structures, error formats, persistence, or framework choices because those details are not provided.

## 3. Module boundary

### 3.1 Public boundary

External modules import and use the **Strategy Engine interface**.

The Strategy Engine interface is a Facade. It hides:

- the selected strategy's concrete Validation class;
- the selected strategy's concrete Indicator class;
- the selected strategy's concrete Analyzer class;
- the concrete strategy factory; and
- the initialization and coordination of those objects.

External modules are not required or allowed to construct these internal components or coordinate their execution.

### 3.2 Internal boundary

Every concrete strategy is composed of three distinct responsibilities:

1. **Validation**
2. **Indicator**
3. **Analyzer**

These responsibilities are implemented as separate classes and are accessed internally through the Strategy Engine Facade.

## 4. Strategy components

### 4.1 Validation

Validation checks the input supplied by an external module before the strategy performs calculation or analysis.

Requirements:

- Every strategy has its own Validation class.
- Validation rules are unique to the selected strategy.
- Validation is performed inside the Strategy Engine boundary.
- External modules provide the input but do not call the Validation class directly.
- The Strategy Engine must not continue to Indicator or Analyzer with input that does not satisfy the selected strategy's validation.

The exact validation rules and the representation of a validation failure are not specified by the source material.

### 4.2 Indicator

Indicator calculates candlestick input according to the selected strategy's formula.

Requirements:

- Every strategy provides an Indicator class appropriate to that strategy.
- Indicator receives validated candlestick data.
- Indicator returns the calculated indicator output.
- Indicator output is passed to Analyzer.
- Indicator output is also available for chart visualization.
- Indicator does not analyze the output into trading states or signals.
- Indicator does not render the chart.

Indicator and Analyzer are separate because the indicator result has a purpose outside signal analysis: it is also consumed by chart visualization.

### 4.3 Analyzer

Analyzer interprets the output produced by Indicator.

Requirements:

- Every strategy provides an Analyzer class appropriate to that strategy's behavior.
- Analyzer receives calculated Indicator output rather than calculating the indicator itself.
- Analyzer produces states or signals for every requested timeframe within the specified period.
- Analyzer uses the Strategy Engine's standardized signal vocabulary.

The brief demonstrates that one indicator can support different analysis behavior. For example, Bollinger Bands can be analyzed as a lower-band/upper-band rule or as an upper-band breakout rule.

## 5. Public Strategy Engine interface

The Facade exposes the core business capabilities while hiding component creation and execution order.

### 5.1 Indicator calculation capability

The external module provides the selected strategy and its input to the Strategy Engine.

The Strategy Engine then:

1. initializes the selected strategy's internal components;
2. invokes the selected strategy's Validation;
3. invokes its Indicator with the validated candlestick data; and
4. returns the Indicator output.

This output can be consumed by chart visualization.

### 5.2 Analysis capability

The external module provides the selected strategy and its input to the Strategy Engine.

The Strategy Engine then:

1. initializes the selected strategy's internal components;
2. invokes the selected strategy's Validation;
3. invokes its Indicator with the validated candlestick data;
4. passes the Indicator output to its Analyzer; and
5. returns the resulting states or signals for the requested timeframes and period.

The caller receives the analysis result without separately invoking Validation, Indicator, or Analyzer. This prevents callers such as the Backtesting module from omitting a required internal step.

### 5.3 Encapsulation rule

The public interface does not expose factory methods for constructing Validation, Indicator, or Analyzer. Component creation belongs behind the Facade.

## 6. Abstract Factory role

The Strategy Engine uses Abstract Factory to represent the different families of strategy components.

Each concrete strategy factory provides the matching set of:

- one concrete Validation class;
- one concrete Indicator class; and
- one concrete Analyzer class.

Examples of concrete strategy families described by the brief include Moving Average, RSI, Bollinger Bands, and Support/Resistance.

The concrete factory is an internal construction mechanism. External modules do not call three factory methods and do not receive the three created components. The Facade uses the appropriate concrete factory and coordinates the resulting component family internally.

## 7. Facade role

Facade is the single entry point to the Strategy Engine.

Its responsibilities are limited to:

- accepting the selected strategy and external input;
- obtaining and initializing the matching strategy component family;
- enforcing Validation before calculation or analysis;
- coordinating Indicator calculation;
- coordinating Analyzer execution when analysis is requested; and
- returning Indicator output or Analyzer output to the caller.

The Facade prevents external modules from knowing how a strategy is constructed or how its internal components collaborate.

## 8. Strategy selection and registration

The project brief requires new strategies to be registered instead of added through a hard-coded `if/else` chain.

The Strategy Engine therefore recognizes a concrete strategy through its registration mechanism and uses the corresponding concrete factory behind the Facade.

The exact registration interface is not defined here. The architectural requirement is:

- registering a new strategy makes it available through the same public Strategy Engine interface;
- no existing strategy is modified;
- external modules are not modified; and
- the Strategy Engine does not gain strategy-specific conditional branches.

## 9. Adding a new strategy

A new strategy contributes:

1. its unique Validation class;
2. its Indicator class;
3. its Analyzer class; and
4. its concrete factory for creating that component family.

The new strategy is then registered with the Strategy Engine.

Adding it must not require changes to:

- existing strategies;
- the Backtesting module;
- the UI;
- the database;
- the Combination Engine;
- the Evaluator; or
- the public Strategy Engine interface.

This is the module's central extensibility requirement.

## 10. Input

External modules provide the strategy input through the Facade.

The supplied design explicitly requires:

- candlestick data;
- timeframe information; and
- a specific period.

The project brief also states that a strategy context may contain price, volume, candles, timeframe, indicators, market state, and sentiment.

The precise input schema is not defined by this specification. Regardless of representation, input is validated by the selected strategy's Validation component before use.

## 11. Output

The Strategy Engine has two kinds of output:

### 11.1 Indicator output

- Calculated from validated candlestick data.
- Specific to the selected strategy's formula.
- Available to Analyzer.
- Available to chart visualization.

### 11.2 Analyzer output

- Derived from Indicator output.
- Contains the strategy's states or signals for every requested timeframe in the specified period.
- Uses the system's standardized signal vocabulary.

The exact output structures are not defined by the source material.

## 12. Strategy examples from the project brief

### 12.1 Moving Average

- **Indicator:** calculates moving averages such as MA20 and MA50 from candlestick data.
- **Analyzer:** produces `BUY` when MA20 crosses above MA50 and `SELL` when MA20 crosses below MA50.

### 12.2 RSI

- **Indicator:** calculates an RSI value from 0 to 100.
- **Analyzer:** can produce `BUY` below a buy threshold and `SELL` above a sell threshold.

The brief shows that RSI periods and thresholds may vary between strategy configurations.

### 12.3 Bollinger Bands

- **Indicator:** calculates Upper Band, Middle Band, and Lower Band.
- **Analyzer:** may analyze price below the Lower Band and above the Upper Band, or may analyze an Upper Band breakout.

This example directly demonstrates why Indicator and Analyzer are separate: the same calculated indicator output can support different analysis purposes.

### 12.4 Support/Resistance

- **Indicator:** calculates Support and Resistance zones from candlestick data.
- **Analyzer:** may analyze price near Support, price near Resistance, or a Resistance breakout to produce signals.

## 13. Separation from other modules

The Strategy Engine and its concrete strategies do not contain:

- Binance access code;
- database persistence code;
- chart-rendering code; or
- notification code.

Strategy evaluation is also separate from strategy implementation. Backtesting and evaluation may consume Strategy Engine output, but their responsibilities are not part of this module.

## 14. Required constraints

1. External modules use one Strategy Engine interface.
2. External modules do not know or initialize Validation, Indicator, Analyzer, or concrete factories.
3. Every strategy has its own Validation, Indicator, and Analyzer component family.
4. Validation always precedes Indicator and Analyzer execution.
5. Indicator and Analyzer remain separate classes.
6. Indicator output is reusable by both Analyzer and chart visualization.
7. Analyzer returns states or signals for every requested timeframe in the specified period.
8. A new strategy is introduced through new components, its concrete factory, and registration.
9. Adding a strategy does not modify other modules or existing strategies.
10. The Strategy Engine does not use a hard-coded strategy-selection condition chain.
11. Strategy internals do not access Binance or the database and do not render charts or send notifications.
12. Strategy evaluation remains outside Strategy Engine implementation.

## 15. Acceptance conditions

The module satisfies this specification when:

- a client can request Indicator output through the Strategy Engine without constructing internal objects;
- a client can request analysis output through the Strategy Engine without separately calling Validation, Indicator, and Analyzer;
- strategy-specific input validation is performed automatically;
- Indicator output can serve both analysis and chart visualization;
- different concrete strategies remain accessible through the same public interface;
- a new strategy can be registered without modifying existing strategies or external modules; and
- internal strategy formulas and analysis rules remain hidden from clients.

## 16. Strategy Description

### SMA - Simple Moving Average

#### What is SMA?

The Simple Moving Average (SMA) is a technical indicator that calculates the average price of an asset over a specified number of periods.

It is commonly calculated using closing prices. Each price in the selected period has equal weight. As new price data becomes available, the oldest value is removed and the newest value is added, causing the average to move over time.

Strictly speaking, SMA is an **indicator**, not a complete trading strategy. A strategy is created by defining rules that interpret SMA values, price crossovers, or crossovers between multiple SMAs.

#### Formula

For a period of (n):
$$
[
SMA_n(t)=\frac{P_t+P_{t-1}+\cdots+P_{t-n+1}}{n}
]
$$
Where:

* (SMA_n(t)) is the SMA at time (t).
* (P_t) is the asset price at time (t), usually the closing price.
* (n) is the number of periods included in the calculation.

For example, a five-day SMA with closing prices of 10, 11, 12, 11, and 14 is:
$$
[
SMA_5=\frac{10+11+12+11+14}{5}=11.6
]
$$
At least (n) price records are normally required before the first (n)-period SMA value can be calculated.

#### Purpose

SMA is primarily used to:

* Smooth short-term price fluctuations and reduce market noise.
* Identify the general direction of a market trend.
* Compare short-term and long-term market movement.
* Identify possible dynamic support or resistance levels.
* Generate potential trend-change signals through crossovers.

A shorter-period SMA, such as SMA20, follows recent prices more closely but fluctuates more. A longer-period SMA, such as SMA200, produces a smoother line but reacts more slowly.

Because SMA is calculated from historical data, it is considered a **lagging indicator**. It confirms a movement after prices have already begun changing rather than reliably predicting the next movement.

#### How to analyze data using SMA

##### 1. SMA direction

The slope of the SMA helps describe the current trend:

* **Rising SMA:** indicates a possible uptrend.
* **Falling SMA:** indicates a possible downtrend.
* **Flat SMA:** suggests that the market may be consolidating or moving sideways.

SMA-based trend strategies are generally less reliable in sideways markets because prices may repeatedly cross the SMA and generate false signals.

##### 2. Price and SMA crossover

A price crossover compares the current price with one SMA:

* **Bullish price crossover:** price moves from below the SMA to above it. This may indicate increasing upward momentum or a potential uptrend.
* **Bearish price crossover:** price moves from above the SMA to below it. This may indicate increasing downward momentum or a potential downtrend.

A crossover should not automatically be treated as a buy or sell instruction. Traders commonly look for confirmation from the SMA’s direction, trading volume, or another indicator.

##### 3. Dual-SMA crossover

This technique compares a short-term SMA with a long-term SMA:

* When the short-term SMA crosses above the long-term SMA, it suggests that recent prices are becoming stronger than the longer-term average.
* When the short-term SMA crosses below the long-term SMA, it suggests that recent prices are becoming weaker than the longer-term average.

The two SMAs must use price data from the same asset and timeframe. For example, an SMA50 and SMA200 calculated from daily candles can be compared with each other.

##### 4. Golden cross

A **golden cross** occurs when a short-term SMA crosses above a long-term SMA. A commonly used configuration is:
$$
[
SMA_{50} \text{ crosses above } SMA_{200}
]
$$
This is interpreted as a potential bullish trend-change signal. Higher trading volume around the crossover may provide stronger confirmation.

##### 5. Death cross

A **death cross** occurs when a short-term SMA crosses below a long-term SMA. A common configuration is:
$$
[
SMA_{50} \text{ crosses below } SMA_{200}
]
$$
This is interpreted as a potential bearish trend-change signal.

##### 6. Dynamic support and resistance

In a trending market, an SMA may behave as a moving support or resistance level:

* During an uptrend, price may pull back toward the SMA and then continue upward, making the SMA a potential support level.
* During a downtrend, price may rise toward the SMA and then move downward again, making the SMA a potential resistance level.

These levels are not guaranteed. Price can break through an SMA without reversing.

#### Example analysis rules

A simplified SMA analysis system could classify market conditions as follows:

| Condition                                  | Possible interpretation      |
| ------------------------------------------ | ---------------------------- |
| Price above a rising SMA                   | Bullish trend                |
| Price below a falling SMA                  | Bearish trend                |
| Price repeatedly crossing a flat SMA       | Sideways or uncertain market |
| Short-term SMA crosses above long-term SMA | Potential bullish crossover  |
| Short-term SMA crosses below long-term SMA | Potential bearish crossover  |
| Price approaches SMA during an uptrend     | Possible dynamic support     |
| Price approaches SMA during a downtrend    | Possible dynamic resistance  |

#### Limitations

* SMA reacts after price changes because it uses historical data.
* Every price in the selected window receives equal weight, including older prices.
* Short-period SMAs can generate many false signals.
* Long-period SMAs may identify changes too late.
* Crossovers can produce repeated losing signals—known as whipsaws—in sideways or volatile markets.
* SMA alone cannot determine whether a trade will be profitable.

For stronger analysis, SMA signals can be evaluated alongside trading volume or indicators such as RSI, MACD, or Bollinger Bands.

### RSI - Relative Strength Index

#### What is RSI?

The Relative Strength Index (RSI) is a **momentum indicator** that measures the speed and magnitude of recent price changes.

It compares recent gains with recent losses and produces a value between **0 and 100**. RSI is normally displayed as a separate line below the asset’s price chart.

Strictly speaking, RSI is an indicator rather than a complete trading strategy. A strategy is created by defining rules based on RSI levels, crossovers, divergences, and the current market trend.

The standard RSI uses a **14-period look-back window**.

#### Formula

First, calculate the price change between consecutive periods:
$$
[
Change_t = Close_t - Close_{t-1}
]
$$
Separate each change into a gain or loss:
$$
[
Gain_t = \max(Change_t, 0)
]
$$
$$
[
Loss_t = \max(-Change_t, 0)
]
$$
The loss is stored as a positive magnitude.

For the initial 14-period calculation:

$$
[
AverageGain_{14}
================
\frac{\sum_{i=1}^{14} Gain_i}{14}
]
$$
$$
[
AverageLoss_{14}
================

\frac{\sum_{i=1}^{14} Loss_i}{14}
]
$$
Then calculate relative strength:

$$
[
RS = \frac{AverageGain}{AverageLoss}
]
$$

Finally:

$$
[
RSI = 100-\frac{100}{1+RS}
]
$$

After the initial value, Wilder’s smoothing method is normally used:

$$
[
AverageGain_t
=============

\frac{AverageGain_{t-1}\times 13+CurrentGain_t}{14}
]
$$

$$
[
AverageLoss_t
=============

\frac{AverageLoss_{t-1}\times 13+CurrentLoss_t}{14}
]
$$
These smoothed averages are then used to calculate the next RS and RSI values.

#### Required input data

RSI normally receives a sequence of closing prices:

```text
close[0], close[1], close[2], ..., close[n]
```

A 14-period RSI needs 14 price changes. Therefore, an implementation generally needs at least **15 closing prices** to calculate the first RSI value:

```text
15 closing prices → 14 price changes → first RSI value
```

Special cases should also be handled:

* If `averageLoss = 0`, RSI is normally treated as `100`.
* If `averageGain = 0`, RSI is normally treated as `0`.
* If both are zero, the market has not moved; the implementation must define a consistent neutral or unavailable result.

#### Purpose

RSI is primarily used to:

* Measure bullish and bearish price momentum.
* Identify potentially overbought or oversold conditions.
* Detect possible momentum changes.
* Confirm the strength or weakness of a trend.
* Find possible price reversals or pullbacks.
* Compare price movement with momentum through divergence.
* Provide confirmation for other indicators, such as SMA.

RSI generally works better in a ranging market than in a strongly trending market.

#### How to analyze data using RSI

##### 1. Overbought condition

An asset is commonly considered **overbought** when:

$$
[
RSI \geq 70
]
$$

This means recent upward movements have been relatively strong. It may indicate that the price is extended and could experience a correction.

However, an RSI above 70 does **not** guarantee an immediate reversal. During a strong uptrend, RSI may remain above 70 for an extended period.

A stronger bearish indication may occur when RSI:

1. Moves above 70.
2. Later crosses back below 70.

The return below 70 suggests that bullish momentum may be weakening.

##### 2. Oversold condition

An asset is commonly considered **oversold** when:

$$
[
RSI \leq 30
]
$$

This means recent downward movements have been relatively strong. It may indicate that selling pressure is becoming extended and that a recovery is possible.

However, an RSI below 30 does not guarantee an immediate upward reversal. During a strong downtrend, RSI may remain oversold while the price continues falling.

A stronger bullish indication may occur when RSI:

1. Moves below 30.
2. Later crosses back above 30.

The return above 30 suggests that bearish momentum may be weakening.

##### 3. Neutral level

The value `50` represents the midpoint of the RSI range:

* **RSI above 50:** bullish momentum may be stronger.
* **RSI below 50:** bearish momentum may be stronger.
* **RSI near 50:** momentum may be balanced or uncertain.

The 50 level can be used as a trend filter, but it should not be treated as a precise reversal signal.

##### 4. RSI ranges during trends

RSI should be interpreted within the context of the prevailing trend.

During an uptrend:

* RSI frequently moves between approximately 40 and 80.
* The 40–50 region may behave as momentum support.
* RSI may repeatedly reach or exceed 70.

During a downtrend:

* RSI frequently moves between approximately 20 and 60.
* The 50–60 region may behave as momentum resistance.
* RSI may repeatedly reach or fall below 30.

Therefore, fixed thresholds of 30 and 70 may need contextual interpretation during strong trends.

##### 5. Bullish divergence

A bullish divergence occurs when:

* Price creates a **lower low**.
* RSI creates a **higher low**.

```text
Price: lower low
RSI:   higher low
```

This indicates that price is still falling, but bearish momentum is becoming weaker. It may warn of a possible upward reversal.

##### 6. Bearish divergence

A bearish divergence occurs when:

* Price creates a **higher high**.
* RSI creates a **lower high**.

```text
Price: higher high
RSI:   lower high
```

This indicates that price is still rising, but bullish momentum is becoming weaker. It may warn of a possible downward reversal.

Divergence is only a warning. It can appear multiple times before the price actually reverses.

##### 7. Bullish swing rejection

A bullish swing rejection is formed when:

1. RSI enters the oversold region below 30.
2. RSI crosses back above 30.
3. RSI declines again but remains above 30.
4. RSI breaks above its previous local high.

This pattern suggests that bearish momentum failed to push RSI back into oversold territory.

##### 8. Bearish swing rejection

A bearish swing rejection is formed when:

1. RSI enters the overbought region above 70.
2. RSI crosses back below 70.
3. RSI rises again but remains below 70.
4. RSI breaks below its previous local low.

This pattern suggests that bullish momentum failed to push RSI back into overbought territory.

#### Example analysis rules

| Condition                                              | Possible interpretation                 |
| ------------------------------------------------------ | --------------------------------------- |
| RSI above 70                                           | Potentially overbought                  |
| RSI crosses below 70                                   | Bullish momentum may be weakening       |
| RSI below 30                                           | Potentially oversold                    |
| RSI crosses above 30                                   | Bearish momentum may be weakening       |
| RSI above 50                                           | Bullish momentum is relatively stronger |
| RSI below 50                                           | Bearish momentum is relatively stronger |
| Price makes a lower low while RSI makes a higher low   | Bullish divergence                      |
| Price makes a higher high while RSI makes a lower high | Bearish divergence                      |
| RSI remains around 40–50 during an uptrend             | Possible momentum support               |
| RSI remains around 50–60 during a downtrend            | Possible momentum resistance            |

#### Combining RSI with SMA

SMA can identify the broader trend, while RSI measures momentum within that trend.

A simplified combined analysis could use:

| SMA condition             | RSI condition           | Possible interpretation                               |
| ------------------------- | ----------------------- | ----------------------------------------------------- |
| Price above a rising SMA  | RSI recovers from 40–50 | Possible bullish trend continuation                   |
| Price above a rising SMA  | RSI crosses above 30    | Possible recovery, aligned with the trend             |
| Price below a falling SMA | RSI reverses from 50–60 | Possible bearish trend continuation                   |
| Price below a falling SMA | RSI crosses below 70    | Possible weakness, aligned with the trend             |
| Strong uptrend            | RSI above 70            | Strong momentum; not automatically a reversal         |
| Strong downtrend          | RSI below 30            | Strong bearish momentum; not automatically a reversal |

#### Limitations

* RSI may remain overbought or oversold for a long time during strong trends.
* Overbought does not automatically mean that the price will fall.
* Oversold does not automatically mean that the price will rise.
* Divergence may appear long before an actual reversal.
* Shorter RSI periods react faster but create more noise.
* Longer RSI periods are smoother but react more slowly.
* RSI can generate false signals if the broader market trend is ignored.
* RSI should generally be combined with trend, price-action, volume, or volatility analysis.

### Support and Resistance

#### What are support and resistance?

Support and resistance are price areas used in technical analysis to identify where the balance between supply and demand may change.

* **Support** is an area below or around the current price where buying demand may become strong enough to slow or reverse a decline. It behaves like a price floor.
* **Resistance** is an area above or around the current price where selling pressure may become strong enough to slow or reverse an advance. It behaves like a price ceiling.

Unlike SMA and RSI, support and resistance are not individual mathematical indicators with one standardized formula. They are analytical concepts that can be detected using historical price reactions, swing points, trendlines, moving averages, volume, and other methods.

A support-and-resistance strategy defines rules for:

1. Detecting important price zones.
2. Measuring their strength.
3. Determining whether price rejected or broke through a zone.
4. Producing an analytical signal from that behavior.

#### Required input data

A basic implementation normally receives OHLC candle data:

```text
timestamp
open
high
low
close
volume // optional but useful
```

Different fields serve different purposes:

* `high` helps identify resistance and swing highs.
* `low` helps identify support and swing lows.
* `close` helps confirm breakouts or rejections.
* `volume` can help measure the significance of a level or breakout.
* `timestamp` preserves candle order and allows timeframe analysis.

#### Formula

There is no universal support-and-resistance formula. The calculation depends on the selected detection method.

One common algorithmic method is **swing-point detection**.

##### Swing-high resistance

A candle at index (i) is a swing high when its high is greater than the highs of nearby candles:

$$
[
High_i = \max(High_{i-k}, \ldots, High_i, \ldots, High_{i+k})
]
$$

Where (k) is the number of candles inspected on each side.

The price near (High_i) becomes a resistance candidate.

##### Swing-low support

A candle at index (i) is a swing low when its low is lower than the lows of nearby candles:

$$
[
Low_i = \min(Low_{i-k}, \ldots, Low_i, \ldots, Low_{i+k})
]
$$

The price near (Low_i) becomes a support candidate.

Because markets rarely react at exactly the same price, nearby swing points should normally be grouped into **zones** instead of exact levels.

##### Zone tolerance

A level may be considered touched when the distance between price and the level is within a selected tolerance:

$$
[
\frac{|Price-Level|}{Level} \leq Tolerance
]
$$

For example, with a tolerance of (0.5%):

$$
[
Tolerance = 0.005
]
$$

The tolerance is an implementation parameter rather than a universal trading rule. It may also be derived from volatility using an indicator such as ATR.

#### Purpose

Support and resistance analysis is primarily used to:

* Identify areas where price previously stopped or reversed.
* Describe the upper and lower boundaries of a trading range.
* Detect possible breakouts and trend changes.
* Find potential areas of increased supply or demand.
* Evaluate whether a price movement is continuing or losing strength.
* Provide context for other indicators such as SMA and RSI.
* Define structured entry, exit, and invalidation rules in a backtest.

These levels reflect probabilities, not guaranteed barriers. Price may reverse before reaching a level, briefly move beyond it, or break through it completely.

#### How to identify support and resistance

##### 1. Historical horizontal levels

Inspect previous price movements for areas where price repeatedly stopped or reversed.

A support candidate may be identified when:

* Price declines toward an area.
* The decline stops.
* Price subsequently moves upward.
* A similar reaction occurs near that area multiple times.

A resistance candidate may be identified when:

* Price rises toward an area.
* The advance stops.
* Price subsequently moves downward.
* A similar reaction occurs near that area multiple times.

Repeated reactions usually make a level more significant.

##### 2. Trendlines

Support and resistance can move over time rather than remain horizontal.

* In an uptrend, a trendline connecting rising lows may act as dynamic support.
* In a downtrend, a trendline connecting falling highs may act as dynamic resistance.

A trendline is generally more meaningful when price has interacted with it multiple times. However, it should still be treated as an area rather than a perfectly precise line.

##### 3. Moving averages

A moving average can also act as dynamic support or resistance:

* During an uptrend, price may decline toward an SMA and then recover.
* During a downtrend, price may rise toward an SMA and then decline.

This creates a connection between SMA analysis and support-and-resistance analysis.

##### 4. Round numbers

Prices may react near psychologically significant round numbers because many market participants place decisions or orders around them.

Examples include:

```text
10
50
100
1,000
```

Round numbers should be treated as potential zones, not automatically accepted as valid levels.

##### 5. Volume

A price zone may be more significant when substantial trading activity previously occurred around it.

Higher volume can indicate that:

* More market participants interacted with that price.
* More participants may remember or respond to the level.
* A breakout supported by strong volume may be more meaningful.

Volume is supporting evidence rather than proof that a level will hold.

#### How to analyze price behavior

##### 1. Support rejection

A support rejection occurs when:

1. Price approaches or enters a support zone.
2. Sellers fail to move price substantially below it.
3. Price closes back above or moves away from the zone.

This suggests that buying demand may be overcoming selling pressure.

```text
Price falls → tests support → rejects support → moves upward
```

##### 2. Resistance rejection

A resistance rejection occurs when:

1. Price approaches or enters a resistance zone.
2. Buyers fail to move price substantially above it.
3. Price closes back below or moves away from the zone.

This suggests that selling pressure may be overcoming buying demand.

```text
Price rises → tests resistance → rejects resistance → moves downward
```

##### 3. Resistance breakout

A resistance breakout occurs when price moves through a resistance zone and confirms above it.

A stronger breakout may include:

* A close above the complete resistance zone.
* Increased trading volume.
* Follow-through from later candles.
* A successful retest of the former resistance.

```text
Price below resistance
        ↓
Price closes above resistance
        ↓
Former resistance may become support
```

##### 4. Support breakdown

A support breakdown occurs when price moves through a support zone and confirms below it.

A stronger breakdown may include:

* A close below the complete support zone.
* Increased trading volume.
* Continued downward movement.
* A failed attempt to move back above the former support.

```text
Price above support
        ↓
Price closes below support
        ↓
Former support may become resistance
```

##### 5. Role reversal

After a confirmed breakout, a level can change its role:

* Broken resistance may become new support.
* Broken support may become new resistance.

This is commonly evaluated through a retest:

1. Price breaks the original level.
2. Price returns toward the level.
3. The level holds from the opposite side.
4. Price continues in the breakout direction.

##### 6. Trading range

A trading range forms when price repeatedly moves between support and resistance without establishing a clear directional trend:

[
Support \leq Price \leq Resistance
]

Possible outcomes include:

* Price rejects support and returns toward resistance.
* Price rejects resistance and returns toward support.
* Price breaks above resistance.
* Price breaks below support.

A range remains valid only while its boundaries continue to contain price.

#### Measuring the strength of a zone

The importance of a support or resistance zone can be evaluated using several factors:

| Factor             | Interpretation                                                                 |
| ------------------ | ------------------------------------------------------------------------------ |
| Number of touches  | More confirmed reactions may make the zone more significant                    |
| Reaction size      | A strong movement away from the zone may indicate a stronger level             |
| Preceding movement | A level following a steep rise or decline may receive more attention           |
| Trading volume     | Higher activity near the zone may increase its significance                    |
| Timeframe          | Weekly or monthly zones are generally more significant than minute-level zones |
| Recency            | More recent levels may better represent current market behavior                |
| Confluence         | A zone supported by SMA, RSI, or another tool may carry more evidence          |

A useful implementation should avoid counting multiple adjacent candles from the same interaction as independent touches. They usually represent one test of the zone.

#### Example analysis rules

| Condition                                       | Possible interpretation            |
| ----------------------------------------------- | ---------------------------------- |
| Price enters support and closes above it        | Possible support rejection         |
| Price enters resistance and closes below it     | Possible resistance rejection      |
| Price closes above resistance                   | Possible bullish breakout          |
| Price closes below support                      | Possible bearish breakdown         |
| Broken resistance holds during a retest         | Resistance may have become support |
| Broken support rejects price during a retest    | Support may have become resistance |
| Price repeatedly moves between two zones        | Range-bound market                 |
| Level has several separated touches             | Potentially stronger level         |
| Breakout occurs with increased volume           | Stronger breakout confirmation     |
| Price briefly crosses a level but closes inside | Possible false breakout            |

#### Example signal classification

A support-and-resistance analyzer could produce signals such as:

```text
AT_SUPPORT
AT_RESISTANCE
SUPPORT_REJECTION
RESISTANCE_REJECTION
RESISTANCE_BREAKOUT
SUPPORT_BREAKDOWN
BULLISH_RETEST
BEARISH_RETEST
INSIDE_RANGE
NO_CLEAR_SIGNAL
```

These describe market conditions. A separate strategy component can convert them into `BUY`, `SELL`, or `HOLD` decisions based on additional confirmation and risk rules.

#### Combining support and resistance with SMA and RSI

| Support/resistance condition | SMA condition             | RSI condition                       | Possible interpretation       |
| ---------------------------- | ------------------------- | ----------------------------------- | ----------------------------- |
| Price rejects support        | Price above rising SMA    | RSI recovers from oversold or 40–50 | Bullish confirmation          |
| Price rejects resistance     | Price below falling SMA   | RSI falls from overbought or 50–60  | Bearish confirmation          |
| Price breaks resistance      | Price above rising SMA    | RSI above 50                        | Possible bullish continuation |
| Price breaks support         | Price below falling SMA   | RSI below 50                        | Possible bearish continuation |
| Price touches support        | SMA is flat               | RSI near 50                         | Weak or uncertain signal      |
| Price breaks resistance      | SMA trend remains bearish | RSI shows weak momentum             | Possible false breakout       |

#### Limitations

* Support and resistance zones are partly subjective.
* Different algorithms may detect different levels.
* A level can fail without warning.
* Price may temporarily cross a zone and then reverse, creating a false breakout.
* Excessive tolerance can merge unrelated levels.
* Insufficient tolerance can create too many nearly identical levels.
* Repeated testing can either validate a level or weaken it before a breakout.
* Historical reactions do not guarantee similar future behavior.
* Using future candles to confirm historical swing points can introduce **look-ahead bias** into a backtest.

For backtesting, a swing point that requires (k) future candles for confirmation must only become available at:

$$
[
ConfirmationIndex = SwingIndex + k
]
$$

Using it before that index would allow the strategy to access information that was not available at the time.

### Bollinger Bands

#### What are Bollinger Bands?

Bollinger Bands are a volatility-based technical indicator composed of three lines:

1. **Middle band:** a Simple Moving Average.
2. **Upper band:** the middle band plus a multiple of standard deviation.
3. **Lower band:** the middle band minus a multiple of standard deviation.

The standard configuration is:

```text
Period: 20
Standard-deviation multiplier: 2
Price source: Closing price
```

The bands expand when volatility increases and contract when volatility decreases.

Strictly speaking, Bollinger Bands are an indicator rather than a complete strategy. A strategy defines how band touches, breakouts, squeezes, and mean-reversion patterns are converted into signals.

#### Required input data

A basic implementation requires an ordered sequence of closing prices:

```text
timestamp
close
```

Complete OHLCV candles may also be useful:

```text
timestamp
open
high
low
close
volume
```

* `close` is normally used to calculate all three bands.
* `high` and `low` may help determine whether price touched a band.
* `volume` may help confirm potential breakouts.
* `timestamp` preserves candle order and timeframe consistency.

A 20-period Bollinger Bands calculation requires at least **20 closing prices** for its first result.

#### Formula

Let:

* (n) be the look-back period, normally 20.
* (k) be the standard-deviation multiplier, normally 2.
* (P_t) be the closing price at time (t).

##### Middle band

The middle band is an (n)-period SMA:

$$
[
Middle_t = SMA_n(t)
]
$$

$$
[
Middle_t =
\frac{P_t+P_{t-1}+\cdots+P_{t-n+1}}{n}
]
$$

##### Standard deviation

First, calculate how far each price is from the middle band:

$$
[
\sigma_t =
\sqrt{
\frac{
\sum_{i=0}^{n-1}(P_{t-i}-Middle_t)^2
}{n}
}
]
$$

##### Upper band

$$
[
Upper_t = Middle_t + k\sigma_t
]
$$

##### Lower band

$$
[
Lower_t = Middle_t - k\sigma_t
]
$$

With the standard configuration:

$$
[
Upper_t = SMA_{20}(t)+2\sigma_t
]
$$

$$
[
Lower_t = SMA_{20}(t)-2\sigma_t
]
$$

Different charting libraries may use population or sample standard deviation. Your implementation should choose one method explicitly and use it consistently during calculation and backtesting.

#### Additional measurements

##### Bandwidth

Bandwidth measures the distance between the bands relative to the middle band:

$$
[
Bandwidth_t =
\frac{Upper_t-Lower_t}{Middle_t}
]
$$

A percentage representation can also be used:

$$
[
BandwidthPercentage_t =
\frac{Upper_t-Lower_t}{Middle_t}\times100
]
$$

Interpretation:

* Smaller bandwidth means lower recent volatility.
* Larger bandwidth means higher recent volatility.

##### Percent B

Percent B describes where the price is positioned relative to the bands:

$$
[
%B_t =
\frac{Price_t-Lower_t}{Upper_t-Lower_t}
]
$$

Typical interpretation:

|      Percent B | Price position             |
| -------------: | -------------------------- |
| Greater than 1 | Above the upper band       |
|              1 | At the upper band          |
|            0.5 | At the middle of the bands |
|              0 | At the lower band          |
|    Less than 0 | Below the lower band       |

If `Upper = Lower`, Percent B is undefined because the denominator is zero. The implementation must handle this edge case.

#### Purpose

Bollinger Bands are primarily used to:

* Measure recent price volatility.
* Identify periods of volatility contraction and expansion.
* Show whether price is relatively high or low compared with recent prices.
* Detect potential consolidation and breakout conditions.
* Identify possible mean-reversion patterns.
* Provide dynamic price boundaries.
* Confirm observations from indicators such as SMA and RSI.

Bollinger Bands adapt to volatility:

* Higher standard deviation produces wider bands.
* Lower standard deviation produces narrower bands.

The bands do not predict the direction of the next price movement by themselves.

#### How to analyze data using Bollinger Bands

##### 1. Middle-band direction

Because the middle band is an SMA, its slope can provide trend context:

* **Rising middle band:** possible uptrend.
* **Falling middle band:** possible downtrend.
* **Flat middle band:** possible consolidation or range-bound market.

The upper and lower bands should be interpreted differently depending on this trend context.

##### 2. Upper-band touch

When price reaches or exceeds the upper band, it is statistically high relative to its recent range.

This can have two different interpretations:

* In a range-bound market, price may be extended and could return toward the middle band.
* In a strong uptrend, repeated upper-band touches may indicate strong bullish momentum and trend continuation.

Therefore:

```text
Upper-band touch ≠ automatic bearish reversal
```

##### 3. Lower-band touch

When price reaches or falls below the lower band, it is statistically low relative to its recent range.

Possible interpretations include:

* In a range-bound market, price may be extended and could return toward the middle band.
* In a strong downtrend, repeated lower-band touches may indicate strong bearish momentum and trend continuation.

Therefore:

```text
Lower-band touch ≠ automatic bullish reversal
```

##### 4. Bollinger Bounce

The Bollinger Bounce is a mean-reversion pattern commonly considered in range-bound markets.

A possible lower-band bounce occurs when:

1. Price reaches or crosses the lower band.
2. Price fails to continue downward.
3. Price moves back inside the bands.
4. Price begins moving toward the middle band.

A possible upper-band bounce is the opposite:

1. Price reaches or crosses the upper band.
2. Price fails to continue upward.
3. Price moves back inside the bands.
4. Price begins moving toward the middle band.

The middle band may become the initial mean-reversion target.

This pattern is less reliable during strong directional trends.

##### 5. Bollinger Squeeze

A Bollinger Squeeze occurs when the bands become unusually narrow.

```text
Decreasing volatility
        ↓
Bands contract
        ↓
Squeeze forms
        ↓
Possible volatility expansion
```

A squeeze suggests that the market is consolidating and that a larger price movement may follow.

However, the squeeze does not reveal the breakout direction. Direction must be determined from subsequent price action or other indicators.

An algorithm can detect a squeeze by comparing current bandwidth with historical bandwidth:

$$
[
Squeeze_t =
Bandwidth_t < Threshold
]
$$

The threshold might be:

* A fixed percentage.
* The lowest bandwidth over a look-back window.
* A selected historical percentile.
* A moving average of bandwidth.

For example:

$$
[
Bandwidth_t <
\min(Bandwidth_{t-m},\ldots,Bandwidth_{t-1})
]
$$

This identifies current bandwidth as the narrowest within the previous (m) periods.

##### 6. Bullish breakout

A possible bullish breakout occurs when:

1. The bands were previously narrow.
2. Price closes above the upper band.
3. The bands begin expanding.
4. Later candles continue upward.
5. Volume may increase.

```text
Squeeze → close above upper band → bands expand
```

A close outside the upper band can indicate momentum rather than an immediate overbought reversal.

##### 7. Bearish breakdown

A possible bearish breakdown occurs when:

1. The bands were previously narrow.
2. Price closes below the lower band.
3. The bands begin expanding.
4. Later candles continue downward.
5. Volume may increase.

```text
Squeeze → close below lower band → bands expand
```

A close below the lower band can indicate strong bearish momentum rather than an immediate oversold recovery.

##### 8. Band expansion

Expanding bands indicate rising volatility:

$$
[
Bandwidth_t > Bandwidth_{t-1}
]
$$

This can accompany:

* The beginning of a strong trend.
* Acceleration of an existing trend.
* Sudden or unusually large price movements.

Expansion measures volatility, not direction. The price’s position relative to the bands supplies directional context.

##### 9. Band contraction

Contracting bands indicate decreasing volatility:

$$
[
Bandwidth_t < Bandwidth_{t-1}
]
$$

This can indicate:

* Price consolidation.
* Reduced directional movement.
* Market uncertainty.
* A possible future breakout.

One narrowing period alone is generally insufficient to identify a meaningful squeeze.

##### 10. Walking the bands

During a strong trend, price may repeatedly touch or remain near one band:

* Repeated movement near the upper band can indicate a strong uptrend.
* Repeated movement near the lower band can indicate a strong downtrend.

This behavior is known informally as **walking the band**. Treating every touch as a reversal signal would work against the active trend.

#### Example analysis rules

| Condition                                         | Possible interpretation                        |
| ------------------------------------------------- | ---------------------------------------------- |
| Bands are narrow                                  | Low volatility or consolidation                |
| Bands begin expanding                             | Volatility is increasing                       |
| Price near upper band in a range                  | Relatively high price; possible mean reversion |
| Price near lower band in a range                  | Relatively low price; possible mean reversion  |
| Price repeatedly touches upper band               | Possible strong uptrend                        |
| Price repeatedly touches lower band               | Possible strong downtrend                      |
| Close above upper band after squeeze              | Possible bullish breakout                      |
| Close below lower band after squeeze              | Possible bearish breakdown                     |
| Price returns inside after crossing upper band    | Possible rejected upward move                  |
| Price returns inside after crossing lower band    | Possible rejected downward move                |
| Price moves from an outer band toward middle band | Possible mean reversion                        |
| Flat middle band with repeated band bounces       | Possible range-bound market                    |

#### Example signal classification

A Bollinger Bands analyzer could return signals such as:

```text
SQUEEZE
EXPANDING_VOLATILITY
ABOVE_UPPER_BAND
BELOW_LOWER_BAND
UPPER_BAND_REJECTION
LOWER_BAND_REJECTION
BULLISH_BREAKOUT
BEARISH_BREAKDOWN
UPPER_BAND_WALK
LOWER_BAND_WALK
MEAN_REVERSION_UP
MEAN_REVERSION_DOWN
INSIDE_BANDS
NO_CLEAR_SIGNAL
```

These signals describe current market conditions. A separate strategy component can combine them with trend and momentum information to produce `BUY`, `SELL`, or `HOLD`.

#### Combining Bollinger Bands with SMA and RSI

| Bollinger Bands condition     | SMA condition      | RSI condition              | Possible interpretation                     |
| ----------------------------- | ------------------ | -------------------------- | ------------------------------------------- |
| Price rejects lower band      | SMA is rising      | RSI recovers from oversold | Bullish mean-reversion confirmation         |
| Price rejects upper band      | SMA is falling     | RSI falls from overbought  | Bearish mean-reversion confirmation         |
| Price closes above upper band | SMA is rising      | RSI above 50               | Possible bullish continuation               |
| Price closes below lower band | SMA is falling     | RSI below 50               | Possible bearish continuation               |
| Bands contract                | SMA is flat        | RSI near 50                | Consolidation with no confirmed direction   |
| Bands expand upward           | SMA turns upward   | RSI momentum increases     | Possible bullish breakout                   |
| Bands expand downward         | SMA turns downward | RSI momentum decreases     | Possible bearish breakdown                  |
| Price reaches upper band      | Strong rising SMA  | RSI remains strong         | May represent momentum rather than reversal |
| Price reaches lower band      | Strong falling SMA | RSI remains weak           | May represent momentum rather than reversal |

#### Implementation considerations

##### Price touch versus close

Define whether a band interaction uses the candle’s high/low or closing price:

```text
Upper-band touch: high >= upperBand
Upper-band close: close >= upperBand

Lower-band touch: low <= lowerBand
Lower-band close: close <= lowerBand
```

A wick touching a band is different from the candle closing beyond it. Closing prices generally provide stronger confirmation but react later.

##### Breakout confirmation

To reduce false breakouts, an implementation can require:

* A close beyond the band.
* A minimum distance beyond the band.
* Multiple consecutive closes.
* Rising bandwidth.
* Higher volume.
* Confirmation from SMA, RSI, or support and resistance.

These are configurable strategy rules rather than part of the Bollinger Bands formula.

##### Rolling calculation

For every new candle:

1. Add the newest closing price.
2. Remove the oldest closing price from the 20-period window.
3. Recalculate the SMA.
4. Recalculate standard deviation.
5. Calculate the new upper and lower bands.

For a large backtest, rolling sums and rolling squared sums can reduce repeated computation, although care should be taken with floating-point precision.

#### Limitations

* Bollinger Bands are based on historical prices and react after volatility changes.
* A band touch is not automatically a reversal.
* Prices can remain outside a band during strong trends.
* A squeeze predicts possible volatility expansion but not its direction.
* Standard settings may not suit every asset or timeframe.
* Financial prices do not always follow a normal distribution.
* Extreme movements occur more often than a simple two-standard-deviation interpretation may suggest.
* Different standard-deviation implementations can produce slightly different results.
* Bollinger Bands can generate false signals when used without trend, momentum, price-action, or volume confirmation.
