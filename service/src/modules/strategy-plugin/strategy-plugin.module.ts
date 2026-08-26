import { Module, OnModuleInit } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { StrategyRegistry } from './strategy-registry';
import { MaPlugin } from './plugins/ma.plugin';
import { RsiPlugin } from './plugins/rsi.plugin';
import { BollingerPlugin } from './plugins/bollinger.plugin';
import { SupportResistancePlugin } from './plugins/support-resistance.plugin';
import { NewsSentimentPlugin } from './plugins/news-sentiment.plugin';
import { AiStrategyPluginAdapter } from './plugins/ai-strategy-plugin.adapter';
import { StrategyPluginService } from './strategy-plugin.service';
import { StrategyPluginController } from './strategy-plugin.controller';
import { StrategyRepository } from '../strategy-search/repositories/strategy.repository';
import { AiStrategyModule } from '../ai-strategy/ai-strategy.module';

@Module({
  imports: [DatabaseModule, AiStrategyModule],
  controllers: [StrategyPluginController],
  providers: [
    StrategyRegistry,
    MaPlugin,
    RsiPlugin,
    BollingerPlugin,
    SupportResistancePlugin,
    NewsSentimentPlugin,
    AiStrategyPluginAdapter,
    StrategyRepository,
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
    private readonly newsSentiment: NewsSentimentPlugin,
    private readonly aiAdapter: AiStrategyPluginAdapter,
  ) {}

  onModuleInit(): void {
    for (const plugin of [
      this.ma,
      this.rsi,
      this.bollinger,
      this.supportResistance,
      this.newsSentiment,
    ]) {
      this.registry.register(plugin);
    }
    this.registry.registerAiAdapter(this.aiAdapter);
  }
}
