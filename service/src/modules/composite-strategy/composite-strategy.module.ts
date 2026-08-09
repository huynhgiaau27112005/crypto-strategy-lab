import { Module } from '@nestjs/common';
import { CompositeStrategyController } from './composite-strategy.controller';
import { CompositeStrategyService } from './composite-strategy.service';

@Module({
  controllers: [CompositeStrategyController],
  providers: [CompositeStrategyService],
  exports: [CompositeStrategyService],
})
export class CompositeStrategyModule {}
