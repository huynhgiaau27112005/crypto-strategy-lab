import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { StrategyPluginService } from './strategy-plugin.service';
import { StrategyCatalogItem } from './strategy-plugin.types';

@Controller('strategy-plugin')
export class StrategyPluginController {
  constructor(private readonly strategyPluginService: StrategyPluginService) {}

  @Get('health')
  health() {
    return { status: 'ok', module: 'strategy-plugin' };
  }

  @UseGuards(JwtAuthGuard)
  @Get('strategies')
  listStrategies(): Promise<StrategyCatalogItem[]> {
    return this.strategyPluginService.listCatalog();
  }
}
