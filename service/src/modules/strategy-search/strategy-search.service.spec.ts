import { BadRequestException } from '@nestjs/common';
import { CandleEntity, ExperimentEntity } from '../../database/types';
import { CandidateDefinition, StartSearchRequest } from './domain/search.types';
import { StrategySearchService } from './strategy-search.service';
import { StrategySearchModule } from './strategy-search.module';
import { SEARCH_ALGORITHM } from './domain/search.types';
import { DomainGuidedRandomGenerator } from './generators/domain-guided-random.generator';
import { MetricsService } from '../../observability/metrics/metrics.service';
import { DomainEventNames } from '../../domain-events';

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
      listTopCandidateMembers: jest.fn().mockResolvedValue([]),
      rankedSummaries: jest.fn().mockResolvedValue([]),
    };
    const strategies = {
      findByName: jest.fn(),
      listSelectableVersions: jest.fn().mockResolvedValue([]),
      listSystemStrategies: jest.fn().mockResolvedValue([
        { id: 'strategy-ma', name: 'MA' },
        { id: 'strategy-rsi', name: 'RSI' },
        { id: 'strategy-bollinger', name: 'BOLLINGER' },
        { id: 'strategy-sr', name: 'SUPPORT_RESISTANCE' },
      ]),
      listLatestForUser: jest.fn().mockResolvedValue([
        { id: 'strategy-ma', name: 'MA', type: 'SYSTEM', version: 1, parameters: {} },
        { id: 'strategy-rsi', name: 'RSI', type: 'SYSTEM', version: 1, parameters: {} },
        { id: 'strategy-bollinger', name: 'BOLLINGER', type: 'SYSTEM', version: 1, parameters: {} },
        { id: 'strategy-sr', name: 'SUPPORT_RESISTANCE', type: 'SYSTEM', version: 1, parameters: {} },
      ]),
    };
    const generator = {
      generate: jest.fn().mockReturnValue(candidateDefinition),
    };
    const fingerprintService = {
      canonicalize: jest.fn((candidate: CandidateDefinition) => candidate),
      fingerprint: jest.fn(() => 'fp-fixed'),
    };
    const backtesting = {
      run: jest.fn(),
    };
    const backtestRuns = {
      complete: jest.fn().mockResolvedValue(undefined),
      fail: jest.fn().mockResolvedValue(undefined),
    };
    // Search no longer holds a LeaderboardService reference at all: it
    // emits, and LeaderboardEventsHandler rebuilds. These tests therefore
    // assert on the ANNOUNCEMENT, and leaderboard-events.handler.spec.ts
    // covers what the announcement causes.
    const events = {
      emitAsync: jest.fn().mockResolvedValue([]),
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
    const aiStrategies = {
      findOwnedActiveById: jest.fn().mockResolvedValue(null),
    };
    const aiPrecompute = {
      precompute: jest.fn().mockResolvedValue(new Map()),
    };
    const strategyPlugin = {
      validateParametersForType: jest.fn(),
    };
    const sentimentPrecompute = {
      precompute: jest.fn().mockResolvedValue([]),
      precomputeMany: jest.fn().mockResolvedValue(new Map()),
    };
    // start() backfills candles before checking the window; the mock makes
    // that a no-op so these tests stay offline and deterministic.
    const marketData = {
      ensureCandleCoverage: jest
        .fn()
        .mockResolvedValue({ interval: '5m', before: 0, after: 0, fetched: 0 }),
    };

    const mocks = {
      database,
      marketData,
      experiments,
      experimentConfigs,
      iterations,
      candidates,
      strategies,
      generator,
      fingerprintService,
      backtesting,
      backtestRuns,
      events,
      searchQueue,
      cache,
      metrics,
      aiStrategies,
      aiPrecompute,
      strategyPlugin,
      sentimentPrecompute,
      ...overrides,
    };

    const service = new StrategySearchService(
      mocks.database as any,
      mocks.marketData as any,
      mocks.experiments as any,
      mocks.experimentConfigs as any,
      mocks.iterations as any,
      mocks.candidates as any,
      mocks.strategies as any,
      mocks.generator as any,
      mocks.fingerprintService as any,
      mocks.backtesting as any,
      mocks.backtestRuns as any,
      mocks.searchQueue as any,
      mocks.cache as any,
      mocks.metrics as any,
      mocks.aiStrategies as any,
      mocks.aiPrecompute as any,
      mocks.strategyPlugin as any,
      mocks.sentimentPrecompute as any,
      mocks.events as any,
    );

    return { service, mocks };
  }

  describe('run() domain events', () => {
    function pendingExperiment(): ExperimentEntity {
      return {
        id: 'exp-1',
        user_id: 'user-1',
        name: null,
        status: 'PENDING',
        started_at: null,
        completed_at: null,
        created_at: new Date(),
      } as ExperimentEntity;
    }

    it('announces backtest.completed with the iteration identifiers and the experiment search config', async () => {
      const { service, mocks } = buildService();
      mocks.experiments.findByIdOrThrow.mockResolvedValue(pendingExperiment());
      mocks.backtesting.run.mockReturnValue({
        evaluation: { overallScore: 9, numberOfTrades: 5 },
      });

      await (service as any).run('exp-1');

      expect(mocks.events.emitAsync).toHaveBeenCalledWith(
        DomainEventNames.BacktestCompleted,
        expect.objectContaining({
          experimentId: 'exp-1',
          candidateId: 'candidate-1',
          iterationId: 'iteration-1',
        }),
      );
      const [, payload] = mocks.events.emitAsync.mock.calls[0];
      // The handler rebuilds from these; if they stopped riding along it
      // would have to re-read the experiment on every single iteration.
      expect(typeof payload.topK).toBe('number');
    });

    // Behavior-preservation guard for the whole refactor. run() rebuilt the
    // leaderboard after EVERY iteration, deliberately outside its backtest
    // try/catch — so a failed iteration still announced a boundary. A
    // success-only event would quietly reduce both the rebuild count and
    // the leaderboard cache-version bumps.
    it('still announces on a FAILED iteration, so the rebuild count matches the direct-call behavior it replaced', async () => {
      const { service, mocks } = buildService();
      mocks.experiments.findByIdOrThrow.mockResolvedValue(pendingExperiment());
      mocks.backtesting.run.mockImplementation(() => {
        throw new Error('backtest exploded');
      });

      await (service as any).run('exp-1');

      expect(mocks.events.emitAsync).toHaveBeenCalledWith(
        DomainEventNames.BacktestFailed,
        expect.objectContaining({
          experimentId: 'exp-1',
          iterationId: 'iteration-1',
          reason: expect.stringContaining('backtest exploded'),
        }),
      );
    });

    // Mirrors the old try/catch around rebuildForExperiment: the backtest
    // rows are committed by then, so a listener blowing up must not fail
    // the search job or leave the experiment stuck.
    it('completes the search even when announcing throws', async () => {
      const { service, mocks } = buildService();
      mocks.experiments.findByIdOrThrow.mockResolvedValue(pendingExperiment());
      mocks.events.emitAsync.mockRejectedValue(new Error('listener exploded'));

      await (service as any).run('exp-1');

      expect(mocks.experiments.finish).toHaveBeenCalledWith(
        'exp-1',
        'COMPLETED',
        expect.any(String),
      );
    });

    // emit() would let the loop race ahead of the rebuild and finish the
    // experiment before the last one committed; the direct call it replaced
    // was awaited, so the emit must be too.
    it('awaits the announcement rather than firing and forgetting', async () => {
      const { service, mocks } = buildService();
      mocks.experiments.findByIdOrThrow.mockResolvedValue(pendingExperiment());
      mocks.backtesting.run.mockReturnValue({
        evaluation: { overallScore: 9, numberOfTrades: 5 },
      });
      let listenerFinished = false;
      mocks.events.emitAsync.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(() => {
              listenerFinished = true;
              resolve([]);
            }, 10),
          ),
      );

      await (service as any).run('exp-1');

      expect(listenerFinished).toBe(true);
    });
  });

  // Migration 005 restored the duplicate-candidate guard the flat-model
  // code had and the Candidate-schema rewire dropped (artifacts/
  // architecture.md §5b). The unique index on
  // (experiment_id, candidate_fingerprint) does the rejecting; these tests
  // pin what run() does with the rejection, which the index cannot express.
  describe('run() duplicate-candidate guard', () => {
    function pendingExperiment(): ExperimentEntity {
      return {
        id: 'exp-1',
        user_id: 'user-1',
        name: null,
        status: 'PENDING',
        started_at: null,
        completed_at: null,
        created_at: new Date(),
      } as ExperimentEntity;
    }

    it('passes the candidate fingerprint to createNext so the unique index can reject a repeat', async () => {
      const { service, mocks } = buildService();
      mocks.experiments.findByIdOrThrow.mockResolvedValue(pendingExperiment());
      mocks.backtesting.run.mockReturnValue({
        evaluation: { overallScore: 9, numberOfTrades: 5 },
      });

      await (service as any).run('exp-1');

      expect(mocks.iterations.createNext).toHaveBeenCalledWith(
        expect.anything(),
        'exp-1',
        'fp-fixed',
      );
    });

    // The whole point of rejecting BEFORE the backtest: a redraw must cost
    // one no-op INSERT, not a full candidate row plus a backtest over the
    // entire candle series.
    it('skips the candidate entirely when createNext reports a duplicate', async () => {
      const { service, mocks } = buildService();
      mocks.experiments.findByIdOrThrow.mockResolvedValue(pendingExperiment());
      mocks.iterations.createNext.mockResolvedValue(null);

      await (service as any).run('exp-1');

      expect(mocks.candidates.createForIteration).not.toHaveBeenCalled();
      expect(mocks.backtesting.run).not.toHaveBeenCalled();
      // No iteration boundary was reached, so there is nothing to announce
      // and no leaderboard rebuild to trigger.
      expect(mocks.events.emitAsync).not.toHaveBeenCalled();
    });

    // A duplicate must not advance `generated` — the counter the UI renders
    // as "N/100 candidate" and the loop's own MAX_CANDIDATES condition.
    // Getting this wrong would make the progress bar count redraws.
    it('stops with SEARCH_SPACE_EXHAUSTED when the generator only redraws duplicates', async () => {
      const { service, mocks } = buildService();
      mocks.experiments.findByIdOrThrow.mockResolvedValue(pendingExperiment());
      mocks.iterations.createNext.mockResolvedValue(null);

      await (service as any).run('exp-1');

      expect(mocks.experiments.finish).toHaveBeenCalledWith(
        'exp-1',
        'COMPLETED',
        'SEARCH_SPACE_EXHAUSTED',
      );
    });
  });

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

    // Regression: reproduced live — extend() raises experiment_configs
    // .iteration_limit in the DB (100 -> 120) and re-enqueues the job, but
    // the SAME worker process's run() kept using a config it had cached
    // in-process from the experiment's FIRST run (maxCandidates: 100).
    // `generated(100) < maxCandidates(100)` was already false, so the loop
    // body never executed a single extra iteration and the experiment
    // immediately re-completed at the old count — exactly what the user
    // saw ("100/110 sau khi bấm chạy thêm"). run() must always read the
    // true, currently-persisted config, regardless of what an earlier
    // run() call for the same experimentId cached in this same process.
    it("reflects a raised iteration_limit on a second run() call in the same process, instead of serving the first call's cached config", async () => {
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

      // First run(): experiment_configs.iteration_limit = 1, nothing
      // generated yet -> loop runs exactly once, then completes.
      mocks.experimentConfigs.findByExperimentId.mockResolvedValue({
        id: 'config-1',
        experiment_id: 'exp-1',
        timeframe: '5m',
        start_time: new Date(),
        end_time: new Date(),
        iteration_limit: 1,
        created_at: new Date(),
      });
      mocks.iterations.countByExperimentId.mockResolvedValue(0);
      await (service as any).run('exp-1');
      expect(mocks.candidates.createForIteration).toHaveBeenCalledTimes(1);

      // extend(): iteration_limit raised to 2 in the DB, one iteration
      // already persisted — same service instance, same in-process cache
      // as the first call.
      mocks.experimentConfigs.findByExperimentId.mockResolvedValue({
        id: 'config-1',
        experiment_id: 'exp-1',
        timeframe: '5m',
        start_time: new Date(),
        end_time: new Date(),
        iteration_limit: 2,
        created_at: new Date(),
      });
      mocks.iterations.countByExperimentId.mockResolvedValue(1);
      await (service as any).run('exp-1');

      // A second candidate must have been generated — proving this call
      // read iteration_limit = 2 fresh, not the first call's cached 1.
      expect(mocks.candidates.createForIteration).toHaveBeenCalledTimes(2);
    });
  });

  describe('buildRunCatalog()', () => {
    it('contributes exactly the static discrete entry for a built-in row — never reads its `parameters` column', () => {
      const { service } = buildService();
      const catalog = (service as any).buildRunCatalog(
        [{ row: { strategy_id: 's-ma', name: 'MA', type: 'SYSTEM', version: 1, parameters: {}, source_code: null, weight: '1' }, key: 'MA' }],
        new Map(),
      );
      expect(catalog.TREND).toHaveLength(1);
    });
  });

  describe('buildRunCatalog() — version/parameter consistency', () => {
    const maRow = {
      strategy_id: 's-ma', name: 'MA', type: 'SYSTEM', version: 1,
      parameters: {}, source_code: null, weight: '1',
    };

    // THE regression guard for the "label lies" bug. Before this, a
    // built-in contributed one entry whose sample() drew parameters at
    // random, while the candidate was pinned to an unrelated version row —
    // so a candidate could read "MA v7" and run parameters v7 never held
    // (reproduced live: v7 stores {11,30}, the candidate ran {50,200}).
    // Every entry must now yield exactly its own version's parameters and
    // carry that version's row id.
    it('emits one entry per selectable version, each sampling exactly that version\'s stored parameters', () => {
      const { service } = buildService();
      const catalog = (service as any).buildRunCatalog(
        [{ row: maRow, key: 'MA' }],
        new Map(),
        [
          { id: 'ma-v11', name: 'MA', version: 11, parameters: { fastPeriod: 10, slowPeriod: 30 } },
          { id: 'ma-v12', name: 'MA', version: 12, parameters: { fastPeriod: 50, slowPeriod: 200 } },
        ],
      );

      expect(catalog.TREND).toHaveLength(2);
      for (const entry of catalog.TREND) {
        // sample() must ignore `random` entirely — a version IS a fixed
        // parameter set, so repeated draws cannot differ.
        const a = entry.sample(() => 0);
        const b = entry.sample(() => 0.99);
        expect(a).toEqual(b);
      }
      const members = catalog.TREND.map((e: any) => e.sample(() => 0));
      expect(members).toEqual([
        { type: 'MA', domain: 'TREND', pluginVersion: 11, strategyId: 'ma-v11', parameters: { fastPeriod: 10, slowPeriod: 30 } },
        { type: 'MA', domain: 'TREND', pluginVersion: 12, strategyId: 'ma-v12', parameters: { fastPeriod: 50, slowPeriod: 200 } },
      ]);
    });

    it('falls back to the in-code sampler when the database has no selectable version, rather than refusing to search', () => {
      const { service } = buildService();
      const catalog = (service as any).buildRunCatalog(
        [{ row: maRow, key: 'MA' }],
        new Map(),
        [],
      );
      expect(catalog.TREND).toHaveLength(1);
    });

    it('places a NEWS_SENTIMENT row in the INFORMATION domain (required-flow #17)', () => {
      const { service } = buildService();
      const catalog = (service as any).buildRunCatalog(
        [{
          row: { strategy_id: 's-ns', name: 'NEWS_SENTIMENT', type: 'SYSTEM', version: 1, parameters: {}, source_code: null, weight: '1' },
          key: 'NEWS_SENTIMENT',
        }],
        new Map(),
        [{ id: 'ns-v2', name: 'NEWS_SENTIMENT', version: 2, parameters: { lookbackHours: 24, buyThreshold: 0.3, sellThreshold: -0.3 } }],
      );
      expect(catalog.INFORMATION).toHaveLength(1);
      expect(catalog.INFORMATION[0].sample(() => 0)).toMatchObject({
        type: 'NEWS_SENTIMENT',
        domain: 'INFORMATION',
        pluginVersion: 2,
        strategyId: 'ns-v2',
      });
    });
  });

  describe('regenerateForStrategyVersion()', () => {
    const experiment = { id: 'exp-1', user_id: 'user-1', search_config: {} };
    const experimentConfigRow = {
      id: 'config-1',
      experiment_id: 'exp-1',
      timeframe: '5m',
      start_time: new Date(),
      end_time: new Date(),
      iteration_limit: 100,
      created_at: new Date(),
    };
    const weightRows = [
      { strategy_id: 'strategy-ma', name: 'MA', type: 'SYSTEM', version: 1, parameters: {}, source_code: null, weight: '0.5' },
      { strategy_id: 'strategy-rsi', name: 'RSI', type: 'SYSTEM', version: 1, parameters: {}, source_code: null, weight: '0.5' },
    ];
    // The user just saved MA v8; RSI is untouched at its SYSTEM v1.
    const latestForUser = [
      { id: 'strategy-ma-v8', name: 'MA', type: 'USER', version: 8, parameters: { fastPeriod: 11, slowPeriod: 30 } },
      { id: 'strategy-rsi', name: 'RSI', type: 'SYSTEM', version: 1, parameters: {} },
    ];
    function topMembers(candidateId: string, score: string) {
      return [
        { candidate_id: candidateId, overall_score: score, strategy_id: 'strategy-ma', name: 'MA', strategy_type: 'SYSTEM', version: 1, parameters: { fastPeriod: 20, slowPeriod: 50 } },
        { candidate_id: candidateId, overall_score: score, strategy_id: 'strategy-rsi', name: 'RSI', strategy_type: 'SYSTEM', version: 1, parameters: { period: 14 } },
      ];
    }
    function arrange(mocks: any, members: unknown[]) {
      mocks.experiments.findOwned.mockResolvedValue(experiment);
      mocks.experiments.findByIdOrThrow.mockResolvedValue(experiment);
      mocks.experimentConfigs.findByExperimentId.mockResolvedValue(experimentConfigRow);
      mocks.experimentConfigs.weightsByExperimentId.mockResolvedValue(weightRows);
      mocks.strategies.listLatestForUser.mockResolvedValue(latestForUser);
      mocks.candidates.listTopCandidateMembers.mockResolvedValue(members);
      mocks.backtesting.run.mockReturnValue({ evaluation: { overallScore: 9, numberOfTrades: 5 } });
    }

    it('throws NotFoundException when the experiment is not owned by this user', async () => {
      const { service, mocks } = buildService();
      mocks.experiments.findOwned.mockResolvedValue(null);

      await expect(
        service.regenerateForStrategyVersion('exp-1', 'user-1', 'MA'),
      ).rejects.toThrow('Experiment not found.');
    });

    it('rejects a strategy name that has no row this user can see', async () => {
      const { service, mocks } = buildService();
      arrange(mocks, []);
      mocks.strategies.listLatestForUser.mockResolvedValue([]);

      await expect(
        service.regenerateForStrategyVersion('exp-1', 'user-1', 'MA'),
      ).rejects.toThrow(BadRequestException);
    });

    it('regenerates each affected combination onto the new version, substituting ONLY the changed strategy', async () => {
      const { service, mocks } = buildService();
      arrange(mocks, topMembers('cand-a', '80'));

      const result = await service.regenerateForStrategyVersion('exp-1', 'user-1', 'MA');

      expect(result.regenerated).toBe(1);
      // The persisted candidate points at the NEW MA row and keeps the old RSI row.
      const [, , persistedMembers] = mocks.candidates.createForIteration.mock.calls[0];
      expect(persistedMembers).toEqual([
        { strategyId: 'strategy-ma-v8', parameters: { fastPeriod: 11, slowPeriod: 30 } },
        { strategyId: 'strategy-rsi', parameters: { period: 14 } },
      ]);
      // ...and the backtested definition carries the new version number.
      const [definitionArg] = mocks.backtesting.run.mock.calls[0];
      expect(definitionArg.members).toEqual([
        { type: 'MA', domain: 'TREND', pluginVersion: 8, parameters: { fastPeriod: 11, slowPeriod: 30 } },
        { type: 'RSI', domain: 'MOMENTUM', pluginVersion: 1, parameters: { period: 14 } },
      ]);
      expect(mocks.events.emitAsync).toHaveBeenCalledWith(
        DomainEventNames.CandidatesRegenerated,
        expect.objectContaining({ experimentId: 'exp-1', candidateIds: ['candidate-1'] }),
      );
    });

    it('never touches the Search generator — regeneration is deliberate, not a random sample', async () => {
      const { service, mocks } = buildService();
      arrange(mocks, topMembers('cand-a', '80'));

      await service.regenerateForStrategyVersion('exp-1', 'user-1', 'MA');

      expect(mocks.generator.generate).not.toHaveBeenCalled();
    });

    it('produces ONE new candidate per distinct combination, not one per leaderboard row', async () => {
      const { service, mocks } = buildService();
      // Two different candidates, same MA+RSI combination, different params.
      arrange(mocks, [...topMembers('cand-a', '80'), ...topMembers('cand-b', '70')]);

      const result = await service.regenerateForStrategyVersion('exp-1', 'user-1', 'MA');

      expect(result.regenerated).toBe(1);
      expect(mocks.candidates.createForIteration).toHaveBeenCalledTimes(1);
    });

    it('skips combinations that do not contain the changed strategy', async () => {
      const { service, mocks } = buildService();
      arrange(mocks, [
        { candidate_id: 'cand-a', overall_score: '80', strategy_id: 'strategy-rsi', name: 'RSI', strategy_type: 'SYSTEM', version: 1, parameters: { period: 14 } },
        { candidate_id: 'cand-a', overall_score: '80', strategy_id: 'strategy-bollinger', name: 'BOLLINGER', strategy_type: 'SYSTEM', version: 1, parameters: { period: 20 } },
      ]);

      const result = await service.regenerateForStrategyVersion('exp-1', 'user-1', 'MA');

      expect(result.regenerated).toBe(0);
      expect(mocks.candidates.createForIteration).not.toHaveBeenCalled();
      expect(mocks.events.emitAsync).not.toHaveBeenCalledWith(
        DomainEventNames.CandidatesRegenerated,
        expect.anything(),
      );
    });

    it('skips a combination already running the new version instead of duplicating it', async () => {
      const { service, mocks } = buildService();
      arrange(mocks, [
        { candidate_id: 'cand-a', overall_score: '80', strategy_id: 'strategy-ma-v8', name: 'MA', strategy_type: 'USER', version: 8, parameters: { fastPeriod: 11, slowPeriod: 30 } },
        { candidate_id: 'cand-a', overall_score: '80', strategy_id: 'strategy-rsi', name: 'RSI', strategy_type: 'SYSTEM', version: 1, parameters: { period: 14 } },
      ]);

      const result = await service.regenerateForStrategyVersion('exp-1', 'user-1', 'MA');

      expect(result.regenerated).toBe(0);
      expect(mocks.candidates.createForIteration).not.toHaveBeenCalled();
    });

    // Regression guard for a bug found only by live verification: after the
    // first cascade the Leaderboard holds BOTH the migrated candidate (MA
    // v8) and the older ones (MA v1) of the same combination. Skipping only
    // the already-migrated candidate left an older one free to seed a
    // duplicate, so every extra cascade minted another identical candidate.
    // Idempotency has to be tracked per COMBINATION, not per candidate.
    it('is idempotent: re-running with the Leaderboard holding both migrated and pre-migration candidates of one combination creates nothing', async () => {
      const { service, mocks } = buildService();
      arrange(mocks, [
        // Already migrated (rank 1).
        { candidate_id: 'cand-new', overall_score: '90', strategy_id: 'strategy-ma-v8', name: 'MA', strategy_type: 'USER', version: 8, parameters: { fastPeriod: 11, slowPeriod: 30 } },
        { candidate_id: 'cand-new', overall_score: '90', strategy_id: 'strategy-rsi', name: 'RSI', strategy_type: 'SYSTEM', version: 1, parameters: { period: 14 } },
        // Same combination, still on the old version (rank 2).
        { candidate_id: 'cand-old', overall_score: '80', strategy_id: 'strategy-ma', name: 'MA', strategy_type: 'SYSTEM', version: 1, parameters: { fastPeriod: 20, slowPeriod: 50 } },
        { candidate_id: 'cand-old', overall_score: '80', strategy_id: 'strategy-rsi', name: 'RSI', strategy_type: 'SYSTEM', version: 1, parameters: { period: 14 } },
      ]);

      const result = await service.regenerateForStrategyVersion('exp-1', 'user-1', 'MA');

      expect(result.regenerated).toBe(0);
      expect(mocks.candidates.createForIteration).not.toHaveBeenCalled();
      expect(mocks.events.emitAsync).not.toHaveBeenCalledWith(
        DomainEventNames.CandidatesRegenerated,
        expect.anything(),
      );
    });

    it('marks a failed regeneration FAILED and keeps going rather than failing the whole cascade', async () => {
      const { service, mocks } = buildService();
      arrange(mocks, topMembers('cand-a', '80'));
      mocks.backtesting.run.mockImplementation(() => {
        throw new Error('backtest exploded');
      });

      const result = await service.regenerateForStrategyVersion('exp-1', 'user-1', 'MA');

      expect(result.regenerated).toBe(0);
      expect(result.skipped).toBe(1);
      expect(mocks.iterations.fail).toHaveBeenCalledWith(
        'iteration-1',
        expect.stringContaining('backtest exploded'),
      );
      expect(mocks.backtestRuns.fail).toHaveBeenCalledWith(
        'candidate-1',
        expect.stringContaining('backtest exploded'),
      );
      expect(mocks.events.emitAsync).not.toHaveBeenCalledWith(
        DomainEventNames.CandidatesRegenerated,
        expect.anything(),
      );
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

    // Regression for the Critical finding: maxDurationSeconds/
    // maxNoImprovement/topK used to live only in the
    // in-process configCache populated by start() (API process), so the
    // worker process (which never calls start()) always reconstructed
    // DEFAULT_SEARCH_CONFIG instead of what the caller submitted. They
    // must now be persisted on experiments.search_config so any process
    // reading loadConfig() from a bare DB row (no cache) recovers the
    // real values.
    it('persists non-default topK/maxDurationSeconds/maxNoImprovement on the experiment row so a cache-less process can recover them', async () => {
      const { service, mocks } = buildService();
      mocks.experiments.create.mockResolvedValue({
        id: 'exp-1',
        user_id: 'user-1',
        name: null,
        status: 'PENDING',
        started_at: null,
        completed_at: null,
        created_at: new Date(),
        search_config: {},
      });
      const request: StartSearchRequest = {
        ...baseRequest,
        enabledDomains: ['TREND', 'MOMENTUM', 'VOLATILITY', 'STRUCTURE'],
        strategyWeights: [
          { type: 'MA', weight: 0.25 },
          { type: 'RSI', weight: 0.25 },
          { type: 'BOLLINGER', weight: 0.2 },
          { type: 'SUPPORT_RESISTANCE', weight: 0.3 },
        ],
        maxDurationSeconds: 60,
        maxNoImprovement: 5,
        topK: 3,
      };

      await service.start('user-1', request);

      expect(mocks.experiments.create).toHaveBeenCalledWith(
        'user-1',
        null,
        expect.anything(),
        {
          maxDurationSeconds: 60,
          maxNoImprovement: 5,
          topK: 3,
          // The cost model travels with the rest of the config so a
          // re-run in any process reproduces the same trades.
          costs: {
            initialCapital: 10_000,
            transactionCostPct: 0,
            slippageBps: 0,
            stopLossPct: null,
            takeProfitPct: null,
          },
        },
      );

      // Simulate a *different process* — a fresh service instance with an
      // empty configCache (i.e. the worker, or the API after a restart) —
      // whose getTop() -> loadConfig() must recover topK from
      // the DB row alone, not from DEFAULT_SEARCH_CONFIG or the first
      // service's in-memory cache.
      const worker = buildService();
      worker.mocks.experiments.findOwned.mockResolvedValue({
        id: 'exp-1',
        user_id: 'user-1',
      } as ExperimentEntity);
      worker.mocks.experiments.findByIdOrThrow.mockResolvedValue({
        id: 'exp-1',
        user_id: 'user-1',
        name: null,
        status: 'RUNNING',
        started_at: new Date(),
        completed_at: null,
        created_at: new Date(),
        search_config: { maxDurationSeconds: 60, maxNoImprovement: 5, topK: 3 },
      } satisfies ExperimentEntity);
      worker.mocks.experiments.top.mockResolvedValue([]);
      worker.mocks.cache.get.mockResolvedValue(null);

      await worker.service.getTop('exp-1', 'user-1', 10);

      // topK: 3 (not the default 10) proves the reconstruction read the
      // real persisted value, not DEFAULT_SEARCH_CONFIG.
      expect(worker.mocks.experiments.top).toHaveBeenCalledWith('exp-1', 'user-1', 100);
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
      return { id: 'exp-1', user_id: 'user-1', search_config: {} } as ExperimentEntity;
    }

    it('queries the DB and caches the result on a cache miss', async () => {
      const { service, mocks } = buildService();
      mocks.experiments.findOwned.mockResolvedValue(ownedExperiment());
      mocks.experiments.findByIdOrThrow.mockResolvedValue(ownedExperiment());
      mocks.experiments.top.mockResolvedValue([{ rank: 1, candidate_id: 'c1' }]);
      mocks.cache.get.mockResolvedValue(null); // both version and data lookups miss

      const result = await service.getTop('exp-1', 'user-1', 10);

      expect(mocks.experiments.top).toHaveBeenCalledWith('exp-1', 'user-1', 100);
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
      mocks.experiments.findByIdOrThrow.mockResolvedValue(ownedExperiment());
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
      mocks.experiments.findByIdOrThrow.mockResolvedValue(ownedExperiment());
      mocks.experiments.top.mockResolvedValue([]);
      mocks.cache.get.mockImplementation((key: string) =>
        key.startsWith('leaderboard:version:') ? Promise.resolve(3) : Promise.resolve(null),
      );

      await service.getTop('exp-1', 'user-1', 10);

      expect(mocks.cache.get).toHaveBeenCalledWith('strategy-search:top:exp-1:user-1:v3');
    });

    // Regression test for the API/worker leaderboard-size divergence: the
    // worker persists leaderboards.top_k / leaderboard_entries using the
    // experiment's own search_config.topK (see run()'s
    // config.topK carried on the `backtest.completed` event payload).
    // getTop() must default to that SAME value when the caller omits
    // `limit`, not a hard-coded row count — otherwise a fresh page load (no
    // client-side lastConfig) disagrees with what was actually persisted.
    it('defaults to the experiment persisted topK when limit is omitted, not a hard-coded default', async () => {
      const { service, mocks } = buildService();
      const experiment = {
        id: 'exp-1',
        user_id: 'user-1',
        name: null,
        status: 'COMPLETED',
        started_at: new Date(),
        completed_at: new Date(),
        created_at: new Date(),
        search_config: { maxDurationSeconds: 60, maxNoImprovement: 5, topK: 4 },
      } satisfies ExperimentEntity;
      mocks.experiments.findOwned.mockResolvedValue(experiment);
      mocks.experiments.findByIdOrThrow.mockResolvedValue(experiment);
      const fullList = Array.from({ length: 20 }, (_, i) => ({ rank: i + 1, candidate_id: `c${i}` }));
      mocks.experiments.top.mockResolvedValue(fullList);
      mocks.cache.get.mockResolvedValue(null); // both version and data lookups miss

      const result = await service.getTop('exp-1', 'user-1', undefined);

      // Cached fetch always pulls the full LEADERBOARD_TOP_CACHE_MAX_ENTRIES
      // superset (see leaderboard-cache-keys.ts) — the assertion that
      // matters is the RETURNED slice, which must be exactly topK=4 long,
      // not the old hard-coded 10.
      expect(result).toEqual(fullList.slice(0, 4));
      expect(result).toHaveLength(4);
    });
  });
});

// Wiring, not behaviour: the specs above build StrategySearchService with
// `new`, so they would keep passing even if the module still injected the
// concrete generator. Required flow #7 ("Search algorithms must remain
// replaceable without changing downstream backtesting") only holds if the
// binding is a token.
describe('StrategySearchModule search-algorithm binding', () => {
  it('binds SEARCH_ALGORITHM to the shipped generator via useExisting', () => {
    const providers = Reflect.getMetadata(
      'providers',
      StrategySearchModule,
    ) as Array<{ provide?: unknown; useExisting?: unknown }>;
    const binding = providers.find((p) => p?.provide === SEARCH_ALGORITHM);

    expect(binding).toBeDefined();
    // useExisting, not useClass: one generator instance, so a stateful
    // algorithm cannot end up with two divergent copies.
    expect(binding?.useExisting).toBe(DomainGuidedRandomGenerator);
  });

  it('injects the token into StrategySearchService, not the concrete class', () => {
    const injected = Reflect.getMetadata(
      'self:paramtypes',
      StrategySearchService,
    ) as Array<{ index: number; param: unknown }> | undefined;

    expect(injected?.some((entry) => entry.param === SEARCH_ALGORITHM)).toBe(true);
  });
});
