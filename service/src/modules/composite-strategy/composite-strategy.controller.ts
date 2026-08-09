import { Controller, Get } from '@nestjs/common';
import { CompositeStrategyService } from './composite-strategy.service';

@Controller('composite-strategy')
export class CompositeStrategyController {
  constructor(private readonly compositeStrategyService: CompositeStrategyService) {}

  @Get('health')
  health() {
    return { status: 'ok', module: 'composite-strategy' };
  }
}
