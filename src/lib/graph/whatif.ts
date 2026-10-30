/**
 * What-If Simulator engine (CLAUDE.md F6). Pure: applies a scenario to a copy of the plan, so a
 * projection is a dry run and no LLM is involved. Applying the same scenario is what Apply saves.
 */

import type { PricedLine } from "@/lib/ai/agents/budget";
import { retotal, runCascade, type CascadeContext } from "@/lib/graph/cascade";
import { describeCascade, diffBudgetLines, diffFunctions } from "@/lib/graph/diff";
import { applyRecoveryPatch, generateRecoveryOptions } from "@/lib/graph/recovery";
import { CATEGORY_LABELS } from "@/lib/labels";
import type { EventPlan } from "@/lib/plan/types";
import { detectConflicts } from "@/lib/rules/conflicts";
import type { Conflict, PlanDiff } from "@/lib/schemas/diff";
import type { BudgetCategory, PriceTier } from "@/lib/schemas/enums";
import type { WhatIfProjection, WhatIfScenario } from "@/lib/schemas/whatif";

function tierUpdates(state: EventPlan, tiers: WhatIfScenario["tiers"]) {
  const wanted = tiers as Partial<Record<BudgetCategory, PriceTier>>;
  return state.budget.lines.flatMap((line, lineIndex) => {
    const unitTier = wanted[line.category];
    if (!unitTier || unitTier === line.basis.unitTier || line.locked) return [];
    const { unit, quantity } = line.basis;
    return [{ lineIndex, basis: { unit, quantity, unitTier } }];
  });
}

/** Which requested functions can go: known ones with no locked lines, and never all of them. */
function droppable(state: EventPlan, names: readonly string[], notes: Conflict[]): Set<string> {
  const known = new Set(state.plan.functions.map((f) => f.name));
  const drops = new Set<string>();
  for (const name of names) {
    if (!known.has(name)) continue;
    if (state.budget.lines.some((l) => l.locked && l.functionName === name)) {
      notes.push({ type: "locked_item", severity: "info", message: `${name} has locked budget items, so it was kept.` });
    } else {
      drops.add(name);
    }
  }
  if (drops.size >= known.size) {
    const keep = state.plan.functions.find((f) => drops.has(f.name))!.name;
    drops.delete(keep);
    notes.push({ type: "function_kept", severity: "info", message: `An event needs at least one function, so ${keep} was kept.` });
  }
  return drops;
}

/** Remove functions with their budget lines and tasks; their rituals become unplaced. User tasks stay. */
function dropFunctions(state: EventPlan, drops: ReadonlySet<string>): EventPlan {
  if (drops.size === 0) return state;
  const removed = state.plan.functions.filter((f) => drops.has(f.name));
  const functions = state.plan.functions.filter((f) => !drops.has(f.name));
  const lines = state.budget.lines.filter((l) => !l.functionName || !drops.has(l.functionName));
  const tasks = state.timeline.tasks.filter((t) => t.source === "user" || !t.functionName || !drops.has(t.functionName));
  const taskRefs = new Set(tasks.map((t) => t.ref));
  const dates = functions.map((f) => f.date).sort();
  return {
    ...state,
    plan: {
      ...state.plan,
      functions,
      startDate: dates[0] ?? state.plan.startDate,
      endDate: dates.at(-1) ?? state.plan.endDate,
      unassignedRitualKeys: [...state.plan.unassignedRitualKeys, ...removed.flatMap((f) => f.ritualKeys)],
    },
    budget: retotal(state.budget, lines, state.plan.allocationPaise, state.budget.budgetTotalPaise),
    timeline: { ...state.timeline, tasks: tasks.map((t) => ({ ...t, dependsOn: t.dependsOn.filter((d) => taskRefs.has(d)) })) },
  };
}

export function applyScenario(
  start: EventPlan,
  scenario: WhatIfScenario,
  ctx: CascadeContext,
  headline = "Applied your What-If scenario.",
): { state: EventPlan; diff: PlanDiff } {
  const notes: Conflict[] = [];
  let state = start;

  if (scenario.guestCount !== undefined) state = runCascade(state, { field: "guest_count", value: scenario.guestCount }, ctx).state;
  const updates = tierUpdates(state, scenario.tiers);
  if (updates.length > 0) state = applyRecoveryPatch(state, { kind: "lines", updates }, ctx).state;

  const drops = droppable(state, scenario.dropFunctions, notes);
  const midpoint = state; // same lines and functions as `start`, in the same order
  state = dropFunctions(state, drops);

  const keptLine = (l: PricedLine) => !l.functionName || !drops.has(l.functionName);
  const keptStart = start.budget.lines.filter(keptLine);
  const keptMid = midpoint.budget.lines.filter(keptLine);
  const keptFn = <T extends { name: string }>(f: T) => !drops.has(f.name);
  const changedLines = diffBudgetLines(keptStart, keptMid, () => "What-If change");
  const removed = [
    ...start.plan.functions.filter((f) => drops.has(f.name)).map((f) => ({ nodeId: `function:${f.name}`, label: f.name })),
    ...start.budget.lines.filter((l) => !keptLine(l)).map((l) => ({ nodeId: `line:${l.label}`, label: l.label })),
  ];

  const conflicts = [
    ...detectConflicts({
      functions: state.plan.functions,
      totalEstimatePaise: state.budget.totalEstimatePaise,
      budgetTotalPaise: state.budget.budgetTotalPaise,
      budgetIsEstimate: state.budget.budgetIsEstimate,
    }),
    ...notes,
  ];
  const delta = state.budget.totalEstimatePaise - start.budget.totalEstimatePaise;
  return {
    state,
    diff: {
      version: ctx.version + 1,
      budgetDeltaPaise: delta,
      changed: [...diffFunctions(start.plan.functions.filter(keptFn), midpoint.plan.functions.filter(keptFn), "What-If change"), ...changedLines],
      added: [],
      removed,
      conflicts,
      recoveryOptions: [],
      explanation: describeCascade({ headline, linesChanged: changedLines.length, budgetDeltaPaise: delta, conflicts }),
    },
  };
}

/** The dry run behind the sliders: nothing is saved. */
export function projectScenario(start: EventPlan, scenario: WhatIfScenario, ctx: CascadeContext): WhatIfProjection {
  const { state, diff } = applyScenario(start, scenario, ctx);
  const { budget } = state;

  const totals = (lines: readonly PricedLine[]) => {
    const out = new Map<BudgetCategory, number>();
    for (const l of lines) out.set(l.category, (out.get(l.category) ?? 0) + l.estimatePaise);
    return out;
  };
  const before = totals(start.budget.lines);
  const after = totals(budget.lines);
  const categories = [...new Set([...before.keys(), ...after.keys()])]
    .map((category) => ({ category, label: CATEGORY_LABELS[category], beforePaise: before.get(category) ?? 0, afterPaise: after.get(category) ?? 0 }))
    .filter((c) => c.beforePaise !== c.afterPaise)
    .sort((a, b) => Math.abs(b.afterPaise - b.beforePaise) - Math.abs(a.afterPaise - a.beforePaise));

  return {
    totalEstimatePaise: budget.totalEstimatePaise,
    deltaPaise: diff.budgetDeltaPaise,
    budgetTotalPaise: budget.budgetTotalPaise,
    budgetIsEstimate: budget.budgetIsEstimate,
    overBudgetPaise: budget.overBudgetPaise,
    remainingPaise: budget.remainingPaise,
    categories,
    conflicts: diff.conflicts,
    savings: generateRecoveryOptions(state, ctx, { evenWithinBudget: true }).map(({ id, title, savesPaise }) => ({ id, title, savesPaise })),
  };
}

/** Short description of a scenario for the change log, e.g. "350 guests, catering low". */
export function describeScenario(s: WhatIfScenario): string {
  const parts = [
    s.guestCount !== undefined ? `${s.guestCount} guests` : null,
    ...Object.entries(s.tiers).map(([category, tier]) => `${CATEGORY_LABELS[category as BudgetCategory].toLowerCase()} ${tier}`),
    s.dropFunctions.length ? `without ${s.dropFunctions.join(", ")}` : null,
  ].filter(Boolean);
  return parts.join(", ") || "No changes";
}
