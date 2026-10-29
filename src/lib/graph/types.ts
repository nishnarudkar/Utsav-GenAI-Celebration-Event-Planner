import { z } from "zod";
import { ISODateString } from "@/lib/schemas/event";
import type { BudgetCategory } from "@/lib/schemas/enums";

/** Plan-graph vocabulary (CLAUDE.md §7.4): what can change, and which nodes it reaches. */

export const WATCHED_FIELDS = ["guest_count", "budget_total", "start_date", "city"] as const;
export type WatchedField = (typeof WATCHED_FIELDS)[number];

/** A requested change, as sent to PATCH /api/events/:id ({ field, value }). */
export const FieldChange = z.discriminatedUnion("field", [
  z.object({ field: z.literal("guest_count"), value: z.number().int().min(1).max(5000) }),
  z.object({ field: z.literal("budget_total"), value: z.number().int().positive() }),
  z.object({ field: z.literal("start_date"), value: ISODateString }),
  z.object({ field: z.literal("city"), value: z.string().trim().min(1).max(80) }),
]);
export type FieldChange = z.infer<typeof FieldChange>;

/** A change with its previous value, read from the stored plan (never trusted from the client). */
export type PlanChange = FieldChange & { from: FieldChange["value"] };

export type NodeId =
  | `budget:${BudgetCategory}`
  | "budget:all"
  | "functions:guests"
  | "functions:dates"
  | "timeline:all"
  | "check:venue_capacity"
  | "check:over_budget"
  | "check:timeline_overlap"
  | "check:muhurat_note"
  | "agent:budget_rebalance";

export type ImpactKind = "recalc" | "check" | "agent" | "shift" | "rebenchmark";

export interface ImpactRule {
  target: NodeId;
  kind: ImpactKind;
}
