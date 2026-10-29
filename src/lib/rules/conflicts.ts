/**
 * Conflict checks over a plan state (CLAUDE.md §7.4 step 2: deterministic, no LLM).
 * The cascade engine runs these after every change and reports the result in the diff.
 */

import { formatINRCompact } from "@/lib/format";
import { checkVenueCapacity } from "@/lib/rules/capacity";
import { diffDays } from "@/lib/rules/dates";
import type { Conflict } from "@/lib/schemas/diff";
import type { PlannedFunction } from "@/lib/schemas/event";

export interface ConflictInput {
  functions: readonly PlannedFunction[];
  totalEstimatePaise: number;
  budgetTotalPaise: number;
  /** When Utsav is estimating the budget, there is no budget to be over. */
  budgetIsEstimate: boolean;
}

export function overBudgetConflict(totalEstimatePaise: number, budgetTotalPaise: number): Conflict | null {
  const over = totalEstimatePaise - budgetTotalPaise;
  if (over <= 0) return null;
  return {
    type: "over_budget",
    severity: "critical",
    message: `Over budget by ${formatINRCompact(over)} (estimate ${formatINRCompact(totalEstimatePaise)} vs budget ${formatINRCompact(budgetTotalPaise)}).`,
  };
}

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  return h * 60 + m;
};

/** Absolute [start, end) in minutes from the earliest function date; overnight functions end next day. */
function interval(f: PlannedFunction, first: string): [number, number] {
  const day = diffDays(first, f.date) * 1440;
  const start = day + minutes(f.startTime);
  let end = day + minutes(f.endTime);
  if (end <= start) end += 1440;
  return [start, end];
}

/** Pairs of functions whose times overlap. Touching (one ends as the next starts) is fine. */
export function timelineOverlaps(functions: readonly PlannedFunction[]): Conflict[] {
  if (functions.length < 2) return [];
  const first = [...functions].map((f) => f.date).sort()[0]!;
  const spans = functions.map((f) => ({ f, span: interval(f, first) }));
  const out: Conflict[] = [];
  for (let i = 0; i < spans.length; i++) {
    for (let j = i + 1; j < spans.length; j++) {
      const a = spans[i]!;
      const b = spans[j]!;
      if (a.span[0] < b.span[1] && b.span[0] < a.span[1]) {
        out.push({ type: "timeline_overlap", severity: "warn", message: `${a.f.name} and ${b.f.name} overlap in time.` });
      }
    }
  }
  return out;
}

/** All conflicts for a plan state, most severe first. */
export function detectConflicts(input: ConflictInput): Conflict[] {
  const all: Conflict[] = [
    ...(input.budgetIsEstimate ? [] : [overBudgetConflict(input.totalEstimatePaise, input.budgetTotalPaise)]).filter(
      (c): c is Conflict => c !== null,
    ),
    ...checkVenueCapacity(input.functions),
    ...timelineOverlaps(input.functions),
  ];
  const rank = { critical: 0, warn: 1, info: 2 } as const;
  return all.map((c, i) => ({ c, i })).sort((a, b) => rank[a.c.severity] - rank[b.c.severity] || a.i - b.i).map(({ c }) => c);
}
