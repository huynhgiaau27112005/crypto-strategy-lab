import { randomUUID } from 'node:crypto';
import { ConflictException, Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { getCorrelationId } from '../../observability/correlation/correlation-context';
import { AI_GENERATE_QUEUE } from '../../queue/queue.constants';
import { withTimeout } from '../../queue/with-timeout';

export type AiGenerateJobStatus = 'RUNNING' | 'COMPLETED' | 'FAILED';

export interface AiGenerateJobResult {
  code: string;
  raw: string;
  providerName: string;
  validation: {
    valid: boolean;
    checks: Array<{ key: string; passed: boolean; message: string }>;
  };
}

export interface AiGenerateJobData {
  userId: string;
  prompt: string;
  correlationId: string;
}

export interface AiGenerateJob {
  jobId: string;
  status: AiGenerateJobStatus;
  prompt: string;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  result: AiGenerateJobResult | null;
}

const IN_FLIGHT_STATES = [
  'active',
  'waiting',
  'delayed',
  'waiting-children',
  'prioritized',
] as const;

@Injectable()
export class AiGenerateQueueService {
  constructor(
    @InjectQueue(AI_GENERATE_QUEUE)
    private readonly queue: Queue<AiGenerateJobData, AiGenerateJobResult>,
  ) {}

  async enqueue(userId: string, prompt: string): Promise<AiGenerateJob> {
    const existing = await withTimeout(this.findInFlightJob(userId));
    if (existing) {
      throw new ConflictException('A generate job is already running for this account.');
    }

    const correlationId = getCorrelationId() ?? randomUUID();
    const job = await withTimeout(
      this.queue.add(
        'generate',
        { userId, prompt, correlationId } satisfies AiGenerateJobData,
        {
          jobId: `${userId}-gen-${Date.now()}`,
          attempts: 1,
          removeOnComplete: { count: 50 },
          removeOnFail: { count: 50 },
        },
      ),
    );
    return this.toJobStatus(job);
  }

  async getStatus(userId: string): Promise<AiGenerateJob | null> {
    const active = await withTimeout(this.findInFlightJob(userId));
    if (active) return this.toJobStatus(active);

    const latest = await withTimeout(this.findLatestFinishedJob(userId));
    return latest ? this.toJobStatus(latest) : null;
  }

  private async findInFlightJob(
    userId: string,
  ): Promise<Job<AiGenerateJobData, AiGenerateJobResult> | undefined> {
    const jobs = await this.queue.getJobs([...IN_FLIGHT_STATES]);
    return jobs.find((job) => job.data?.userId === userId);
  }

  private async findLatestFinishedJob(
    userId: string,
  ): Promise<Job<AiGenerateJobData, AiGenerateJobResult> | undefined> {
    const [completed, failed] = await Promise.all([
      this.queue.getJobs(['completed'], 0, 50),
      this.queue.getJobs(['failed'], 0, 50),
    ]);
    const ownJobs = [...completed, ...failed].filter((job) => job.data?.userId === userId);
    ownJobs.sort((a, b) => (b.finishedOn ?? 0) - (a.finishedOn ?? 0));
    return ownJobs[0];
  }

  private async toJobStatus(
    job: Job<AiGenerateJobData, AiGenerateJobResult>,
  ): Promise<AiGenerateJob> {
    const state = await job.getState();
    const status: AiGenerateJobStatus =
      state === 'completed' ? 'COMPLETED' : state === 'failed' ? 'FAILED' : 'RUNNING';

    return {
      jobId: String(job.id),
      status,
      prompt: job.data.prompt,
      startedAt: job.processedOn ? new Date(job.processedOn).toISOString() : null,
      finishedAt: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
      error: status === 'FAILED' ? job.failedReason ?? null : null,
      result: status === 'COMPLETED' && job.returnvalue ? job.returnvalue : null,
    };
  }
}
