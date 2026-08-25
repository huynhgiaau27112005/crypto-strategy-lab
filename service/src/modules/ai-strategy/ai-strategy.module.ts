import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { AiStrategyController } from './ai-strategy.controller';
import { AiStrategyService } from './ai-strategy.service';
import { AiStrategyValidatorService } from './ai-strategy-validator.service';
import { AiStrategyRunnerService } from './ai-strategy-runner.service';
import { AiStrategySignalPrecomputeService } from './ai-strategy-signal-precompute.service';
import { AiStrategyRepository } from './repositories/ai-strategy.repository';
import { CandleRepository } from '../market-data/repositories/candle.repository';
import { LLM_PROVIDER, llmProviderFactory } from './providers/llm-provider.factory';

@Module({
  imports: [DatabaseModule],
  controllers: [AiStrategyController],
  providers: [
    AiStrategyService,
    AiStrategyValidatorService,
    AiStrategyRunnerService,
    AiStrategySignalPrecomputeService,
    AiStrategyRepository,
    CandleRepository,
    { provide: LLM_PROVIDER, useFactory: llmProviderFactory },
  ],
  // AiStrategyRepository and AiStrategySignalPrecomputeService are exported
  // (in addition to AiStrategyService) so StrategyPluginModule can read the
  // catalog of a user's AI strategies and StrategySearchModule can
  // precompute their signals for a run, without either module
  // reimplementing AI-strategy execution — see strategy-plugin.service.ts
  // and strategy-search.service.ts.
  exports: [AiStrategyService, AiStrategyRepository, AiStrategySignalPrecomputeService],
})
export class AiStrategyModule {}
