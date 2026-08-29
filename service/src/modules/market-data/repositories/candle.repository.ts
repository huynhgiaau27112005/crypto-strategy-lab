import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import { CandleEntity } from '../../../database/types';

@Injectable()
export class CandleRepository {
    constructor(
        private readonly database: DatabaseService,
    ) { }

    async findCandles(
        timeframe: string,
        limit: number,
        startTime?: Date,
        endTime?: Date,
    ): Promise<CandleEntity[]> {
        const conditions: string[] = ['timeframe = $1'];
        const params: any[] = [timeframe];

        if (startTime) {
            params.push(startTime);
            conditions.push(`timestamp >= $${params.length}`);
        }

        if (endTime) {
            params.push(endTime);
            conditions.push(`timestamp < $${params.length}`);
        }

        params.push(limit);
        const limitParamIndex = params.length;

        const queryText = `
      SELECT
        timeframe,
        timestamp,
        open,
        high,
        low,
        close,
        volume
      FROM candles
      WHERE ${conditions.join(' AND ')}
      ORDER BY timestamp DESC
      LIMIT $${limitParamIndex}
    `;

        const result = await this.database.query<CandleEntity>(queryText, params);
        return result.rows;
    }

    async insertCandles(
        candles: Array<{
            timeframe: string;
            timestamp: Date;
            open: string;
            high: string;
            low: string;
            close: string;
            volume: string;
        }>,
    ): Promise<void> {
        if (candles.length === 0) {
            return;
        }

        await this.database.withTransaction(async (client) => {
            for (const candle of candles) {
                await client.query(
                    `
          INSERT INTO candles (
            timeframe,
            timestamp,
            open,
            high,
            low,
            close,
            volume
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7
          )
          ON CONFLICT (
            timeframe,
            timestamp
          )
          DO UPDATE SET
            open = EXCLUDED.open,
            high = EXCLUDED.high,
            low = EXCLUDED.low,
            close = EXCLUDED.close,
            volume = EXCLUDED.volume
          `,
                    [
                        candle.timeframe,
                        candle.timestamp,
                        candle.open,
                        candle.high,
                        candle.low,
                        candle.close,
                        candle.volume,
                    ],
                );
            }
        });
    }

    /**
     * How many candles are stored for `timeframe` inside `[startTime,
     * endTime)` — the same window predicate ExperimentRepository.candles()
     * uses, so "does this window have enough history to backtest" can be
     * answered without loading every row.
     */
    async countInWindow(
        timeframe: string,
        startTime: Date,
        endTime: Date,
    ): Promise<number> {
        const result = await this.database.query<{ count: string }>(
            `SELECT COUNT(*)::text AS count
               FROM candles
              WHERE timeframe = $1 AND timestamp >= $2 AND timestamp < $3`,
            [timeframe, startTime, endTime],
        );
        return Number(result.rows[0]?.count ?? 0);
    }

    /** Row count per timeframe — used to report backfill progress and results. */
    async countByTimeframe(): Promise<Record<string, number>> {
        const result = await this.database.query<{ timeframe: string; count: string }>(
            'SELECT timeframe, COUNT(*)::text AS count FROM candles GROUP BY timeframe',
        );
        const counts: Record<string, number> = {};
        for (const row of result.rows) {
            counts[row.timeframe] = Number(row.count);
        }
        return counts;
    }
}