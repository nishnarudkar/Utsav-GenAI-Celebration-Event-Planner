import type { ImpactRule, PlanChange, WatchedField } from "@/lib/graph/types";
import type { BudgetCategory, BudgetUnit } from "@/lib/schemas/enums";

/**
 * Declarative dependency rules (CLAUDE.md §7.4): which plan nodes a change to each watched
 * field reaches, and how. The cascade engine walks these; nothing here computes values.
 */
export const DEPENDENCIES: Record<WatchedField, readonly ImpactRule[]> = {
  guest_count: [
    { target: "functions:guests", kind: "recalc" },
    { target: "budget:catering", kind: "recalc" },
    { target: "budget:invites", kind: "recalc" },
    { target: "budget:gifts", kind: "recalc" },
    { target: "budget:transport", kind: "recalc" },
    { target: "budget:misc", kind: "recalc" },
    { target: "check:venue_capacity", kind: "check" },
    { target: "check:over_budget", kind: "check" },
  ],
  budget_total: [
    { target: "check:over_budget", kind: "check" },
    { target: "agent:budget_rebalance", kind: "agent" },
  ],
  start_date: [
    { target: "functions:dates", kind: "shift" },
    { target: "timeline:all", kind: "shift" },
    { target: "check:timeline_overlap", kind: "check" },
    { target: "check:muhurat_note", kind: "check" },
  ],
  city: [
    { target: "budget:all", kind: "rebenchmark" },
    { target: "check:over_budget", kind: "check" },
  ],
};

/** The rules a change triggers; none when the value didn't actually change. */
export function computeImpact(change: PlanChange): readonly ImpactRule[] {
  if (change.from === change.value) return [];
  return DEPENDENCIES[change.field];
}

/**
 * How a budget line responds to a guest-count change:
 * - "function_guests": scales with its function's expected guests (plates, per-guest lines)
 * - "event_guests": scales with the event's total guest count (e.g. invitation cards)
 * - "fixed": unaffected (venue days, décor packages, ceremonial gift trays)
 */
export type GuestScaling = "function_guests" | "event_guests" | "fixed";

export function guestScaling(line: { category: BudgetCategory; basis: { unit: BudgetUnit } }): GuestScaling {
  const { unit } = line.basis;
  if (unit === "per_plate" || unit === "per_guest") return "function_guests";
  if (line.category === "invites" && unit === "per_item") return "event_guests";
  return "fixed";
}
