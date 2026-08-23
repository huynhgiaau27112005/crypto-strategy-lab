export abstract class BaseStrategy {
  abstract analyze(): void;
}

/*
BaseIndicator
-> SMAIndicator

BaseStrategy
-> SMAStrategy

indicator.calculate() -> strategy.analyze(context);
context = { calculateResults, etc. }

BaseFacade
SMAFacade(validation, indicator, strategy)

Validation -> Indicator -> Analyze

BaseValidation
-> SMAValidation?

*/

// Need to calculate the weighted