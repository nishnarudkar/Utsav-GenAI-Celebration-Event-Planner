import { z } from "zod";

/** Output of the Culture agent (CLAUDE.md §8). */

export const RitualItem = z.object({
  item: z.string().min(1),
  quantity: z.string().optional(),
});
export type RitualItem = z.infer<typeof RitualItem>;

export const Ritual = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]*$/, "key must be snake_case"),
  name: z.string().min(1),
  order: z.number().int().positive(),
  durationMinutes: z.number().int().min(5).max(600),
  participants: z.array(z.string().min(1)),
  items: z.array(RitualItem),
  significance: z.string().max(160),
});
export type Ritual = z.infer<typeof Ritual>;

export const Confidence = z.enum(["high", "medium", "low"]);
export type Confidence = z.infer<typeof Confidence>;

export const RitualPlan = z.object({
  rituals: z.array(Ritual).min(1),
  /** Ids of the KB chunks the plan is grounded in, e.g. "kb/rituals/bengali-hindu-wedding.md#3". */
  sources: z.array(z.string()),
  confidence: Confidence,
});
export type RitualPlan = z.infer<typeof RitualPlan>;
