import { Module } from '@nestjs/common';
import { NewsController } from './news.controller';
import { NewsService } from './news.service';
import { NewsRepository } from './repositories/news.repository';
import { NewsCrawlService } from './crawl/news-crawl.service';
import { NewsCrawlQueueService } from './crawl/news-crawl-queue.service';

// Deliberately does NOT declare NewsCrawlProcessor as a provider here — see
// StrategySearchModule's comment on SearchProcessor for why. It is only
// registered in WorkerModule (worker.ts). NewsCrawlService itself (the
// actual spawn-and-await logic) IS provided here too, since WorkerModule
// imports this whole module to get it — it is simply never turned into a
// BullMQ Worker inside the API process, because nothing here does that.
@Module({
  controllers: [NewsController],
  providers: [NewsService, NewsRepository, NewsCrawlService, NewsCrawlQueueService],
  // NewsRepository is exported so SentimentModule can read the same
  // `news` table for its aggregate summary without a second repository
  // duplicating access to it. NewsCrawlService is exported so WorkerModule
  // can hand it to NewsCrawlProcessor.
  exports: [NewsService, NewsRepository, NewsCrawlService],
})
export class NewsModule {}
