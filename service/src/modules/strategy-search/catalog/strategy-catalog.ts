import {
  CandidateMember,
  SearchStrategyType,
  StrategyDomain,
} from '../domain/search.types';

export interface CatalogEntry {
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
  INFORMATION: {
    type: 'NEWS_SENTIMENT',
    domain: 'INFORMATION',
    sample(random) {
      return member('NEWS_SENTIMENT', 'INFORMATION', {
        lookbackHours: pick([6, 12, 24, 48], random),
        buyThreshold: pick([0.2, 0.3, 0.5], random),
        sellThreshold: pick([-0.2, -0.3, -0.5], random),
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

/**
 * One built-in strategy VERSION as a catalog entry — the unit the
 * generator now samples over (see StrategySearchService.buildRunCatalog).
 *
 * `sample` ignores `random` on purpose: a version IS a fixed parameter
 * set, so there is nothing left to randomise once the version is chosen.
 * The randomness lives one level up, in which version gets picked. That is
 * what keeps "which version" and "which parameters" the same fact, instead
 * of two independently-decided things that can disagree.
 */
export function versionCatalogEntry(row: {
  id: string;
  type: SearchStrategyType;
  domain: StrategyDomain;
  version: number;
  parameters: Record<string, number>;
}): CatalogEntry {
  return {
    type: row.type,
    domain: row.domain,
    sample: () => ({
      type: row.type,
      domain: row.domain,
      pluginVersion: row.version,
      strategyId: row.id,
      parameters: row.parameters,
    }),
  };
}

/**
 * One AI strategy's catalog entry — unlike a built-in's, its "sample" is
 * fixed (no numeric parameter space to explore; the source code is what
 * it is for this pinned version), so it always returns the same member
 * for a given strategyId/version regardless of `random`. `pluginVersion`
 * carries the AI strategy's own `strategies.version`, so the resulting
 * candidate stays reproducible even if the user later saves a new version
 * under the same name (see search.types.ts's strategyTypeKey/AI:<id> doc
 * comment — `type` itself already pins the exact row).
 */
export function aiCatalogEntry(row: {
  id: string;
  domain: StrategyDomain;
  version: number;
}): CatalogEntry {
  const type: SearchStrategyType = `AI:${row.id}`;
  return {
    type,
    domain: row.domain,
    sample: () => ({
      type,
      domain: row.domain,
      pluginVersion: row.version,
      parameters: {},
    }),
  };
}
