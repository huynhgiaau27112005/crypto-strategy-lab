import { Injectable } from '@nestjs/common';
import { SearchStrategyType } from '../strategy-search/domain/search.types';
import { StrategyPlugin } from './strategy-plugin.types';

@Injectable()
export class StrategyRegistry {
  private readonly plugins = new Map<SearchStrategyType, StrategyPlugin>();

  register(plugin: StrategyPlugin): void {
    if (this.plugins.has(plugin.type)) {
      throw new Error(`Strategy plugin "${plugin.type}" is already registered`);
    }
    this.plugins.set(plugin.type, plugin);
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

  list(): StrategyPlugin[] {
    return [...this.plugins.values()];
  }
}
