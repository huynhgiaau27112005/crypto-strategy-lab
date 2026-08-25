import { z } from 'zod';
import { MAX_PROMPT_LENGTH } from '../ai-strategy.config';

// The UI caps the prompt textarea at 1000 chars (see the "… / 1000"
// counter in the prototype) — enforced again here since the frontend
// cannot be trusted to enforce it (docs/about-projects anti-pattern:
// business logic must not live only in the frontend).
export const generateStrategySchema = z.object({
  prompt: z.string().trim().min(1, 'prompt must not be empty').max(MAX_PROMPT_LENGTH),
});
export type GenerateStrategyBody = z.infer<typeof generateStrategySchema>;

export const validateStrategySchema = z.object({
  code: z.string().min(1, 'code must not be empty'),
});
export type ValidateStrategyBody = z.infer<typeof validateStrategySchema>;

export const saveStrategySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'name must not be empty')
    .max(255)
    .regex(/^[A-Za-z0-9_.\-]+$/, 'name must be alphanumeric with _ . - only'),
  code: z.string().min(1, 'code must not be empty'),
});
export type SaveStrategyBody = z.infer<typeof saveStrategySchema>;

const candleShape = z.object({
  timestamp: z.number(),
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
  volume: z.number(),
});

export const runStrategySchema = z.object({
  timeframe: z.string().trim().min(1).max(10).default('1h'),
  limit: z.number().int().min(2).max(5000).default(200),
  // Optional escape hatch for tests / callers that already have a candle
  // series in hand; when omitted, the service loads real candles from the
  // candle repository for `timeframe`/`limit`.
  candles: z.array(candleShape).optional(),
});
export type RunStrategyBody = z.infer<typeof runStrategySchema>;
