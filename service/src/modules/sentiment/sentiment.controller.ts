import { Controller, Get } from '@nestjs/common';
import { SentimentService } from './sentiment.service';

@Controller('sentiment')
export class SentimentController {
  constructor(private readonly sentimentService: SentimentService) {}

  @Get('health')
  health() {
    return { status: 'ok', module: 'sentiment' };
  }
}
