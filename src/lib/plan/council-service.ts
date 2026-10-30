import "server-only";
import { runCouncil, type CouncilDeps } from "@/lib/ai/agents/council";
import { applyCouncilPatch } from "@/lib/graph/council";
import { generateRecoveryOptions } from "@/lib/graph/recovery";
import type { EventRepository } from "@/lib/plan/event-repo";
import type { StoredEvent } from "@/lib/plan/types";
import type { ISODate } from "@/lib/rules/dates";
import type { CouncilResolution } from "@/lib/schemas/council";
import type { PlanDiff } from "@/lib/schemas/diff";

/** Family Council flow: run the agent, store the result, apply a chosen compromise. */

export const MIN_STAKEHOLDERS = 2;

export type RunOutcome = { kind: "not_found" } | { kind: "too_few" } | { kind: "ok"; council: CouncilResolution };

export async function holdCouncil(repo: EventRepository, id: string, opts: { today: ISODate }, deps?: CouncilDeps): Promise<RunOutcome> {
  const event = await repo.get(id);
  if (!event) return { kind: "not_found" };
  if (event.stakeholders.length < MIN_STAKEHOLDERS) return { kind: "too_few" };

  const result = await runCouncil(event, event.stakeholders, { version: event.version, today: opts.today }, deps);
  const council = await repo.setCouncil(id, { ...result, planVersion: event.version });
  return council ? { kind: "ok", council } : { kind: "not_found" };
}

export type ApplyOutcome =
  | { kind: "not_found" }
  | { kind: "option_not_found" }
  | { kind: "stale" }
  | { kind: "version_conflict" }
  | { kind: "applied"; event: StoredEvent; diff: PlanDiff };

/** Apply a compromise as a logged change (so Undo works) and record the family's decision. */
export async function applyCompromise(repo: EventRepository, id: string, optionId: string, opts: { today: ISODate }): Promise<ApplyOutcome> {
  const event = await repo.get(id);
  if (!event) return { kind: "not_found" };
  const option = event.council?.options.find((o) => o.id === optionId);
  if (!option) return { kind: "option_not_found" };
  if (event.council?.planVersion !== event.version) return { kind: "stale" };

  const ctx = { version: event.version, today: opts.today };
  const result = applyCouncilPatch(event, option.patch, ctx, `Family Council chose “${option.title}”.`);
  const diff: PlanDiff = { ...result.diff, recoveryOptions: generateRecoveryOptions(result.state, ctx) };

  const applied = await repo.applyChange(id, event.version, result.state, {
    trigger: { field: "council", optionId, value: option.title, from: null },
    diff,
  });
  if (!applied.ok) return { kind: applied.error };
  await repo.setChosenOption(id, optionId);
  return { kind: "applied", event: { ...applied.event, council: { ...event.council, chosenOptionId: optionId } }, diff };
}
