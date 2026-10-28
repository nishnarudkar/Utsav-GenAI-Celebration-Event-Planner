import { z } from "zod";
import raw from "../../../kb/pricing/vendor-benchmarks-india.json";
import { BudgetCategory, BudgetUnit, CityTier } from "@/lib/schemas/enums";

/**
 * Indicative vendor price benchmarks (kb/pricing/vendor-benchmarks-india.json).
 * Always shown in the UI as "indicative estimates" (CLAUDE.md §7.5).
 */

const paise = z.number().int().nonnegative();

export const BenchmarkRow = z
  .object({
    category: BudgetCategory,
    unit: BudgetUnit,
    city_tier: CityTier,
    low_paise: paise,
    mid_paise: paise,
    high_paise: paise,
    label: z.string().min(1),
  })
  .refine((r) => r.low_paise <= r.mid_paise && r.mid_paise <= r.high_paise, {
    message: "expected low ≤ mid ≤ high",
  });
export type BenchmarkRow = z.infer<typeof BenchmarkRow>;

export const PricingFile = z.object({
  version: z.number().int(),
  currency: z.literal("INR"),
  updated: z.string(),
  disclaimer: z.string().min(1),
  city_tiers: z.record(z.string(), z.string()),
  rows: z.array(BenchmarkRow).min(1),
});
export type PricingFile = z.infer<typeof PricingFile>;

let cached: PricingFile | undefined;

/** Parsed and validated once; throws at first use if the JSON is malformed. */
export function getPricing(): PricingFile {
  cached ??= PricingFile.parse(raw);
  return cached;
}
