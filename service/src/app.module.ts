import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { MarketDataModule } from './modules/market-data';
import { ChartModule } from './modules/chart';
import { StrategyEngineModule } from './modules/strategy-engine';
import { StrategyPluginModule } from './modules/strategy-plugin';
import { CompositeStrategyModule } from './modules/composite-strategy';
import { StrategySearchModule } from './modules/strategy-search';
import { BacktestingModule } from './modules/backtesting';
import { LeaderboardModule } from './modules/leaderboard';
import { ContinuousLoopModule } from './modules/continuous-loop';
import { NewsModule } from './modules/news';
import { SentimentModule } from './modules/sentiment';
import { DatabaseModule } from './database/database.module';

@Module({
  imports: [
    MarketDataModule,
    ChartModule,
    StrategyEngineModule,
    StrategyPluginModule,
    CompositeStrategyModule,
    StrategySearchModule,
    BacktestingModule,
    LeaderboardModule,
    ContinuousLoopModule,
    NewsModule,
    SentimentModule,
    DatabaseModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
