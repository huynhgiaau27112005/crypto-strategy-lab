import { BadRequestException } from '@nestjs/common';
import { Job } from 'bullmq';
import { AiGenerateProcessor } from './ai-generate.processor';
import {
  AiGenerateJobData,
  AiGenerateJobResult,
} from './ai-generate-queue.service';
import { AiStrategyService } from './ai-strategy.service';

describe('AiGenerateProcessor', () => {
  const originalGenerateTimeoutMs = process.env.AI_STRATEGY_GENERATE_TIMEOUT_MS;

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalGenerateTimeoutMs === undefined) {
      delete process.env.AI_STRATEGY_GENERATE_TIMEOUT_MS;
    } else {
      process.env.AI_STRATEGY_GENERATE_TIMEOUT_MS = originalGenerateTimeoutMs;
    }
  });

  function makeJob(prompt = 'Build an RSI strategy'): Job<AiGenerateJobData> {
    return {
      id: 'generate-job-1',
      data: {
        userId: 'user-1',
        prompt,
        correlationId: 'correlation-1',
      },
    } as Job<AiGenerateJobData>;
  }

  it('returns generate output as the job result', async () => {
    const expected: AiGenerateJobResult = {
      code: 'def generate_signals(candles): return []',
      raw: 'raw response',
      providerName: 'test-provider',
      validation: {
        valid: true,
        checks: [{ key: 'syntax', passed: true, message: 'Valid syntax' }],
      },
    };
    const service = {
      generate: jest.fn().mockResolvedValue(expected),
    } as unknown as AiStrategyService;
    const processor = new AiGenerateProcessor(service);

    await expect(processor.process(makeJob())).resolves.toEqual(expected);
    expect(service.generate).toHaveBeenCalledWith('Build an RSI strategy');
  });

  it('fails when generate rejects with BadRequestException', async () => {
    const error = new BadRequestException('generation failed');
    const service = {
      generate: jest.fn().mockRejectedValue(error),
    } as unknown as AiStrategyService;
    const processor = new AiGenerateProcessor(service);

    await expect(processor.process(makeJob())).rejects.toBe(error);
  });

  it('fails when generate exceeds the configured timeout', async () => {
    process.env.AI_STRATEGY_GENERATE_TIMEOUT_MS = '20';
    const service = {
      generate: jest.fn().mockReturnValue(new Promise(() => undefined)),
    } as unknown as AiStrategyService;
    const processor = new AiGenerateProcessor(service);

    await expect(processor.process(makeJob())).rejects.toThrow('timed out');
  });
});
