import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RealtimeSignalService, RealtimeSignalResult } from './realtime-signal.service';

@Controller('strategy-engine')
export class RealtimeSignalController {
  constructor(private readonly realtimeSignalService: RealtimeSignalService) {}

  @UseGuards(JwtAuthGuard)
  @Get('signal')
  getSignal(@Query('interval') interval: string): Promise<RealtimeSignalResult> {
    return this.realtimeSignalService.getSignal(interval);
  }
}
