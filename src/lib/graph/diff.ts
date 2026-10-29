/**
 * Plan diff utilities (CLAUDE.md §7.4 step 4). Pure: compare before/after plan parts and
 * describe what changed. Budget lines are compared by position, since a cascade never adds,
 * removes or reorders lines.
 */

import type { PricedLine } from "@/lib/ai/agents/budget";
import { formatINRDelta } from "@/lib/format";
import type { Conflict, PlanDiff } from "@/lib/schemas/diff";
import type { PlannedFunction } from "@/lib/schemas/event";

export type ChangedEntry = PlanDiff["changed"][number];

export interface LineSnapshot {
  quantity: number;
  unitPaise: number;
  estimatePaise: number;
}

const snapshot = (l: PricedLine): LineSnapshot => ({ quantity: l.basis.quantity, unitPaise: l.basis.unitPaise, estimatePaise: l.estimatePaise });

/** One entry per budget line whose estimate or basis changed. */
export function diffBudgetLines(
  before: readonly PricedLine[],
  after: readonly PricedLine[],
  reason: (before: PricedLine, after: PricedLine, index: number) => string,
): ChangedEntry[] {
  if (before.length !== after.length) throw new Error("diffBudgetLines expects the same lines before and after");
  const out: ChangedEntry[] = [];
  before.forEach((b, i) => {
    const a = after[i]!;
    if (b.estimatePaise === a.estimatePaise && b.basis.quantity === a.basis.quantity && b.basis.unitPaise === a.basis.unitPaise) return;
    out.push({ nodeId: `line:${i}`, label: a.label, from: snapshot(b), to: snapshot(a), reason: reason(b, a, i) });
  });
  return out;
}

/** One entry per function whose guests, date or times changed. */
export function diffFunctions(before: readonly PlannedFunction[], after: readonly PlannedFunction[], reason: string): ChangedEntry[] {
  const out: ChangedEntry[] = [];
  before.forEach((b, i) => {
    const a = after[i];
    if (!a) return;
    const from: Record<string, unknown> = {};
    const to: Record<string, unknown> = {};
    for (const k of ["expectedGuests", "date", "startTime", "endTime"] as const) {
      if (b[k] !== a[k]) {
        from[k] = b[k];
        to[k] = a[k];
      }
    }
    if (Object.keys(from).length) out.push({ nodeId: `function:${i}`, label: a.name, from, to, reason });
  });
  return out;
}

/** Difference in total estimate, in paise (positive = costs more). */
export const budgetDelta = (beforeTotalPaise: number, afterTotalPaise: number) => afterTotalPaise - beforeTotalPaise;

/**
 * Plain-English summary of a cascade, used until (and as a fallback for) the AI Explainer:
 * "Guest count changed from 250 to 350. 4 budget items were recalculated (+₹2.1L).
 *  2 conflicts need attention: over budget, venue capacity."
 */
export function describeCascade(opts: {
  headline: string;
  linesChanged: number;
  budgetDeltaPaise: number;
  conflicts: readonly Conflict[];
  extra?: readonly string[];
}): string {
  const parts = [opts.headline];
  if (opts.linesChanged > 0) {
    parts.push(
      `${opts.linesChanged} budget item${opts.linesChanged === 1 ? " was" : "s were"} recalculated (${formatINRDelta(opts.budgetDeltaPaise)}).`,
    );
  } else if (opts.budgetDeltaPaise === 0) {
    parts.push("No budget items changed.");
  }
  parts.push(...(opts.extra ?? []));
  const open = opts.conflicts.filter((c) => c.severity !== "info");
  if (open.length > 0) {
    const kinds = [...new Set(open.map((c) => c.type.replace(/_/g, " ")))];
    parts.push(`${open.length} conflict${open.length === 1 ? " needs" : "s need"} attention: ${kinds.join(", ")}.`);
  } else {
    parts.push("No conflicts.");
  }
  return parts.join(" ");
}
