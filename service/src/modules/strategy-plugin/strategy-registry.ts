import { Injectable } from '@nestjs/common';
import { isAiStrategyType, SearchStrategyType } from '../strategy-search/domain/search.types';
import { StrategyPlugin } from './strategy-plugin.types';

@Injectable()
export class StrategyRegistry {
  private readonly plugins = new Map<SearchStrategyType, StrategyPlugin>();
  private aiAdapter: StrategyPlugin | null = null;

  // Built-in plugins only — one instance per literal type, registered once
  // in StrategyPluginModule.onModuleInit. has()/get() keep this exact,
  // unchanged meaning so callers that must mean "a boot-time registered
  // built-in plugin" (StrategyPluginService's parameter-versioning
  // endpoints) keep behaving exactly as before: an AI strategy type is
  // correctly NOT found there, since it isn't a numeric-parameter plugin
  // you version through that flow.
  register(plugin: StrategyPlugin): void {
    if (this.plugins.has(plugin.type)) {
      throw new Error(`Strategy plugin "${plugin.type}" is already registered`);
    }
    this.plugins.set(plugin.type, plugin);
  }

  // AI strategies are per-user, created at runtime, and live in Postgres —
  // there is no fixed set of them to register individually at boot the way
  // built-ins are. Instead, ONE shared adapter instance is registered here
  // (still at boot, still exactly once — same registration lifetime as a
  // built-in plugin) and resolve() routes every "AI:<strategyId>" type to
  // it. See strategy-plugin/plugins/ai-strategy-plugin.adapter.ts.
  registerAiAdapter(adapter: StrategyPlugin): void {
    this.aiAdapter = adapter;
  }

  has(type: SearchStrategyType): boolean {
    return this.plugins.has(type);
  }

  get(type: SearchStrategyType): StrategyPlugin {
    const plugin = this.plugins.get(type);
    if (!plugin) {
      throw new Error(`No strategy plugin registered for type "${type}"`);
    }
    return plugin;
  }

  // The seam StrategyEngineService actually calls at signal/backtest time.
  // This is the one place that recognizes the "AI:" namespace — engine,
  // composite, and search services call resolve()/this method's callers
  // and never branch on strategy kind themselves (see task-15's "the
  // architectural point").
  resolve(type: SearchStrategyType): StrategyPlugin {
    if (isAiStrategyType(type)) {
      if (!this.aiAdapter) {
        throw new Error('No AI strategy adapter registered.');
      }
      return this.aiAdapter;
    }
    return this.get(type);
  }

  list(): StrategyPlugin[] {
    return [...this.plugins.values()];
  }
}
