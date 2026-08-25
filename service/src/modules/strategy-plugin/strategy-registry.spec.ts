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

  describe('resolve() — AI strategy routing', () => {
    it('routes any "AI:<id>" type to the shared AI adapter, without registering each id', () => {
      const registry = new StrategyRegistry();
      const adapter = fake('AI:*');
      registry.registerAiAdapter(adapter);
      expect(registry.resolve('AI:11111111-1111-1111-1111-111111111111' as never)).toBe(adapter);
      expect(registry.resolve('AI:22222222-2222-2222-2222-222222222222' as never)).toBe(adapter);
    });

    it('still resolves built-in types through the ordinary Map', () => {
      const registry = new StrategyRegistry();
      const ma = fake('MA');
      registry.register(ma);
      expect(registry.resolve('MA')).toBe(ma);
    });

    it('throws a clear error when an AI type is resolved before an adapter is registered', () => {
      const registry = new StrategyRegistry();
      expect(() => registry.resolve('AI:missing' as never)).toThrow(/AI strategy adapter/);
    });

    it('has()/get() stay built-ins-only even after an AI adapter is registered', () => {
      const registry = new StrategyRegistry();
      registry.registerAiAdapter(fake('AI:*'));
      expect(registry.has('AI:11111111-1111-1111-1111-111111111111' as never)).toBe(false);
      expect(() => registry.get('AI:11111111-1111-1111-1111-111111111111' as never)).toThrow(
        /No strategy plugin registered/,
      );
    });
  });
});
