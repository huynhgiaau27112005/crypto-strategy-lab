import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { StrategyRegistry } from './strategy-registry';
import { StrategyRepository } from '../strategy-search/repositories/strategy.repository';
import { StrategyCatalogItem, StrategyVersionSummary } from './strategy-plugin.types';
import { SearchStrategyType } from '../strategy-search/domain/search.types';

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

  async listVersions(name: string, userId: string): Promise<StrategyVersionSummary[]> {
    this.assertKnownType(name);
    const rows = await this.strategies.listVersions(name, userId);
    return rows.map((row) => ({
      strategyId: row.id,
      name: row.name,
      version: row.version,
      type: row.type,
      parameters: row.parameters,
      isMine: row.owner_user_id === userId,
      createdAt: row.created_at,
    }));
  }

  async saveVersion(
    name: string,
    userId: string,
    parameters: Record<string, number>,
  ): Promise<StrategyVersionSummary> {
    const type = this.assertKnownType(name);
    const plugin = this.registry.get(type);
    this.validateParameters(plugin.parameterSchema, parameters);

    const row = await this.strategies.createVersion(name, userId, parameters);
    return {
      strategyId: row.id,
      name: row.name,
      version: row.version,
      type: row.type,
      parameters: row.parameters,
      isMine: true,
      createdAt: row.created_at,
    };
  }

  private assertKnownType(name: string): SearchStrategyType {
    const type = name as SearchStrategyType;
    if (!this.registry.has(type)) {
      throw new NotFoundException(`No strategy plugin registered for "${name}".`);
    }
    return type;
  }

  /**
   * The backend is the authority: reject unknown keys, missing keys, wrong
   * types, out-of-range values, and values not aligned to `step`. The
   * frontend performs the same checks for UX only — this is what actually
   * guards the data.
   */
  private validateParameters(
    schema: { key: string; type: 'int' | 'float'; min: number; max: number; step: number }[],
    parameters: Record<string, number>,
  ): void {
    const schemaKeys = new Set(schema.map((spec) => spec.key));
    const submittedKeys = Object.keys(parameters);

    const unknownKeys = submittedKeys.filter((key) => !schemaKeys.has(key));
    if (unknownKeys.length > 0) {
      throw new BadRequestException(`Unknown parameter(s): ${unknownKeys.join(', ')}`);
    }

    const missingKeys = schema.filter((spec) => !(spec.key in parameters));
    if (missingKeys.length > 0) {
      throw new BadRequestException(
        `Missing parameter(s): ${missingKeys.map((spec) => spec.key).join(', ')}`,
      );
    }

    for (const spec of schema) {
      const value = parameters[spec.key];

      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new BadRequestException(`Parameter "${spec.key}" must be a finite number.`);
      }
      if (spec.type === 'int' && !Number.isInteger(value)) {
        throw new BadRequestException(`Parameter "${spec.key}" must be an integer.`);
      }
      if (value < spec.min || value > spec.max) {
        throw new BadRequestException(
          `Parameter "${spec.key}" must be between ${spec.min} and ${spec.max}.`,
        );
      }
      if (spec.step > 0) {
        const steps = (value - spec.min) / spec.step;
        const rounded = Math.round(steps);
        if (Math.abs(steps - rounded) > 1e-9) {
          throw new BadRequestException(
            `Parameter "${spec.key}" must be in increments of ${spec.step} from ${spec.min}.`,
          );
        }
      }
    }
  }
}
