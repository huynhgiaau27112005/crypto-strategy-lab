import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { QueueModule } from './queue/queue.module';
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
 */
@Module({
  imports: [DatabaseModule, QueueModule, StrategySearchModule, NewsModule],
  providers: [SearchProcessor, NewsCrawlProcessor],
})
export class WorkerModule {}
