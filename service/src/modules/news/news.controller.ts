import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ZodError } from 'zod';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { NewsService } from './news.service';
import { newsQuerySchema } from './dto/news-query.dto';

@Controller('news')
export class NewsController {
  constructor(private readonly newsService: NewsService) {}

  @Get('health')
  health() {
    return { status: 'ok', module: 'news' };
  }

  // Shared data, not user-owned: any authenticated user sees all news, so
  // this is guarded but never scoped by user_id.
  @UseGuards(JwtAuthGuard)
  @Get()
  list(@Query() query: unknown) {
    const result = newsQuerySchema.safeParse(query);
    if (!result.success) {
      throw new BadRequestException(this.formatZodError(result.error));
    }
    const { sentiment, page, pageSize } = result.data;
    return this.newsService.list({ sentiment, page, pageSize });
  }

  private formatZodError(error: ZodError): string {
    return error.issues
      .map((issue) => `${issue.path.join('.') || '(query)'}: ${issue.message}`)
      .join('; ');
  }
}
