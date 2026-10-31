import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PUT as setPermit } from "@/app/api/events/[id]/permits/route";
import { POST as createEvent } from "@/app/api/events/route";
import { getPermits, permitRows } from "@/lib/kb/permits";
import type { StoredEvent } from "@/lib/plan/types";
import { estimateCrowd } from "@/lib/rules/crowd";

const rupees = (r: number) => r * 100;
const COMMUNITY = { eventType: "community", culture: "generic", city: "Pune", startDate: "2027-01-26", guestCount: 500, budgetTotalPaise: rupees(5_00_000) };

async function newEvent(): Promise<StoredEvent> {
  const res = await createEvent(new Request("http://test", { method: "POST", body: JSON.stringify(COMMUNITY) }));
  expect(res.status).toBe(201);
  return ((await res.json()) as { event: StoredEvent }).event;
}
const put = (id: string, body: unknown) => setPermit(new Request("http://test", { method: "PUT", body: JSON.stringify(body) }), { params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.stubEnv("DEMO_MODE", "true");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("estimateCrowd", () => {
  it("works out exits, volunteers, first aid and toilets", () => {
    expect(estimateCrowd({ peakCrowd: 500 })).toEqual({ exitWidthNeededM: 3, minExits: 2, volunteers: 5, firstAidPosts: 1, toilets: 4 });
    expect(estimateCrowd({ peakCrowd: 5000 })).toMatchObject({ exitWidthNeededM: 8, volunteers: 50, firstAidPosts: 5, toilets: 34 });
  });

  it("never asks for less than two proper exits, however small the crowd", () => {
    expect(estimateCrowd({ peakCrowd: 50 }).exitWidthNeededM).toBe(3);
  });

  it("rounds up, so needs are never understated, with at least two toilets", () => {
    expect(estimateCrowd({ peakCrowd: 2300 }).exitWidthNeededM).toBe(4);
    expect(estimateCrowd({ peakCrowd: 101 }).volunteers).toBe(2);
    expect(estimateCrowd({ peakCrowd: 20 }).toilets).toBe(2);
  });

  it.each([
    [500, "comfortable", 0.5],
    [2000, "busy", 2],
    [4000, "crowded", 4],
    [5000, "unsafe", 5],
    [7000, "unsafe", 7],
  ])("rates %i people in 1,000 sq m as %s", (peakCrowd, level, perSqM) => {
    expect(estimateCrowd({ peakCrowd, areaSqM: 1000 }).density).toEqual({ perSqM, level, comfortableCapacity: 2000 });
  });

  it("judges density on the real figure, not the rounded one", () => {
    expect(estimateCrowd({ peakCrowd: 1996, areaSqM: 1000 }).density).toMatchObject({ perSqM: 2, level: "comfortable" });
  });

  it("reports an exit shortfall only when given a width", () => {
    expect(estimateCrowd({ peakCrowd: 5000 }).exitShortfallM).toBeUndefined();
    expect(estimateCrowd({ peakCrowd: 5000, exitWidthM: 5 }).exitShortfallM).toBe(3);
    expect(estimateCrowd({ peakCrowd: 5000, exitWidthM: 10 }).exitShortfallM).toBe(0);
  });
});

describe("permitRows", () => {
  const { items } = getPermits();

  it("has valid data, with unique ids", () => {
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
    expect(items.map((i) => i.id)).toEqual(expect.arrayContaining(["police_permission", "municipal_permission", "fire_noc", "loudspeaker_permission"]));
  });

  it("works out apply-by dates, soonest first", () => {
    const rows = permitRows(items, "2027-01-26", "2026-10-31", []);
    expect(rows[0]).toMatchObject({ id: "site_consent", applyBy: "2026-11-27", late: false, done: false });
    expect(rows.find((r) => r.id === "police_permission")?.applyBy).toBe("2026-12-27");
    const dates = rows.map((r) => r.applyBy);
    expect(dates).toEqual([...dates].sort());
  });

  it("marks a missed date late, unless it's done", () => {
    const rows = permitRows(items, "2027-01-26", "2027-01-10", ["police_permission"]);
    expect(rows.find((r) => r.id === "fire_noc")).toMatchObject({ late: true, done: false });
    expect(rows.find((r) => r.id === "police_permission")).toMatchObject({ late: false, done: true });
    expect(rows.find((r) => r.id === "ambulance_arrangement")).toMatchObject({ applyBy: "2027-01-19", late: false });
  });
});

describe("demo community event", () => {
  it("builds a plan without a key, within budget, and with nothing unpriced", async () => {
    const event = await newEvent();
    expect(event.plan.functions.map((f) => f.name)).toEqual(["Set-up and briefing", "Festival day", "Clean-up"]);
    expect(event.budget).toMatchObject({ overBudgetPaise: 0, unpriced: [] });
    expect(event.permitsDone).toEqual([]);
  });
});

describe("PUT /api/events/:id/permits", () => {
  it("ticks and unticks, and rejects bad requests", async () => {
    const event = await newEvent();
    const res = await put(event.id, { permitId: "fire_noc", done: true });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ permitsDone: ["fire_noc"] });
    expect(await (await put(event.id, { permitId: "fire_noc", done: false })).json()).toEqual({ permitsDone: [] });

    expect((await put(event.id, { permitId: "made_up", done: true })).status).toBe(400);
    expect((await put(event.id, { permitId: "fire_noc" })).status).toBe(400);
    expect((await put("00000000-0000-0000-0000-000000000000", { permitId: "fire_noc", done: true })).status).toBe(404);
  });
});
