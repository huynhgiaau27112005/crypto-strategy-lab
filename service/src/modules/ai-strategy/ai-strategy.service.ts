import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AiStrategyValidatorService } from './ai-strategy-validator.service';
import { AiStrategyRunnerService } from './ai-strategy-runner.service';
import { AiStrategyRepository } from './repositories/ai-strategy.repository';
import { CandleRepository } from '../market-data/repositories/candle.repository';
import { LLM_PROVIDER } from './providers/llm-provider.factory';
import type {
  AiStrategyDetail,
  AiStrategyDomain,
  AiStrategySummary,
  CandleInput,
  GeneratedStrategy,
  LlmProvider,
  Signal,
  ValidationResult,
} from './ai-strategy.types';
import { StrategyEntity } from '../../database/types';

@Injectable()
export class AiStrategyService {
  constructor(
    @Inject(LLM_PROVIDER) private readonly llmProvider: LlmProvider,
    private readonly validator: AiStrategyValidatorService,
    private readonly runner: AiStrategyRunnerService,
    private readonly repository: AiStrategyRepository,
    private readonly candles: CandleRepository,
  ) {}

  /**
   * Prompt -> Python source -> auto-validated. The UI's validation panel
   * reflects this same result immediately after generation, before the
   * user does anything else.
   */
  async generate(prompt: string): Promise<{
    code: string;
    raw: string;
    providerName: string;
    validation: ValidationResult;
  }> {
    let generated: GeneratedStrategy;
    try {
      generated = await this.llmProvider.generateStrategy(prompt);
    } catch (err) {
      // The OpenAI-compatible provider throws when OPENAI_API_KEY is unset
      // (see openai-compatible.provider.ts) or the upstream call fails —
      // surface as a clear, actionable 400, never a crash or silent stub.
      throw new BadRequestException(
        `Strategy generation failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const validation = await this.validator.validate(generated.code);
    return {
      code: generated.code,
      raw: generated.raw,
      providerName: generated.providerName,
      validation,
    };
  }

  async validateCode(code: string): Promise<ValidationResult> {
    return this.validator.validate(code);
  }

  /**
   * Re-validates before writing — never trust a validation result computed
   * in an earlier request (the user could have edited the code, or time
   * could have passed since generate()). Rejects with the failing checks
   * if invalid; never silently saves broken code.
   */
  async save(
    userId: string,
    name: string,
    code: string,
    domain: AiStrategyDomain,
  ): Promise<AiStrategyDetail> {
    const validation = await this.validator.validate(code);
    if (!validation.valid) {
      const reasons = validation.checks
        .filter((c) => !c.passed)
        .map((c) => `${c.key}: ${c.message}`)
        .join(' | ');
      throw new BadRequestException(`Strategy failed validation, not saved. ${reasons}`);
    }

    const row = await this.repository.createVersion(userId, name, code, domain);
    return toDetail(row);
  }

  async listMine(userId: string): Promise<AiStrategySummary[]> {
    const rows = await this.repository.listMine(userId);
    return rows.map(toSummary);
  }

  async getOne(id: string, userId: string): Promise<AiStrategyDetail> {
    const row = await this.repository.findMineById(id, userId);
    if (!row) {
      throw new NotFoundException(`No AI-generated strategy "${id}" owned by this account.`);
    }
    return toDetail(row);
  }

  /**
   * Runs a saved strategy over real candles from the candle repository
   * (or, for tests/tooling, an explicitly-supplied series) and returns its
   * signals — the end-to-end proof that a saved AI strategy is actually
   * executable, not just stored text.
   */
  async run(
    id: string,
    userId: string,
    timeframe: string,
    limit: number,
    explicitCandles?: CandleInput[],
  ): Promise<{ candleCount: number; signals: Signal[] }> {
    const row = await this.repository.findMineById(id, userId);
    if (!row) {
      throw new NotFoundException(`No AI-generated strategy "${id}" owned by this account.`);
    }
    if (!row.source_code) {
      throw new BadRequestException('This strategy row has no source code stored.');
    }

    const candleInputs = explicitCandles ?? (await this.loadCandles(timeframe, limit));
    if (candleInputs.length === 0) {
      throw new BadRequestException(
        `No candles available for timeframe "${timeframe}". Import candles for this timeframe first.`,
      );
    }

    const signals = await this.runner.run(row.source_code, candleInputs);
    return { candleCount: candleInputs.length, signals };
  }

  private async loadCandles(timeframe: string, limit: number): Promise<CandleInput[]> {
    const rows = await this.candles.findCandles(timeframe, limit);
    // findCandles orders DESC (most recent first); the contract is
    // oldest-first so a strategy's own indexing (e.g. "closes[i-20:i]" for
    // a moving average) behaves the way a human reading the series would
    // expect.
    return rows
      .slice()
      .reverse()
      .map((c) => ({
        timestamp: new Date(c.timestamp).getTime(),
        open: Number(c.open),
        high: Number(c.high),
        low: Number(c.low),
        close: Number(c.close),
        volume: Number(c.volume),
      }));
  }
}

const VALID_DOMAINS: readonly AiStrategyDomain[] = ['TREND', 'MOMENTUM', 'VOLATILITY', 'STRUCTURE'];

function rowDomain(row: StrategyEntity): AiStrategyDomain | null {
  const domain = row.parameters?.domain;
  return typeof domain === 'string' && (VALID_DOMAINS as string[]).includes(domain)
    ? (domain as AiStrategyDomain)
    : null;
}

function toSummary(row: StrategyEntity): AiStrategySummary {
  return {
    id: row.id,
    name: row.name,
    version: row.version,
    createdAt: row.created_at,
    isActive: row.is_active,
    domain: rowDomain(row),
  };
}

function toDetail(row: StrategyEntity): AiStrategyDetail {
  return {
    ...toSummary(row),
    sourceCode: row.source_code ?? '',
  };
}
