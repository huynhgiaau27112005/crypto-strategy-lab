import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ZodError } from 'zod';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SentimentService } from './sentiment.service';
import { sentimentSummaryQuerySchema } from './dto/sentiment-query.dto';

@Controller('sentiment')
export class SentimentController {
  constructor(private readonly sentimentService: SentimentService) {}

  @Get('health')
  health() {
    return { status: 'ok', module: 'sentiment' };
  }

  // Shared data, not user-owned: guarded but never scoped by user_id.
  @UseGuards(JwtAuthGuard)
  @Get('summary')
  summary(@Query() query: unknown) {
    const result = sentimentSummaryQuerySchema.safeParse(query);
    if (!result.success) {
      throw new BadRequestException(this.formatZodError(result.error));
    }
    return this.sentimentService.summary(result.data.hours);
  }

  private formatZodError(error: ZodError): string {
    return error.issues
      .map((issue) => `${issue.path.join('.') || '(query)'}: ${issue.message}`)
      .join('; ');
  }
}
