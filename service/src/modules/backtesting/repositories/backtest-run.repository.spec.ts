import { PoolClient } from 'pg';
import { DatabaseService } from '../../../database/database.service';
import { BacktestRunRepository } from './backtest-run.repository';
import { BacktestResult } from '../backtesting.types';

describe('BacktestRunRepository', () => {
  const RUN_ID = 'run-1';
  const CANDIDATE_ID = 'candidate-1';

  const result: BacktestResult = {
    trades: [
      {
        side: 'LONG',
        entryTime: new Date('2026-01-01T00:00:00Z'),
        entryPrice: 100,
        exitTime: new Date('2026-01-02T00:00:00Z'),
        exitPrice: 110,
        quantity: 1,
        profitLoss: 10,
        returnPercent: 8,
        exitReason: 'SIGNAL',
      },
      {
        side: 'LONG',
        entryTime: new Date('2026-01-03T00:00:00Z'),
        entryPrice: 200,
        exitTime: new Date('2026-01-04T00:00:00Z'),
        exitPrice: 190,
        quantity: 2,
        profitLoss: -20,
        returnPercent: -5,
        exitReason: 'END_OF_BACKTEST',
      },
    ],
    evaluation: {
      totalReturn: 10,
      profitLoss: -10,
      winRate: 0.5,
      maxDrawdown: 3,
      numberOfTrades: 2,
      profitFactor: 1.2,
      sharpeRatio: 0.9,
      overallScore: 55.5,
    },
  };

  describe('complete', () => {
    // Returns a distinct run id only for the RETURNING id upsert, so a bug
    // that reused candidateId (or any other value) as the run id in a later
    // statement would surface as a mismatched bound parameter below.
    const query = jest.fn().mockImplementation((sql: string) => {
      if (sql.includes('RETURNING id')) {
        return Promise.resolve({ rows: [{ id: RUN_ID }] });
      }
      return Promise.resolve({ rows: [] });
    });
    const client = { query } as unknown as PoolClient;
    const database = {
      withTransaction: (cb: (c: PoolClient) => Promise<void>) => cb(client),
    } as unknown as DatabaseService;

    beforeEach(() => {
      query.mockClear();
    });

    it('writes backtest_runs, then deletes prior trades, then inserts each trade, then upserts the evaluation, in that order', async () => {
      const repository = new BacktestRunRepository(database);

      await repository.complete(CANDIDATE_ID, result);

      expect(query).toHaveBeenCalledTimes(5);

      const calls = query.mock.calls;
      const [runSql, runParams] = calls[0];
      const [deleteSql, deleteParams] = calls[1];
      const [trade1Sql] = calls[2];
      const [trade2Sql] = calls[3];
      const [evalSql] = calls[4];

      expect(runSql).toContain('INSERT INTO backtest_runs');
      expect(runParams).toEqual([CANDIDATE_ID]);

      expect(deleteSql).toContain('DELETE FROM trades');
      expect(deleteParams).toEqual([RUN_ID]);

      expect(trade1Sql).toContain('INSERT INTO trades');
      expect(trade2Sql).toContain('INSERT INTO trades');

      expect(evalSql).toContain('INSERT INTO evaluations');
    });

    it('binds the run id and every trade field to the correct positional parameter', async () => {
      const repository = new BacktestRunRepository(database);

      await repository.complete(CANDIDATE_ID, result);

      const calls = query.mock.calls;
      const trade1Params = calls[2][1] as unknown[];
      const trade2Params = calls[3][1] as unknown[];

      // columns: backtest_run_id, side, entry_time, entry_price, quantity,
      //          exit_time, exit_price, profit_loss, return_pct, exit_reason
      expect(trade1Params).toEqual([
        RUN_ID,
        'LONG',
        result.trades[0].entryTime,
        100,
        1,
        result.trades[0].exitTime,
        110,
        10, // profit_loss <- profitLoss
        8, // return_pct <- returnPercent
        'SIGNAL',
      ]);

      expect(trade2Params).toEqual([
        RUN_ID,
        'LONG',
        result.trades[1].entryTime,
        200,
        2,
        result.trades[1].exitTime,
        190,
        -20, // profit_loss <- profitLoss
        -5, // return_pct <- returnPercent
        'END_OF_BACKTEST',
      ]);
    });

    it('binds the run id and every evaluation field to the correct positional parameter', async () => {
      const repository = new BacktestRunRepository(database);

      await repository.complete(CANDIDATE_ID, result);

      const evalParams = query.mock.calls[4][1] as unknown[];

      // columns: backtest_run_id, total_return, profit_loss, win_rate, max_drawdown,
      //          number_of_trades, profit_factor, sharpe_ratio, overall_score
      expect(evalParams).toEqual([
        RUN_ID,
        10, // totalReturn
        -10, // profitLoss
        0.5, // winRate
        3, // maxDrawdown
        2, // numberOfTrades
        1.2, // profitFactor
        0.9, // sharpeRatio
        55.5, // overallScore
      ]);
    });
  });

  describe('fail', () => {
    it('upserts a FAILED backtest_runs row for the candidate with a truncated error message', async () => {
      const query = jest.fn().mockResolvedValue({ rows: [] });
      const database = { query } as unknown as DatabaseService;
      const repository = new BacktestRunRepository(database);
      const longMessage = 'x'.repeat(5000);

      await repository.fail(CANDIDATE_ID, longMessage);

      expect(query).toHaveBeenCalledTimes(1);
      const [sql, params] = query.mock.calls[0];
      expect(sql).toContain('INSERT INTO backtest_runs');
      expect(sql).toContain("'FAILED'");
      expect(params).toEqual([CANDIDATE_ID, 'x'.repeat(4000)]);
    });
  });
});
