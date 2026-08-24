import { Injectable } from '@nestjs/common';
import { BinanceClient } from './clients/binance.client';
import { CandleRepository } from './repositories/candle.repository';
import { assertAllowedInterval } from './config';

export interface MarketCandle {
    timeframe: string;
    timestamp: Date;
    open: string;
    high: string;
    low: string;
    close: string;
    volume: string;
}

export interface CandleImportResult {
    symbol: string;
    interval: string;
    count: number;
}

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
    ): Promise<MarketCandle[]> {
        const rows = await this.binanceClient.getKlines(
            symbol,
            interval,
            limit,
        );
        return rows.map((row) => this.toCandle(interval, row));
    }

    async importCandles(
        symbol: string,
        interval: string,
        limit = 500,
    ): Promise<CandleImportResult> {
        assertAllowedInterval(interval);
        const rows = await this.binanceClient.getKlines(
            symbol,
            interval,
            limit,
        );
        const candles = rows.map((row) => this.toCandle(interval, row));

        await this.candleRepository.insertCandles(candles);

        return {
            symbol,
            interval,
            count: candles.length,
        };
    }

    private toCandle(
        interval: string,
        row: Awaited<ReturnType<BinanceClient['getKlines']>>[number],
    ): MarketCandle {
        return {
            timeframe: interval,
            timestamp: new Date(row[0]),
            open: row[1],
            high: row[2],
            low: row[3],
            close: row[4],
            volume: row[5],
        };
    }
}
