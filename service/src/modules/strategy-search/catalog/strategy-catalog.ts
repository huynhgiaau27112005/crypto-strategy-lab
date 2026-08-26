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
 * A built-in strategy's user-saved parameter version as a second,
 * additional catalog entry for its domain (pushed alongside the static
 * `STRATEGY_CATALOG[domain]` entry in `buildRunCatalog`, never replacing
 * it — see that call site's comment). Unlike the static entry's `sample`,
 * this one is fixed: it always returns the exact parameters the user
 * saved via `StrategyPluginService.saveVersion` (ParameterPanel's "Lưu
 * tham số → tạo version mới"), so that saving a new version actually
 * gives it a real chance to be generated, backtested, and ranked on the
 * Leaderboard by a future search — before this, a saved version only
 * changed which `strategies` row got pinned/displayed and never affected
 * what parameters `DomainGuidedRandomGenerator` actually tried.
 */
export function builtinPinnedEntry(
  type: SearchStrategyType,
  domain: StrategyDomain,
  parameters: Record<string, number>,
): CatalogEntry {
  return {
    type,
    domain,
    sample: () => member(type, domain, parameters),
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
