import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';

@Injectable()
export class CandleRepository {
    constructor(
        private readonly database: DatabaseService,
    ) { }

    async findCandles(
        tradingPairId: number,
        timeframeId: number,
        limit: number,
    ) {
        const result = await this.database.query(
            `
      SELECT
        time,
        open,
        high,
        low,
        close,
        volume
      FROM market.candles
      WHERE trading_pair_id = $1
        AND timeframe_id = $2
      ORDER BY time DESC
      LIMIT $3
      `,
            [
                tradingPairId,
                timeframeId,
                limit,
            ],
        );

        return result.rows;
    }

    async insertCandles(
        candles: Array<{
            time: Date;
            tradingPairId: number;
            timeframeId: number;
            open: string;
            high: string;
            low: string;
            close: string;
            volume: string;
        }>,
    ) {
        if (candles.length === 0) {
            return;
        }

        const client =
            await this.database.getClient();

        try {
            await client.query('BEGIN');

            for (const candle of candles) {
                await client.query(
                    `
          INSERT INTO market.candles (
            time,
            trading_pair_id,
            timeframe_id,
            open,
            high,
            low,
            close,
            volume
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            $8
          )
          ON CONFLICT (
            trading_pair_id,
            timeframe_id,
            time
          )
          DO UPDATE SET
            open = EXCLUDED.open,
            high = EXCLUDED.high,
            low = EXCLUDED.low,
            close = EXCLUDED.close,
            volume = EXCLUDED.volume
          `,
                    [
                        candle.time,
                        candle.tradingPairId,
                        candle.timeframeId,
                        candle.open,
                        candle.high,
                        candle.low,
                        candle.close,
                        candle.volume,
                    ],
                );
            }

            await client.query('COMMIT');
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    async findTradingPairId(
        symbol: string,
    ): Promise<number> {
        const result = await this.database.query<{
            id: number;
        }>(
            `
        SELECT id
        FROM market.trading_pairs
        WHERE symbol = $1
        `,
            [symbol.toUpperCase()],
        );

        if (result.rowCount === 0) {
            throw new Error(
                `Trading pair not found: ${symbol}`,
            );
        }

        return result.rows[0].id;
    }

    async findTimeframeId(
        code: string,
    ): Promise<number> {
        const result = await this.database.query<{
            id: number;
        }>(
            `
        SELECT id
        FROM market.timeframes
        WHERE code = $1
        `,
            [code],
        );

        if (result.rowCount === 0) {
            throw new Error(
                `Timeframe not found: ${code}`,
            );
        }

        return result.rows[0].id;
    }
}