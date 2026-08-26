import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { StrategyRegistry } from './strategy-registry';
import { StrategyRepository } from '../strategy-search/repositories/strategy.repository';
import { StrategyCatalogItem, StrategyVersionSummary } from './strategy-plugin.types';
import { aiStrategyType, SearchStrategyType, strategyRowDomain } from '../strategy-search/domain/search.types';
import { AiStrategyRepository } from '../ai-strategy/repositories/ai-strategy.repository';

@Injectable()
export class StrategyPluginService {
  private readonly logger = new Logger(StrategyPluginService.name);

  constructor(
    private readonly registry: StrategyRegistry,
    private readonly strategies: StrategyRepository,
    private readonly aiStrategies: AiStrategyRepository,
  ) {}

  // Built-in plugins (shared, same for every caller) plus this user's own
  // saved AI strategies (per-user — task-15's "Strategy sau khi lưu sẽ
  // xuất hiện ở nhóm 'Strategy do AI generate'"). AI entries are built
  // directly from `strategies` rows, NOT from registry.list() — the
  // registry's AI adapter is a single shared instance used only to
  // *resolve* an "AI:<id>" type at analyze() time (see
  // strategy-registry.ts), it does not enumerate individual AI strategies.
  async listCatalog(userId: string): Promise<StrategyCatalogItem[]> {
    // This user's own latest saved version per built-in name, falling back
    // to the shared SYSTEM row — never the bare SYSTEM-only list, or a
    // saved version would never show up here (see
    // StrategyRepository.listLatestForUser's doc comment).
    const rows = await this.strategies.listLatestForUser(userId);
    const byName = new Map(rows.map((row) => [row.name, row]));
    const builtIns = this.registry.list().map((plugin) => {
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

    const aiRows = await this.aiStrategies.listLatestPerName(userId);
    const aiItems: StrategyCatalogItem[] = [];
    for (const row of aiRows) {
      try {
        aiItems.push({
          type: aiStrategyType(row.id),
          domain: strategyRowDomain(row),
          displayName: row.name,
          description: 'Strategy do AI sinh — chạy qua subprocess Python, không có tham số điều chỉnh ở đây.',
          parameterSchema: [],
          strategyId: row.id,
          version: row.version,
        });
      } catch (error) {
        // Legacy row saved before domain selection existed — cannot be
        // combined into a search candidate without a domain, so it is
        // omitted from the catalog rather than failing the whole listing.
        this.logger.warn(
          `AI strategy "${row.name}" (${row.id}) omitted from the catalog: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    return [...builtIns, ...aiItems];
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
