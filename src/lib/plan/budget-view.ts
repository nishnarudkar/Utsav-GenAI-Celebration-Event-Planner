import type { PricedLine } from "@/lib/ai/agents/budget";
import { formatINR } from "@/lib/format";
import { CATEGORY_LABELS } from "@/lib/labels";
import type { ResolvedBasis } from "@/lib/rules/budget-math";
import type { BudgetCategory, BudgetUnit, CityTier } from "@/lib/schemas/enums";
import type { EventPlan } from "@/lib/plan/types";

/** View model for the Budget page. Pure; the page only renders it. */

export interface CategoryRow {
  category: BudgetCategory;
  label: string;
  estimatePaise: number;
  /** Planner's target; null when the total budget is being estimated. */
  allocatedPaise: number | null;
  /** estimate − target (positive = over target); null without a target. */
  deltaPaise: number | null;
  lines: PricedLine[];
}

export interface BudgetView {
  rows: CategoryRow[];
  totalEstimatePaise: number;
  budgetTotalPaise: number;
  isEstimate: boolean;
  remainingPaise: number;
  overBudgetPaise: number;
  unpriced: EventPlan["budget"]["unpriced"];
  adjustments: string[];
}

export function buildBudgetView(event: Pick<EventPlan, "budget">): BudgetView {
  const { budget } = event;
  const linesBy = new Map<BudgetCategory, PricedLine[]>();
  for (const line of budget.lines) linesBy.set(line.category, [...(linesBy.get(line.category) ?? []), line]);

  const rows: CategoryRow[] = (Object.entries(budget.byCategory) as Array<[BudgetCategory, { allocatedPaise: number | null; estimatePaise: number } | undefined]>)
    .filter((e): e is [BudgetCategory, { allocatedPaise: number | null; estimatePaise: number }] => e[1] !== undefined)
    .map(([category, c]) => ({
      category,
      label: CATEGORY_LABELS[category],
      estimatePaise: c.estimatePaise,
      allocatedPaise: c.allocatedPaise,
      deltaPaise: c.allocatedPaise === null ? null : c.estimatePaise - c.allocatedPaise,
      lines: [...(linesBy.get(category) ?? [])].sort((a, b) => b.estimatePaise - a.estimatePaise),
    }))
    .sort((a, b) => b.estimatePaise - a.estimatePaise || a.label.localeCompare(b.label));

  return {
    rows,
    totalEstimatePaise: budget.totalEstimatePaise,
    budgetTotalPaise: budget.budgetTotalPaise,
    isEstimate: budget.budgetIsEstimate,
    remainingPaise: budget.remainingPaise,
    overBudgetPaise: budget.overBudgetPaise,
    unpriced: budget.unpriced,
    adjustments: budget.adjustments,
  };
}

const UNIT_NOUN: Record<BudgetUnit, [singular: string, plural: string]> = {
  per_plate: ["plate", "plates"],
  per_guest: ["guest", "guests"],
  per_day: ["day", "days"],
  per_hour: ["hour", "hours"],
  per_item: ["item", "items"],
  flat: ["package", "packages"],
};

const TIER_PLACE: Record<CityTier, string> = { 1: "metro", 2: "large-city", 3: "smaller-city" };

/** The "Why?" working for a priced line: "250 plates × ₹900 · low tier · metro prices". */
export function basisText(basis: ResolvedBasis): string {
  const [one, many] = UNIT_NOUN[basis.unit];
  const qty = Number.isInteger(basis.quantity) ? basis.quantity.toLocaleString("en-IN") : String(basis.quantity);
  return `${qty} ${basis.quantity === 1 ? one : many} × ${formatINR(basis.unitPaise)} · ${basis.unitTier} tier · ${TIER_PLACE[basis.cityTier]} prices`;
}
