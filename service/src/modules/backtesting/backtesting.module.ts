import { Module } from '@nestjs/common';
import { BacktestingController } from './backtesting.controller';
import { BacktestingService } from './backtesting.service';
import { CompositeStrategyModule } from '../composite-strategy/composite-strategy.module';

@Module({
  imports: [CompositeStrategyModule],
  controllers: [BacktestingController],
  providers: [BacktestingService],
  exports: [BacktestingService],
})
export class BacktestingModule {}
