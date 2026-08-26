import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { extendSearchSchema } from './dto/extend-search.dto';
import { regenerateForStrategySchema } from './dto/regenerate-for-strategy.dto';
import { StrategySearchService } from './strategy-search.service';
import type { StartSearchRequest } from './domain/search.types';

@Controller('strategy-search')
export class StrategySearchController {
  constructor(private readonly strategySearchService: StrategySearchService) {}

  @Get('health')
  health() {
    return { status: 'ok', module: 'strategy-search' };
  }

  @UseGuards(JwtAuthGuard)
  @Post('experiments')
  @HttpCode(HttpStatus.ACCEPTED)
  async start(
    @Body() body: StartSearchRequest,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const experiment = await this.strategySearchService.start(user.id, body);
    return { experimentId: experiment.id, status: experiment.status };
  }

  @UseGuards(JwtAuthGuard)
  @Get('experiments/:id')
  getStatus(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.strategySearchService.getStatus(id, user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('experiments/:id/top')
  getTop(
    @Param('id') id: string,
    @Query('limit') limit: string | undefined,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    // Genuinely optional — do NOT default `limit` here. An omitted query
    // param must reach the service as `undefined` so getTop() can tell
    // "caller didn't ask" (-> default to the experiment's persisted topK)
    // apart from "caller asked for a specific number" (explicit override).
    // Defaulting it to 10 here (as before) is exactly the bug: it makes
    // every unspecified request disagree with leaderboards.top_k.
    const parsedLimit = limit === undefined ? undefined : Number(limit);
    return this.strategySearchService.getTop(
      id,
      user.id,
      parsedLimit !== undefined && Number.isFinite(parsedLimit)
        ? parsedLimit
        : undefined,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post('experiments/:id/cancel')
  cancel(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.strategySearchService.cancel(id, user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('experiments/:id/extend')
  @HttpCode(HttpStatus.ACCEPTED)
  extend(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const result = extendSearchSchema.safeParse(body ?? {});
    if (!result.success) {
      throw new BadRequestException(
        result.error.issues
          .map((issue) => `${issue.path.join('.') || '(body)'}: ${issue.message}`)
          .join('; '),
      );
    }
    return this.strategySearchService.extend(
      id,
      user.id,
      result.data.iterations,
    );
  }

  // Second half of ParameterPanel's "Lưu tham số → tạo version mới": after
  // POST /strategy-plugin/strategies/:name/versions has inserted the new
  // immutable strategy version, this regenerates every combination on this
  // experiment's Leaderboard that contains that strategy onto the new
  // version — the prototype's "hệ thống sinh lại N tổ hợp có chứa strategy
  // này thành version tổ hợp mới trong Leaderboard". Split across two
  // endpoints so StrategyPlugin (which owns strategy versions) keeps no
  // dependency on StrategySearch (which owns experiments/leaderboards).
  @UseGuards(JwtAuthGuard)
  @Post('experiments/:id/regenerate')
  regenerate(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const result = regenerateForStrategySchema.safeParse(body ?? {});
    if (!result.success) {
      throw new BadRequestException(
        result.error.issues
          .map((issue) => `${issue.path.join('.') || '(body)'}: ${issue.message}`)
          .join('; '),
      );
    }
    return this.strategySearchService.regenerateForStrategyVersion(
      id,
      user.id,
      result.data.strategyName,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('candidates/:id')
  candidateDetail(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('tradePage') tradePage: string | undefined,
    @Query('tradePageSize') tradePageSize: string | undefined,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.strategySearchService.candidateDetail(
      user.id,
      id,
      Number(tradePage ?? '1'),
      Number(tradePageSize ?? '20'),
    );
  }
}
