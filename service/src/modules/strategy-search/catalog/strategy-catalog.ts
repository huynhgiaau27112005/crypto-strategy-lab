import {
  CandidateMember,
  SearchStrategyType,
  StrategyDomain,
} from '../domain/search.types';

interface CatalogEntry {
  type: SearchStrategyType;
  domain: StrategyDomain;
  sample: (random: () => number) => CandidateMember;
}

function pick<T>(values: readonly T[], random: () => number): T {
  return values[Math.floor(random() * values.length)];
}

function member(
  type: SearchStrategyType,
  domain: StrategyDomain,
  parameters: Record<string, number>,
): CandidateMember {
  return { type, domain, pluginVersion: 1, parameters };
}

export const STRATEGY_CATALOG: Record<StrategyDomain, CatalogEntry> = {
  TREND: {
    type: 'MA',
    domain: 'TREND',
    sample(random) {
      const validPairs = [
        [10, 30],
        [10, 50],
        [20, 50],
        [20, 100],
        [50, 100],
        [50, 200],
      ] as const;
      const [fastPeriod, slowPeriod] = pick(validPairs, random);
      return member('MA', 'TREND', { fastPeriod, slowPeriod });
    },
  },
  MOMENTUM: {
    type: 'RSI',
    domain: 'MOMENTUM',
    sample(random) {
      return member('RSI', 'MOMENTUM', {
        period: pick([14, 21], random),
        buyThreshold: pick([25, 30, 35], random),
        sellThreshold: pick([65, 70, 75], random),
      });
    },
  },
  VOLATILITY: {
    type: 'BOLLINGER',
    domain: 'VOLATILITY',
    sample(random) {
      return member('BOLLINGER', 'VOLATILITY', {
        period: pick([20, 30], random),
        standardDeviation: pick([1.5, 2, 2.5], random),
      });
    },
  },
  STRUCTURE: {
    type: 'SUPPORT_RESISTANCE',
    domain: 'STRUCTURE',
    sample(random) {
      return member('SUPPORT_RESISTANCE', 'STRUCTURE', {
        lookback: pick([20, 50, 100], random),
        proximityPercent: pick([0.5, 1, 1.5], random),
      });
    },
  },
};
