import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Response } from 'express';
import { StrategySearchService } from './strategy-search.service';
import type { StartSearchRequest } from './domain/search.types';

@Controller('strategy-search')
export class StrategySearchController {
  constructor(private readonly strategySearchService: StrategySearchService) {}

  @Get('health')
  health() {
    return { status: 'ok', module: 'strategy-search' };
  }

  @Post('experiments')
  @HttpCode(HttpStatus.ACCEPTED)
  async start(
    @Body() body: StartSearchRequest,
    @Headers('cookie') cookie: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    const sessionId = this.resolveSession(cookie);
    response.cookie('session_id', sessionId, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
    const experiment = await this.strategySearchService.start(sessionId, body);
    return { experimentId: experiment.id, status: experiment.status };
  }

  @Get('experiments/:id')
  getStatus(
    @Param('id') id: string,
    @Headers('cookie') cookie: string | undefined,
  ) {
    return this.strategySearchService.getStatus(
      id,
      this.resolveSession(cookie),
    );
  }

  @Get('experiments/:id/top')
  getTop(
    @Param('id') id: string,
    @Query('limit') limit: string | undefined,
    @Headers('cookie') cookie: string | undefined,
  ) {
    const parsedLimit = Number(limit ?? 10);
    return this.strategySearchService.getTop(
      id,
      this.resolveSession(cookie),
      Number.isFinite(parsedLimit) ? parsedLimit : 10,
    );
  }

  @Post('experiments/:id/cancel')
  cancel(
    @Param('id') id: string,
    @Headers('cookie') cookie: string | undefined,
  ) {
    return this.strategySearchService.cancel(id, this.resolveSession(cookie));
  }

  private resolveSession(cookie: string | undefined): string {
    const match = cookie
      ?.split(';')
      .map((item) => item.trim())
      .find((item) => item.startsWith('session_id='));
    const sessionId = match?.slice('session_id='.length);
    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (sessionId && uuidPattern.test(sessionId)) return sessionId;
    return randomUUID();
  }
}
