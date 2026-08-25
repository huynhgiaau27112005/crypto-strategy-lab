import { BadRequestException, Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../auth/decorators/current-user.decorator';
import { AiStrategyService } from './ai-strategy.service';
import {
  generateStrategySchema,
  runStrategySchema,
  saveStrategySchema,
  validateStrategySchema,
} from './dto/ai-strategy.dto';
import { PROMPT_SAMPLES } from './contract-prompt';

function parseOrThrow<T>(schema: { safeParse: (v: unknown) => { success: boolean; data?: T; error?: any } }, body: unknown): T {
  const result = schema.safeParse(body ?? {});
  if (!result.success) {
    throw new BadRequestException(
      result.error.issues.map((issue: any) => `${issue.path.join('.') || '(body)'}: ${issue.message}`).join('; '),
    );
  }
  return result.data as T;
}

@Controller('ai-strategy')
export class AiStrategyController {
  constructor(private readonly aiStrategyService: AiStrategyService) {}

  @Get('health')
  health() {
    return { status: 'ok', module: 'ai-strategy' };
  }

  // Static sample prompts shown in the "Mẫu mô tả" panel — kept on the
  // backend so the frontend never hard-codes copy that could drift from
  // the contract prompt (contract-prompt.ts is the single source).
  @Get('samples')
  samples() {
    return { samples: PROMPT_SAMPLES };
  }

  @UseGuards(JwtAuthGuard)
  @Post('generate')
  generate(@Body() body: unknown, @CurrentUser() _user: CurrentUserPayload) {
    const { prompt } = parseOrThrow(generateStrategySchema, body);
    return this.aiStrategyService.generate(prompt);
  }

  @UseGuards(JwtAuthGuard)
  @Post('validate')
  validate(@Body() body: unknown) {
    const { code } = parseOrThrow(validateStrategySchema, body);
    return this.aiStrategyService.validateCode(code);
  }

  @UseGuards(JwtAuthGuard)
  @Post('save')
  save(@Body() body: unknown, @CurrentUser() user: CurrentUserPayload) {
    const { name, code, domain } = parseOrThrow(saveStrategySchema, body);
    return this.aiStrategyService.save(user.id, name, code, domain);
  }

  // Ownership-scoped list: only AI strategies this account saved. See
  // AiStrategyRepository.listMine for the scoping and
  // ai-strategy.service.spec.ts for the regression test.
  @UseGuards(JwtAuthGuard)
  @Get('mine')
  listMine(@CurrentUser() user: CurrentUserPayload) {
    return this.aiStrategyService.listMine(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  getOne(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.aiStrategyService.getOne(id, user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/run')
  run(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: CurrentUserPayload) {
    const { timeframe, limit, candles } = parseOrThrow(runStrategySchema, body);
    return this.aiStrategyService.run(id, user.id, timeframe, limit, candles);
  }
}
