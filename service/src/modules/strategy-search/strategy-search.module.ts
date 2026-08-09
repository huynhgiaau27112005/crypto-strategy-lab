import { Module } from '@nestjs/common';
import { StrategySearchController } from './strategy-search.controller';
import { StrategySearchService } from './strategy-search.service';

@Module({
  controllers: [StrategySearchController],
  providers: [StrategySearchService],
  exports: [StrategySearchService],
})
export class StrategySearchModule {}
