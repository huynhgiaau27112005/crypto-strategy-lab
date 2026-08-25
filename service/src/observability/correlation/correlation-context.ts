import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Per-request/per-job correlation context, propagated implicitly via
 * AsyncLocalStorage so no call site has to thread a correlation id through
 * every function signature (task-18 requirement #2).
 *
 * One store is shared by both processes: the API sets it in
 * ObservabilityMiddleware for every HTTP request; the worker sets it in
 * each BullMQ processor from the job payload (see SearchProcessor /
 * NewsCrawlProcessor). StructuredLogger reads it on every log call, which
 * is what makes "same correlationId across two processes" work without
 * every service constructor accepting a correlationId parameter.
 */
export interface CorrelationStore {
  correlationId: string;
}

const storage = new AsyncLocalStorage<CorrelationStore>();

export function runWithCorrelationId<T>(correlationId: string, fn: () => T): T {
  return storage.run({ correlationId }, fn);
}

export function getCorrelationId(): string | undefined {
  return storage.getStore()?.correlationId;
}
