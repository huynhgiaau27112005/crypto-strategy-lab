import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { MarketDataService }
  from './market-data.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('market-data')
export class MarketDataController {
  constructor(
    private readonly marketDataService:
      MarketDataService,
  ) { }

  // Public market data — no auth required to read (see
  // artifacts/api-contract.md); interval/limit are validated by
  // MarketDataService.getCandles (assertAllowedInterval/assertValidLimit)
  // so an invalid value 400s here instead of reaching Binance or the
  // Redis cache key unfiltered.
  @Get('candles')
  async getCandles(
    @Query('symbol') symbol: string,
    @Query('interval') interval: string,
    @Query('limit') limit = '500',
  ) {
    return this.marketDataService.getCandles(
      symbol,
      interval,
      limit,
    );
  }

  // Writes into the shared, non-user-scoped `candles` table that every
  // user's backtest reads — must be authenticated, unlike the read-only
  // GET above, so an anonymous caller cannot inject/corrupt candle rows
  // for a symbol another user's experiment then backtests against.
  @Post('import')
  @UseGuards(JwtAuthGuard)
  async importCandles(
    @Body()
    body: {
      symbol: string;
      interval: string;
      limit?: number;
    },
  ) {
    return this.marketDataService.importCandles(
      body.symbol,
      body.interval,
      body.limit ?? 500,
    );
  }
}