# Strategy Plugin Module Specification

## 1. Purpose

The Strategy Plugin module controls which strategies are available to the rest of the system.

It provides a registry interface above the Strategy Engine Facade. Other modules access this registry to discover and use registered strategies. They do not access concrete strategy implementations, factories, Validators, Indicators, or Analyzers.

The module also admits newly generated Python strategy files into the registry so that an accepted strategy can be reused later.

## 2. Architectural position

The two module boundaries have different responsibilities:

- **Strategy Engine:** provides one Facade for executing a strategy while hiding its Validation, Indicator, Analyzer, and construction process.
- **Strategy Plugin:** registers Strategy Engine-compatible strategies, controls which ones are exposed, and provides the system-level access point for using them.

External modules use the Strategy Plugin registry. The registry resolves the requested registered strategy and delegates strategy calculation or analysis to its Strategy Engine Facade.

## 3. Core responsibilities

The Strategy Plugin module is responsible for:

1. maintaining the registry of configured strategies;
2. exposing only registered strategies to other modules and users;
3. providing one registry interface for discovering and using those strategies;
4. connecting each registered strategy to its Strategy Engine Facade;
5. accepting a generated `.py` strategy file after generation is complete;
6. ensuring that the generated strategy is compatible with the Strategy Engine contract;
7. registering an accepted generated strategy; and
8. keeping an accepted strategy available for later reuse.

## 4. Public boundary

The registry class is the public boundary of this module.

Other modules may use the registry to:

- obtain the strategies currently available in the system;
- select one of those registered strategies;
- request indicator calculation through the selected strategy; and
- request analysis through the selected strategy.

The exact method names and data structures are not specified by the source material.

The registry hides:

- concrete strategy code;
- strategy factories;
- Validation, Indicator, and Analyzer classes;
- strategy initialization;
- generated Python file integration; and
- the internal collection of registered entries.

## 5. Registry availability rule

The registry is the source of strategy availability.

- A strategy configured in the registry is available to users and other modules.
- A strategy that exists in the codebase but is not configured in the registry is not exposed.
- Registering one strategy does not automatically expose every strategy present in the system.
- External modules must not bypass the registry to use an unregistered strategy.

### Example

Assume the system contains three strategy implementations:

- Strategy A
- Strategy B
- Strategy C

If only Strategy A and Strategy B are configured in the registry, the system exposes only Strategy A and Strategy B. Strategy C remains unavailable through the module's public interface.

## 6. Registered strategy contract

A registry entry represents a strategy that is usable through the Strategy Engine Facade.

The registered strategy must conform to the Strategy Engine specification. It therefore provides the matching strategy family containing:

1. a strategy-specific Validation class;
2. an Indicator class;
3. an Analyzer class; and
4. the concrete factory used by the Strategy Engine Facade to initialize those components.

The registry does not expose these objects. It exposes the registered strategy through the common Strategy Engine behavior.

## 7. Registration flow

For an existing strategy, the required flow is:

`Strategy implementation -> Strategy Engine-compatible Facade/factory -> Strategy Plugin registry -> available strategy`

The registration result is binary from the availability perspective:

- registered: the strategy is exposed;
- not registered: the strategy is not exposed.

The project brief illustrates registration with `register(SupportResistance)` and `StrategyRegistry.register(MACDStrategy)`. These are examples rather than mandated method signatures.

## 8. Using a registered strategy

The use flow is:

`External module -> Strategy Plugin registry -> registered strategy -> Strategy Engine Facade -> result`

The registry:

1. receives a request for a strategy that is available in the registry;
2. resolves the corresponding registered strategy;
3. delegates the requested calculation or analysis to its Strategy Engine Facade; and
4. returns the Facade result to the caller.

The caller does not initialize or invoke Validation, Indicator, or Analyzer directly.

## 9. User-provided strategy prompt

The system allows a user to provide material describing a new strategy. That material may be:

- a URL about the strategy;
- a textual strategy description; or
- other prompt content supplied by the user.

An LLM or another generator converts that material into a Python strategy file.

Prompt interpretation, source retrieval, strategy design, and Python code generation are outside the Strategy Plugin module. This module's responsibility begins when the generated `.py` file is available for plugin admission.

## 10. Generated Python plugin flow

The required flow is:

`User prompt -> LLM or other generator -> generated .py strategy -> Strategy Plugin admission -> registry -> reusable strategy`

After receiving the generated `.py` file, the Strategy Plugin module:

1. checks whether the generated strategy conforms to the registered strategy contract;
2. ensures that it can be used through the Strategy Engine Facade;
3. prevents it from becoming available when it does not satisfy that contract;
4. registers it when it satisfies the contract; and
5. keeps the accepted strategy available for later reuse.

The exact compatibility-checking mechanism and failure representation are not specified.

## 11. Reusability

An accepted generated strategy is not limited to the request in which it was created.

The module must preserve enough information for the strategy to remain available for later reuse through the registry. This includes the accepted strategy file and its registration state.

The exact persistence technology and storage location are not defined by this specification.

## 12. Strategy versioning

The project brief requires strategies to have versions so that previous experiment results remain reproducible.

Therefore:

- a registered strategy has a version;
- a changed generated strategy must not overwrite the version used by an earlier experiment;
- an earlier experiment remains associated with the exact strategy version it used; and
- the registry must not make an updated implementation indistinguishable from the earlier version.

The version format is not specified.

## 13. Extensibility requirement

Adding a new strategy plugin must have minimal impact on existing code.

A new plugin is added through:

1. a new Strategy Engine-compatible strategy implementation;
2. its concrete strategy factory; and
3. registration in the Strategy Plugin registry.

Adding it must not require modification of:

- existing strategies;
- the Strategy Engine's common Facade interface;
- the Controller;
- the Backtester;
- the UI;
- the database;
- the Combination Engine; or
- the Evaluator.

## 14. Separation of responsibilities

The Strategy Plugin module does not:

- calculate indicators itself;
- analyze indicator output itself;
- implement strategy-specific Validation;
- generate the Python strategy file;
- retrieve or interpret URLs supplied in prompts;
- backtest strategies;
- evaluate or rank strategy performance;
- render charts;
- retrieve Binance data; or
- access strategy data on behalf of a concrete strategy.

Calculation and analysis belong to Strategy Engine. Generation belongs to the LLM or other generator. Backtesting, evaluation, visualization, and market data remain responsibilities of their corresponding modules.

## 15. Prohibited designs

### 15.1 Hard-coded strategy selection

The registry must not be replaced by a strategy-specific condition chain such as:

```text
if strategy == MA ...
else if strategy == RSI ...
else if strategy == Bollinger ...
else if strategy == SupportResistance ...
```

### 15.2 Automatic exposure of every implementation

The presence of a strategy implementation or `.py` file must not automatically make it available. Availability is determined by registry configuration and successful plugin admission.

### 15.3 Registry bypass

External modules must not instantiate or invoke concrete strategy plugins directly. They use the registry interface.

### 15.4 Client-managed plugin internals

External modules must not load the generated file, create its factory, or assemble its Validation, Indicator, and Analyzer components themselves.

## 16. States of a generated strategy

Only the following distinctions are required by this specification:

- **Generated but not registered:** a `.py` file exists but is not exposed to users.
- **Registered:** the strategy has passed plugin admission and is available through the registry.
- **Not accepted:** the generated strategy does not satisfy the Strategy Engine-compatible contract and is not exposed.

No additional lifecycle states are defined.

## 17. Unspecified concerns

The supplied requirements do not define:

- the registry's concrete API;
- the generated Python file format beyond Strategy Engine compatibility;
- the LLM or other generation mechanism;
- dependency installation for a generated file;
- code-execution isolation or security policy;
- duplicate strategy-name handling;
- replacement or removal behavior;
- the exact compatibility checks;
- the failure and error model;
- the persistence technology; or
- whether registration changes require a running-system reload.

This specification does not infer decisions for those concerns.

## 18. Required constraints

1. Other modules access strategies only through the Strategy Plugin registry.
2. Only configured and successfully registered strategies are exposed.
3. A strategy that is not in the registry is unavailable even if its implementation exists.
4. Every registered strategy is usable through the common Strategy Engine Facade behavior.
5. The registry hides concrete strategy components and construction.
6. A generated `.py` strategy is checked for Strategy Engine compatibility before registration.
7. An incompatible generated strategy is not exposed.
8. An accepted generated strategy can be reused later.
9. Strategies retain version identity for reproducibility.
10. Adding a strategy does not add a hard-coded strategy branch.
11. Adding a strategy does not require changes to existing strategies or consuming modules.
12. Prompt-to-Python generation remains outside this module.

## 19. Acceptance conditions

The Strategy Plugin module satisfies this specification when:

- a system containing three strategy implementations can expose only two by configuring only those two in the registry;
- external modules can discover and use the two registered strategies through one registry interface;
- the unregistered third strategy cannot be accessed through that interface;
- a generated `.py` strategy that satisfies the Strategy Engine contract can be admitted and registered;
- an incompatible generated `.py` strategy is not exposed;
- an accepted generated strategy remains available for future reuse;
- registered strategies are executed through their Strategy Engine Facades; and
- adding a new registered strategy does not require modification of existing strategies or consuming modules.
