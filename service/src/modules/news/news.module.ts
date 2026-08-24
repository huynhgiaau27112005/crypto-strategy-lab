import { Module } from '@nestjs/common';
import { NewsController } from './news.controller';
import { NewsService } from './news.service';
import { NewsRepository } from './repositories/news.repository';

@Module({
  controllers: [NewsController],
  providers: [NewsService, NewsRepository],
  // NewsRepository is exported so SentimentModule can read the same
  // `news` table for its aggregate summary without a second repository
  // duplicating access to it.
  exports: [NewsService, NewsRepository],
})
export class NewsModule {}
