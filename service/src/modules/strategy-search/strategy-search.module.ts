import { Module } from '@nestjs/common';
import { StrategySearchController } from './strategy-search.controller';
import { StrategySearchService } from './strategy-search.service';
import { BacktestingModule } from '../backtesting/backtesting.module';
import { LeaderboardModule } from '../leaderboard/leaderboard.module';
import { DomainGuidedRandomGenerator } from './generators/domain-guided-random.generator';
import { ExperimentRepository } from './repositories/experiment.repository';
import { StrategyRepository } from './repositories/strategy.repository';
import { ExperimentStrategyRepository } from './repositories/experiment-strategy.repository';
import { CandidateFingerprintService } from './services/candidate-fingerprint.service';

@Module({
  imports: [BacktestingModule, LeaderboardModule],
  controllers: [StrategySearchController],
  providers: [
    StrategySearchService,
    DomainGuidedRandomGenerator,
    ExperimentRepository,
    StrategyRepository,
    ExperimentStrategyRepository,
    CandidateFingerprintService,
  ],
  exports: [StrategySearchService],
})
export class StrategySearchModule {}
