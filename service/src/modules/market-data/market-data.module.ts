import { Module } from '@nestjs/common';

import { MarketDataController }
  from './market-data.controller';

import { MarketDataService }
  from './market-data.service';

import { BinanceClient }
  from './clients/binance.client';

import { CandleRepository }
  from './repositories/candle.repository';

@Module({
  controllers: [
    MarketDataController,
  ],

  providers: [
    MarketDataService,
    BinanceClient,
    CandleRepository,
  ],

  exports: [
    MarketDataService,
  ],
})
export class MarketDataModule { }