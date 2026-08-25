import { BadRequestException, Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../auth/decorators/current-user.decorator';
import { StrategyPluginService } from './strategy-plugin.service';
import { StrategyCatalogItem, StrategyVersionSummary } from './strategy-plugin.types';
import { saveStrategyVersionSchema } from './dto/save-strategy-version.dto';

@Controller('strategy-plugin')
export class StrategyPluginController {
  constructor(private readonly strategyPluginService: StrategyPluginService) {}

  @Get('health')
  health() {
    return { status: 'ok', module: 'strategy-plugin' };
  }

  @UseGuards(JwtAuthGuard)
  @Get('strategies')
  listStrategies(@CurrentUser() user: CurrentUserPayload): Promise<StrategyCatalogItem[]> {
    return this.strategyPluginService.listCatalog(user.id);
  }

  // Versions this user is entitled to see for `name`: the shared SYSTEM
  // lineage plus any versions this user personally saved. See
  // StrategyRepository.listVersions for the ownership scoping.
  @UseGuards(JwtAuthGuard)
  @Get('strategies/:name/versions')
  listVersions(
    @Param('name') name: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<StrategyVersionSummary[]> {
    return this.strategyPluginService.listVersions(name, user.id);
  }

  // Always INSERTs a new row (never updates an existing one) — see
  // StrategyRepository.createVersion. Does NOT regenerate combinations that
  // reference this strategy in the Leaderboard; that is a separate,
  // not-yet-built behavior.
  @UseGuards(JwtAuthGuard)
  @Post('strategies/:name/versions')
  saveVersion(
    @Param('name') name: string,
    @Body() body: unknown,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<StrategyVersionSummary> {
    const result = saveStrategyVersionSchema.safeParse(body ?? {});
    if (!result.success) {
      throw new BadRequestException(
        result.error.issues
          .map((issue) => `${issue.path.join('.') || '(body)'}: ${issue.message}`)
          .join('; '),
      );
    }
    return this.strategyPluginService.saveVersion(name, user.id, result.data.parameters);
  }
}
