import {
  BadRequestException,
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
  // `startTime`/`endTime` (ISO 8601 or epoch ms) are optional: omitted,
  // this returns the latest `limit` closed candles as before. Supplied, it
  // returns that exact historical window — which is what the Backtest tab
  // needs so its result chart shows the candles the run was configured
  // over instead of "whatever is latest right now".
  @Get('candles')
  async getCandles(
    @Query('symbol') symbol: string,
    @Query('interval') interval: string,
    @Query('limit') limit = '500',
    @Query('startTime') startTime?: string,
    @Query('endTime') endTime?: string,
  ) {
    const from = this.parseTime(startTime, 'startTime');
    const to = this.parseTime(endTime, 'endTime');
    if (from && to && from >= to) {
      throw new BadRequestException('startTime must be before endTime.');
    }
    return this.marketDataService.getCandles(
      symbol,
      interval,
      limit,
      from,
      to,
    );
  }

  private parseTime(value: string | undefined, field: string): Date | undefined {
    if (value === undefined || value === '') return undefined;
    // Accept both epoch milliseconds and ISO 8601 so the query string can
    // carry whichever form the caller already has.
    const asNumber = Number(value);
    const parsed = Number.isFinite(asNumber)
      ? new Date(asNumber)
      : new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(
        `${field} must be an ISO 8601 timestamp or epoch milliseconds.`,
      );
    }
    return parsed;
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