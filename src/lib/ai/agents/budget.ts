import "server-only";
import { BUDGET_PROMPT_V1, renderPriceMenu } from "@/lib/ai/prompts/budget";
import { callStructured, type CallStructuredOptions } from "@/lib/ai/structured";
import { formatDate, formatINR } from "@/lib/format";
import { getPricing } from "@/lib/kb/pricing";
import { indexBenchmarks, resolveBudgetLines, sumPaise, summarizeBudget, type ResolvedLine } from "@/lib/rules/budget-math";
import { BudgetProposal, type BudgetLineProposal } from "@/lib/schemas/budget";
import type { BudgetCategory, CityTier } from "@/lib/schemas/enums";
import type { OnboardingAnswers, PlannedEvent } from "@/lib/schemas/event";

/**
 * Budget agent: plan + allocation targets + price menu → line items with a basis.
 * `priceBudgetProposal` validates and prices them deterministically.
 */

export interface BudgetInput {
  answers: OnboardingAnswers;
  cityTier: CityTier;
  plan: Pick<PlannedEvent, "functions" | "allocationPaise">;
}

export interface BudgetDeps {
  structured: (opts: CallStructuredOptions<typeof BudgetProposal>) => Promise<BudgetProposal>;
}

export type PricedLine = ResolvedLine<BudgetLineProposal>;

export interface CategoryBudget {
  /** Planner's target; null when the total budget is still being estimated. */
  allocatedPaise: number | null;
  estimatePaise: number;
}

export interface PricedBudget {
  lines: PricedLine[];
  /** Lines with no benchmark for their category/unit: the UI asks for a quote. */
  unpriced: BudgetLineProposal[];
  totalEstimatePaise: number;
  /** The family's budget, or the priced total when they asked Utsav to estimate. */
  budgetTotalPaise: number;
  budgetIsEstimate: boolean;
  byCategory: Partial<Record<BudgetCategory, CategoryBudget>>;
  overBudgetPaise: number;
  remainingPaise: number;
  adjustments: string[];
}

const defaultDeps: BudgetDeps = { structured: (opts) => callStructured(opts) };

export async function proposeBudget(input: BudgetInput, deps: BudgetDeps = defaultDeps): Promise<PricedBudget> {
  const pricing = getPricing();
  const proposal = await deps.structured({
    schema: BudgetProposal,
    name: "emit_budget_proposal",
    fixtureKey: `emit_budget_proposal.${input.answers.culture}.${input.answers.eventType}`,
    model: "smart",
    system: [
      { type: "text", text: BUDGET_PROMPT_V1, cache_control: { type: "ephemeral" } },
      { type: "text", text: renderPriceMenu(pricing.rows, input.cityTier), cache_control: { type: "ephemeral" } },
    ],
    messages: [{ role: "user", content: userMessage(input) }],
  });
  return priceBudgetProposal(proposal, input, pricing.rows);
}

function userMessage({ answers, plan }: BudgetInput): string {
  const functions = plan.functions
    .map((f) => `- ${f.name}: ${formatDate(f.date)}, ${f.startTime}–${f.endTime}, ${f.expectedGuests} guests`)
    .join("\n");
  const targets = plan.allocationPaise
    ? Object.entries(plan.allocationPaise)
        .map(([cat, paise]) => `- ${cat}: about ${formatINR(paise ?? 0)}`)
        .join("\n")
    : "- No budget set yet: choose sensible mid-range options; the app will total them as an estimate.";
  return [
    `Event: ${answers.eventType}, ${answers.culture.replace(/_/g, " ")}, in ${answers.city}`,
    `Guest count: ${answers.guestCount}`,
    `Total budget: ${answers.budgetTotalPaise === null ? "to be estimated" : formatINR(answers.budgetTotalPaise)}`,
    "",
    "Functions:",
    functions,
    "",
    "Target per category:",
    targets,
  ].join("\n");
}

/**
 * Deterministic checks and pricing of the model's proposal:
 * - functionName must match a planned function (otherwise it's cleared)
 * - per_guest quantity ≤ the function's guests (or the guest count for event-wide lines);
 *   per_plate ≤ 2 meals per guest at that function (or across all functions)
 * - lines priced from benchmarks for the city tier; unknown category/unit pairs → `unpriced`
 * - totals per category compared with the Planner's allocation and the overall budget
 */
export function priceBudgetProposal(
  proposal: BudgetProposal,
  input: BudgetInput,
  benchmarkRows = getPricing().rows,
): PricedBudget {
  const { answers, plan, cityTier } = input;
  const adjustments: string[] = [];
  const fnGuests = new Map(plan.functions.map((f) => [f.name, f.expectedGuests]));
  const allFunctionGuests = sumPaise(plan.functions.map((f) => f.expectedGuests));

  const checked = proposal.lines.map((line): BudgetLineProposal => {
    let functionName = line.functionName;
    if (functionName !== undefined && !fnGuests.has(functionName)) {
      adjustments.push(`"${line.label}": unknown function "${functionName}", treated as event-wide.`);
      functionName = undefined;
    }
    const guests = functionName ? (fnGuests.get(functionName) ?? answers.guestCount) : answers.guestCount;
    const cap =
      line.basis.unit === "per_guest"
        ? guests
        : line.basis.unit === "per_plate"
          ? 2 * (functionName ? guests : Math.max(allFunctionGuests, answers.guestCount))
          : Infinity;
    let quantity = line.basis.quantity;
    if (quantity > cap) {
      adjustments.push(`"${line.label}": ${line.basis.unit} quantity capped at ${cap} (was ${quantity}).`);
      quantity = cap;
    }
    const { functionName: _drop, ...rest } = line;
    return { ...rest, ...(functionName ? { functionName } : {}), basis: { ...line.basis, quantity } };
  });

  const { lines, unpriced } = resolveBudgetLines(checked, indexBenchmarks(benchmarkRows), cityTier);
  for (const u of unpriced) adjustments.push(`"${u.label}": no benchmark for ${u.category} ${u.basis.unit}; needs a quote.`);

  const totalEstimatePaise = sumPaise(lines.map((l) => l.estimatePaise));
  const budgetIsEstimate = answers.budgetTotalPaise === null;
  const budgetTotalPaise = answers.budgetTotalPaise ?? totalEstimatePaise;
  const summary = summarizeBudget(lines, budgetTotalPaise);

  const categories = new Set<BudgetCategory>([
    ...(Object.keys(plan.allocationPaise ?? {}) as BudgetCategory[]),
    ...lines.map((l) => l.category),
  ]);
  const byCategory: Partial<Record<BudgetCategory, CategoryBudget>> = {};
  for (const c of categories) {
    byCategory[c] = { allocatedPaise: plan.allocationPaise?.[c] ?? null, estimatePaise: summary.byCategory[c] ?? 0 };
  }

  return {
    lines,
    unpriced,
    totalEstimatePaise,
    budgetTotalPaise,
    budgetIsEstimate,
    byCategory,
    overBudgetPaise: summary.overBudgetPaise,
    remainingPaise: summary.remainingPaise,
    adjustments,
  };
}
