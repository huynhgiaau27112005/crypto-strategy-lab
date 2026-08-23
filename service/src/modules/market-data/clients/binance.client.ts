import {
    Injectable,
    InternalServerErrorException,
} from '@nestjs/common';

export type BinanceKline = [
    openTime: number,
    open: string,
    high: string,
    low: string,
    close: string,
    volume: string,
];

@Injectable()
export class BinanceClient {
    private readonly baseUrl =
        'https://api.binance.com';

    async getKlines(
        symbol: string,
        interval: string,
        limit = 500,
    ): Promise<BinanceKline[]> {
        const url = new URL(
            '/api/v3/klines',
            this.baseUrl,
        );

        url.searchParams.set(
            'symbol',
            symbol.toUpperCase(),
        );

        url.searchParams.set(
            'interval',
            interval,
        );

        url.searchParams.set(
            'limit',
            String(limit),
        );

        const response = await fetch(url);

        if (!response.ok) {
            throw new InternalServerErrorException(
                `Binance API returned ${response.status}`,
            );
        }

        const payload: unknown = await response.json();
        if (!Array.isArray(payload)) {
            throw new InternalServerErrorException(
                'Binance API returned an invalid kline payload',
            );
        }

        return payload.map((row: unknown) => {
            if (!Array.isArray(row) || row.length < 6) {
                throw new InternalServerErrorException(
                    'Binance API returned an invalid kline row',
                );
            }
            return [
                Number(row[0]),
                String(row[1]),
                String(row[2]),
                String(row[3]),
                String(row[4]),
                String(row[5]),
            ];
        });
    }
}
