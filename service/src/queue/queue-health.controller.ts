import { Controller, Get } from '@nestjs/common';
import { QueueHealthService } from './queue-health.service';

// Unauthenticated on purpose, same as the other /health-style endpoints in
// this codebase (e.g. GET /strategy-search/health) — this is operational
// status, not user data.
@Controller('queue')
export class QueueHealthController {
  constructor(private readonly queueHealthService: QueueHealthService) {}

  @Get('health')
  health() {
    return this.queueHealthService.snapshot();
  }
}
