import { PoolClient } from 'pg';
import { DatabaseService } from '../../../database/database.service';
import { BacktestRunRepository } from './backtest-run.repository';
import { BacktestResult } from '../backtesting.types';

describe('BacktestRunRepository', () => {
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
        returnPercent: 10,
        exitReason: 'SIGNAL',
      },
    ],
    evaluation: {
      totalReturn: 10,
      profitLoss: 10,
      winRate: 1,
      maxDrawdown: 0,
      numberOfTrades: 1,
      profitFactor: null,
      sharpeRatio: null,
      overallScore: 55.5,
    },
  };

  it('inserts a completed backtest_runs row, its trades, then its evaluation', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [{ id: 'run-1' }] });
    const client = { query } as unknown as PoolClient;
    const database = {
      withTransaction: (cb: (c: PoolClient) => Promise<void>) => cb(client),
    } as unknown as DatabaseService;
    const repository = new BacktestRunRepository(database);

    await repository.complete('candidate-1', result);

    const statements = query.mock.calls.map((call) => call[0] as string);
    expect(statements.some((sql) => sql.includes('INSERT INTO backtest_runs'))).toBe(true);
    expect(statements.some((sql) => sql.includes('INSERT INTO trades'))).toBe(true);
    expect(statements.some((sql) => sql.includes('INSERT INTO evaluations'))).toBe(true);
  });
});
