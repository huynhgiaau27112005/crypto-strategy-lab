import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../../../database/database.service';
import {
  CandidateEntity,
  TradeExitReason,
  TradeSide,
} from '../../../database/types';
import { SearchStrategyType, strategyTypeKey } from '../domain/search.types';

export interface CandidateStrategyInput {
  strategyId: string;
  parameters: Record<string, unknown>;
}

export interface CandidateDetailMember {
  type: SearchStrategyType;
  parameters: Record<string, number>;
  weight: number;
}

export interface CandidateDetailEvaluation {
  totalReturn: number;
  profitLoss: number;
  winRate: number;
  maxDrawdown: number;
  numberOfTrades: number;
  profitFactor: number;
  sharpeRatio: number;
  overallScore: number;
}

export interface TradeRow {
  id: string;
  side: TradeSide;
  entryTime: Date;
  entryPrice: number;
  quantity: number;
  stopLoss: number | null;
  takeProfit: number | null;
  exitTime: Date | null;
  exitPrice: number | null;
  profitLoss: number | null;
  returnPct: number | null;
  exitReason: TradeExitReason | null;
}

export interface CandidateDetail {
  candidateId: string;
  experimentId: string;
  iterationNumber: number;
  members: CandidateDetailMember[];
  evaluation: CandidateDetailEvaluation | null;
  trades: TradeRow[];
  tradeTotal: number;
}

interface CandidateHeaderRow {
  candidate_id: string;
  experiment_id: string;
  iteration_number: number;
  evaluation_id: string | null;
  total_return: string | null;
  profit_loss: string | null;
  win_rate: string | null;
  max_drawdown: string | null;
  number_of_trades: number | null;
  profit_factor: string | null;
  sharpe_ratio: string | null;
  overall_score: string | null;
}

interface CandidateMemberRow {
  strategy_id: string;
  name: string;
  strategy_type: 'SYSTEM' | 'USER' | 'AI_GENERATED';
  parameters: Record<string, number>;
  weight: string;
}

interface TradeDetailRow {
  id: string;
  side: TradeSide;
  entry_time: Date;
  entry_price: string;
  quantity: string;
  stop_loss: string | null;
  take_profit: string | null;
  exit_time: Date | null;
  exit_price: string | null;
  profit_loss: string | null;
  return_pct: string | null;
  exit_reason: TradeExitReason | null;
}

@Injectable()
export class CandidateRepository {
  constructor(private readonly database: DatabaseService) {}

  async createForIteration(
    client: PoolClient,
    iterationId: string,
    members: CandidateStrategyInput[],
  ): Promise<CandidateEntity> {
    const candidateResult = await client.query<CandidateEntity>(
      `INSERT INTO candidates (iteration_id) VALUES ($1) RETURNING *`,
      [iterationId],
    );
    const candidate = candidateResult.rows[0];
    for (const member of members) {
      await client.query(
        `INSERT INTO candidate_strategies (candidate_id, strategy_id, parameters)
         VALUES ($1, $2, $3)`,
        [candidate.id, member.strategyId, JSON.stringify(member.parameters)],
      );
    }
    return candidate;
  }

  // Returns one candidate's full detail (header + evaluation + weighted
  // members + a page of trades), scoped to the requesting user via
  // candidates -> experiment_iterations -> experiments.user_id, so a bare
  // uuid guess against another user's candidate cannot succeed. Returns
  // null when the candidate does not exist or is not owned by userId.
  async findDetail(
    candidateId: string,
    userId: string,
    page: number,
    pageSize: number,
  ): Promise<CandidateDetail | null> {
    const headerResult = await this.database.query<CandidateHeaderRow>(
      `SELECT
         c.id AS candidate_id,
         e.id AS experiment_id,
         ei.iteration_number,
         ev.id AS evaluation_id,
         ev.total_return, ev.profit_loss, ev.win_rate, ev.max_drawdown,
         ev.number_of_trades, ev.profit_factor, ev.sharpe_ratio, ev.overall_score
       FROM candidates c
       JOIN experiment_iterations ei ON ei.id = c.iteration_id
       JOIN experiments e ON e.id = ei.experiment_id
       LEFT JOIN backtest_runs br ON br.candidate_id = c.id
       LEFT JOIN evaluations ev ON ev.backtest_run_id = br.id
       WHERE c.id = $1 AND e.user_id = $2`,
      [candidateId, userId],
    );
    const header = headerResult.rows[0];
    if (!header) return null;

    const membersResult = await this.database.query<CandidateMemberRow>(
      `SELECT s.id AS strategy_id, s.name, s.type AS strategy_type, cs.parameters, ecs.weight
       FROM candidate_strategies cs
       JOIN strategies s ON s.id = cs.strategy_id
       JOIN candidates c ON c.id = cs.candidate_id
       JOIN experiment_iterations ei ON ei.id = c.iteration_id
       JOIN experiment_configs ec ON ec.experiment_id = ei.experiment_id
       JOIN experiment_config_strategies ecs
         ON ecs.experiment_config_id = ec.id AND ecs.strategy_id = cs.strategy_id
       WHERE cs.candidate_id = $1`,
      [candidateId],
    );

    const offset = (page - 1) * pageSize;
    const tradesResult = await this.database.query<TradeDetailRow>(
      `SELECT t.id, t.side, t.entry_time, t.entry_price, t.quantity,
              t.stop_loss, t.take_profit, t.exit_time, t.exit_price,
              t.profit_loss, t.return_pct, t.exit_reason
       FROM trades t
       JOIN backtest_runs br ON br.id = t.backtest_run_id
       WHERE br.candidate_id = $1
       ORDER BY t.entry_time ASC
       LIMIT $2 OFFSET $3`,
      [candidateId, pageSize, offset],
    );

    const countResult = await this.database.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count
       FROM trades t
       JOIN backtest_runs br ON br.id = t.backtest_run_id
       WHERE br.candidate_id = $1`,
      [candidateId],
    );

    return {
      candidateId: header.candidate_id,
      experimentId: header.experiment_id,
      iterationNumber: header.iteration_number,
      members: membersResult.rows.map((row) => ({
        type: strategyTypeKey({ id: row.strategy_id, name: row.name, type: row.strategy_type }),
        parameters: row.parameters,
        weight: Number(row.weight),
      })),
      evaluation: this.toEvaluation(header),
      trades: tradesResult.rows.map((row) => this.toTradeRow(row)),
      tradeTotal: Number(countResult.rows[0]?.count ?? 0),
    };
  }

  private toEvaluation(
    header: CandidateHeaderRow,
  ): CandidateDetailEvaluation | null {
    if (!header.evaluation_id) return null;
    return {
      totalReturn: Number(header.total_return),
      profitLoss: Number(header.profit_loss),
      winRate: Number(header.win_rate),
      maxDrawdown: Number(header.max_drawdown),
      numberOfTrades: Number(header.number_of_trades),
      profitFactor: Number(header.profit_factor),
      sharpeRatio: Number(header.sharpe_ratio),
      overallScore: Number(header.overall_score),
    };
  }

  private toTradeRow(row: TradeDetailRow): TradeRow {
    return {
      id: row.id,
      side: row.side,
      entryTime: row.entry_time,
      entryPrice: Number(row.entry_price),
      quantity: Number(row.quantity),
      stopLoss: row.stop_loss === null ? null : Number(row.stop_loss),
      takeProfit: row.take_profit === null ? null : Number(row.take_profit),
      exitTime: row.exit_time,
      exitPrice: row.exit_price === null ? null : Number(row.exit_price),
      profitLoss: row.profit_loss === null ? null : Number(row.profit_loss),
      returnPct: row.return_pct === null ? null : Number(row.return_pct),
      exitReason: row.exit_reason,
    };
  }
}
