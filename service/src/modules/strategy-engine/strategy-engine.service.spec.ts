import { StrategyEngineService } from './strategy-engine.service';
import { StrategyRegistry } from '../strategy-plugin/strategy-registry';

describe('StrategyEngineService', () => {
  it('delegates to the plugin registered for the member type', () => {
    const analyze = jest.fn().mockReturnValue('BUY');
    const registry = { get: jest.fn().mockReturnValue({ analyze }) } as unknown as StrategyRegistry;
    const service = new StrategyEngineService(registry);

    const member = { type: 'RSI', domain: 'MOMENTUM', parameters: { period: 14 } } as never;
    const context = { candles: [], index: 0 } as never;

    expect(service.analyze(member, context)).toBe('BUY');
    expect(registry.get).toHaveBeenCalledWith('RSI');
    expect(analyze).toHaveBeenCalledWith(member, context);
  });

  it('propagates the registry error for an unregistered type', () => {
    const registry = {
      get: jest.fn(() => {
        throw new Error('No strategy plugin registered for type "GHOST"');
      }),
    } as unknown as StrategyRegistry;
    const service = new StrategyEngineService(registry);
    expect(() => service.analyze({ type: 'GHOST' } as never, { candles: [], index: 0 } as never)).toThrow(
      /GHOST/,
    );
  });
});
