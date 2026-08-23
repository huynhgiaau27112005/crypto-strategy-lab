import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { BacktestResult } from '../../backtesting/backtesting.types';
import { DatabaseService } from '../../../database/database.service';
import { ExperimentStrategyEntity } from '../../../database/types';

@Injectable()
export class ExperimentStrategyRepository {
  constructor(private readonly database: DatabaseService) {}

  async create(
    experimentId: string,
    strategyId: string,
  ): Promise<{ entity: ExperimentStrategyEntity; isNew: boolean } | null> {
    const result = await this.database.query<ExperimentStrategyEntity>(
      `INSERT INTO experiment_strategies (experiment_id, strategy_id, status)
       VALUES ($1, $2, 'PENDING')
       ON CONFLICT (experiment_id, strategy_id) DO UPDATE SET status = 'PENDING'
         WHERE experiment_strategies.status IN ('PENDING', 'RUNNING')
       RETURNING *, (xmax = 0) AS is_new`,
      [experimentId, strategyId],
    );
    if (!result.rows[0]) return null;
    const row = result.rows[0] as ExperimentStrategyEntity & {
      is_new: boolean;
    };
    return { entity: row, isNew: row.is_new };
  }

  async setRunning(id: string): Promise<void> {
    await this.database.query(
      `UPDATE experiment_strategies SET status = 'RUNNING' WHERE id = $1`,
      [id],
    );
  }

  async complete(id: string, result: BacktestResult): Promise<void> {
    await this.database.withTransaction(async (client) => {
      await client.query(
        `DELETE FROM trades WHERE experiment_strategy_id = $1`,
        [id],
      );
      for (const trade of result.trades)
        await this.insertTrade(client, id, trade);
      const evaluation = result.evaluation;
      await client.query(
        `INSERT INTO evaluations (
           experiment_strategy_id, total_return, profit_loss, win_rate, max_drawdown,
           number_of_trades, profit_factor, sharpe_ratio, overall_score
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (experiment_strategy_id) DO UPDATE SET
           total_return = EXCLUDED.total_return,
           profit_loss = EXCLUDED.profit_loss,
           win_rate = EXCLUDED.win_rate,
           max_drawdown = EXCLUDED.max_drawdown,
           number_of_trades = EXCLUDED.number_of_trades,
           profit_factor = EXCLUDED.profit_factor,
           sharpe_ratio = EXCLUDED.sharpe_ratio,
           overall_score = EXCLUDED.overall_score`,
        [
          id,
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
      await client.query(
        `UPDATE experiment_strategies SET status = 'COMPLETED' WHERE id = $1`,
        [id],
      );
    });
  }

  async fail(id: string): Promise<void> {
    await this.database.query(
      `UPDATE experiment_strategies SET status = 'FAILED' WHERE id = $1`,
      [id],
    );
  }

  private async insertTrade(
    client: PoolClient,
    experimentStrategyId: string,
    trade: BacktestResult['trades'][number],
  ): Promise<void> {
    await client.query(
      `INSERT INTO trades (
         experiment_strategy_id, side, entry_time, entry_price, exit_time,
         exit_price, quantity, profit_loss, return_percent, exit_reason
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        experimentStrategyId,
        trade.side,
        trade.entryTime,
        trade.entryPrice,
        trade.exitTime,
        trade.exitPrice,
        trade.quantity,
        trade.profitLoss,
        trade.returnPercent,
        trade.exitReason,
      ],
    );
  }
}
