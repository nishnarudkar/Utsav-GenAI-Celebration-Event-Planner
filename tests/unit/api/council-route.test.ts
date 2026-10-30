import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as applyOption } from "@/app/api/events/[id]/council/apply/route";
import { GET as getCouncil, POST as holdCouncil } from "@/app/api/events/[id]/council/route";
import { GET as getEvent, PATCH as patchEvent } from "@/app/api/events/[id]/route";
import { DELETE as removeStakeholder } from "@/app/api/events/[id]/stakeholders/[stakeholderId]/route";
import { POST as addStakeholder } from "@/app/api/events/[id]/stakeholders/route";
import { POST as undo } from "@/app/api/events/[id]/undo/route";
import { POST as createEvent } from "@/app/api/events/route";
import { finalizeCouncil, stakeholderRefs } from "@/lib/ai/agents/council";
import { applyCouncilPatch } from "@/lib/graph/council";
import type { StoredEvent } from "@/lib/plan/types";
import type { CouncilDraft, CouncilResolution, Stakeholder } from "@/lib/schemas/council";
import type { PlanDiff } from "@/lib/schemas/diff";

const rupees = (r: number) => r * 100;
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const MISSING = "00000000-0000-0000-0000-000000000000";
const req = (body?: unknown) => new Request("http://test", { method: "POST", ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const json = async <T>(res: Response) => (await res.json()) as T;

const BODY = { eventType: "wedding", culture: "bengali_hindu", city: "Kolkata", startDate: "2027-02-14", guestCount: 250, budgetTotalPaise: rupees(15_00_000) };

async function newEvent(body: Record<string, unknown> = BODY): Promise<StoredEvent> {
  return (await json<{ event: StoredEvent }>(await createEvent(req(body)))).event;
}
const read = async (id: string) => (await json<{ event: StoredEvent }>(await getEvent(new Request("http://test"), params(id)))).event;

async function withFamily(): Promise<StoredEvent> {
  const event = await newEvent();
  await addStakeholder(req({ name: "Ananya & Rohan", role: "couple", preferences: { guestCount: 150, venueStyle: "lawn" } }), params(event.id));
  await addStakeholder(req({ name: "Mr & Mrs Sen", role: "bride_family", preferences: { guestCount: 350, venueStyle: "banquet_hall" } }), params(event.id));
  await addStakeholder(req({ name: "Mr & Mrs Bose", role: "groom_family", preferences: { guestCount: 250, budgetMaxPaise: rupees(15_00_000) } }), params(event.id));
  return read(event.id);
}
const hold = async (id: string) => (await json<{ council: CouncilResolution }>(await holdCouncil(req(), params(id)))).council;

beforeEach(() => {
  vi.stubEnv("DEMO_MODE", "true");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("stakeholders", () => {
  it("adds with validation and removes", async () => {
    const event = await newEvent();
    const res = await addStakeholder(req({ name: "Asha", role: "parent", preferences: { menu: "veg" } }), params(event.id));
    expect(res.status).toBe(201);
    const { stakeholder } = await json<{ stakeholder: Stakeholder }>(res);
    expect(stakeholder).toMatchObject({ name: "Asha", weight: 1 });

    expect((await addStakeholder(req({ name: "", role: "parent", preferences: {} }), params(event.id))).status).toBe(400);
    expect((await addStakeholder(req({ name: "X", role: "uncle", preferences: {} }), params(event.id))).status).toBe(400);
    expect((await addStakeholder(req({ name: "X", role: "parent", preferences: {} }), params(MISSING))).status).toBe(404);

    const ctx = { params: Promise.resolve({ id: event.id, stakeholderId: stakeholder.id }) };
    expect((await removeStakeholder(new Request("http://test"), ctx)).status).toBe(204);
    expect((await removeStakeholder(new Request("http://test"), ctx)).status).toBe(404);
  });

  it("clears the council result when the family changes", async () => {
    const event = await withFamily();
    await hold(event.id);
    await addStakeholder(req({ name: "Dida", role: "parent", preferences: {} }), params(event.id));
    expect((await read(event.id)).council).toBeNull();
  });
});

describe("holding a council", () => {
  it("needs at least two people", async () => {
    const event = await newEvent();
    expect((await holdCouncil(req(), params(event.id))).status).toBe(400);
    expect((await holdCouncil(req(), params(MISSING))).status).toBe(404);
  });

  it("maps refs to names and measures each option's cost in code", async () => {
    const event = await withFamily();
    const council = await hold(event.id);

    expect(council.conflicts.map((c) => [c.topic, c.severity])).toEqual([["Guest list", "high"], ["Venue", "medium"], ["Spending", "medium"]]);
    expect(council.conflicts[0]?.positions[0]?.stakeholder).toBe("Ananya & Rohan");
    expect(council.options.map((o) => [o.id, o.costDeltaPaise])).toEqual([
      ["intimate_biye_big_reception", rupees(27_200)], // −100 + 100 plates, +100 gifts ₹200, +48 cards ₹150
      ["middle_ground_300", rupees(1_03_600)],
      ["keep_current", 0],
    ]);
    expect(council.options[0]).toMatchObject({ satisfies: ["Ananya & Rohan", "Mr & Mrs Sen"], compromises: ["Mr & Mrs Bose"] });
    expect(council.options[2]?.conflictsAfter).toEqual([]);

    const got = await json<{ stakeholders: Stakeholder[]; council: CouncilResolution }>(await getCouncil(new Request("http://test"), params(event.id)));
    expect(got.stakeholders).toHaveLength(3);
    expect(got.council.id).toBe(council.id);
  });

  it("explains demo mode's limit for other plans", async () => {
    const event = await newEvent({ ...BODY, eventType: "birthday", culture: "generic", city: "Pune" });
    await addStakeholder(req({ name: "A", role: "parent", preferences: {} }), params(event.id));
    await addStakeholder(req({ name: "B", role: "parent", preferences: {} }), params(event.id));
    const res = await holdCouncil(req(), params(event.id));
    expect(res.status).toBe(422);
  });
});

describe("applying a compromise", () => {
  it("updates the plan with function-level guests, records the choice, and can be undone", async () => {
    const event = await withFamily();
    await hold(event.id);
    const res = await applyOption(req({ optionId: "intimate_biye_big_reception" }), params(event.id));
    expect(res.status).toBe(200);
    const { event: updated, diff } = await json<{ event: StoredEvent; diff: PlanDiff }>(res);

    expect(updated.answers.guestCount).toBe(350);
    const guests = Object.fromEntries(updated.plan.functions.map((f) => [f.name, f.expectedGuests]));
    expect(guests).toMatchObject({ "Biye (wedding ceremony)": 150, "Bou Bhaat (reception)": 350, "Gaye Holud": 60 });
    expect(updated.budget.lines.find((l) => l.label === "Wedding dinner — buffet")?.basis.quantity).toBe(150);
    expect(updated.budget.lines.find((l) => l.label === "Bou Bhaat feast")?.basis.quantity).toBe(350);
    expect(diff.budgetDeltaPaise).toBe(rupees(27_200));
    expect(diff.explanation).toMatch(/^Family Council chose “Intimate wedding, big Bou Bhaat”\./);
    expect((await read(event.id)).council?.chosenOptionId).toBe("intimate_biye_big_reception");

    await undo(req(), params(event.id));
    const restored = await read(event.id);
    expect(restored.answers.guestCount).toBe(250);
    expect(restored.budget.totalEstimatePaise).toBe(rupees(14_40_000));
    expect(restored.council?.chosenOptionId).toBeNull();
  });

  it("refuses unknown options and options made for an older plan", async () => {
    const event = await withFamily();
    expect((await applyOption(req({ optionId: "keep_current" }), params(event.id))).status).toBe(404); // no council yet
    await hold(event.id);
    expect((await applyOption(req({ optionId: "nope" }), params(event.id))).status).toBe(404);

    await patchEvent(new Request("http://test", { method: "PATCH", body: JSON.stringify({ field: "guest_count", value: 260 }) }), params(event.id));
    const stale = await applyOption(req({ optionId: "keep_current" }), params(event.id));
    expect(stale.status).toBe(409);
  });
});

describe("finalizeCouncil", () => {
  const stakeholders: Stakeholder[] = [
    { id: "1", name: "Priya", role: "parent", preferences: {}, weight: 1 },
    { id: "2", name: "Dev", role: "parent", preferences: {}, weight: 1 },
  ];

  it("gives repeated roles distinct refs", () => {
    expect([...stakeholderRefs(stakeholders).keys()]).toEqual(["parent", "parent_2"]);
  });

  it("drops unknown refs, conflicts left with one side, and unknown functions", async () => {
    const event = await newEvent();
    const draft: CouncilDraft = {
      conflicts: [{ topic: "Menu", severity: "low", positions: [{ ref: "parent", wants: "Veg" }, { ref: "ghost", wants: "Fish" }] }],
      options: [
        { id: "a", title: "A", description: "d", satisfies: ["parent", "ghost"], compromises: [], patch: { guestCount: null, functionGuests: [{ functionName: "Made up", guests: 900 }], budgetTotalPaise: null } },
        { id: "b", title: "B", description: "d", satisfies: [], compromises: ["parent_2"], patch: { guestCount: null, functionGuests: [], budgetTotalPaise: null } },
      ],
    };
    const result = finalizeCouncil(draft, event, stakeholders, { version: 1, today: "2026-10-30" });
    expect(result.conflicts).toEqual([]);
    expect(result.options[0]).toMatchObject({ satisfies: ["Priya"], costDeltaPaise: 0 });
    expect(result.options[1]?.compromises).toEqual(["Dev"]);
  });
});

describe("applyCouncilPatch", () => {
  it("raises the guest list when a function asks for more guests than the event has", async () => {
    const event = await newEvent();
    const { state } = applyCouncilPatch(event, { guestCount: null, functionGuests: [{ functionName: "Bou Bhaat (reception)", guests: 400 }], budgetTotalPaise: null }, { version: 1, today: "2026-10-30" }, "x");
    expect(state.answers.guestCount).toBe(400);
  });

  it("adopts a budget limit and rescales targets", async () => {
    const event = await newEvent();
    const { state, diff } = applyCouncilPatch(event, { guestCount: null, functionGuests: [], budgetTotalPaise: rupees(12_00_000) }, { version: 1, today: "2026-10-30" }, "x");
    expect(state.budget.budgetTotalPaise).toBe(rupees(12_00_000));
    expect(diff.conflicts[0]?.type).toBe("over_budget");
  });

  it("leaves a locked line alone and says so", async () => {
    const event = await newEvent();
    const locked = { ...event, budget: { ...event.budget, lines: event.budget.lines.map((l) => (l.label === "Bou Bhaat feast" ? { ...l, locked: true } : l)) } };
    const { state, diff } = applyCouncilPatch(locked, { guestCount: null, functionGuests: [{ functionName: "Bou Bhaat (reception)", guests: 100 }], budgetTotalPaise: null }, { version: 1, today: "2026-10-30" }, "x");
    expect(state.budget.lines.find((l) => l.label === "Bou Bhaat feast")?.basis.quantity).toBe(250);
    expect(diff.conflicts.map((c) => c.type)).toContain("locked_item");
  });
});
