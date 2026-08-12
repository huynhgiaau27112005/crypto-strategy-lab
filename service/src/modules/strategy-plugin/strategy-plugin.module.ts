import { Module } from '@nestjs/common';
import { StrategyPluginController } from './strategy-plugin.controller';
import { StrategyPluginService } from './strategy-plugin.service';
import { registryProvider } from './config';

@Module({
  controllers: [StrategyPluginController],
  providers: [StrategyPluginService, registryProvider],
  exports: [StrategyPluginService],
})
export class StrategyPluginModule {}
