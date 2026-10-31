import "server-only";
import { planReshuffle, type DayofDeps } from "@/lib/ai/agents/dayof";
import { sendWhatsApp } from "@/lib/messaging/whatsapp";
import type { EventRepository } from "@/lib/plan/event-repo";
import { liveDate } from "@/lib/plan/live-view";
import type { StoredEvent } from "@/lib/plan/types";
import type { ISODate } from "@/lib/rules/dates";
import { buildRunOfShow } from "@/lib/rules/run-of-show";
import type { LiveProposal } from "@/lib/schemas/dayof";

/** Day-of flow: an incident becomes a proposal; nothing moves or sends until it's confirmed. */

export async function proposeReshuffle(repo: EventRepository, id: string, incident: string, opts: { today: ISODate }, deps?: DayofDeps): Promise<LiveProposal | null> {
  const event = await repo.get(id);
  if (!event) return null;
  const slots = buildRunOfShow(event.plan.functions, event.rituals.rituals, liveDate(event, opts.today), event.live.shifts);
  const proposal = await planReshuffle(event, slots, incident, crypto.randomUUID(), deps);
  await repo.setLiveProposal(id, proposal);
  return proposal;
}

export type ConfirmOutcome = { kind: "not_found" } | { kind: "stale" } | { kind: "confirmed"; event: StoredEvent };

export async function confirmReshuffle(repo: EventRepository, id: string, proposalId: string): Promise<ConfirmOutcome> {
  const event = await repo.get(id);
  if (!event) return { kind: "not_found" };
  const proposal = event.live.proposal;
  if (proposal?.id !== proposalId) return { kind: "stale" };

  const notifications = proposal.messages.map((m) => sendWhatsApp(m.to, m.body));
  const updated = await repo.applyLive(id, proposal, notifications);
  return updated ? { kind: "confirmed", event: updated } : { kind: "not_found" };
}
