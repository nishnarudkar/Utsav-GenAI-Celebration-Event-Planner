/**
 * Recovery options (CLAUDE.md §7.4 step 5): when a change leaves the plan over budget, offer
 * concrete fixes, each a ready-to-apply patch. Pure and deterministic — every saving is found by
 * applying the patch in a dry run and comparing totals, never estimated by a model.
 */

import { z } from "zod";
import type { PricedLine } from "@/lib/ai/agents/budget";
import { formatINRCompact } from "@/lib/format";
import { retotal, runCascade, type CascadeContext } from "@/lib/graph/cascade";
import { diffBudgetLines, describeCascade } from "@/lib/graph/diff";
import { FieldChange, type PlanChange } from "@/lib/graph/types";
import { getPricing } from "@/lib/kb/pricing";
import { CATEGORY_LABELS } from "@/lib/labels";
import type { EventPlan } from "@/lib/plan/types";
import { indexBenchmarks, lineEstimatePaise, unitPricePaise } from "@/lib/rules/budget-math";
import { detectConflicts } from "@/lib/rules/conflicts";
import { BudgetBasis } from "@/lib/schemas/budget";
import type { PlanDiff, RecoveryOption } from "@/lib/schemas/diff";
import type { BudgetCategory, PriceTier } from "@/lib/schemas/enums";

/** A recovery patch: re-basis some budget lines, or make a field change (runs the cascade). */
export const RecoveryPatch = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("lines"),
    updates: z.array(z.object({ lineIndex: z.number().int().nonnegative(), basis: BudgetBasis })).min(1),
  }),
  z.object({ kind: z.literal("field"), change: FieldChange }),
]);
export type RecoveryPatch = z.infer<typeof RecoveryPatch>;

/** Categories never suggested as cuts: ritual costs (priest, puja items) are the family's call. */
const PROTECTED: ReadonlySet<BudgetCategory> = new Set(["priest"]);
const LOWER_TIER: Record<PriceTier, PriceTier | null> = { high: "mid", mid: "low", low: null };
const MAX_OPTIONS = 3;

export interface RecoveryContext extends CascadeContext {
  /** What triggered the current state, for context-specific options. */
  trigger?: PlanChange;
}

/** Apply a patch to a state (dry): the new state, its diff entries and conflicts. */
export function applyRecoveryPatch(
  state: EventPlan,
  patch: RecoveryPatch,
  ctx: CascadeContext,
): { state: EventPlan; diff: PlanDiff } {
  if (patch.kind === "field") {
    const result = runCascade(state, patch.change, ctx);
    return { state: result.state, diff: result.diff };
  }

  const index = indexBenchmarks(ctx.benchmarkRows ?? getPricing().rows);
  const lines = [...state.budget.lines];
  for (const { lineIndex, basis } of patch.updates) {
    const line = lines[lineIndex];
    if (!line || line.locked) continue;
    const unitPaise = unitPricePaise(index, { category: line.category, unit: basis.unit, cityTier: state.cityTier, tier: basis.unitTier });
    if (unitPaise === null) continue;
    lines[lineIndex] = { ...line, basis: { ...basis, unitPaise, cityTier: state.cityTier }, estimatePaise: lineEstimatePaise(basis.quantity, unitPaise) };
  }
  const budget = retotal(state.budget, lines, state.plan.allocationPaise, state.budget.budgetTotalPaise);
  const next: EventPlan = { ...state, budget };
  const changed = diffBudgetLines(state.budget.lines, lines, () => "Recovery option");
  const conflicts = detectConflicts({
    functions: next.plan.functions,
    totalEstimatePaise: budget.totalEstimatePaise,
    budgetTotalPaise: budget.budgetTotalPaise,
    budgetIsEstimate: budget.budgetIsEstimate,
  });
  const delta = budget.totalEstimatePaise - state.budget.totalEstimatePaise;
  return {
    state: next,
    diff: {
      version: ctx.version + 1,
      budgetDeltaPaise: delta,
      changed,
      added: [],
      removed: [],
      conflicts,
      recoveryOptions: [],
      explanation: describeCascade({ headline: "Applied a recovery option.", linesChanged: changed.length, budgetDeltaPaise: delta, conflicts }),
    },
  };
}

interface Candidate {
  id: string;
  title: string;
  patch: RecoveryPatch;
  /** Extra effect worth mentioning (e.g. "Fits the 300-seat hall"). */
  note?: string;
}

function candidates(state: EventPlan, ctx: RecoveryContext): Candidate[] {
  const out: Candidate[] = [];
  const lines = state.budget.lines;

  // 1. One tier lower, per category.
  const byCategory = new Map<BudgetCategory, Array<{ i: number; line: PricedLine; tier: PriceTier }>>();
  lines.forEach((line, i) => {
    const tier = LOWER_TIER[line.basis.unitTier];
    if (!tier || line.locked || PROTECTED.has(line.category)) return;
    byCategory.set(line.category, [...(byCategory.get(line.category) ?? []), { i, line, tier }]);
  });
  for (const [category, items] of byCategory) {
    out.push({
      id: `tier:${category}`,
      title: `Choose budget-friendly ${CATEGORY_LABELS[category].toLowerCase()} options`,
      patch: { kind: "lines", updates: items.map(({ i, line, tier }) => ({ lineIndex: i, basis: { unit: line.basis.unit, quantity: line.basis.quantity, unitTier: tier } })) },
    });
  }

  // 2. Printed cards → digital invitations.
  lines.forEach((line, i) => {
    if (line.category === "invites" && line.basis.unit === "per_item" && !line.locked) {
      out.push({
        id: `digital_invites:${i}`,
        title: "Switch to digital invitations",
        patch: { kind: "lines", updates: [{ lineIndex: i, basis: { unit: "flat", quantity: 1, unitTier: "low" } }] },
      });
    }
  });

  // 3. After a guest increase that overfills a venue: keep the list at the venue's capacity.
  if (ctx.trigger?.field === "guest_count" && ctx.trigger.value > (ctx.trigger.from as number)) {
    const caps = state.plan.functions
      .filter((f) => f.venueCapacity && f.expectedGuests > f.venueCapacity)
      .map((f) => f.venueCapacity!);
    const cap = caps.length ? Math.min(...caps) : null;
    if (cap && cap < state.answers.guestCount && cap > (ctx.trigger.from as number)) {
      out.push({
        id: `guests:${cap}`,
        title: `Keep the guest list at ${cap}`,
        patch: { kind: "field", change: { field: "guest_count", value: cap } },
        note: `fits the ${cap}-seat venue`,
      });
    }
  }
  return out;
}

/**
 * Up to three options, biggest saving first, each with its exact saving. Only offered when
 * the plan is over a family-set budget.
 */
export function generateRecoveryOptions(state: EventPlan, ctx: RecoveryContext): RecoveryOption[] {
  const over = state.budget.budgetIsEstimate ? 0 : state.budget.overBudgetPaise;
  if (over <= 0) return [];

  const scored = candidates(state, ctx)
    .map((c) => {
      const after = applyRecoveryPatch(state, c.patch, ctx).state;
      return { c, saves: state.budget.totalEstimatePaise - after.budget.totalEstimatePaise };
    })
    .filter((s) => s.saves > 0)
    .sort((a, b) => b.saves - a.saves || a.c.id.localeCompare(b.c.id))
    .slice(0, MAX_OPTIONS);

  return scored.map(({ c, saves }) => {
    const covers = saves >= over ? `brings you within budget` : `covers ${Math.round((saves / over) * 100)}% of the ${formatINRCompact(over)} overrun`;
    return {
      id: c.id,
      title: c.title,
      savesPaise: saves,
      impact: `Saves ${formatINRCompact(saves)} — ${covers}${c.note ? `; ${c.note}` : ""}.`,
      patch: c.patch,
    };
  });
}
