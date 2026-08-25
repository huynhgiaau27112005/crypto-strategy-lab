import { z } from 'zod';

// Shape-only validation: every value must be a finite number. The
// authoritative check — which keys are required, and their type/min/max/step
// — happens in StrategyPluginService against the plugin's parameterSchema,
// because that schema is dynamic per strategy type and cannot be expressed
// as a static zod shape here.
export const saveStrategyVersionSchema = z.object({
  parameters: z.record(z.string(), z.number().finite()),
});

export type SaveStrategyVersionDto = z.infer<typeof saveStrategyVersionSchema>;
