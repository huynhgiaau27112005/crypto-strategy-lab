import { Injectable } from '@nestjs/common';
import { StrategyRegistry } from './strategy-registry';
import { StrategyRepository } from '../strategy-search/repositories/strategy.repository';
import { StrategyCatalogItem } from './strategy-plugin.types';

@Injectable()
export class StrategyPluginService {
  constructor(
    private readonly registry: StrategyRegistry,
    private readonly strategies: StrategyRepository,
  ) {}

  async listCatalog(): Promise<StrategyCatalogItem[]> {
    const rows = await this.strategies.listSystemStrategies();
    const byName = new Map(rows.map((row) => [row.name, row]));
    return this.registry.list().map((plugin) => {
      const row = byName.get(plugin.type) ?? null;
      return {
        type: plugin.type,
        domain: plugin.domain,
        displayName: plugin.displayName,
        description: plugin.description,
        parameterSchema: plugin.parameterSchema,
        strategyId: row?.id ?? null,
        version: row?.version ?? null,
      };
    });
  }
}
