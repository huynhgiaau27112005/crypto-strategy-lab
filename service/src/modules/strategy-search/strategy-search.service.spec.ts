import { BadRequestException } from '@nestjs/common';
import { CandleEntity, ExperimentEntity } from '../../database/types';
import { CandidateDefinition, StartSearchRequest } from './domain/search.types';
import { StrategySearchService } from './strategy-search.service';
import { MetricsService } from '../../observability/metrics/metrics.service';

function makeCandles(count: number): CandleEntity[] {
  return Array.from({ length: count }, (_, index) => ({
    timeframe: '5m',
    timestamp: new Date(Date.now() + index * 60_000),
    open: '100',
    high: '101',
    low: '99',
    close: '100',
    volume: '10',
  }));
}

describe('StrategySearchService', () => {
  const candidateDefinition: CandidateDefinition = {
    schemaVersion: 1,
    combination: { method: 'WEIGHTED_VOTE', buyThreshold: 0.3, sellThreshold: -0.3 },
    members: [
      { type: 'MA', domain: 'TREND', pluginVersion: 1, parameters: { fastPeriod: 10, slowPeriod: 20 } },
    ],
  };

  function buildService(overrides: Partial<Record<string, unknown>> = {}) {
    const database = {
      withTransaction: jest.fn((callback: (client: unknown) => unknown) =>
        callback({}),
      ),
      query: jest.fn(),
    };
    const experiments = {
      create: jest.fn(),
      findOwned: jest.fn(),
      findByIdOrThrow: jest.fn(),
      findResumable: jest.fn().mockResolvedValue([]),
      setRunning: jest.fn().mockResolvedValue(true),
      finish: jest.fn().mockResolvedValue(undefined),
      isCancelled: jest.fn().mockResolvedValue(false),
      cancel: jest.fn(),
      candles: jest.fn().mockResolvedValue(makeCandles(300)),
      status: jest.fn(),
      top: jest.fn(),
      reopen: jest.fn().mockResolvedValue(true),
    };
    const experimentConfigs = {
      createWithWeights: jest.fn(),
      increaseIterationLimit: jest.fn().mockResolvedValue(110),
      findByExperimentId: jest.fn().mockResolvedValue({
        id: 'config-1',
        experiment_id: 'exp-1',
        timeframe: '5m',
        start_time: new Date(),
        end_time: new Date(),
        iteration_limit: 1,
        created_at: new Date(),
      }),
      weightsByExperimentId: jest.fn().mockResolvedValue([
        { strategy_id: 'strategy-ma', name: 'MA', weight: '1' },
      ]),
    };
    const iterations = {
      createNext: jest.fn().mockResolvedValue({
        id: 'iteration-1',
        experiment_id: 'exp-1',
        iteration_number: 1,
        status: 'RUNNING',
        started_at: new Date(),
        completed_at: null,
        error_message: null,
        created_at: new Date(),
      }),
      complete: jest.fn().mockResolvedValue(undefined),
      fail: jest.fn().mockResolvedValue(undefined),
      countByExperimentId: jest.fn().mockResolvedValue(0),
    };
    const candidates = {
      createForIteration: jest.fn().mockResolvedValue({
        id: 'candidate-1',
        iteration_id: 'iteration-1',
        created_at: new Date(),
      }),
    };
    const strategies = {
      findByName: jest.fn(),
      listSystemStrategies: jest.fn().mockResolvedValue([
        { id: 'strategy-ma', name: 'MA' },
        { id: 'strategy-rsi', name: 'RSI' },
        { id: 'strategy-bollinger', name: 'BOLLINGER' },
        { id: 'strategy-sr', name: 'SUPPORT_RESISTANCE' },
      ]),
    };
    const generator = {
      generate: jest.fn().mockReturnValue(candidateDefinition),
    };
    const fingerprintService = {
      canonicalize: jest.fn((candidate: CandidateDefinition) => candidate),
    };
    const backtesting = {
      run: jest.fn(),
    };
    const backtestRuns = {
      complete: jest.fn().mockResolvedValue(undefined),
      fail: jest.fn().mockResolvedValue(undefined),
    };
    const leaderboard = {
      rebuildForExperiment: jest.fn().mockResolvedValue(undefined),
    };
    const searchQueue = {
      enqueue: jest.fn().mockResolvedValue(undefined),
      cancelIfQueued: jest.fn().mockResolvedValue(undefined),
    };
    const cache = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
      incr: jest.fn().mockResolvedValue(null),
    };

    const metrics = new MetricsService();

    const mocks = {
      database,
      experiments,
      experimentConfigs,
      iterations,
      candidates,
      strategies,
      generator,
      fingerprintService,
      backtesting,
      backtestRuns,
      leaderboard,
      searchQueue,
      cache,
      metrics,
      ...overrides,
    };

    const service = new StrategySearchService(
      mocks.database as any,
      mocks.experiments as any,
      mocks.experimentConfigs as any,
      mocks.iterations as any,
      mocks.candidates as any,
      mocks.strategies as any,
      mocks.generator as any,
      mocks.fingerprintService as any,
      mocks.backtesting as any,
      mocks.backtestRuns as any,
      mocks.leaderboard as any,
      mocks.searchQueue as any,
      mocks.cache as any,
      mocks.metrics as any,
    );

    return { service, mocks };
  }

  describe('run()', () => {
    it('marks the iteration and backtest run FAILED when the backtest throws after the candidate row exists', async () => {
      const { service, mocks } = buildService();
      mocks.experiments.findByIdOrThrow.mockResolvedValue({
        id: 'exp-1',
        user_id: 'user-1',
        name: null,
        status: 'PENDING',
        started_at: null,
        completed_at: null,
        created_at: new Date(),
      } as ExperimentEntity);
      mocks.backtesting.run.mockImplementation(() => {
        throw new Error('backtest exploded');
      });

      await (service as any).run('exp-1');

      expect(mocks.iterations.fail).toHaveBeenCalledWith(
        'iteration-1',
        expect.stringContaining('backtest exploded'),
      );
      expect(mocks.backtestRuns.fail).toHaveBeenCalledWith(
        'candidate-1',
        expect.stringContaining('backtest exploded'),
      );
      expect(mocks.backtestRuns.complete).not.toHaveBeenCalled();
    });

    it('marks the iteration FAILED but does not call backtestRuns.fail when candidate creation itself throws', async () => {
      const { service, mocks } = buildService();
      mocks.experiments.findByIdOrThrow.mockResolvedValue({
        id: 'exp-1',
        user_id: 'user-1',
        name: null,
        status: 'PENDING',
        started_at: null,
        completed_at: null,
        created_at: new Date(),
      } as ExperimentEntity);
      mocks.candidates.createForIteration.mockRejectedValue(
        new Error('candidate insert failed'),
      );

      await (service as any).run('exp-1');

      expect(mocks.iterations.fail).toHaveBeenCalledWith(
        'iteration-1',
        expect.stringContaining('candidate insert failed'),
      );
      expect(mocks.backtestRuns.fail).not.toHaveBeenCalled();
      expect(mocks.backtestRuns.complete).not.toHaveBeenCalled();
    });
  });

  describe('start()', () => {
    const baseRequest: StartSearchRequest = {
      timeframe: '5m',
      startTime: new Date(Date.now() - 3_600_000).toISOString(),
      endTime: new Date().toISOString(),
      maxCandidates: 10,
    };

    it('rejects strategyWeights that do not exactly cover enabledDomains, before creating any experiment', async () => {
      const { service, mocks } = buildService();
      const request: StartSearchRequest = {
        ...baseRequest,
        // Default enabledDomains covers all four domains, but this only
        // supplies weights for three of them (missing SUPPORT_RESISTANCE) —
        // the exact scenario from Finding 1.
        strategyWeights: [
          { type: 'MA', weight: 0.3 },
          { type: 'RSI', weight: 0.3 },
          { type: 'BOLLINGER', weight: 0.4 },
        ],
      };

      await expect(service.start('user-1', request)).rejects.toThrow(
        BadRequestException,
      );

      expect(mocks.experiments.create).not.toHaveBeenCalled();
      expect(mocks.experimentConfigs.createWithWeights).not.toHaveBeenCalled();
    });

    it('accepts strategyWeights whose sum is not 1 — the composite formula normalizes them, so they no longer need to', async () => {
      const { service, mocks } = buildService();
      mocks.experiments.create.mockResolvedValue({
        id: 'exp-1',
        user_id: 'user-1',
        name: null,
        status: 'PENDING',
        started_at: null,
        completed_at: null,
        created_at: new Date(),
      });
      const request: StartSearchRequest = {
        ...baseRequest,
        enabledDomains: ['TREND', 'MOMENTUM', 'VOLATILITY', 'STRUCTURE'],
        // Sum = 1.15 — the exact case the owner reported being wrongly
        // rejected.
        strategyWeights: [
          { type: 'MA', weight: 0.25 },
          { type: 'RSI', weight: 0.25 },
          { type: 'BOLLINGER', weight: 0.2 },
          { type: 'SUPPORT_RESISTANCE', weight: 0.45 },
        ],
      };

      await service.start('user-1', request);

      expect(mocks.experiments.create).toHaveBeenCalled();
      expect(mocks.experimentConfigs.createWithWeights).toHaveBeenCalled();
      // start() enqueues the search onto the queue instead of running it
      // inline — this is the API-as-enqueuer behavior task-16 requires.
      expect(mocks.searchQueue.enqueue).toHaveBeenCalledWith('exp-1');
    });

    it('rejects a negative strategyWeight', async () => {
      const { service, mocks } = buildService();
      const request: StartSearchRequest = {
        ...baseRequest,
        enabledDomains: ['TREND', 'MOMENTUM', 'VOLATILITY', 'STRUCTURE'],
        strategyWeights: [
          { type: 'MA', weight: -0.5 },
          { type: 'RSI', weight: 0.3 },
          { type: 'BOLLINGER', weight: 0.4 },
          { type: 'SUPPORT_RESISTANCE', weight: 0.4 },
        ],
      };

      await expect(service.start('user-1', request)).rejects.toThrow(
        BadRequestException,
      );
      expect(mocks.experiments.create).not.toHaveBeenCalled();
    });

    it('rejects strategyWeights that are all zero', async () => {
      const { service, mocks } = buildService();
      const request: StartSearchRequest = {
        ...baseRequest,
        enabledDomains: ['TREND', 'MOMENTUM', 'VOLATILITY', 'STRUCTURE'],
        strategyWeights: [
          { type: 'MA', weight: 0 },
          { type: 'RSI', weight: 0 },
          { type: 'BOLLINGER', weight: 0 },
          { type: 'SUPPORT_RESISTANCE', weight: 0 },
        ],
      };

      await expect(service.start('user-1', request)).rejects.toThrow(
        BadRequestException,
      );
      expect(mocks.experiments.create).not.toHaveBeenCalled();
    });
  });

  describe('extend()', () => {
    const ownedExperiment = {
      id: 'exp-1',
      user_id: 'user-1',
      name: null,
      status: 'COMPLETED',
      started_at: new Date(),
      completed_at: new Date(),
      created_at: new Date(),
    } as ExperimentEntity;

    it('rejects extending an experiment that does not belong to the caller with 404, and never reopens it', async () => {
      const { service, mocks } = buildService();
      mocks.experiments.findOwned.mockResolvedValue(null);

      await expect(
        service.extend('exp-1', 'attacker', 10),
      ).rejects.toMatchObject({ status: 404 });

      // The scope-defeat regression this guards against: without the
      // ownership check (or if reopen() dropped its userId binding), an
      // attacker could extend and observe another user's experiment.
      expect(mocks.experiments.reopen).not.toHaveBeenCalled();
      expect(mocks.experimentConfigs.increaseIterationLimit).not.toHaveBeenCalled();
    });

    it('rejects with 409 and does not touch config when the experiment is not COMPLETED (reopen() loses the race or the experiment is still running)', async () => {
      const { service, mocks } = buildService();
      mocks.experiments.findOwned.mockResolvedValue(ownedExperiment);
      mocks.experiments.reopen.mockResolvedValue(false);

      await expect(
        service.extend('exp-1', 'user-1', 10),
      ).rejects.toMatchObject({ status: 409 });

      expect(mocks.experimentConfigs.increaseIterationLimit).not.toHaveBeenCalled();
    });

    it('rejects an iterations count above the bound without reopening the experiment', async () => {
      const { service, mocks } = buildService();
      mocks.experiments.findOwned.mockResolvedValue(ownedExperiment);

      await expect(
        service.extend('exp-1', 'user-1', 51),
      ).rejects.toThrow(BadRequestException);

      expect(mocks.experiments.reopen).not.toHaveBeenCalled();
    });

    it('reopens the experiment, raises iteration_limit by the requested count, and (re)schedules the run', async () => {
      const { service, mocks } = buildService();
      mocks.experiments.findOwned.mockResolvedValue(ownedExperiment);
      mocks.experiments.reopen.mockResolvedValue(true);

      const result = await service.extend('exp-1', 'user-1', 10);

      expect(result).toEqual({ id: 'exp-1', status: 'PENDING' });
      expect(mocks.experiments.reopen).toHaveBeenCalledWith('exp-1', 'user-1');
      expect(mocks.experimentConfigs.increaseIterationLimit).toHaveBeenCalledWith(
        'exp-1',
        10,
      );
      // extend() routes through the same queue as start(), not a second
      // inline run loop.
      expect(mocks.searchQueue.enqueue).toHaveBeenCalledWith('exp-1');
    });

    it('defaults to 10 iterations when the caller omits the count', async () => {
      const { service, mocks } = buildService();
      mocks.experiments.findOwned.mockResolvedValue(ownedExperiment);

      await service.extend('exp-1', 'user-1', undefined);

      expect(mocks.experimentConfigs.increaseIterationLimit).toHaveBeenCalledWith(
        'exp-1',
        10,
      );
    });
  });

  describe('cancel()', () => {
    it('removes a still-queued job from the search queue when the cancel takes effect', async () => {
      const { service, mocks } = buildService();
      mocks.experiments.findOwned.mockResolvedValue({
        id: 'exp-1',
        user_id: 'user-1',
      } as ExperimentEntity);
      mocks.experiments.cancel.mockResolvedValue(true);

      const result = await service.cancel('exp-1', 'user-1');

      expect(result).toEqual({ id: 'exp-1', cancelled: true });
      expect(mocks.searchQueue.cancelIfQueued).toHaveBeenCalledWith('exp-1');
    });

    it('does not touch the queue when the DB cancel does not take effect', async () => {
      const { service, mocks } = buildService();
      mocks.experiments.findOwned.mockResolvedValue({
        id: 'exp-1',
        user_id: 'user-1',
      } as ExperimentEntity);
      mocks.experiments.cancel.mockResolvedValue(false);

      const result = await service.cancel('exp-1', 'user-1');

      expect(result).toEqual({ id: 'exp-1', cancelled: false });
      expect(mocks.searchQueue.cancelIfQueued).not.toHaveBeenCalled();
    });
  });

  describe('getTop() caching', () => {
    function ownedExperiment() {
      return { id: 'exp-1', user_id: 'user-1' } as ExperimentEntity;
    }

    it('queries the DB and caches the result on a cache miss', async () => {
      const { service, mocks } = buildService();
      mocks.experiments.findOwned.mockResolvedValue(ownedExperiment());
      mocks.experiments.top.mockResolvedValue([{ rank: 1, candidate_id: 'c1' }]);
      mocks.cache.get.mockResolvedValue(null); // both version and data lookups miss

      const result = await service.getTop('exp-1', 'user-1', 10);

      expect(mocks.experiments.top).toHaveBeenCalledWith('exp-1', 'user-1', 100, expect.any(Number));
      expect(mocks.cache.set).toHaveBeenCalledWith(
        expect.stringContaining('strategy-search:top:exp-1:user-1:v0'),
        [{ rank: 1, candidate_id: 'c1' }],
        expect.any(Number),
      );
      expect(result).toEqual([{ rank: 1, candidate_id: 'c1' }]);
    });

    it('returns the cached top list sliced to the requested limit without touching the DB', async () => {
      const { service, mocks } = buildService();
      mocks.experiments.findOwned.mockResolvedValue(ownedExperiment());
      const fullList = Array.from({ length: 20 }, (_, i) => ({ rank: i + 1, candidate_id: `c${i}` }));
      mocks.cache.get.mockImplementation((key: string) =>
        key.startsWith('leaderboard:version:') ? Promise.resolve(0) : Promise.resolve(fullList),
      );

      const result = await service.getTop('exp-1', 'user-1', 5);

      expect(result).toEqual(fullList.slice(0, 5));
      expect(mocks.experiments.top).not.toHaveBeenCalled();
    });

    it('reads a different cache key once the leaderboard version has been bumped by a rebuild', async () => {
      const { service, mocks } = buildService();
      mocks.experiments.findOwned.mockResolvedValue(ownedExperiment());
      mocks.experiments.top.mockResolvedValue([]);
      mocks.cache.get.mockImplementation((key: string) =>
        key.startsWith('leaderboard:version:') ? Promise.resolve(3) : Promise.resolve(null),
      );

      await service.getTop('exp-1', 'user-1', 10);

      expect(mocks.cache.get).toHaveBeenCalledWith('strategy-search:top:exp-1:user-1:v3');
    });
  });
});
