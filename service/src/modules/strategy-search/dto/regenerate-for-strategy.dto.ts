import { z } from 'zod';

// Body of POST /strategy-search/experiments/:id/regenerate — the second
// half of ParameterPanel's "Lưu tham số → tạo version mới" (the first half
// is POST /strategy-plugin/strategies/:name/versions, which inserts the new
// immutable strategy version). `strategyName` is the built-in strategy
// whose parameters were just re-saved; every combination on this
// experiment's Leaderboard that contains it is regenerated onto the new
// version. See StrategySearchService.regenerateForStrategyVersion.
export const regenerateForStrategySchema = z.object({
  strategyName: z.string().min(1),
});

export type RegenerateForStrategyDto = z.infer<typeof regenerateForStrategySchema>;
