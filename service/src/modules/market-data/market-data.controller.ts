import {
  Body,
  Controller,
  Get,
  Post,
  Query,
} from '@nestjs/common';

import { MarketDataService }
  from './market-data.service';

@Controller('market-data')
export class MarketDataController {
  constructor(
    private readonly marketDataService:
      MarketDataService,
  ) { }

  @Get('candles')
  async getCandles(
    @Query('symbol') symbol: string,
    @Query('interval') interval: string,
    @Query('limit') limit = '500',
  ) {
    return this.marketDataService.getCandles(
      symbol,
      interval,
      Number(limit),
    );
  }

  @Post('import')
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