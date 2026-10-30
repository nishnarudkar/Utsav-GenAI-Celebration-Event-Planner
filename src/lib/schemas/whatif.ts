import { z } from "zod";
import { PriceTier } from "@/lib/schemas/enums";
import type { BudgetCategory } from "@/lib/schemas/enums";
import type { Conflict } from "@/lib/schemas/diff";

/** Budget What-If Simulator (CLAUDE.md F6). A scenario only lists what the family changed. */

export const WhatIfScenario = z.object({
  guestCount: z.number().int().min(1).max(5000).optional(),
  tiers: z
    .object({ venue: PriceTier.optional(), catering: PriceTier.optional(), decor: PriceTier.optional() })
    .default({}),
  /** Function names to leave out. */
  dropFunctions: z.array(z.string().min(1).max(80)).max(12).default([]),
});
export type WhatIfScenario = z.infer<typeof WhatIfScenario>;

export interface CategoryProjection {
  category: BudgetCategory;
  label: string;
  beforePaise: number;
  afterPaise: number;
}

export interface SavingSuggestion {
  id: string;
  title: string;
  savesPaise: number;
}

export interface WhatIfProjection {
  totalEstimatePaise: number;
  /** Against the current plan; positive means the scenario costs more. */
  deltaPaise: number;
  budgetTotalPaise: number;
  budgetIsEstimate: boolean;
  overBudgetPaise: number;
  remainingPaise: number;
  /** Only categories the scenario changes, biggest change first. */
  categories: CategoryProjection[];
  conflicts: Conflict[];
  /** Further savings from this scenario, biggest first. */
  savings: SavingSuggestion[];
}
