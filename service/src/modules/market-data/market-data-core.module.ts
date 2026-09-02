import { Module } from '@nestjs/common';

import { MarketDataService } from './market-data.service';
import { BinanceClient } from './clients/binance.client';
import { MARKET_DATA_PROVIDER } from './providers/market-data-provider';
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
// The ONE place that decides which exchange the application talks to.
// Swapping providers is this binding plus a new class implementing
// MarketDataProvider - no consumer of MARKET_DATA_PROVIDER changes, which
// is the extension axis docs/about-projects/02-architecture-goals.md asks
// the architecture to demonstrate.
const marketDataProvider = {
  provide: MARKET_DATA_PROVIDER,
  useExisting: BinanceClient,
};

@Module({
  providers: [
    MarketDataService,
    BinanceClient,
    marketDataProvider,
    CandleRepository,
  ],
  // BinanceClient itself is deliberately NOT exported: outside this module
  // the provider is only reachable through the token, so nothing can
  // accidentally re-couple to the concrete exchange.
  exports: [MarketDataService, MARKET_DATA_PROVIDER, CandleRepository],
})
export class MarketDataCoreModule {}
