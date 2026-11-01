import "server-only";
import { planReshuffle, type DayofDeps } from "@/lib/ai/agents/dayof";
import { sendWhatsApp } from "@/lib/messaging/whatsapp";
import type { EventRepository } from "@/lib/plan/event-repo";
import { liveDate } from "@/lib/plan/live-view";
import type { StoredEvent } from "@/lib/plan/types";
import type { ISODate } from "@/lib/rules/dates";
import { buildRunOfShow, upcomingSlots } from "@/lib/rules/run-of-show";
import type { LiveProposal } from "@/lib/schemas/dayof";

/** Day-of flow: an incident becomes a proposal; nothing moves or sends until it's confirmed. */

export async function proposeReshuffle(repo: EventRepository, id: string, incident: string, opts: { today: ISODate; nowMinutes?: number }, deps?: DayofDeps): Promise<LiveProposal | null> {
  const event = await repo.get(id);
  if (!event) return null;
  const date = liveDate(event, opts.today);
  const day = buildRunOfShow(event.plan.functions, event.rituals.rituals, date, event.live.shifts);
  // Only on the day itself: a rehearsal beforehand plans around the whole running order.
  const slots = date === opts.today && opts.nowMinutes !== undefined ? upcomingSlots(day, opts.nowMinutes) : day;
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
