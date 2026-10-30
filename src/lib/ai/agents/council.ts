import "server-only";
import { COUNCIL_PROMPT_V1 } from "@/lib/ai/prompts/council";
import { callStructured, type CallStructuredOptions } from "@/lib/ai/structured";
import { formatDate, formatINR } from "@/lib/format";
import { applyCouncilPatch } from "@/lib/graph/council";
import type { EventPlan } from "@/lib/plan/types";
import type { ISODate } from "@/lib/rules/dates";
import { CouncilDraft, type CouncilConflict, type CouncilOption, type Stakeholder } from "@/lib/schemas/council";

/** Council agent: preferences + plan → conflicts and compromises. Costs are measured in code. */

export interface CouncilDeps {
  structured: (opts: CallStructuredOptions<typeof CouncilDraft>) => Promise<CouncilDraft>;
}

const defaultDeps: CouncilDeps = { structured: (opts) => callStructured(opts) };

/** Refs by role ("couple", "bride_family"; a repeated role gets "parent_2"), so prompts and fixtures don't depend on names. */
export function stakeholderRefs(stakeholders: readonly Stakeholder[]): Map<string, Stakeholder> {
  const refs = new Map<string, Stakeholder>();
  const seen = new Map<string, number>();
  for (const s of stakeholders) {
    const n = (seen.get(s.role) ?? 0) + 1;
    seen.set(s.role, n);
    refs.set(n === 1 ? s.role : `${s.role}_${n}`, s);
  }
  return refs;
}

function preferenceLines(s: Stakeholder): string {
  const p = s.preferences;
  const parts = [
    p.guestCount !== undefined ? `guests: ${p.guestCount}` : null,
    p.budgetMaxPaise !== undefined ? `budget limit: ${formatINR(p.budgetMaxPaise)} (${p.budgetMaxPaise} paise)` : null,
    p.venueStyle ? `venue: ${p.venueStyle.replace(/_/g, " ")}` : null,
    p.functions ? `functions: ${p.functions.replace(/_/g, " ")}` : null,
    p.menu ? `menu: ${p.menu.replace(/_/g, " ")}` : null,
    p.notes ? `notes: ${p.notes}` : null,
  ].filter(Boolean);
  return parts.join("; ") || "no stated preferences";
}

function userMessage(state: EventPlan, refs: ReadonlyMap<string, Stakeholder>): string {
  return [
    `Event: ${state.title}. ${state.answers.guestCount} guests, budget ${formatINR(state.budget.budgetTotalPaise)}, estimated cost ${formatINR(state.budget.totalEstimatePaise)}.`,
    "",
    "Functions:",
    ...state.plan.functions.map((f) => `- ${f.name}: ${formatDate(f.date)}, ${f.expectedGuests} guests`),
    "",
    "Stakeholders:",
    ...[...refs].map(([ref, s]) => `- ref "${ref}" (${s.name}, weight ${s.weight}): ${preferenceLines(s)}`),
  ].join("\n");
}

export interface CouncilResult {
  conflicts: CouncilConflict[];
  options: CouncilOption[];
}

/**
 * Deterministic finish: refs become names (unknown refs are dropped), and each option's cost
 * and remaining plan problems are measured by dry-running its patch.
 */
export function finalizeCouncil(
  draft: CouncilDraft,
  state: EventPlan,
  stakeholders: readonly Stakeholder[],
  ctx: { version: number; today: ISODate },
): CouncilResult {
  const refs = stakeholderRefs(stakeholders);
  const name = (ref: string) => refs.get(ref)?.name;
  const names = (list: readonly string[]) => [...new Set(list.flatMap((r) => name(r) ?? []))];

  const conflicts = draft.conflicts
    .map((c): CouncilConflict => ({
      topic: c.topic,
      severity: c.severity,
      positions: c.positions.flatMap((p) => {
        const stakeholder = name(p.ref);
        return stakeholder ? [{ stakeholder, wants: p.wants }] : [];
      }),
    }))
    .filter((c) => c.positions.length >= 2);

  const options = draft.options.map((o): CouncilOption => {
    const { diff } = applyCouncilPatch(state, o.patch, ctx, o.title);
    return {
      id: o.id,
      title: o.title,
      description: o.description,
      satisfies: names(o.satisfies),
      compromises: names(o.compromises),
      costDeltaPaise: diff.budgetDeltaPaise,
      conflictsAfter: diff.conflicts.filter((c) => c.severity !== "info").map((c) => c.message),
      patch: o.patch,
    };
  });
  return { conflicts, options };
}

export async function runCouncil(
  state: EventPlan,
  stakeholders: readonly Stakeholder[],
  ctx: { version: number; today: ISODate },
  deps: CouncilDeps = defaultDeps,
): Promise<CouncilResult> {
  const refs = stakeholderRefs(stakeholders);
  const draft = await deps.structured({
    schema: CouncilDraft,
    name: "emit_council",
    fixtureKey: `emit_council.${state.answers.culture}.${state.answers.eventType}`,
    model: "smart",
    system: COUNCIL_PROMPT_V1,
    messages: [{ role: "user", content: userMessage(state, refs) }],
  });
  return finalizeCouncil(draft, state, stakeholders, ctx);
}
