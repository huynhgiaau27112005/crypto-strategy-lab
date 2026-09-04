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
  /** Human-readable strategy name from the exact pinned strategy row.
   * For AI members, `type` remains `AI:<strategyId>` for execution while
   * this field is what result UIs should render. */
  name: string;
  /** The exact `strategies` row version this candidate's member was pinned
   * to at experiment-creation time — NOT the currently-latest version for
   * this name/user (that can have moved on since). Rendering the live
   * catalog's version here instead was a real, user-reported bug: after a
   * strategy gained newer saved versions, every OLD candidate's detail
   * view started claiming it too used the newest version, when it had
   * actually run against whatever version was pinned back when it was
   * generated. */
  version: number;
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

/** One row of CandidateRepository.rankedSummaries. */
export interface RankedCandidateSummary {
  candidateId: string;
  /** Member strategy names joined, e.g. "BOLLINGER + MA". */
  combo: string;
  rank: number;
  /** How many completed candidates this experiment has in total. */
  total: number;
  overallScore: number | null;
  profitLoss: number | null;
  winRate: number | null;
  maxDrawdown: number | null;
  numberOfTrades: number;
}

interface RankedCandidateSummaryRow {
  candidate_id: string;
  combo: string | null;
  rank: string;
  total: string;
  overall_score: string | null;
  profit_loss: string | null;
  win_rate: string | null;
  max_drawdown: string | null;
  number_of_trades: number;
}

export interface TopCandidateMemberRow {
  candidate_id: string;
  overall_score: string | null;
  strategy_id: string;
  name: string;
  strategy_type: 'SYSTEM' | 'USER' | 'AI_GENERATED';
  version: number;
  parameters: Record<string, number>;
}

interface CandidateMemberRow {
  strategy_id: string;
  name: string;
  strategy_type: 'SYSTEM' | 'USER' | 'AI_GENERATED';
  version: number;
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

  /**
   * The members of the experiment's currently top-ranked candidates (same
   * ordering/filter `ExperimentRepository.top` uses, so this sees exactly
   * what the Leaderboard shows), flattened one row per member.
   *
   * Used by `StrategySearchService.regenerateForStrategyVersion` to answer
   * "which combinations on this Leaderboard contain the strategy the user
   * just saved a new parameter version for" — the prototype's `saveParams`
   * cascade ("hệ thống sinh lại N tổ hợp có chứa strategy này thành version
   * tổ hợp mới trong Leaderboard"). Scoped to the owning user, and bounded
   * by `limit` so the cascade can never fan out past the Leaderboard's own
   * Top-K.
   */
  async listTopCandidateMembers(
    experimentId: string,
    userId: string,
    limit: number,
  ): Promise<TopCandidateMemberRow[]> {
    const result = await this.database.query<TopCandidateMemberRow>(
      `WITH top_candidates AS (
         SELECT c.id AS candidate_id, ev.overall_score
         FROM experiments e
         JOIN experiment_iterations ei ON ei.experiment_id = e.id
         JOIN candidates c ON c.iteration_id = ei.id
         JOIN backtest_runs br ON br.candidate_id = c.id AND br.status = 'COMPLETED'
         JOIN evaluations ev ON ev.backtest_run_id = br.id
         WHERE e.id = $1 AND e.user_id = $2
         ORDER BY ev.overall_score DESC NULLS LAST
         LIMIT $3
       )
       SELECT tc.candidate_id, tc.overall_score,
              s.id AS strategy_id, s.name, s.type AS strategy_type, s.version,
              cs.parameters
       FROM top_candidates tc
       JOIN candidate_strategies cs ON cs.candidate_id = tc.candidate_id
       JOIN strategies s ON s.id = cs.strategy_id
       ORDER BY tc.overall_score DESC NULLS LAST, s.name ASC`,
      [experimentId, userId, limit],
    );
    return result.rows;
  }

  /**
   * Rank + headline metrics for specific candidates, measured against
   * EVERY completed candidate of the experiment - not just the Top-K.
   *
   * This is what lets the UI show a parameter version the user saved even
   * when it scored outside the leaderboard: "#37 / 100" is a real,
   * comparable placement, whereas the Top-K query simply returns nothing
   * for such a candidate and the version looks like it vanished.
   */
  async rankedSummaries(
    experimentId: string,
    userId: string,
    candidateIds: string[],
  ): Promise<RankedCandidateSummary[]> {
    if (candidateIds.length === 0) return [];
    const result = await this.database.query<RankedCandidateSummaryRow>(
      `WITH ranked AS (
         SELECT c.id AS candidate_id,
                ev.overall_score, ev.profit_loss, ev.win_rate,
                ev.max_drawdown, ev.number_of_trades,
                RANK() OVER (ORDER BY ev.overall_score DESC NULLS LAST) AS rank,
                COUNT(*) OVER () AS total
           FROM experiments e
           JOIN experiment_iterations ei ON ei.experiment_id = e.id
           JOIN candidates c ON c.iteration_id = ei.id
           JOIN backtest_runs br ON br.candidate_id = c.id AND br.status = 'COMPLETED'
           JOIN evaluations ev ON ev.backtest_run_id = br.id
          WHERE e.id = $1 AND e.user_id = $2
       )
       SELECT r.*,
              (
                SELECT string_agg(s.name, ' + ' ORDER BY s.name)
                  FROM candidate_strategies cs
                  JOIN strategies s ON s.id = cs.strategy_id
                 WHERE cs.candidate_id = r.candidate_id
              ) AS combo
         FROM ranked r
        WHERE r.candidate_id = ANY($3::uuid[])
        ORDER BY r.rank ASC`,
      [experimentId, userId, candidateIds],
    );
    return result.rows.map((row) => ({
      candidateId: row.candidate_id,
      combo: row.combo ?? '',
      rank: Number(row.rank),
      total: Number(row.total),
      overallScore: row.overall_score === null ? null : Number(row.overall_score),
      profitLoss: row.profit_loss === null ? null : Number(row.profit_loss),
      winRate: row.win_rate === null ? null : Number(row.win_rate),
      maxDrawdown: row.max_drawdown === null ? null : Number(row.max_drawdown),
      numberOfTrades: row.number_of_trades,
    }));
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
      // Weight resolves by strategy NAME, not by the exact `strategies` row
      // id. Weight is a property of the Search Configuration and is set per
      // strategy in the weighted-voting table ("MA has weight 0.25"), not
      // per parameter version — and a candidate created by the
      // save-a-new-version cascade
      // (StrategySearchService.regenerateForStrategyVersion) deliberately
      // points at a NEWER `strategies` row than the one pinned into
      // experiment_config_strategies at start(). Joining on strategy_id
      // would silently drop exactly those members from every detail view
      // (INNER JOIN, no match); joining on name lets the new version
      // inherit its strategy's configured weight while leaving the
      // immutable experiment_configs untouched.
      `SELECT s.id AS strategy_id, s.name, s.type AS strategy_type, s.version, cs.parameters, ecs.weight
       FROM candidate_strategies cs
       JOIN strategies s ON s.id = cs.strategy_id
       JOIN candidates c ON c.id = cs.candidate_id
       JOIN experiment_iterations ei ON ei.id = c.iteration_id
       JOIN experiment_configs ec ON ec.experiment_id = ei.experiment_id
       JOIN experiment_config_strategies ecs
         ON ecs.experiment_config_id = ec.id
       JOIN strategies cfg_s ON cfg_s.id = ecs.strategy_id AND cfg_s.name = s.name
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
        name: row.name,
        version: row.version,
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
