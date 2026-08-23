import { Injectable } from '@nestjs/common';
import { STRATEGY_CATALOG } from '../catalog/strategy-catalog';
import {
  CandidateDefinition,
  SearchAlgorithm,
  SearchConfig,
  StrategyDomain,
} from '../domain/search.types';

@Injectable()
export class DomainGuidedRandomGenerator implements SearchAlgorithm {
  generate(random: () => number, config: SearchConfig): CandidateDefinition {
    const domains = this.pickValidDomains(random, config);
    const members = domains.map((domain) =>
      STRATEGY_CATALOG[domain].sample(random),
    );

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

    const upperBound = Math.min(config.maxMembers, available.length);
    const lowerBound = Math.max(2, Math.min(config.minMembers, upperBound));
    const memberCount =
      lowerBound + Math.floor(random() * (upperBound - lowerBound + 1));
    const selected = new Set<StrategyDomain>([
      directional[Math.floor(random() * directional.length)],
      confirmation[Math.floor(random() * confirmation.length)],
    ]);

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
