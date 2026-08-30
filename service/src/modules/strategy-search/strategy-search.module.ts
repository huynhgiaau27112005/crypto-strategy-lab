import { Module } from '@nestjs/common';
import { StrategySearchController } from './strategy-search.controller';
import { StrategySearchService } from './strategy-search.service';
import { BacktestingModule } from '../backtesting/backtesting.module';
import { StrategyPluginModule } from '../strategy-plugin/strategy-plugin.module';
import { AiStrategyModule } from '../ai-strategy/ai-strategy.module';
import { NewsModule } from '../news/news.module';
import { MarketDataCoreModule } from '../market-data/market-data-core.module';
import { DomainGuidedRandomGenerator } from './generators/domain-guided-random.generator';
import { SEARCH_ALGORITHM } from './domain/search.types';
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
// The ONE place that decides which search algorithm runs. Required flow #7
// ("Search algorithms must remain replaceable without changing downstream
// backtesting") is satisfied by rebinding this provider, not by editing
// StrategySearchService.
const searchAlgorithm = {
  provide: SEARCH_ALGORITHM,
  useExisting: DomainGuidedRandomGenerator,
};

@Module({
  imports: [
    BacktestingModule,
    // LeaderboardModule is deliberately absent. Search used to depend on it
    // to call rebuildForExperiment() directly; it now emits domain events
    // and has no compile-time knowledge of the Leaderboard at all. That
    // missing import IS the decoupling — `grep -rn LeaderboardService
    // src/modules/strategy-search/` returns nothing but comments.
    //
    // The listener still has to exist in whichever process emits, which is
    // why AppModule and WorkerModule each import LeaderboardModule
    // themselves rather than inheriting it through this module.
    StrategyPluginModule,
    AiStrategyModule,
    NewsModule,
    // Candle backfill before a search starts - see
    // StrategySearchService.start(). Core module (no controller/gateway)
    // because WorkerModule imports this module too.
    MarketDataCoreModule,
  ],
  controllers: [StrategySearchController],
  providers: [
    StrategySearchService,
    DomainGuidedRandomGenerator,
    searchAlgorithm,
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
