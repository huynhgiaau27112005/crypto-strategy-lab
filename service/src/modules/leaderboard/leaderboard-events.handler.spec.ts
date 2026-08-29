import { Test } from '@nestjs/testing';
import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter';
import { LeaderboardEventsHandler } from './leaderboard-events.handler';
import { LeaderboardService } from './leaderboard.service';
import { DomainEventNames } from '../../domain-events';

function makeLeaderboard() {
  return { rebuildForExperiment: jest.fn().mockResolvedValue(undefined) };
}

const iterationPayload = {
  experimentId: 'exp-1',
  candidateId: 'cand-1',
  iterationId: 'iter-1',
  topK: 7,
  minimumTrades: 20,
};

describe('LeaderboardEventsHandler', () => {
  describe('iteration boundary (backtest.completed / backtest.failed)', () => {
    it('rebuilds with the topK and minimumTrades carried on the payload, not defaults of its own', async () => {
      const leaderboard = makeLeaderboard();
      const handler = new LeaderboardEventsHandler(leaderboard as any);

      await handler.onIterationBoundary(iterationPayload);

      expect(leaderboard.rebuildForExperiment).toHaveBeenCalledWith('exp-1', 7, 20);
    });

    // The rebuild used to run after EVERY iteration, deliberately outside
    // run()'s backtest try/catch. Subscribing to the failure event too is
    // what keeps the rebuild count (and the cache-version bump count)
    // identical to the pre-refactor behavior.
    it('also rebuilds on a FAILED iteration — the rebuild is an iteration boundary, not new data', async () => {
      const leaderboard = makeLeaderboard();
      const handler = new LeaderboardEventsHandler(leaderboard as any);

      await handler.onIterationBoundary({
        experimentId: 'exp-1',
        iterationId: 'iter-1',
        reason: 'backtest exploded',
        topK: 7,
        minimumTrades: 20,
      });

      expect(leaderboard.rebuildForExperiment).toHaveBeenCalledWith('exp-1', 7, 20);
    });

    // Preserves run()'s original try/catch: the backtest rows are already
    // committed, so a transient rebuild failure must not fail the search.
    it('swallows a rebuild failure so the search loop keeps running', async () => {
      const leaderboard = makeLeaderboard();
      leaderboard.rebuildForExperiment.mockRejectedValue(new Error('db down'));
      const handler = new LeaderboardEventsHandler(leaderboard as any);

      await expect(handler.onIterationBoundary(iterationPayload)).resolves.toBeUndefined();
    });
  });

  describe('candidates.regenerated', () => {
    it('rebuilds with the payload config', async () => {
      const leaderboard = makeLeaderboard();
      const handler = new LeaderboardEventsHandler(leaderboard as any);

      await handler.onCandidatesRegenerated({
        experimentId: 'exp-9',
        candidateIds: ['c1', 'c2'],
        topK: 5,
        minimumTrades: 3,
      });

      expect(leaderboard.rebuildForExperiment).toHaveBeenCalledWith('exp-9', 5, 3);
    });

    // The opposite policy to the iteration boundary above, and the reason
    // the two handlers are not merged: the regenerate endpoint is a
    // synchronous user action where a failed rebuild has always produced a
    // 5xx, never a 200 carrying a stale leaderboard.
    it('lets a rebuild failure propagate so the regenerate request still fails loudly', async () => {
      const leaderboard = makeLeaderboard();
      leaderboard.rebuildForExperiment.mockRejectedValue(new Error('db down'));
      const handler = new LeaderboardEventsHandler(leaderboard as any);

      await expect(
        handler.onCandidatesRegenerated({
          experimentId: 'exp-9',
          candidateIds: ['c1'],
          topK: 5,
          minimumTrades: 3,
        }),
      ).rejects.toThrow('db down');
    });
  });

  // Everything above tests the handler by calling it directly, which proves
  // the policies but NOT that the events actually reach it. This block wires
  // a real EventEmitterModule so a subscription that was never registered
  // (wrong event name, missing provider, module not in the graph) fails
  // here instead of silently in production — the failure mode that no
  // mock-based test in this repo can see.
  describe('wiring through a real EventEmitterModule', () => {
    async function bootstrap() {
      const leaderboard = makeLeaderboard();
      const moduleRef = await Test.createTestingModule({
        imports: [EventEmitterModule.forRoot({ wildcard: false })],
        providers: [
          LeaderboardEventsHandler,
          { provide: LeaderboardService, useValue: leaderboard },
        ],
      }).compile();
      await moduleRef.init();
      return { leaderboard, emitter: moduleRef.get(EventEmitter2), moduleRef };
    }

    it.each([
      DomainEventNames.BacktestCompleted,
      DomainEventNames.BacktestFailed,
      DomainEventNames.CandidatesRegenerated,
    ])('a real emit of "%s" reaches the handler', async (eventName) => {
      const { leaderboard, emitter, moduleRef } = await bootstrap();

      await emitter.emitAsync(eventName, { ...iterationPayload, candidateIds: ['c1'], reason: 'x' });

      expect(leaderboard.rebuildForExperiment).toHaveBeenCalledWith('exp-1', 7, 20);
      await moduleRef.close();
    });

    // Direct-call tests cannot see this: @nestjs/event-emitter wraps every
    // listener in a try/catch that logs and swallows unless
    // suppressErrors:false is set, so the rejection this endpoint relies on
    // would disappear between the handler and the emit site.
    it('propagates a regenerate rebuild failure through the real emitter, not just out of the handler', async () => {
      const { leaderboard, emitter, moduleRef } = await bootstrap();
      leaderboard.rebuildForExperiment.mockRejectedValue(new Error('db down'));

      await expect(
        emitter.emitAsync(DomainEventNames.CandidatesRegenerated, {
          experimentId: 'exp-9',
          candidateIds: ['c1'],
          topK: 5,
          minimumTrades: 3,
        }),
      ).rejects.toThrow('db down');
      await moduleRef.close();
    });

    // The mirror image of the test above: the per-iteration path must stay
    // silent so a transient rebuild failure cannot fail a search job whose
    // backtest rows are already committed.
    it('does NOT propagate an iteration-boundary rebuild failure through the real emitter', async () => {
      const { leaderboard, emitter, moduleRef } = await bootstrap();
      leaderboard.rebuildForExperiment.mockRejectedValue(new Error('db down'));

      await expect(
        emitter.emitAsync(DomainEventNames.BacktestCompleted, iterationPayload),
      ).resolves.toBeDefined();
      await moduleRef.close();
    });

    // emitAsync, unlike emit, awaits async listeners — the property
    // StrategySearchService.run() depends on to keep rebuilds ordered
    // against experiments.finish().
    it('emitAsync waits for the listener to finish before resolving', async () => {
      const { leaderboard, emitter, moduleRef } = await bootstrap();
      let settled = false;
      leaderboard.rebuildForExperiment.mockImplementation(
        () =>
          new Promise<void>((resolve) =>
            setTimeout(() => {
              settled = true;
              resolve();
            }, 10),
          ),
      );

      await emitter.emitAsync(DomainEventNames.BacktestCompleted, iterationPayload);

      expect(settled).toBe(true);
      await moduleRef.close();
    });
  });
});
