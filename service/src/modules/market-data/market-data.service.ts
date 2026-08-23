import { Injectable } from '@nestjs/common';
import { BinanceClient } from './clients/binance.client';
import { CandleRepository } from './repositories/candle.repository';

@Injectable()
export class MarketDataService {
    constructor(
        private readonly binanceClient: BinanceClient,
        private readonly candleRepository: CandleRepository,
    ) { }

    async getCandles(
        symbol: string,
        interval: string,
        limit = 500,
    ) {
        const rows =
            await this.binanceClient.getKlines(
                symbol,
                interval,
                limit,
            );

        return rows.map((row: any[]) => ({
            timeframe: interval,
            timestamp: new Date(row[0]),
            open: row[1],
            high: row[2],
            low: row[3],
            close: row[4],
            volume: row[5],
        }));
    }

    async importCandles(
        symbol: string,
        interval: string,
        limit = 500,
    ) {
        const rows =
            await this.binanceClient.getKlines(
                symbol,
                interval,
                limit,
            );

        const candles = rows.map(
            (row: any[]) => ({
                timeframe: interval,
                timestamp: new Date(row[0]),
                open: row[1],
                high: row[2],
                low: row[3],
                close: row[4],
                volume: row[5],
            }),
        );

        await this.candleRepository.insertCandles(candles);

        return {
            symbol,
            interval,
            count: candles.length,
        };
    }
}