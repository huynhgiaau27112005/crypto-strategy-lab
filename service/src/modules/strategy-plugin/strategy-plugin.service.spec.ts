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

    const aiRepo = { listLatestPerName: jest.fn().mockResolvedValue([]) } as never;
    const service = new StrategyPluginService(registry, repo, aiRepo);
    await expect(service.listCatalog('user-1')).resolves.toEqual([
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

    const aiRepo = { listLatestPerName: jest.fn().mockResolvedValue([]) } as never;
    const service = new StrategyPluginService(registry, repo, aiRepo);
    const [item] = await service.listCatalog('user-1');
    expect(item).toMatchObject({ type: 'RSI', strategyId: null, version: null });
  });

  describe('saveVersion', () => {
    const maSchema = [
      { key: 'fastPeriod', label: 'Fast', type: 'int', min: 5, max: 50, step: 1, default: 10 },
      { key: 'slowPeriod', label: 'Slow', type: 'int', min: 20, max: 200, step: 10, default: 50 },
    ];
    const registry = {
      has: (type: string) => type === 'MA',
      get: () => ({ type: 'MA', parameterSchema: maSchema }),
    } as never;

    it('rejects an out-of-range parameter instead of trusting the client', async () => {
      const repo = { createVersion: jest.fn() } as never;
      const aiRepo = { listLatestPerName: jest.fn().mockResolvedValue([]) } as never;
    const service = new StrategyPluginService(registry, repo, aiRepo);
      await expect(
        service.saveVersion('MA', 'user-1', { fastPeriod: 999, slowPeriod: 50 }),
      ).rejects.toThrow(/between/);
      expect((repo as any).createVersion).not.toHaveBeenCalled();
    });

    it('rejects an unknown parameter key', async () => {
      const repo = { createVersion: jest.fn() } as never;
      const aiRepo = { listLatestPerName: jest.fn().mockResolvedValue([]) } as never;
    const service = new StrategyPluginService(registry, repo, aiRepo);
      await expect(
        service.saveVersion('MA', 'user-1', { fastPeriod: 10, slowPeriod: 50, bogus: 1 } as never),
      ).rejects.toThrow(/Unknown parameter/);
    });

    it('rejects a missing parameter key', async () => {
      const repo = { createVersion: jest.fn() } as never;
      const aiRepo = { listLatestPerName: jest.fn().mockResolvedValue([]) } as never;
    const service = new StrategyPluginService(registry, repo, aiRepo);
      await expect(
        service.saveVersion('MA', 'user-1', { fastPeriod: 10 } as never),
      ).rejects.toThrow(/Missing parameter/);
    });

    it('rejects a non-integer value for an int parameter', async () => {
      const repo = { createVersion: jest.fn() } as never;
      const aiRepo = { listLatestPerName: jest.fn().mockResolvedValue([]) } as never;
    const service = new StrategyPluginService(registry, repo, aiRepo);
      await expect(
        service.saveVersion('MA', 'user-1', { fastPeriod: 10.5, slowPeriod: 50 }),
      ).rejects.toThrow(/integer/);
    });

    it('rejects a value not aligned to step', async () => {
      const repo = { createVersion: jest.fn() } as never;
      const aiRepo = { listLatestPerName: jest.fn().mockResolvedValue([]) } as never;
    const service = new StrategyPluginService(registry, repo, aiRepo);
      await expect(
        service.saveVersion('MA', 'user-1', { fastPeriod: 10, slowPeriod: 55 }),
      ).rejects.toThrow(/increments/);
    });

    it('rejects an unknown strategy type', async () => {
      const repo = { createVersion: jest.fn() } as never;
      const aiRepo = { listLatestPerName: jest.fn().mockResolvedValue([]) } as never;
    const service = new StrategyPluginService(registry, repo, aiRepo);
      await expect(
        service.saveVersion('NOT_REAL', 'user-1', {}),
      ).rejects.toThrow(/No strategy plugin/);
    });

    it('delegates to the repository to insert a new version when validation passes', async () => {
      const createVersion = jest.fn().mockResolvedValue({
        id: 'new-id',
        name: 'MA',
        version: 2,
        type: 'USER',
        parameters: { fastPeriod: 10, slowPeriod: 50 },
        owner_user_id: 'user-1',
        created_at: new Date('2026-01-01'),
      });
      const repo = { createVersion } as never;
      const aiRepo = { listLatestPerName: jest.fn().mockResolvedValue([]) } as never;
    const service = new StrategyPluginService(registry, repo, aiRepo);
      const result = await service.saveVersion('MA', 'user-1', { fastPeriod: 10, slowPeriod: 50 });
      expect(createVersion).toHaveBeenCalledWith('MA', 'user-1', { fastPeriod: 10, slowPeriod: 50 });
      expect(result).toMatchObject({ strategyId: 'new-id', version: 2, isMine: true });
    });
  });
});
