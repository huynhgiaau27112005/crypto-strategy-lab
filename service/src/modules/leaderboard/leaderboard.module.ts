import { Module } from '@nestjs/common';
import { LeaderboardController } from './leaderboard.controller';
import { LeaderboardService } from './leaderboard.service';
import { LeaderboardEventsHandler } from './leaderboard-events.handler';

// LeaderboardEventsHandler is a provider but NOT an export: nothing calls
// it directly. Merely being instantiated is what registers its @OnEvent
// subscriptions, which is why the module it lives in has to be part of
// every process graph that emits those events (see worker.module.ts).
@Module({
  controllers: [LeaderboardController],
  providers: [LeaderboardService, LeaderboardEventsHandler],
  exports: [LeaderboardService],
})
export class LeaderboardModule {}
