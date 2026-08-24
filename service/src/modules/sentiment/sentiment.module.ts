import { Module } from '@nestjs/common';
import { SentimentController } from './sentiment.controller';
import { SentimentService } from './sentiment.service';
import { NewsModule } from '../news/news.module';

@Module({
  // Reuses NewsRepository (exported by NewsModule) for reading the `news`
  // table's aggregate sentiment counts, instead of a second repository
  // duplicating access to the same table.
  imports: [NewsModule],
  controllers: [SentimentController],
  providers: [SentimentService],
  exports: [SentimentService],
})
export class SentimentModule {}
