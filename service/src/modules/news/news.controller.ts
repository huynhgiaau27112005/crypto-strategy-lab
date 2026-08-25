import { BadRequestException, Controller, Get, HttpCode, HttpStatus, Post, Query, UseGuards } from '@nestjs/common';
import { ZodError } from 'zod';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { NewsService } from './news.service';
import { newsQuerySchema } from './dto/news-query.dto';
import { NewsCrawlService } from './crawl/news-crawl.service';

@Controller('news')
export class NewsController {
  constructor(
    private readonly newsService: NewsService,
    private readonly newsCrawlService: NewsCrawlService,
  ) {}

  @Get('health')
  health() {
    return { status: 'ok', module: 'news' };
  }

  // ADR-005 (artifacts/decisions.md §7): the crawler is a separate OS
  // process (workers/news/main.py), never crawled in-process here. This
  // launches it and returns immediately with a job id — it never blocks
  // the HTTP request for the crawl's duration. A second call while a crawl
  // is already running returns that same in-flight job instead of spawning
  // a parallel crawler over the same sources.
  @UseGuards(JwtAuthGuard)
  @Post('crawl')
  @HttpCode(HttpStatus.ACCEPTED)
  triggerCrawl() {
    return this.newsCrawlService.trigger();
  }

  // Polled by the client after triggerCrawl() — null before the first
  // crawl of this process's lifetime has ever been triggered.
  @UseGuards(JwtAuthGuard)
  @Get('crawl/status')
  getCrawlStatus() {
    return this.newsCrawlService.getStatus();
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
