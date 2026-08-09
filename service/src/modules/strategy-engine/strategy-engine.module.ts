import { Module } from '@nestjs/common';
import { StrategyEngineController } from './strategy-engine.controller';
import { StrategyEngineService } from './strategy-engine.service';

@Module({
  controllers: [StrategyEngineController],
  providers: [StrategyEngineService],
  exports: [StrategyEngineService],
})
export class StrategyEngineModule {}
