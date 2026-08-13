import { Module } from '@nestjs/common';
import { StrategyPluginController } from './strategy-plugin.controller';
import { StrategyPluginService } from './strategy-plugin.service';
import { registryProvider } from './config';
import { SMAStrategy } from './implementations/sma.strategy';
import { BollingerStrategy } from './implementations/bollinger.strategy';

@Module({
  controllers: [StrategyPluginController],
  providers: [
    StrategyPluginService,
    SMAStrategy,
    BollingerStrategy,
    registryProvider,
  ],
  exports: [StrategyPluginService],
})
export class StrategyPluginModule {}
