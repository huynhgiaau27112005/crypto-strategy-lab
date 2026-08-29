import { Module } from '@nestjs/common';

import { MarketDataService } from './market-data.service';
import { BinanceClient } from './clients/binance.client';
import { CandleRepository } from './repositories/candle.repository';

/**
 * Market data WITHOUT the HTTP controller or the WebSocket gateway.
 *
 * StrategySearchModule needs MarketDataService (to backfill candles before
 * a search runs) and is imported by both AppModule and WorkerModule. The
 * worker is a Nest application CONTEXT with no HTTP/WS server, so pulling
 * the full MarketDataModule in there would instantiate a gateway that can
 * never serve anyone. Splitting the providers out keeps "who can reach
 * market data" and "who exposes it over the network" separate concerns.
 */
@Module({
  providers: [MarketDataService, BinanceClient, CandleRepository],
  exports: [MarketDataService, BinanceClient, CandleRepository],
})
export class MarketDataCoreModule {}
