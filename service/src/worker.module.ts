import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { QueueModule } from './queue/queue.module';
import { CacheModule } from './cache/cache.module';
import { ObservabilityModule } from './observability/observability.module';
import { StrategySearchModule } from './modules/strategy-search';
import { NewsModule } from './modules/news';
import { SearchProcessor } from './modules/strategy-search/search.processor';
import { NewsCrawlProcessor } from './modules/news/crawl/news-crawl.processor';

/**
 * The worker's module graph. task-16's architectural point: this imports
 * the SAME business modules as AppModule (StrategySearchModule, NewsModule)
 * so it calls the exact same StrategySearchService.run() / NewsCrawlService
 * — no forked/duplicated logic — but additionally declares the two
 * @Processor() classes as providers. Instantiating a @Processor() class is
 * what makes @nestjs/bullmq start a BullMQ Worker that pulls jobs off
 * Redis; AppModule (service/src/app.module.ts) never does this, so the API
 * process only ever enqueues.
 *
 * CacheModule is imported here too (task-17): the leaderboard rebuild that
 * invalidates the cached "top" response runs inside this worker process,
 * while the read that populates the cache runs in the API process. Both
 * need LeaderboardService wired to the same CacheService/Redis client —
 * see artifacts/cache.md, "cross-process invalidation".
 */
@Module({
  imports: [
    DatabaseModule,
    QueueModule,
    CacheModule,
    ObservabilityModule,
    StrategySearchModule,
    NewsModule,
  ],
  providers: [SearchProcessor, NewsCrawlProcessor],
})
export class WorkerModule {}
