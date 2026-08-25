import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { MarketDataModule } from './modules/market-data';
import { ChartModule } from './modules/chart';
import { StrategyEngineModule, RealtimeSignalModule } from './modules/strategy-engine';
import { StrategyPluginModule } from './modules/strategy-plugin';
import { CompositeStrategyModule } from './modules/composite-strategy';
import { StrategySearchModule } from './modules/strategy-search';
import { BacktestingModule } from './modules/backtesting';
import { LeaderboardModule } from './modules/leaderboard';
import { ContinuousLoopModule } from './modules/continuous-loop';
import { NewsModule } from './modules/news';
import { SentimentModule } from './modules/sentiment';
import { AiStrategyModule } from './modules/ai-strategy';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { QueueModule } from './queue/queue.module';

@Module({
  imports: [
    QueueModule,
    MarketDataModule,
    ChartModule,
    StrategyEngineModule,
    RealtimeSignalModule,
    StrategyPluginModule,
    CompositeStrategyModule,
    StrategySearchModule,
    BacktestingModule,
    LeaderboardModule,
    ContinuousLoopModule,
    NewsModule,
    SentimentModule,
    AiStrategyModule,
    DatabaseModule,
    AuthModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
