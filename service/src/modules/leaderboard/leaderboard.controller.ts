import { Controller, Get } from '@nestjs/common';
import { LeaderboardService } from './leaderboard.service';

@Controller('leaderboard')
export class LeaderboardController {
  constructor(private readonly leaderboardService: LeaderboardService) {}

  @Get('health')
  health() {
    return { status: 'ok', module: 'leaderboard' };
  }
}
