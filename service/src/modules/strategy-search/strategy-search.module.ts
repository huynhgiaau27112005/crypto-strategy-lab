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
import { SearchQueueService } from './services/search-queue.service';

// Deliberately does NOT declare SearchProcessor as a provider here: this
// module is imported by AppModule (the HTTP process), and instantiating a
// @Processor()-decorated class starts a BullMQ Worker that pulls and runs
// jobs. SearchProcessor is only registered in WorkerModule (worker.ts) —
// see that file's comment for why this is the architectural point of
// task-16 (API enqueues, worker executes).
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
    SearchQueueService,
  ],
  exports: [StrategySearchService],
})
export class StrategySearchModule {}
