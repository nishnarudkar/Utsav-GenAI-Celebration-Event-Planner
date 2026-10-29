import "server-only";
import { runCascade } from "@/lib/graph/cascade";
import type { FieldChange } from "@/lib/graph/types";
import type { EventRepository } from "@/lib/plan/event-repo";
import type { ChangeRecord, StoredEvent } from "@/lib/plan/types";
import type { ISODate } from "@/lib/rules/dates";
import type { PlanDiff } from "@/lib/schemas/diff";

/**
 * Applies a field change to a stored event (CLAUDE.md §7.4 steps 1–6): run the cascade, then
 * persist the new plan, version and change log. With `dryRun`, nothing is stored (What-If).
 */

export type ChangeOutcome =
  | { kind: "not_found" }
  | { kind: "version_conflict" }
  | { kind: "noop"; event: StoredEvent; diff: PlanDiff }
  | { kind: "preview"; event: StoredEvent; diff: PlanDiff }
  | { kind: "applied"; event: StoredEvent; diff: PlanDiff; change: ChangeRecord };

export async function changeEvent(
  repo: EventRepository,
  id: string,
  change: FieldChange,
  opts: { today: ISODate; dryRun?: boolean },
): Promise<ChangeOutcome> {
  const event = await repo.get(id);
  if (!event) return { kind: "not_found" };

  const result = runCascade(event, change, { version: event.version, today: opts.today });
  if (result.noop) return { kind: "noop", event, diff: result.diff };
  if (opts.dryRun) return { kind: "preview", event: { ...event, ...result.state }, diff: result.diff };

  const applied = await repo.applyChange(id, event.version, result.state, { trigger: result.change, diff: result.diff });
  if (!applied.ok) return { kind: applied.error };
  return { kind: "applied", event: applied.event, diff: result.diff, change: applied.change };
}

/** Change-log entry as sent to the client (the before-snapshot stays on the server). */
export function changeSummary(c: ChangeRecord) {
  return {
    id: c.id,
    version: c.version,
    field: c.trigger.field,
    from: c.trigger.from,
    to: c.trigger.value,
    explanation: c.diff.explanation,
    budgetDeltaPaise: c.diff.budgetDeltaPaise,
    undone: c.undone,
    createdAt: c.createdAt,
  };
}
