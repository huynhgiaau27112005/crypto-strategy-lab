import { StrategyEngineService } from './strategy-engine.service';
import { StrategyRegistry } from '../strategy-plugin/strategy-registry';

describe('StrategyEngineService', () => {
  it('delegates to the plugin resolved for the member type', () => {
    const analyze = jest.fn().mockReturnValue('BUY');
    const registry = { resolve: jest.fn().mockReturnValue({ analyze }) } as unknown as StrategyRegistry;
    const service = new StrategyEngineService(registry);

    const member = { type: 'RSI', domain: 'MOMENTUM', parameters: { period: 14 } } as never;
    const context = { candles: [], index: 0 } as never;

    expect(service.analyze(member, context)).toBe('BUY');
    expect(registry.resolve).toHaveBeenCalledWith('RSI');
    expect(analyze).toHaveBeenCalledWith(member, context);
  });

  it('propagates the registry error for an unregistered type', () => {
    const registry = {
      resolve: jest.fn(() => {
        throw new Error('No strategy plugin registered for type "GHOST"');
      }),
    } as unknown as StrategyRegistry;
    const service = new StrategyEngineService(registry);
    expect(() => service.analyze({ type: 'GHOST' } as never, { candles: [], index: 0 } as never)).toThrow(
      /GHOST/,
    );
  });

  it('delegates an AI strategy member to whatever the registry resolves for its "AI:<id>" type', () => {
    const analyze = jest.fn().mockReturnValue('SELL');
    const registry = { resolve: jest.fn().mockReturnValue({ analyze }) } as unknown as StrategyRegistry;
    const service = new StrategyEngineService(registry);

    const member = { type: 'AI:abc-123', domain: 'MOMENTUM', parameters: {} } as never;
    const context = { candles: [], index: 5, aiSignals: new Map([['AI:abc-123', ['SELL']]]) } as never;

    expect(service.analyze(member, context)).toBe('SELL');
    expect(registry.resolve).toHaveBeenCalledWith('AI:abc-123');
  });
});
