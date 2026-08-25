import { BadRequestException, Controller, Get, HttpCode, HttpStatus, Post, Query, UseGuards } from '@nestjs/common';
import { ZodError } from 'zod';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { NewsService } from './news.service';
import { newsQuerySchema } from './dto/news-query.dto';
import { NewsCrawlQueueService } from './crawl/news-crawl-queue.service';

@Controller('news')
export class NewsController {
  constructor(
    private readonly newsService: NewsService,
    private readonly newsCrawlQueueService: NewsCrawlQueueService,
  ) {}

  @Get('health')
  health() {
    return { status: 'ok', module: 'news' };
  }

  // ADR-005 (artifacts/decisions.md §7): the crawler is a separate OS
  // process (workers/news/main.py), launched by the worker process — never
  // crawled in-process here (task-16: the API only enqueues onto the
  // "news-crawl" BullMQ queue and returns immediately with a job id, it
  // never blocks the HTTP request for the crawl's duration). A second call
  // while a crawl is already queued/running returns that same in-flight
  // job instead of spawning a parallel crawler over the same sources.
  @UseGuards(JwtAuthGuard)
  @Post('crawl')
  @HttpCode(HttpStatus.ACCEPTED)
  triggerCrawl() {
    return this.newsCrawlQueueService.trigger();
  }

  // Polled by the client after triggerCrawl() — null before the first
  // crawl has ever been triggered. Reads real BullMQ/Redis job state, so a
  // restarted API process reports the same status a still-running worker
  // is updating (task-16).
  @UseGuards(JwtAuthGuard)
  @Get('crawl/status')
  getCrawlStatus() {
    return this.newsCrawlQueueService.getStatus();
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
