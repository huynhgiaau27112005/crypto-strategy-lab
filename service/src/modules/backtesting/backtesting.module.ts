import { Module } from '@nestjs/common';
import { BacktestingController } from './backtesting.controller';
import { BacktestingService } from './backtesting.service';
import { CompositeStrategyModule } from '../composite-strategy/composite-strategy.module';
import { BacktestRunRepository } from './repositories/backtest-run.repository';

@Module({
  imports: [CompositeStrategyModule],
  controllers: [BacktestingController],
  providers: [BacktestingService, BacktestRunRepository],
  exports: [BacktestingService, BacktestRunRepository],
})
export class BacktestingModule {}
