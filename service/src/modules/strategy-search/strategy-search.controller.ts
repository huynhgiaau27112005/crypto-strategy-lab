import { Controller, Get } from '@nestjs/common';
import { StrategySearchService } from './strategy-search.service';

@Controller('strategy-search')
export class StrategySearchController {
  constructor(private readonly strategySearchService: StrategySearchService) {}

  @Get('health')
  health() {
    return { status: 'ok', module: 'strategy-search' };
  }
}
