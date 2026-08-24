import { Module } from '@nestjs/common';
import { StrategySearchController } from './strategy-search.controller';
import { StrategySearchService } from './strategy-search.service';
import { BacktestingModule } from '../backtesting/backtesting.module';
import { LeaderboardModule } from '../leaderboard/leaderboard.module';
import { StrategyPluginModule } from '../strategy-plugin/strategy-plugin.module';
import { DomainGuidedRandomGenerator } from './generators/domain-guided-random.generator';
import { ExperimentRepository } from './repositories/experiment.repository';
import { ExperimentConfigRepository } from './repositories/experiment-config.repository';
import { ExperimentIterationRepository } from './repositories/experiment-iteration.repository';
import { CandidateRepository } from './repositories/candidate.repository';
import { StrategyRepository } from './repositories/strategy.repository';
import { CandidateFingerprintService } from './services/candidate-fingerprint.service';

@Module({
  imports: [BacktestingModule, LeaderboardModule, StrategyPluginModule],
  controllers: [StrategySearchController],
  providers: [
    StrategySearchService,
    DomainGuidedRandomGenerator,
    ExperimentRepository,
    ExperimentConfigRepository,
    ExperimentIterationRepository,
    CandidateRepository,
    StrategyRepository,
    CandidateFingerprintService,
  ],
  exports: [StrategySearchService],
})
export class StrategySearchModule {}
