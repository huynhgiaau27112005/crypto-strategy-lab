import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { runWithCorrelationId } from '../../observability/correlation/correlation-context';
import { AI_GENERATE_QUEUE } from '../../queue/queue.constants';
import {
  AiGenerateJobData,
  AiGenerateJobResult,
} from './ai-generate-queue.service';
import { getGenerateTimeoutMs } from './ai-strategy.config';
import { AiStrategyService } from './ai-strategy.service';

@Processor(AI_GENERATE_QUEUE, { concurrency: 5, lockDuration: 120_000 })
export class AiGenerateProcessor extends WorkerHost {
  private readonly logger = new Logger(AiGenerateProcessor.name);

  constructor(private readonly aiStrategyService: AiStrategyService) {
    super();
  }

  async process(
    job: Job<AiGenerateJobData, AiGenerateJobResult>,
  ): Promise<AiGenerateJobResult> {
    const correlationId = job.data.correlationId ?? String(job.id);
    return runWithCorrelationId(correlationId, async () => {
      this.logger.log(`[worker] Starting AI generate job ${job.id}`);
      const result = await this.withTimeout(
        this.aiStrategyService.generate(job.data.prompt),
        getGenerateTimeoutMs(),
      );
      this.logger.log(`[worker] AI generate job ${job.id} finished`);
      return result;
    });
  }

  private async withTimeout<T>(operation: Promise<T>, ms: number): Promise<T> {
    let timeout: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        operation,
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error(`Generate job timed out after ${ms}ms`)),
            ms,
          );
        }),
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }
}
