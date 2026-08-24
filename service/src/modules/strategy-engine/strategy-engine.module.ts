import { Module } from '@nestjs/common';
import { StrategyEngineController } from './strategy-engine.controller';
import { StrategyEngineService } from './strategy-engine.service';
import { StrategyPluginModule } from '../strategy-plugin/strategy-plugin.module';

@Module({
  imports: [StrategyPluginModule],
  controllers: [StrategyEngineController],
  providers: [StrategyEngineService],
  exports: [StrategyEngineService],
})
export class StrategyEngineModule {}
