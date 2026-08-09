import { Controller, Get } from '@nestjs/common';
import { ContinuousLoopService } from './continuous-loop.service';

@Controller('continuous-loop')
export class ContinuousLoopController {
  constructor(private readonly continuousLoopService: ContinuousLoopService) {}

  @Get('health')
  health() {
    return { status: 'ok', module: 'continuous-loop' };
  }
}
