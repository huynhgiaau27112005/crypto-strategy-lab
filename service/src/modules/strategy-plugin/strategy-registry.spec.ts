import { StrategyRegistry } from './strategy-registry';
import { StrategyPlugin } from './strategy-plugin.types';

const fake = (type: string): StrategyPlugin =>
  ({
    type,
    domain: 'TREND',
    displayName: `Fake ${type}`,
    description: 'test plugin',
    parameterSchema: [],
    analyze: () => 'HOLD',
  }) as unknown as StrategyPlugin;

describe('StrategyRegistry', () => {
  it('returns a registered plugin by type', () => {
    const registry = new StrategyRegistry();
    const plugin = fake('MA');
    registry.register(plugin);
    expect(registry.get('MA')).toBe(plugin);
    expect(registry.has('MA')).toBe(true);
  });

  it('throws on an unknown type instead of silently returning undefined', () => {
    const registry = new StrategyRegistry();
    expect(() => registry.get('RSI')).toThrow(/RSI/);
  });

  it('rejects a duplicate registration for the same type', () => {
    const registry = new StrategyRegistry();
    registry.register(fake('MA'));
    expect(() => registry.register(fake('MA'))).toThrow(/already registered/i);
  });

  it('lists every registered plugin', () => {
    const registry = new StrategyRegistry();
    registry.register(fake('MA'));
    registry.register(fake('RSI'));
    expect(registry.list().map((p) => p.type).sort()).toEqual(['MA', 'RSI']);
  });
});
