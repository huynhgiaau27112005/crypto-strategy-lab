import { z } from 'zod';

const DEFAULT_HOURS = 24;
const MAX_HOURS = 24 * 365; // one year — a generous upper bound, not unbounded

export const sentimentSummaryQuerySchema = z.object({
  hours: z
    .string()
    .optional()
    .transform((value) => (value === undefined ? DEFAULT_HOURS : Number(value)))
    .refine((value) => Number.isFinite(value) && value > 0, {
      message: 'hours must be a positive number',
    })
    .transform((value) => Math.min(value, MAX_HOURS)),
});

export type SentimentSummaryQueryDto = z.infer<typeof sentimentSummaryQuerySchema>;
