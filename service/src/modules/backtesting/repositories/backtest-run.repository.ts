import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../../../database/database.service';
import { BacktestResult } from '../backtesting.types';

@Injectable()
export class BacktestRunRepository {
  constructor(private readonly database: DatabaseService) {}

  async complete(candidateId: string, result: BacktestResult): Promise<void> {
    await this.database.withTransaction(async (client: PoolClient) => {
      const run = await client.query<{ id: string }>(
        `INSERT INTO backtest_runs (candidate_id, status, started_at, completed_at)
         VALUES ($1, 'COMPLETED', NOW(), NOW())
         ON CONFLICT (candidate_id) DO UPDATE SET
           status = 'COMPLETED', completed_at = NOW(), error_message = NULL
         RETURNING id`,
        [candidateId],
      );
      const runId = run.rows[0].id;
      await client.query(`DELETE FROM trades WHERE backtest_run_id = $1`, [runId]);
      for (const trade of result.trades) {
        await client.query(
          `INSERT INTO trades (
             backtest_run_id, side, entry_time, entry_price, quantity,
             stop_loss, take_profit,
             exit_time, exit_price, profit_loss, return_pct, exit_reason
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [
            runId,
            trade.side,
            trade.entryTime,
            trade.entryPrice,
            trade.quantity,
            trade.stopLoss,
            trade.takeProfit,
            trade.exitTime,
            trade.exitPrice,
            trade.profitLoss,
            trade.returnPercent,
            trade.exitReason,
          ],
        );
      }
      const evaluation = result.evaluation;
      await client.query(
        `INSERT INTO evaluations (
           backtest_run_id, total_return, profit_loss, win_rate, max_drawdown,
           number_of_trades, profit_factor, sharpe_ratio, overall_score
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (backtest_run_id) DO UPDATE SET
           total_return = EXCLUDED.total_return,
           profit_loss = EXCLUDED.profit_loss,
           win_rate = EXCLUDED.win_rate,
           max_drawdown = EXCLUDED.max_drawdown,
           number_of_trades = EXCLUDED.number_of_trades,
           profit_factor = EXCLUDED.profit_factor,
           sharpe_ratio = EXCLUDED.sharpe_ratio,
           overall_score = EXCLUDED.overall_score`,
        [
          runId,
          evaluation.totalReturn,
          evaluation.profitLoss,
          evaluation.winRate,
          evaluation.maxDrawdown,
          evaluation.numberOfTrades,
          evaluation.profitFactor,
          evaluation.sharpeRatio,
          evaluation.overallScore,
        ],
      );
    });
  }

  async fail(candidateId: string, message: string): Promise<void> {
    await this.database.query(
      `INSERT INTO backtest_runs (candidate_id, status, started_at, completed_at, error_message)
       VALUES ($1, 'FAILED', NOW(), NOW(), $2)
       ON CONFLICT (candidate_id) DO UPDATE SET
         status = 'FAILED', completed_at = NOW(), error_message = EXCLUDED.error_message`,
      [candidateId, message.slice(0, 4000)],
    );
  }
}
