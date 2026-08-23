import { Module } from '@nestjs/common';
import { CompositeStrategyController } from './composite-strategy.controller';
import { CompositeStrategyService } from './composite-strategy.service';
import { StrategyEngineModule } from '../strategy-engine/strategy-engine.module';

@Module({
  imports: [StrategyEngineModule],
  controllers: [CompositeStrategyController],
  providers: [CompositeStrategyService],
  exports: [CompositeStrategyService],
})
export class CompositeStrategyModule {}
