import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { HealthService } from './health.service';

// Unauthenticated on purpose — operational status, not user data, same
// precedent as GET /queue/health and GET /strategy-search/health. Liveness
// and readiness probes are called by an orchestrator (or a human/curl in
// this project), never by an end user, and carry no PII.
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get('live')
  live() {
    return this.health.liveness();
  }

  @Get('ready')
  async ready(@Res({ passthrough: true }) res: Response) {
    const result = await this.health.readiness();
    res.status(result.status === 'ok' ? 200 : 503);
    return result;
  }
}
