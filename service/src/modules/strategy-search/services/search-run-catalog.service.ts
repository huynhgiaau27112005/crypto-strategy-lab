import { Injectable, Logger } from '@nestjs/common';
import { CandleEntity, StrategyEntity } from '../../../database/types';
import { CandleInput } from '../../ai-strategy/ai-strategy.types';
import { StrategySignal } from '../../strategy-engine/strategy.types';
import {
  aiCatalogEntry,
  STRATEGY_CATALOG,
  versionCatalogEntry,
} from '../catalog/strategy-catalog';
import {
  CandidateDefinition,
  SearchStrategyType,
  StrategyDomain,
  strategyRowDomain,
} from '../domain/search.types';
import { RunCatalog } from '../generators/domain-guided-random.generator';
import { WeightRow } from '../repositories/experiment-config.repository';

@Injectable()
export class SearchRunCatalogService {
  private readonly logger = new Logger(SearchRunCatalogService.name);

  toAiCandleInput(candles: CandleEntity[]): CandleInput[] {
    return candles.map((candle) => ({
      timestamp: new Date(candle.timestamp).getTime(),
      open: Number(candle.open),
      high: Number(candle.high),
      low: Number(candle.low),
      close: Number(candle.close),
      volume: Number(candle.volume),
    }));
  }

  sentimentSeries(
    candidate: CandidateDefinition,
    byLookback: Map<number, Array<number | null>>,
  ): Array<number | null> | undefined {
    const member = candidate.members.find(({ type }) => type === 'NEWS_SENTIMENT');
    return member
      ? byLookback.get(Number(member.parameters.lookbackHours))
      : undefined;
  }

  build(
    keyedRows: Array<{ row: WeightRow; key: SearchStrategyType }>,
    aiSignalsByType: Map<string, StrategySignal[]>,
    versionRows: StrategyEntity[] = [],
  ): RunCatalog {
    const catalog: RunCatalog = {
      TREND: [],
      MOMENTUM: [],
      VOLATILITY: [],
      STRUCTURE: [],
      INFORMATION: [],
    };
    const versionsByName = new Map<string, StrategyEntity[]>();
    for (const row of versionRows) {
      const versions = versionsByName.get(row.name) ?? [];
      versions.push(row);
      versionsByName.set(row.name, versions);
    }

    for (const { row, key } of keyedRows) {
      let domain: StrategyDomain;
      try {
        domain = strategyRowDomain(row);
      } catch (error) {
        this.logger.warn(
          `Weight row for "${row.name}" is excluded: ${this.errorMessage(error)}`,
        );
        continue;
      }

      if (row.type === 'AI_GENERATED') {
        if (aiSignalsByType.has(key)) {
          catalog[domain].push(
            aiCatalogEntry({
              id: row.strategy_id,
              domain,
              version: row.version,
            }),
          );
        }
        continue;
      }

      const versions = versionsByName.get(row.name) ?? [];
      if (versions.length) {
        for (const version of versions) {
          catalog[domain].push(
            versionCatalogEntry({
              id: version.id,
              type: row.name as SearchStrategyType,
              domain,
              version: version.version,
              parameters: version.parameters as Record<string, number>,
            }),
          );
        }
        continue;
      }

      const fallback = STRATEGY_CATALOG[domain];
      if (fallback.type === row.name) {
        this.logger.warn(
          `No selectable parameter version found for "${row.name}"; falling back to the in-code sampler.`,
        );
        catalog[domain].push(fallback);
      }
    }
    return catalog;
  }

  assertUsableDomains(
    usableDomains: StrategyDomain[],
    requestedDomains: StrategyDomain[],
  ): void {
    const dropped = requestedDomains.filter(
      (domain) => !usableDomains.includes(domain),
    );
    if (!dropped.length) return;

    this.logger.warn(`Domains unusable for this run: ${dropped.join(', ')}`);
    const hasDirectional = usableDomains.some(
      (domain) => domain === 'TREND' || domain === 'STRUCTURE',
    );
    const hasConfirmation = usableDomains.some(
      (domain) => domain === 'MOMENTUM' || domain === 'VOLATILITY',
    );
    if (!hasDirectional || !hasConfirmation) {
      throw new Error(
        'No directional and confirmation domain pair is usable for this run.',
      );
    }
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
