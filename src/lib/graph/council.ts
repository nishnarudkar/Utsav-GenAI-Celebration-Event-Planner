/**
 * Applying a Family Council compromise to a plan. Pure, like the cascade: returns the next
 * state and a diff without persisting, so each option's cost can be measured by a dry run.
 */

import type { PricedLine } from "@/lib/ai/agents/budget";
import { retotal, runCascade, type CascadeContext } from "@/lib/graph/cascade";
import { guestScaling } from "@/lib/graph/dependencies";
import { describeCascade, diffBudgetLines, diffFunctions } from "@/lib/graph/diff";
import type { EventPlan } from "@/lib/plan/types";
import { lineEstimatePaise } from "@/lib/rules/budget-math";
import { rescaleQuantity } from "@/lib/rules/capacity";
import { detectConflicts } from "@/lib/rules/conflicts";
import type { CouncilPatch } from "@/lib/schemas/council";
import type { Conflict, PlanDiff } from "@/lib/schemas/diff";

/** Set guests at specific functions, rescaling that function's guest-driven lines. */
export function applyFunctionGuests(
  state: EventPlan,
  updates: CouncilPatch["functionGuests"],
): { state: EventPlan; notes: Conflict[] } {
  const target = new Map(updates.map((u) => [u.functionName, u.guests]));
  const before = new Map(state.plan.functions.map((f) => [f.name, f.expectedGuests]));
  const functions = state.plan.functions.map((f) => {
    const guests = target.get(f.name);
    return guests === undefined || guests === f.expectedGuests ? f : { ...f, expectedGuests: guests };
  });
  const notes: Conflict[] = [];

  const lines = state.budget.lines.map((line): PricedLine => {
    if (guestScaling(line) !== "function_guests" || !line.functionName) return line;
    const to = target.get(line.functionName);
    const from = before.get(line.functionName);
    if (to === undefined || from === undefined || to === from) return line;
    const quantity = rescaleQuantity(line.basis.quantity, from, to);
    if (quantity === line.basis.quantity) return line;
    if (line.locked) {
      notes.push({ type: "locked_item", severity: "info", message: `"${line.label}" is locked, so it wasn't changed — it would need ${quantity} instead of ${line.basis.quantity}.` });
      return line;
    }
    return { ...line, basis: { ...line.basis, quantity }, estimatePaise: lineEstimatePaise(quantity, line.basis.unitPaise) };
  });

  return {
    state: {
      ...state,
      plan: { ...state.plan, functions },
      budget: retotal(state.budget, lines, state.plan.allocationPaise, state.budget.budgetTotalPaise),
    },
    notes,
  };
}

/**
 * Apply a compromise: guest count, then per-function guests, then budget. The guest list is
 * raised if a function asks for more guests than the event has, so the two can't disagree.
 */
export function applyCouncilPatch(
  start: EventPlan,
  patch: CouncilPatch,
  ctx: CascadeContext,
  headline: string,
): { state: EventPlan; diff: PlanDiff } {
  let state = start;
  const notes: Conflict[] = [];

  const known = new Set(start.plan.functions.map((f) => f.name));
  const updates = patch.functionGuests.filter((u) => known.has(u.functionName));
  const guestCount = Math.max(patch.guestCount ?? start.answers.guestCount, ...updates.map((u) => u.guests));

  state = runCascade(state, { field: "guest_count", value: guestCount }, ctx).state;
  if (updates.length > 0) {
    const applied = applyFunctionGuests(state, updates);
    state = applied.state;
    notes.push(...applied.notes);
  }
  if (patch.budgetTotalPaise !== null) {
    state = runCascade(state, { field: "budget_total", value: patch.budgetTotalPaise }, ctx).state;
  }

  const conflicts = [
    ...detectConflicts({
      functions: state.plan.functions,
      totalEstimatePaise: state.budget.totalEstimatePaise,
      budgetTotalPaise: state.budget.budgetTotalPaise,
      budgetIsEstimate: state.budget.budgetIsEstimate,
    }),
    ...notes,
  ];
  const lines = diffBudgetLines(start.budget.lines, state.budget.lines, () => "Family Council decision");
  const functions = diffFunctions(start.plan.functions, state.plan.functions, "Family Council decision");
  const delta = state.budget.totalEstimatePaise - start.budget.totalEstimatePaise;

  return {
    state,
    diff: {
      version: ctx.version + 1,
      budgetDeltaPaise: delta,
      changed: [...functions, ...lines],
      added: [],
      removed: [],
      conflicts,
      recoveryOptions: [],
      explanation: describeCascade({ headline, linesChanged: lines.length, budgetDeltaPaise: delta, conflicts }),
    },
  };
}
