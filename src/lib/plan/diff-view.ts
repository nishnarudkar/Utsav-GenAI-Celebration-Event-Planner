import { formatDate, formatINR, formatINRCompact, formatINRDelta } from "@/lib/format";
import { isISODate } from "@/lib/rules/dates";
import type { Conflict, PlanDiff } from "@/lib/schemas/diff";
import type { PlanIssue } from "@/lib/plan/dashboard";

/** View model for the DiffPanel. Pure; turns PlanDiff entries into display rows. */

/** "up" = costs/needs more (red ▲), "down" = saves (green ▼), "neutral" = moved/renamed (▸). */
export type Direction = "up" | "down" | "neutral";

export interface DiffRow {
  key: string;
  label: string;
  from: string;
  to: string;
  direction: Direction;
  /** Signed money change for budget lines, e.g. "+₹90K". */
  delta?: string;
  reason: string;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const num = (v: unknown) => (typeof v === "number" ? v : null);

function fieldValue(field: string, v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (field === "budget_total" && typeof v === "number") return formatINRCompact(v);
  if (field === "start_date" && typeof v === "string" && isISODate(v)) return formatDate(v);
  if (field === "guest_count" && typeof v === "number") return `${v.toLocaleString("en-IN")} guests`;
  return String(v);
}

function functionValue(v: unknown): string {
  if (!isRecord(v)) return "—";
  const parts: string[] = [];
  if (typeof v.expectedGuests === "number") parts.push(`${v.expectedGuests} guests`);
  if (typeof v.date === "string" && isISODate(v.date)) parts.push(formatDate(v.date));
  if (typeof v.startTime === "string") parts.push(`from ${v.startTime}`);
  return parts.join(", ") || "—";
}

export function diffRows(diff: PlanDiff): DiffRow[] {
  const removed = diff.removed.map((r): DiffRow => ({ key: `removed:${r.nodeId}`, label: r.label, from: "Planned", to: "Removed", direction: "neutral", reason: "Taken out of the plan" }));
  const changed = diff.changed.map((c): DiffRow => {
    if (c.nodeId.startsWith("field:")) {
      const field = c.nodeId.slice("field:".length);
      const a = num(c.from);
      const b = num(c.to);
      const direction: Direction = a !== null && b !== null && field !== "start_date" ? (b > a ? "up" : b < a ? "down" : "neutral") : "neutral";
      return { key: c.nodeId, label: c.label, from: fieldValue(field, c.from), to: fieldValue(field, c.to), direction, reason: c.reason };
    }
    if (c.nodeId.startsWith("line:") && isRecord(c.from) && isRecord(c.to)) {
      const a = num(c.from.estimatePaise) ?? 0;
      const b = num(c.to.estimatePaise) ?? 0;
      return {
        key: c.nodeId,
        label: c.label,
        from: formatINR(a),
        to: formatINR(b),
        direction: b > a ? "up" : b < a ? "down" : "neutral",
        delta: formatINRDelta(b - a),
        reason: c.reason,
      };
    }
    if (c.nodeId.startsWith("function:")) {
      return { key: c.nodeId, label: c.label, from: functionValue(c.from), to: functionValue(c.to), direction: "neutral", reason: c.reason };
    }
    // timeline:all and anything else
    const show = (v: unknown) => (typeof v === "string" && isISODate(v) ? formatDate(v) : String(v ?? "—"));
    return { key: c.nodeId, label: c.label, from: show(c.from), to: show(c.to), direction: "neutral", reason: c.reason };
  });
  return [...changed, ...removed];
}

const CONFLICT_TITLES: Record<string, string> = {
  over_budget: "Over budget",
  venue_capacity: "Venue capacity",
  timeline_overlap: "Functions overlap",
  locked_item: "Locked item not changed",
  date_note: "Check the new date",
  function_kept: "Function kept",
};

/** Conflicts in the dashboard's issue shape, so the same IssueList renders them. */
export function conflictIssues(conflicts: readonly Conflict[]): PlanIssue[] {
  return conflicts.map((c, i) => ({
    id: `${c.type}-${i}`,
    severity: c.severity,
    title: CONFLICT_TITLES[c.type] ?? "Note",
    detail: c.message,
  }));
}
