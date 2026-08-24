import { Module } from '@nestjs/common';
import { RealtimeSignalController } from './realtime-signal.controller';
import { RealtimeSignalService } from './realtime-signal.service';
import { MarketDataModule } from '../market-data/market-data.module';
import { StrategyPluginModule } from '../strategy-plugin/strategy-plugin.module';
import { CompositeStrategyModule } from '../composite-strategy/composite-strategy.module';

/**
 * Separate module (not folded into StrategyEngineModule) on purpose:
 * CompositeStrategyModule already imports StrategyEngineModule (for
 * StrategyEngineService), so StrategyEngineModule importing
 * CompositeStrategyModule back would be a circular module graph. This
 * module sits one level up — it depends on strategy-plugin, market-data and
 * composite-strategy, but nothing depends on it — so the GET
 * /strategy-engine/signal route can reuse CompositeStrategyService without
 * introducing that cycle.
 */
@Module({
  imports: [MarketDataModule, StrategyPluginModule, CompositeStrategyModule],
  controllers: [RealtimeSignalController],
  providers: [RealtimeSignalService],
})
export class RealtimeSignalModule {}
