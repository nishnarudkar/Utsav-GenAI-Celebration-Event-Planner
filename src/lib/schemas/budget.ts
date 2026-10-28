import { z } from "zod";
import { BudgetCategory, BudgetUnit, PriceTier } from "@/lib/schemas/enums";

/**
 * What the Budget agent proposes (CLAUDE.md §8): structure and choices, never totals.
 * `lib/rules/budget-math.ts` turns `basis` into paise using city benchmarks.
 */
export const BudgetBasis = z.object({
  unit: BudgetUnit,
  quantity: z.number().positive(),
  unitTier: PriceTier,
});
export type BudgetBasis = z.infer<typeof BudgetBasis>;

export const BudgetLineProposal = z.object({
  category: BudgetCategory,
  label: z.string().min(1),
  functionName: z.string().optional(),
  basis: BudgetBasis,
  rationale: z.string().max(200),
});
export type BudgetLineProposal = z.infer<typeof BudgetLineProposal>;

/** Budget agent output: line items with a basis, never totals (CLAUDE.md §7.3). */
export const BudgetProposal = z.object({
  lines: z.array(BudgetLineProposal).min(1).max(40),
});
export type BudgetProposal = z.infer<typeof BudgetProposal>;
