import { Module, OnModuleInit } from '@nestjs/common';
import { StrategyRegistry } from './strategy-registry';
import { MaPlugin } from './plugins/ma.plugin';
import { RsiPlugin } from './plugins/rsi.plugin';
import { BollingerPlugin } from './plugins/bollinger.plugin';
import { SupportResistancePlugin } from './plugins/support-resistance.plugin';
import { StrategyPluginService } from './strategy-plugin.service';
import { StrategyPluginController } from './strategy-plugin.controller';

@Module({
  controllers: [StrategyPluginController],
  providers: [
    StrategyRegistry,
    MaPlugin,
    RsiPlugin,
    BollingerPlugin,
    SupportResistancePlugin,
    StrategyPluginService,
  ],
  exports: [StrategyRegistry, StrategyPluginService],
})
export class StrategyPluginModule implements OnModuleInit {
  constructor(
    private readonly registry: StrategyRegistry,
    private readonly ma: MaPlugin,
    private readonly rsi: RsiPlugin,
    private readonly bollinger: BollingerPlugin,
    private readonly supportResistance: SupportResistancePlugin,
  ) {}

  onModuleInit(): void {
    for (const plugin of [this.ma, this.rsi, this.bollinger, this.supportResistance]) {
      this.registry.register(plugin);
    }
  }
}
