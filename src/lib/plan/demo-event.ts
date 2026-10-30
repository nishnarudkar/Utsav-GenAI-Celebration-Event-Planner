import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { buildEventPlan, type BuildPlanOptions } from "@/lib/plan/build-plan";
import type { EventRepository } from "@/lib/plan/event-repo";
import { checkQuote } from "@/lib/plan/quote-service";
import type { EventPlan, StoredEvent } from "@/lib/plan/types";
import type { StakeholderInput } from "@/lib/schemas/council";
import type { OnboardingAnswers } from "@/lib/schemas/event";

/**
 * The demo event (CLAUDE.md §11 Phase 5): the Bengali wedding from the demo script, ready to
 * present. Everything goes through the same services as a real event, so each click on
 * "Try the demo wedding" gives a fresh copy to rehearse on.
 */

export const DEMO_ANSWERS: OnboardingAnswers = {
  title: "Ananya & Rohan’s wedding",
  eventType: "wedding",
  culture: "bengali_hindu",
  city: "Kolkata",
  startDate: "2027-02-14",
  guestCount: 250,
  budgetTotalPaise: 15_00_000_00,
};

/** The hall booked for the Biye. Onboarding doesn't ask, so this is what makes 350 guests a conflict. */
export const DEMO_VENUE = { functionName: "Biye (wedding ceremony)", capacity: 300 };

/** Their preferences match the conflicts in the emit_council demo fixture. */
export const DEMO_FAMILY: StakeholderInput[] = [
  { name: "Ananya & Rohan", role: "couple", weight: 1, preferences: { guestCount: 150, venueStyle: "lawn" } },
  { name: "Mr & Mrs Sen", role: "bride_family", weight: 1, preferences: { guestCount: 350, venueStyle: "banquet_hall", notes: "A generous celebration, with every relative invited." } },
  { name: "Mr & Mrs Bose", role: "groom_family", weight: 1, preferences: { guestCount: 250, budgetMaxPaise: DEMO_ANSWERS.budgetTotalPaise ?? undefined } },
];

const SAMPLE_QUOTE = { fileName: "sample-caterer-quote.pdf", category: "catering" } as const;

function withVenueCapacity(plan: EventPlan): EventPlan {
  const functions = plan.plan.functions.map((f) => (f.name === DEMO_VENUE.functionName ? { ...f, venueCapacity: DEMO_VENUE.capacity } : f));
  return { ...plan, plan: { ...plan.plan, functions } };
}

export async function createDemoEvent(repo: EventRepository, opts: Pick<BuildPlanOptions, "today"> = {}): Promise<StoredEvent> {
  const plan = await buildEventPlan(DEMO_ANSWERS, opts);
  const { id } = await repo.create(withVenueCapacity(plan));
  for (const person of DEMO_FAMILY) await repo.addStakeholder(id, person);

  const bytes = await readFile(path.join(process.cwd(), "public", "samples", SAMPLE_QUOTE.fileName));
  await checkQuote(repo, id, {
    file: { mediaType: "application/pdf", base64: bytes.toString("base64") },
    fileName: SAMPLE_QUOTE.fileName,
    category: SAMPLE_QUOTE.category,
  });

  const event = await repo.get(id);
  if (!event) throw new Error("Demo event disappeared while it was being created.");
  return event;
}
