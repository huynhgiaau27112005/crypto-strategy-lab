import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { AiStrategyController } from './ai-strategy.controller';
import { AiStrategyService } from './ai-strategy.service';
import { AiStrategyValidatorService } from './ai-strategy-validator.service';
import { AiStrategyRunnerService } from './ai-strategy-runner.service';
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
    AiStrategyRepository,
    CandleRepository,
    { provide: LLM_PROVIDER, useFactory: llmProviderFactory },
  ],
  exports: [AiStrategyService],
})
export class AiStrategyModule {}
