import { Module } from '@nestjs/common';

import { MarketDataCoreModule } from './market-data-core.module';
import { MarketDataController } from './market-data.controller';
import { MarketDataGateway } from './market-data.gateway';

/**
 * The network-facing half of market data: the REST controller and the
 * `/market` WebSocket gateway. Providers live in MarketDataCoreModule so a
 * non-HTTP process (the worker) can depend on the service alone.
 */
@Module({
  imports: [MarketDataCoreModule],
  controllers: [MarketDataController],
  providers: [MarketDataGateway],
  exports: [MarketDataCoreModule],
})
export class MarketDataModule {}
