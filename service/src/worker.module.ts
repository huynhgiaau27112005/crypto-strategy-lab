import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { DatabaseModule } from './database/database.module';
import { QueueModule } from './queue/queue.module';
import { CacheModule } from './cache/cache.module';
import { ObservabilityModule } from './observability/observability.module';
import { StrategySearchModule } from './modules/strategy-search';
import { LeaderboardModule } from './modules/leaderboard';
import { NewsModule } from './modules/news';
import { AiStrategyModule } from './modules/ai-strategy/ai-strategy.module';
import { SearchProcessor } from './modules/strategy-search/search.processor';
import { NewsCrawlProcessor } from './modules/news/crawl/news-crawl.processor';
import { AiGenerateProcessor } from './modules/ai-strategy/ai-generate.processor';

/**
 * The worker's module graph. task-16's architectural point: this imports
 * the SAME business modules as AppModule (StrategySearchModule, NewsModule)
 * so it calls the exact same StrategySearchService.run() / NewsCrawlService
 * — no forked/duplicated logic — but additionally declares the three
 * @Processor() classes as providers (search, news-crawl, ai-generate).
 * Instantiating a @Processor() class is
 * what makes @nestjs/bullmq start a BullMQ Worker that pulls jobs off
 * Redis; AppModule (service/src/app.module.ts) never does this, so the API
 * process only ever enqueues.
 *
 * CacheModule is imported here too (task-17): the leaderboard rebuild that
 * invalidates the cached "top" response runs inside this worker process,
 * while the read that populates the cache runs in the API process. Both
 * need LeaderboardService wired to the same CacheService/Redis client —
 * see artifacts/cache.md, "cross-process invalidation".
 *
 * LeaderboardModule is listed EXPLICITLY rather than left to arrive
 * transitively through StrategySearchModule, and that is load-bearing.
 * StrategySearchService no longer calls LeaderboardService at all — it
 * emits domain events, and LeaderboardEventsHandler (a provider of
 * LeaderboardModule) subscribes. A provider only exists where its module is
 * part of the graph, so dropping this import would leave the worker with
 * nobody listening: the search loop would emit into the void and the
 * leaderboard would silently never rebuild. Nothing in the unit tests can
 * catch that, because they all mock the emitter — hence the comment.
 */
@Module({
  imports: [
    // Same in-process emitter AppModule registers — see its comment for the
    // BullMQ-vs-emitter distinction. Registered per process by design.
    EventEmitterModule.forRoot({ wildcard: false, verboseMemoryLeak: true }),
    DatabaseModule,
    QueueModule,
    CacheModule,
    ObservabilityModule,
    StrategySearchModule,
    LeaderboardModule,
    NewsModule,
    AiStrategyModule,
  ],
  providers: [SearchProcessor, NewsCrawlProcessor, AiGenerateProcessor],
})
export class WorkerModule {}
