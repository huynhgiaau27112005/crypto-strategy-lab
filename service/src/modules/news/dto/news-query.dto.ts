import { z } from 'zod';

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 20;
const DEFAULT_PAGE = 1;

// Query params arrive as strings (or undefined) from Express. Rejects
// non-numeric, zero, and negative page/pageSize; clamps pageSize to a sane
// maximum instead of rejecting an over-large request.
export const newsQuerySchema = z.object({
  sentiment: z.enum(['POSITIVE', 'NEUTRAL', 'NEGATIVE']).optional(),
  page: z
    .string()
    .optional()
    .transform((value) => (value === undefined ? DEFAULT_PAGE : Number(value)))
    .refine((value) => Number.isInteger(value) && value > 0, {
      message: 'page must be a positive integer',
    }),
  pageSize: z
    .string()
    .optional()
    .transform((value) => (value === undefined ? DEFAULT_PAGE_SIZE : Number(value)))
    .refine((value) => Number.isInteger(value) && value > 0, {
      message: 'pageSize must be a positive integer',
    })
    .transform((value) => Math.min(value, MAX_PAGE_SIZE)),
});

export type NewsQueryDto = z.infer<typeof newsQuerySchema>;
