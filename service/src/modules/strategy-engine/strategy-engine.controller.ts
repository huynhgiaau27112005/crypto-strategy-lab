import { Controller, Get } from '@nestjs/common';
import { StrategyEngineService } from './strategy-engine.service';

@Controller('strategy-engine')
export class StrategyEngineController {
  constructor(private readonly strategyEngineService: StrategyEngineService) {}

  @Get('health')
  health() {
    return { status: 'ok', module: 'strategy-engine' };
  }
}
