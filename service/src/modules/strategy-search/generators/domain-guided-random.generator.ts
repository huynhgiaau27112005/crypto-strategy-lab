import { Injectable } from '@nestjs/common';
import { CatalogEntry, STRATEGY_CATALOG } from '../catalog/strategy-catalog';
import {
  CandidateDefinition,
  SearchAlgorithm,
  SearchConfig,
  StrategyDomain,
} from '../domain/search.types';

// One domain can now have more than one representative to draw from —
// the built-in plugin AND any of this run's enabled AI strategies whose
// domain matches (see StrategySearchService.run(), which builds this map
// per run from the actual weightRows the experiment was started with).
// Defaults to the built-in-only, single-entry-per-domain catalog so every
// existing call site/test that only ever exercised built-ins keeps
// behaving identically without passing this argument.
export type RunCatalog = Record<StrategyDomain, CatalogEntry[]>;

function defaultRunCatalog(): RunCatalog {
  return {
    TREND: [STRATEGY_CATALOG.TREND],
    MOMENTUM: [STRATEGY_CATALOG.MOMENTUM],
    VOLATILITY: [STRATEGY_CATALOG.VOLATILITY],
    STRUCTURE: [STRATEGY_CATALOG.STRUCTURE],
    INFORMATION: [STRATEGY_CATALOG.INFORMATION],
  };
}

@Injectable()
export class DomainGuidedRandomGenerator implements SearchAlgorithm<RunCatalog> {
  generate(
    random: () => number,
    config: SearchConfig,
    runCatalog: RunCatalog = defaultRunCatalog(),
  ): CandidateDefinition {
    const domains = this.pickValidDomains(random, config);
    const members = domains.map((domain) => {
      const entries = runCatalog[domain];
      const entry = entries[Math.floor(random() * entries.length)];
      return entry.sample(random);
    });

    return {
      schemaVersion: 1,
      combination: {
        method: 'WEIGHTED_VOTE',
        buyThreshold: 0.3,
        sellThreshold: -0.3,
      },
      members,
    };
  }

  private pickValidDomains(
    random: () => number,
    config: SearchConfig,
  ): StrategyDomain[] {
    const available = [...new Set(config.enabledDomains)];
    const directional = available.filter(
      (domain) => domain === 'TREND' || domain === 'STRUCTURE',
    );
    const confirmation = available.filter(
      (domain) => domain === 'MOMENTUM' || domain === 'VOLATILITY',
    );

    if (directional.length === 0 || confirmation.length === 0) {
      throw new Error(
        'Search requires a directional and a confirmation domain.',
      );
    }

    const selected = new Set<StrategyDomain>([
      directional[Math.floor(random() * directional.length)],
      confirmation[Math.floor(random() * confirmation.length)],
    ]);

    // INFORMATION is supplementary rather than directional/confirmation,
    // but when the user explicitly enables it they expect News Sentiment
    // to participate in the candidates being evaluated. Previously it was
    // left in the optional shuffled tail, so it could disappear from every
    // visible Top-K row regardless of the weight the user assigned it.
    if (available.includes('INFORMATION')) selected.add('INFORMATION');

    const upperBound = Math.min(config.maxMembers, available.length);
    if (selected.size > upperBound) {
      throw new Error(
        'maxMembers is too small for the required directional, confirmation and information domains.',
      );
    }
    const lowerBound = Math.max(
      selected.size,
      Math.min(config.minMembers, upperBound),
    );
    const memberCount =
      lowerBound + Math.floor(random() * (upperBound - lowerBound + 1));

    const shuffled = available.filter((domain) => !selected.has(domain));
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(random() * (index + 1));
      [shuffled[index], shuffled[swapIndex]] = [
        shuffled[swapIndex],
        shuffled[index],
      ];
    }
    for (const domain of shuffled) {
      if (selected.size >= memberCount) break;
      selected.add(domain);
    }
    return [...selected];
  }
}
