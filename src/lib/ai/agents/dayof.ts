import "server-only";
import { AIValidationError } from "@/lib/ai/errors";
import { DAYOF_PROMPT_V1 } from "@/lib/ai/prompts/dayof";
import { callStructured, type CallStructuredOptions } from "@/lib/ai/structured";
import type { EventPlan } from "@/lib/plan/types";
import { applyDelay, overruns, slotTime, type RunSlot } from "@/lib/rules/run-of-show";
import { ReshuffleDraft, type LiveProposal, type OutgoingMessage, type SlotMove } from "@/lib/schemas/dayof";
import type { BudgetCategory } from "@/lib/schemas/enums";

/** Day-of agent: reads an incident (AI), then moves the running order and fills in messages (code). */

export interface DayofDeps {
  structured: (opts: CallStructuredOptions<typeof ReshuffleDraft>) => Promise<ReshuffleDraft>;
}

const defaultDeps: DayofDeps = { structured: (opts) => callStructured(opts) };

/** Who a message goes to. There's no vendor list yet, so people are addressed by role. */
const VENDOR_ROLES: Record<BudgetCategory, string> = {
  venue: "Venue manager",
  catering: "Caterer",
  decor: "Decorator",
  photography: "Photographer",
  attire: "Attire vendor",
  jewelry: "Jeweller",
  invites: "Invitations vendor",
  music: "Music",
  transport: "Transport",
  gifts: "Gifts vendor",
  priest: "Priest",
  misc: "Vendor",
};

/** "Photographer 30 min late" → "photographer-30-min-late", for the demo fixture name. */
export const incidentSlug = (incident: string) =>
  incident.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

const CLOCK_TIME = /\d{1,2}[:.]\d{2}|\d\s*(?:am|pm)\b/i;

function userMessage(state: EventPlan, slots: readonly RunSlot[], incident: string): string {
  const categories = [...new Set(state.budget.lines.map((l) => l.category))];
  return [
    "Today's slots:",
    ...slots.map((s) => `- ${s.id}: ${s.name} (${s.functionName}), ${slotTime(s.startMin)} to ${slotTime(s.endMin)}`),
    "",
    `Vendor categories: ${categories.join(", ")}`,
    "",
    `Incident: ${incident}`,
  ].join("\n");
}

/** Fill the placeholders. A message with a clock time of its own is replaced, as is one with nothing to fill. */
function writeMessage(n: ReshuffleDraft["notify"][number], first: SlotMove | undefined, summary: string): OutgoingMessage {
  const usesPlaceholder = /\{(?:new_time|slot)\}/.test(n.message);
  const safe = !CLOCK_TIME.test(n.message) && !(usesPlaceholder && !first);
  const update = first ? ` ${first.name} now starts at ${first.to}.` : "";
  const body = safe
    ? n.message.replaceAll("{new_time}", first?.to ?? "").replaceAll("{slot}", first?.name ?? "")
    : `Namaste, an update for today: ${summary}${update} Thank you.`;
  return { category: n.category, to: VENDOR_ROLES[n.category], reason: n.reason, body };
}

/** Turn the model's draft into a proposal. All times here come from code. */
export function finalizeReshuffle(draft: ReshuffleDraft, state: EventPlan, slots: readonly RunSlot[], incident: string, id: string): LiveProposal {
  const delayed = draft.fromSlotId !== null && draft.delayMinutes > 0;
  const deltas = delayed ? applyDelay(slots, draft.fromSlotId!, draft.delayMinutes) : {};
  if (!deltas) throw new AIValidationError("emit_reshuffle", `Unknown slot id: ${draft.fromSlotId}`);

  const moved = slots.filter((s) => (deltas[s.id] ?? 0) > 0);
  const moves: SlotMove[] = moved.map((s) => ({
    slotId: s.id,
    name: s.name,
    functionName: s.functionName,
    from: slotTime(s.startMin),
    to: slotTime(s.startMin + deltas[s.id]!),
    deltaMinutes: deltas[s.id]!,
  }));

  const after = slots.map((s) => ({ ...s, startMin: s.startMin + (deltas[s.id] ?? 0), endMin: s.endMin + (deltas[s.id] ?? 0) }));
  const hasPriest = state.budget.lines.some((l) => l.category === "priest");
  const warnings = [
    ...overruns(state.plan.functions, after),
    ...(hasPriest && moved.some((s) => s.isRitual) ? ["If a ritual has a fixed muhurat, check with the priest before confirming this."] : []),
  ];

  const summary = CLOCK_TIME.test(draft.summary) ? `Reported: ${incident}` : draft.summary;
  return { id, incident, summary, moves, warnings, messages: draft.notify.map((n) => writeMessage(n, moves[0], summary)), deltas };
}

export async function planReshuffle(state: EventPlan, slots: readonly RunSlot[], incident: string, id: string, deps: DayofDeps = defaultDeps): Promise<LiveProposal> {
  const draft = await deps.structured({
    schema: ReshuffleDraft,
    name: "emit_reshuffle",
    fixtureKey: `emit_reshuffle.${state.answers.culture}.${state.answers.eventType}.${incidentSlug(incident)}`,
    model: "smart",
    system: DAYOF_PROMPT_V1,
    messages: [{ role: "user", content: userMessage(state, slots, incident) }],
  });
  return finalizeReshuffle(draft, state, slots, incident, id);
}
