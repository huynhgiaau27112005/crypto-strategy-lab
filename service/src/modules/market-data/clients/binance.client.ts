import {
    Injectable,
    InternalServerErrorException,
} from '@nestjs/common';

@Injectable()
export class BinanceClient {
    private readonly baseUrl =
        'https://api.binance.com';

    async getKlines(
        symbol: string,
        interval: string,
        limit = 500,
    ) {
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

        return response.json();
    }
}