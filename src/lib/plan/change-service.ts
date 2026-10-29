import "server-only";
import { explainChange, type ExplainInput } from "@/lib/ai/agents/explainer";
import { runCascade } from "@/lib/graph/cascade";
import { generateRecoveryOptions } from "@/lib/graph/recovery";
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

export interface ChangeOptions {
  today: ISODate;
  dryRun?: boolean;
  /** Writes the friendly summary; defaults to the Explainer agent (falls back to the deterministic text). */
  explain?: (input: ExplainInput) => Promise<string>;
}

export async function changeEvent(repo: EventRepository, id: string, change: FieldChange, opts: ChangeOptions): Promise<ChangeOutcome> {
  const event = await repo.get(id);
  if (!event) return { kind: "not_found" };

  const ctx = { version: event.version, today: opts.today };
  const result = runCascade(event, change, ctx);
  if (result.noop) return { kind: "noop", event, diff: result.diff };

  // Recovery options (deterministic), then the Explainer words the result.
  const withOptions: PlanDiff = { ...result.diff, recoveryOptions: generateRecoveryOptions(result.state, { ...ctx, trigger: result.change }) };
  const explanation = await (opts.explain ?? explainChange)({
    trigger: result.change,
    diff: withOptions,
    totalEstimatePaise: result.state.budget.totalEstimatePaise,
    budgetTotalPaise: result.state.budget.budgetTotalPaise,
    overBudgetPaise: result.state.budget.overBudgetPaise,
  });
  const diff: PlanDiff = { ...withOptions, explanation };

  if (opts.dryRun) return { kind: "preview", event: { ...event, ...result.state }, diff };

  const applied = await repo.applyChange(id, event.version, result.state, { trigger: result.change, diff });
  if (!applied.ok) return { kind: applied.error };
  return { kind: "applied", event: applied.event, diff, change: applied.change };
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
