import { Injectable, LoggerService } from '@nestjs/common';
import { getCorrelationId } from '../correlation/correlation-context';
import { redact } from './redact';

export type LogFormat = 'json' | 'pretty';

interface LogEntry {
  timestamp: string;
  level: string;
  context: string;
  message: string;
  correlationId?: string;
  [key: string]: unknown;
}

/**
 * Structured logger used everywhere in this codebase — registered via
 * `app.useLogger(app.get(StructuredLogger))` in both main.ts and worker.ts.
 * Nest's own `Logger` class (used all over via `new Logger(SomeClass.name)`)
 * delegates to whatever logger was registered with `useLogger`, so every
 * existing `this.logger.log(...)` call site in the codebase becomes
 * structured JSON automatically, with no per-call-site changes required.
 *
 * Format: JSON lines in production, human-readable single-line output in
 * development — controlled by LOG_FORMAT ('json' | 'pretty'), defaulting to
 * 'pretty' unless NODE_ENV=production (task-18 requirement #1).
 *
 * Every log line carries the active correlation id (from AsyncLocalStorage,
 * see correlation-context.ts) automatically, and every structured "meta"
 * field is passed through {@link redact} before being written — this is the
 * single choke point that makes redaction impossible to bypass by accident
 * (task-18 hard requirement).
 */
@Injectable()
export class StructuredLogger implements LoggerService {
  private readonly format: LogFormat;

  constructor() {
    const configured = process.env.LOG_FORMAT?.toLowerCase();
    if (configured === 'json' || configured === 'pretty') {
      this.format = configured;
    } else {
      this.format = process.env.NODE_ENV === 'production' ? 'json' : 'pretty';
    }
  }

  log(message: unknown, context?: string): void {
    this.write('info', message, context);
  }

  error(message: unknown, trace?: string, context?: string): void {
    this.write('error', message, context, trace ? { trace } : undefined);
  }

  warn(message: unknown, context?: string): void {
    this.write('warn', message, context);
  }

  debug(message: unknown, context?: string): void {
    this.write('debug', message, context);
  }

  verbose(message: unknown, context?: string): void {
    this.write('verbose', message, context);
  }

  /**
   * Escape hatch for call sites that want structured extras attached to a
   * log line (e.g. ObservabilityMiddleware's access log: method/route/
   * status/durationMs) beyond the plain-string message Nest's LoggerService
   * interface supports. Still goes through the exact same redact() + format
   * path as every other log call.
   */
  logWithMeta(message: string, context: string, meta: Record<string, unknown>): void {
    this.write('info', message, context, meta);
  }

  private write(
    level: string,
    message: unknown,
    context?: string,
    meta?: Record<string, unknown>,
  ): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      context: context ?? 'Application',
      message: this.stringifyMessage(message),
    };
    const correlationId = getCorrelationId();
    if (correlationId) entry.correlationId = correlationId;
    if (meta) Object.assign(entry, redact(meta) as Record<string, unknown>);

    const line = this.format === 'json' ? JSON.stringify(entry) : this.formatPretty(entry);
    if (level === 'error') {
      // eslint-disable-next-line no-console
      console.error(line);
    } else {
      // eslint-disable-next-line no-console
      console.log(line);
    }
  }

  private stringifyMessage(message: unknown): string {
    if (typeof message === 'string') return message;
    try {
      return JSON.stringify(redact(message));
    } catch {
      return String(message);
    }
  }

  private formatPretty(entry: LogEntry): string {
    const { timestamp, level, context, message, correlationId, ...rest } = entry;
    const cidSuffix = correlationId ? ` cid=${correlationId}` : '';
    const restKeys = Object.keys(rest);
    const extra = restKeys.length > 0 ? ` ${JSON.stringify(rest)}` : '';
    return `${timestamp} ${level.toUpperCase().padEnd(5)} [${context}]${cidSuffix} ${message}${extra}`;
  }
}
