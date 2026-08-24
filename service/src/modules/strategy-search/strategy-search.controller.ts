import {
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
    const parsedLimit = Number(limit ?? 10);
    return this.strategySearchService.getTop(
      id,
      user.id,
      Number.isFinite(parsedLimit) ? parsedLimit : 10,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post('experiments/:id/cancel')
  cancel(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.strategySearchService.cancel(id, user.id);
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
