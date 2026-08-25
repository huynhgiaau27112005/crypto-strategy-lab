import { z } from 'zod';

// Bounds the "Chạy thêm N iteration" request. Upper bound of 50 keeps this
// well clear of an unbounded loop (docs/about-projects/03-anti-patterns-to-avoid.md)
// while comfortably covering the UI's fixed "Chạy thêm 10 iteration" button.
export const extendSearchSchema = z.object({
  iterations: z.number().int().min(1).max(50).optional(),
});

export type ExtendSearchDto = z.infer<typeof extendSearchSchema>;

export const DEFAULT_EXTEND_ITERATIONS = 10;
