import { Controller, Get } from '@nestjs/common';
import { StrategyPluginService } from './strategy-plugin.service';

@Controller('strategy-plugin')
export class StrategyPluginController {
  constructor(private readonly strategyPluginService: StrategyPluginService) {}

  @Get('health')
  health() {
    return { status: 'ok', module: 'strategy-plugin' };
  }
}
