import { Module } from '@nestjs/common';
import { StrategyPluginController } from './strategy-plugin.controller';
import { StrategyPluginService } from './strategy-plugin.service';

@Module({
  controllers: [StrategyPluginController],
  providers: [
    StrategyPluginService,
  ],
  exports: [StrategyPluginService],
})
export class StrategyPluginModule {}
