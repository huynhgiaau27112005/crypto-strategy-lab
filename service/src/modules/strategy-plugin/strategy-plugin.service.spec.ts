import { StrategyPluginService } from './strategy-plugin.service';

describe('StrategyPluginService', () => {
  it('merges registry plugins with their persisted strategy row', async () => {
    const registry = {
      list: () => [
        {
          type: 'MA',
          domain: 'TREND',
          displayName: 'Moving Average Crossover',
          description: 'desc',
          parameterSchema: [],
        },
      ],
    } as never;
    const repo = {
      listSystemStrategies: jest
        .fn()
        .mockResolvedValue([{ id: 'uuid-ma', name: 'MA', version: 3 }]),
    } as never;

    const service = new StrategyPluginService(registry, repo);
    await expect(service.listCatalog()).resolves.toEqual([
      {
        type: 'MA',
        domain: 'TREND',
        displayName: 'Moving Average Crossover',
        description: 'desc',
        parameterSchema: [],
        strategyId: 'uuid-ma',
        version: 3,
      },
    ]);
  });

  it('returns null ids for a plugin with no seeded row rather than dropping it', async () => {
    const registry = {
      list: () => [
        { type: 'RSI', domain: 'MOMENTUM', displayName: 'RSI', description: 'd', parameterSchema: [] },
      ],
    } as never;
    const repo = { listSystemStrategies: jest.fn().mockResolvedValue([]) } as never;

    const service = new StrategyPluginService(registry, repo);
    const [item] = await service.listCatalog();
    expect(item).toMatchObject({ type: 'RSI', strategyId: null, version: null });
  });
});
