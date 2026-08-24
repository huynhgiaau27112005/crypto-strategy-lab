import { BadRequestException } from '@nestjs/common';
import { CandleEntity, ExperimentEntity } from '../../database/types';
import { CandidateDefinition, StartSearchRequest } from './domain/search.types';
import { StrategySearchService } from './strategy-search.service';

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
    };
    const experimentConfigs = {
      createWithWeights: jest.fn(),
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
      // start() fires the run loop in the background via setImmediate; give
      // it just enough to resolve findByIdOrThrow so it exits cleanly on
      // CANCELLED instead of logging an unrelated background error.
      mocks.experiments.findByIdOrThrow.mockResolvedValue({
        id: 'exp-1',
        user_id: 'user-1',
        name: null,
        status: 'CANCELLED',
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
});
