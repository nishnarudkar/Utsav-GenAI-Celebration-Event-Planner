import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as writePitch } from "@/app/api/events/[id]/sponsorship/route";
import { DELETE as removeVolunteer, POST as addVolunteer } from "@/app/api/events/[id]/volunteers/route";
import { POST as createEvent } from "@/app/api/events/route";
import { getEventRepository } from "@/lib/plan/event-repo";
import type { StoredEvent } from "@/lib/plan/types";
import { rosterCoverage, rosterText } from "@/lib/rules/roster";
import { pitchFor, sponsorshipTiers, tiersTotalPaise } from "@/lib/rules/sponsorship";
import { SponsorshipWords, type Volunteer } from "@/lib/schemas/community";
import type { PlannedFunction } from "@/lib/schemas/event";
import words from "../../fixtures/llm/emit_sponsorship.community.json";

const rupees = (r: number) => r * 100;
const COMMUNITY = {
  eventType: "community",
  culture: "generic",
  city: "Pune",
  startDate: "2027-01-26",
  guestCount: 500,
  budgetTotalPaise: rupees(5_00_000),
};
const WEDDING = { ...COMMUNITY, eventType: "wedding", culture: "bengali_hindu", city: "Kolkata" };
const PITCH = {
  organiser: "Green Park RWA",
  contact: "Asha, 98200 00000",
  targetPaise: rupees(2_00_000),
  cause: "The stage and a free meal",
};

const FESTIVAL: PlannedFunction = {
  name: "Festival day",
  ritualKeys: [],
  date: "2027-01-26",
  startTime: "09:00",
  endTime: "21:00",
  expectedGuests: 500,
};
const person = (over: Partial<Volunteer>): Volunteer => ({
  id: "v1",
  name: "Asha",
  role: "crowd_entry",
  functionName: "Festival day",
  ...over,
});

async function newEvent(answers: object = COMMUNITY): Promise<StoredEvent> {
  const res = await createEvent(new Request("http://test", { method: "POST", body: JSON.stringify(answers) }));
  expect(res.status).toBe(201);
  return ((await res.json()) as { event: StoredEvent }).event;
}
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const request = (method: string, body: unknown) => new Request("http://test", { method, body: JSON.stringify(body) });

beforeEach(() => {
  vi.stubEnv("DEMO_MODE", "true");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("rosterCoverage", () => {
  it("compares each shift with what its crowd needs", () => {
    const { shifts, unplaced } = rosterCoverage(
      [FESTIVAL],
      [person({}), person({ id: "v2", name: "Ravi", role: "first_aid" })],
    );
    expect(shifts[0]).toMatchObject({ volunteersNeeded: 5, firstAidNeeded: 1, firstAidHave: 1 });
    expect(shifts[0]?.volunteers).toHaveLength(2);
    expect(unplaced).toEqual([]);
  });

  it("keeps people whose function has left the plan", () => {
    const moved = person({ functionName: "Parade" });
    expect(rosterCoverage([FESTIVAL], [moved]).unplaced).toEqual([moved]);
  });
});

describe("rosterText", () => {
  it("lists shifts and roles, without phone numbers", () => {
    const text = rosterText(
      "Green Park Festival",
      rosterCoverage([FESTIVAL, { ...FESTIVAL, name: "Clean-up" }], [person({ phone: "98200 00000" })]),
    );
    expect(text).toContain("Festival day, 26 Jan 2027, 9:00 AM – 9:00 PM\n- Asha: Crowd and entry");
    expect(text).toContain("- Nobody yet");
    expect(text).not.toContain("98200");
  });
});

describe("sponsorshipTiers", () => {
  it("splits the target across the tiers", () => {
    const tiers = sponsorshipTiers(rupees(2_00_000));
    expect(tiers.map((t) => [t.slots, t.amountPaise])).toEqual([
      [1, rupees(80_000)],
      [2, rupees(40_000)],
      [4, rupees(10_000)],
    ]);
    expect(tiersTotalPaise(tiers)).toBe(rupees(2_00_000));
  });

  it("rounds up to the next ₹1,000, so a full house meets the target", () => {
    const tiers = sponsorshipTiers(rupees(1_23_456));
    expect(tiers.map((t) => t.amountPaise)).toEqual([rupees(50_000), rupees(25_000), rupees(7_000)]);
    expect(tiersTotalPaise(tiers)).toBeGreaterThanOrEqual(rupees(1_23_456));
  });
});

describe("SponsorshipWords", () => {
  it("accepts the sample wording", () => {
    expect(SponsorshipWords.safeParse(words).success).toBe(true);
  });

  it.each([
    ["opening", "Last year 5000 people came."],
    ["closing", "Only ₹ a little."],
  ])("rejects figures from the model in %s", (field, text) => {
    expect(SponsorshipWords.safeParse({ ...words, [field]: text }).success).toBe(false);
  });
});

describe("pitchFor", () => {
  const event = {
    title: "Green Park Festival",
    answers: { city: "Pune", startDate: "2027-01-26" },
    plan: { functions: [FESTIVAL] },
  };

  it("builds the message from the event, the amounts and the wording", () => {
    const { message, totalPaise } = pitchFor(event, { input: PITCH, words });
    expect(message).toContain("26 Jan 2027, Pune");
    expect(message).toContain("about 500 people");
    expect(message).toContain(`• Title sponsor (1 place): ₹80,000. ${words.perks.title}`);
    expect(message).toContain("• Supporter (4 places): ₹10,000.");
    expect(message).toContain("What your support pays for: The stage and a free meal");
    expect(message.endsWith("Green Park RWA\nAsha, 98200 00000")).toBe(true);
    expect(totalPaise).toBe(rupees(2_00_000));
  });

  it("reflects a changed crowd without being rewritten", () => {
    const grown = { ...event, plan: { functions: [{ ...FESTIVAL, expectedGuests: 1200 }] } };
    expect(pitchFor(grown, { input: PITCH, words }).message).toContain("about 1,200 people");
  });
});

describe("volunteers API", () => {
  const asha = { name: "Asha", phone: "98200 00000", role: "first_aid", functionName: "Festival day" };

  it("adds and removes a volunteer", async () => {
    const event = await newEvent();
    const res = await addVolunteer(request("POST", asha), params(event.id));
    expect(res.status).toBe(201);
    const { volunteer } = (await res.json()) as { volunteer: Volunteer };
    expect(volunteer).toMatchObject(asha);
    expect((await getEventRepository().get(event.id))?.volunteers).toHaveLength(1);

    expect((await removeVolunteer(request("DELETE", { volunteerId: volunteer.id }), params(event.id))).status).toBe(
      204,
    );
    expect((await getEventRepository().get(event.id))?.volunteers).toEqual([]);
    expect((await removeVolunteer(request("DELETE", { volunteerId: volunteer.id }), params(event.id))).status).toBe(
      404,
    );
  });

  it("refuses bad input, a shift not in the plan, and the same person twice", async () => {
    const event = await newEvent();
    expect((await addVolunteer(request("POST", { ...asha, role: "boss" }), params(event.id))).status).toBe(400);
    expect((await addVolunteer(request("POST", { ...asha, phone: "call me" }), params(event.id))).status).toBe(400);
    expect((await addVolunteer(request("POST", { ...asha, functionName: "Parade" }), params(event.id))).status).toBe(
      400,
    );

    await addVolunteer(request("POST", asha), params(event.id));
    const twice = await addVolunteer(request("POST", { ...asha, name: "ASHA" }), params(event.id));
    expect(twice.status).toBe(400);
    expect((await addVolunteer(request("POST", { ...asha, functionName: "Clean-up" }), params(event.id))).status).toBe(
      201,
    );
  });

  it("is only for community events", async () => {
    const event = await newEvent(WEDDING);
    expect((await addVolunteer(request("POST", asha), params(event.id))).status).toBe(404);
  });
});

describe("POST /api/events/:id/sponsorship", () => {
  it("writes the pitch and saves it on the event", async () => {
    const event = await newEvent();
    const res = await writePitch(request("POST", PITCH), params(event.id));
    expect(res.status).toBe(200);
    const { pitch } = (await res.json()) as { pitch: { message: string; totalPaise: number } };
    expect(pitch.totalPaise).toBe(rupees(2_00_000));
    expect(pitch.message).toContain("about 500 people");
    expect((await getEventRepository().get(event.id))?.sponsorship?.input).toEqual(PITCH);
  });

  it("refuses bad input and other event types", async () => {
    const event = await newEvent();
    expect((await writePitch(request("POST", { ...PITCH, targetPaise: 100 }), params(event.id))).status).toBe(400);
    expect((await writePitch(request("POST", { ...PITCH, cause: " " }), params(event.id))).status).toBe(400);
    const wedding = await newEvent(WEDDING);
    expect((await writePitch(request("POST", PITCH), params(wedding.id))).status).toBe(404);
  });
});
