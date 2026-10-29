/**
 * The cascade engine (CLAUDE.md §7.4) — Utsav's core feature.
 *
 *   change → computeImpact (dependency rules) → deterministic recalculation → conflicts → PlanDiff
 *
 * `runCascade` is pure: it returns the next plan state and a diff without persisting anything,
 * so the What-If simulator can call it as a dry run. Locked budget lines and user-created
 * tasks are never modified; when a change would affect them they're flagged instead (rule 4).
 * The AI Explainer and recovery options are layered on top of this result.
 */

import type { PricedBudget, PricedLine } from "@/lib/ai/agents/budget";
import { formatDate, formatINRCompact } from "@/lib/format";
import { computeImpact, guestScaling } from "@/lib/graph/dependencies";
import { budgetDelta, describeCascade, diffBudgetLines, diffFunctions, type ChangedEntry } from "@/lib/graph/diff";
import type { FieldChange, PlanChange } from "@/lib/graph/types";
import { getPricing, type BenchmarkRow } from "@/lib/kb/pricing";
import type { EventPlan } from "@/lib/plan/types";
import { allocateByWeight, indexBenchmarks, lineEstimatePaise, sumPaise, summarizeBudget, unitPricePaise } from "@/lib/rules/budget-math";
import { rescaleQuantity, scaleFunctionGuests } from "@/lib/rules/capacity";
import { cityTier } from "@/lib/rules/city-tier";
import { detectConflicts } from "@/lib/rules/conflicts";
import { addDays, diffDays, type ISODate } from "@/lib/rules/dates";
import { sortByDue } from "@/lib/rules/schedule";
import type { BudgetCategory } from "@/lib/schemas/enums";
import type { Conflict, PlanDiff } from "@/lib/schemas/diff";

export interface CascadeContext {
  /** The event's current version; the diff gets version + 1. */
  version: number;
  /** IST calendar date, for re-scheduling tasks. */
  today: ISODate;
  benchmarkRows?: readonly BenchmarkRow[];
}

export interface CascadeResult {
  /** True when the value didn't change: nothing to persist. */
  noop: boolean;
  change: PlanChange;
  state: EventPlan;
  diff: PlanDiff;
}

/** What a field handler produces before the shared re-total / conflict / diff steps. */
interface FieldOutcome {
  state: EventPlan;
  changed: ChangedEntry[];
  headline: string;
  extra?: string[];
  /** Notes that become info-level conflicts (locked items that needed changes, date notes). */
  notes?: Conflict[];
  linesChanged: number;
}

const FIELD_LABELS: Record<FieldChange["field"], string> = {
  guest_count: "Guest count",
  budget_total: "Budget",
  start_date: "Main day",
  city: "City",
};

export function readCurrentValue(state: EventPlan, field: FieldChange["field"]): FieldChange["value"] {
  switch (field) {
    case "guest_count":
      return state.answers.guestCount;
    case "budget_total":
      return state.answers.budgetTotalPaise ?? state.budget.budgetTotalPaise;
    case "start_date":
      return state.answers.startDate;
    case "city":
      return state.answers.city;
  }
}

export function runCascade(state: EventPlan, request: FieldChange, ctx: CascadeContext): CascadeResult {
  const change = { ...request, from: readCurrentValue(state, request.field) } as PlanChange;
  if (computeImpact(change).length === 0) {
    return { noop: true, change, state, diff: emptyDiff(ctx.version, `${FIELD_LABELS[change.field]} is already ${String(change.value)}.`) };
  }

  const outcome = applyField(state, change, ctx);
  const next = outcome.state;
  const conflicts = [
    ...detectConflicts({
      functions: next.plan.functions,
      totalEstimatePaise: next.budget.totalEstimatePaise,
      budgetTotalPaise: next.budget.budgetTotalPaise,
      budgetIsEstimate: next.budget.budgetIsEstimate,
    }),
    ...(outcome.notes ?? []),
  ];
  const delta = budgetDelta(state.budget.totalEstimatePaise, next.budget.totalEstimatePaise);
  const fieldEntry: ChangedEntry = {
    nodeId: `field:${change.field}`,
    label: FIELD_LABELS[change.field],
    from: change.from,
    to: change.value,
    reason: "Changed by you",
  };

  return {
    noop: false,
    change,
    state: next,
    diff: {
      version: ctx.version + 1,
      budgetDeltaPaise: delta,
      changed: [fieldEntry, ...outcome.changed],
      added: [],
      removed: [],
      conflicts,
      recoveryOptions: [],
      explanation: describeCascade({
        headline: outcome.headline,
        linesChanged: outcome.linesChanged,
        budgetDeltaPaise: delta,
        conflicts,
        extra: outcome.extra,
      }),
    },
  };
}

function applyField(state: EventPlan, change: PlanChange, ctx: CascadeContext): FieldOutcome {
  switch (change.field) {
    case "guest_count":
      return applyGuestCount(state, change.from as number, change.value);
    case "budget_total":
      return applyBudgetTotal(state, change.from as number, change.value);
    case "start_date":
      return applyStartDate(state, change.from as ISODate, change.value, ctx.today);
    case "city":
      return applyCity(state, change.value, ctx.benchmarkRows ?? getPricing().rows);
  }
}

// ---------- guest count ----------

function applyGuestCount(state: EventPlan, fromG: number, toG: number): FieldOutcome {
  const functions = scaleFunctionGuests(state.plan.functions, fromG, toG);
  const before = new Map(state.plan.functions.map((f) => [f.name, f.expectedGuests]));
  const after = new Map(functions.map((f) => [f.name, f.expectedGuests]));
  const reasons = new Map<number, string>();
  const notes: Conflict[] = [];

  const lines = state.budget.lines.map((line, i): PricedLine => {
    const scaling = guestScaling(line);
    if (scaling === "fixed") return line;
    const byFunction = scaling === "function_guests" && line.functionName !== undefined && before.has(line.functionName);
    const gFrom = byFunction ? before.get(line.functionName!)! : fromG;
    const gTo = byFunction ? after.get(line.functionName!)! : toG;
    const quantity = rescaleQuantity(line.basis.quantity, gFrom, gTo);
    if (quantity === line.basis.quantity) return line;
    if (line.locked) {
      notes.push(lockedNote(line, `would need ${quantity} instead of ${line.basis.quantity} for ${gTo} guests`));
      return line;
    }
    reasons.set(i, `${gFrom} → ${gTo} guests${byFunction ? ` at ${line.functionName}` : ""}`);
    return { ...line, basis: { ...line.basis, quantity }, estimatePaise: lineEstimatePaise(quantity, line.basis.unitPaise) };
  });

  const next: EventPlan = {
    ...state,
    answers: { ...state.answers, guestCount: toG },
    plan: { ...state.plan, functions },
    budget: retotal(state.budget, lines, state.plan.allocationPaise, state.budget.budgetTotalPaise),
  };
  const lineChanges = diffBudgetLines(state.budget.lines, lines, (_b, a, i) => reasons.get(i) ?? a.label);
  return {
    state: next,
    changed: [...diffFunctions(state.plan.functions, functions, "Follows the new guest count"), ...lineChanges],
    headline: `Guest count changed from ${fromG} to ${toG}.`,
    notes,
    linesChanged: lineChanges.length,
  };
}

// ---------- budget total ----------

function applyBudgetTotal(state: EventPlan, fromPaise: number, toPaise: number): FieldOutcome {
  const weights = state.plan.allocationPercent;
  const allocationPaise = Object.keys(weights).length > 0 ? allocateByWeight(toPaise, weights) : null;
  const next: EventPlan = {
    ...state,
    answers: { ...state.answers, budgetTotalPaise: toPaise },
    plan: { ...state.plan, allocationPaise },
    budget: retotal({ ...state.budget, budgetIsEstimate: false }, state.budget.lines, allocationPaise, toPaise),
  };
  return {
    state: next,
    changed: [],
    headline: `Budget changed from ${formatINRCompact(fromPaise)} to ${formatINRCompact(toPaise)}.`,
    extra: allocationPaise ? ["Category targets were rescaled to the new budget."] : [],
    linesChanged: 0,
  };
}

// ---------- main date ----------

function applyStartDate(state: EventPlan, from: ISODate, to: ISODate, today: ISODate): FieldOutcome {
  const shift = diffDays(from, to);
  const functions = state.plan.functions.map((f) => ({ ...f, date: addDays(f.date, shift) }));
  let moved = 0;
  const tasks = sortByDue(
    state.timeline.tasks.map((t) => {
      if (t.source === "user") return t;
      moved++;
      const idealDueDate = addDays(t.idealDueDate, shift);
      const overdue = idealDueDate < today;
      return { ...t, idealDueDate, dueDate: overdue ? today : idealDueDate, overdue };
    }),
  );
  const next: EventPlan = {
    ...state,
    answers: { ...state.answers, startDate: to },
    plan: { ...state.plan, functions, startDate: addDays(state.plan.startDate, shift), endDate: addDays(state.plan.endDate, shift) },
    timeline: { ...state.timeline, tasks },
  };
  const direction = shift > 0 ? "later" : "earlier";
  const days = `${Math.abs(shift)} day${Math.abs(shift) === 1 ? "" : "s"}`;
  const notes: Conflict[] =
    state.answers.eventType === "wedding" && state.answers.culture !== "generic"
      ? [{ type: "date_note", severity: "info", message: "New date: check the timings with your priest or elders." }]
      : [];
  const kept = state.timeline.tasks.length - moved;
  return {
    state: next,
    changed: [
      ...diffFunctions(state.plan.functions, functions, `Moved ${days} ${direction}`),
      {
        nodeId: "timeline:all",
        label: "Task due dates",
        from: from,
        to: to,
        reason: `${moved} task${moved === 1 ? "" : "s"} moved ${days} ${direction}${kept ? `; ${kept} of your own tasks left as they were` : ""}`,
      },
    ],
    headline: `Main day moved from ${formatDate(from)} to ${formatDate(to)}.`,
    notes,
    linesChanged: 0,
  };
}

// ---------- city ----------

function applyCity(state: EventPlan, city: string, rows: readonly BenchmarkRow[]): FieldOutcome {
  const tier = cityTier(city);
  const base: EventPlan = { ...state, answers: { ...state.answers, city }, cityTier: tier.tier, cityTierKnown: tier.known };
  if (tier.tier === state.cityTier) {
    return { state: base, changed: [], headline: `City changed to ${city}; prices use the same city tier.`, linesChanged: 0 };
  }
  const index = indexBenchmarks(rows);
  const notes: Conflict[] = [];
  const lines = state.budget.lines.map((line): PricedLine => {
    const unitPaise = unitPricePaise(index, { category: line.category, unit: line.basis.unit, cityTier: tier.tier, tier: line.basis.unitTier });
    if (unitPaise === null || unitPaise === line.basis.unitPaise) return line;
    if (line.locked) {
      notes.push(lockedNote(line, `would be ${formatINRCompact(lineEstimatePaise(line.basis.quantity, unitPaise))} at ${city} prices`));
      return line;
    }
    return { ...line, basis: { ...line.basis, unitPaise, cityTier: tier.tier }, estimatePaise: lineEstimatePaise(line.basis.quantity, unitPaise) };
  });
  const lineChanges = diffBudgetLines(state.budget.lines, lines, () => `Re-priced for ${city}`);
  return {
    state: { ...base, budget: retotal(state.budget, lines, state.plan.allocationPaise, state.budget.budgetTotalPaise) },
    changed: lineChanges,
    headline: `City changed to ${city}; prices were updated for the new city tier.`,
    notes,
    linesChanged: lineChanges.length,
  };
}

// ---------- shared ----------

function lockedNote(line: PricedLine, what: string): Conflict {
  return { type: "locked_item", severity: "info", message: `"${line.label}" is locked, so it wasn't changed — it ${what}.` };
}

/** Re-total the budget after lines or the budget total changed. An estimated budget follows the estimate. */
export function retotal(
  prev: PricedBudget,
  lines: PricedLine[],
  allocationPaise: Partial<Record<BudgetCategory, number>> | null,
  budgetTotalPaise: number,
): PricedBudget {
  const totalEstimatePaise = sumPaise(lines.map((l) => l.estimatePaise));
  const total = prev.budgetIsEstimate ? totalEstimatePaise : budgetTotalPaise;
  const summary = summarizeBudget(lines, total);
  const categories = new Set<BudgetCategory>([...(Object.keys(allocationPaise ?? {}) as BudgetCategory[]), ...lines.map((l) => l.category)]);
  const byCategory: PricedBudget["byCategory"] = {};
  for (const c of categories) byCategory[c] = { allocatedPaise: allocationPaise?.[c] ?? null, estimatePaise: summary.byCategory[c] ?? 0 };
  return {
    ...prev,
    lines,
    totalEstimatePaise,
    budgetTotalPaise: total,
    byCategory,
    overBudgetPaise: summary.overBudgetPaise,
    remainingPaise: summary.remainingPaise,
  };
}

function emptyDiff(version: number, explanation: string): PlanDiff {
  return { version, budgetDeltaPaise: 0, changed: [], added: [], removed: [], conflicts: [], recoveryOptions: [], explanation };
}
