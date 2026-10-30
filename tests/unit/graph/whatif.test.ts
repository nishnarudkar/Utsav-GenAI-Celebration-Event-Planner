import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as whatif } from "@/app/api/events/[id]/whatif/route";
import { GET as getEvent } from "@/app/api/events/[id]/route";
import { POST as undo } from "@/app/api/events/[id]/undo/route";
import { POST as createEvent } from "@/app/api/events/route";
import { applyScenario, describeScenario, projectScenario } from "@/lib/graph/whatif";
import { buildEventPlan } from "@/lib/plan/build-plan";
import { diffRows } from "@/lib/plan/diff-view";
import type { EventPlan, StoredEvent } from "@/lib/plan/types";
import { sumPaise } from "@/lib/rules/budget-math";
import type { PlanDiff } from "@/lib/schemas/diff";
import type { WhatIfProjection } from "@/lib/schemas/whatif";

const CTX = { version: 1, today: "2026-10-30" };
const rupees = (r: number) => r * 100;
const BODY = { eventType: "wedding", culture: "bengali_hindu", city: "Kolkata", startDate: "2027-02-14", guestCount: 250, budgetTotalPaise: rupees(15_00_000) };
const scenario = (over: Partial<Parameters<typeof projectScenario>[1]> = {}) => ({ tiers: {}, dropFunctions: [], ...over });

let demo: EventPlan;

beforeAll(async () => {
  vi.stubEnv("DEMO_MODE", "true");
  demo = await buildEventPlan(BODY as Parameters<typeof buildEventPlan>[0], { today: CTX.today });
});
afterAll(() => {
  vi.unstubAllEnvs();
});

describe("projectScenario", () => {
  it("projects guests and tiers together without touching the plan", () => {
    const before = structuredClone(demo);
    const p = projectScenario(demo, scenario({ guestCount: 300, tiers: { catering: "mid" } }), CTX);
    // 300 × 2 feasts at ₹1,500 + breakfast and lunch re-tiered to ₹1,500
    expect(p.categories.find((c) => c.category === "catering")).toMatchObject({ beforePaise: rupees(5_40_000), afterPaise: rupees(10_50_000) });
    expect(p.deltaPaise).toBe(p.totalEstimatePaise - rupees(14_40_000));
    expect(p.overBudgetPaise).toBe(p.totalEstimatePaise - rupees(15_00_000));
    expect(p.conflicts[0]?.type).toBe("over_budget");
    expect(demo).toEqual(before);
  });

  it("lists only changed categories, biggest change first, and ranks savings", () => {
    const p = projectScenario(demo, scenario({ tiers: { decor: "high", venue: "mid" } }), CTX);
    expect(p.categories.map((c) => c.category)).toEqual(["decor", "venue"]);
    const saves = p.savings.map((s) => s.savesPaise);
    expect(saves.length).toBeGreaterThan(0);
    expect(saves).toEqual([...saves].sort((a, b) => b - a));
  });

  it("offers savings even within budget", () => {
    const p = projectScenario(demo, scenario({ guestCount: 240 }), CTX);
    expect(p.overBudgetPaise).toBe(0);
    expect(p.savings[0]).toMatchObject({ id: "tier:attire", savesPaise: rupees(93_000) });
  });
});

describe("dropping a function", () => {
  it("removes its lines and tasks, keeps user tasks, and lists its rituals as unplaced", () => {
    const userTask = { ...demo.timeline.tasks[0]!, ref: "mine", functionName: "Gaye Holud", source: "user" as const };
    const state = { ...demo, timeline: { ...demo.timeline, tasks: [...demo.timeline.tasks, userTask] } };
    const { state: next, diff } = applyScenario(state, scenario({ dropFunctions: ["Gaye Holud"] }), CTX);

    expect(next.plan.functions.map((f) => f.name)).not.toContain("Gaye Holud");
    expect(next.budget.lines.some((l) => l.functionName === "Gaye Holud")).toBe(false);
    expect(next.timeline.tasks.filter((t) => t.functionName === "Gaye Holud").map((t) => t.ref)).toEqual(["mine"]);
    expect(next.plan.unassignedRitualKeys).toEqual(expect.arrayContaining(["gaye_holud", "dodhi_mangal", "shankha_porana"]));
    expect(next.budget.totalEstimatePaise).toBe(sumPaise(next.budget.lines.map((l) => l.estimatePaise)));
    expect(diff.removed.map((r) => r.label)).toEqual(["Gaye Holud", "Gaye Holud breakfast", "Gaye Holud floral setup", "Tattva gift trays"]);
    expect(diffRows(diff).at(-1)).toMatchObject({ from: "Planned", to: "Removed" });
  });

  it("removes dangling task dependencies and updates the date range", () => {
    const { state } = applyScenario(demo, scenario({ dropFunctions: ["Aashirbaad"] }), CTX);
    const refs = new Set(state.timeline.tasks.map((t) => t.ref));
    for (const t of state.timeline.tasks) for (const d of t.dependsOn) expect(refs.has(d), d).toBe(true);
    expect(state.plan.startDate).toBe("2027-02-14");
  });

  it("keeps a function with locked lines and never drops every function", () => {
    const locked = { ...demo, budget: { ...demo.budget, lines: demo.budget.lines.map((l) => (l.functionName === "Gaye Holud" ? { ...l, locked: true } : l)) } };
    const a = applyScenario(locked, scenario({ dropFunctions: ["Gaye Holud"] }), CTX);
    expect(a.state.plan.functions.map((f) => f.name)).toContain("Gaye Holud");
    expect(a.diff.conflicts.map((c) => c.type)).toContain("locked_item");

    const all = demo.plan.functions.map((f) => f.name);
    const b = applyScenario(demo, scenario({ dropFunctions: all }), CTX);
    expect(b.state.plan.functions).toHaveLength(1);
    expect(b.diff.conflicts.map((c) => c.type)).toContain("function_kept");
  });

  it("ignores unknown function names", () => {
    expect(applyScenario(demo, scenario({ dropFunctions: ["Made up"] }), CTX).diff.removed).toEqual([]);
  });
});

describe("tiers", () => {
  it("skips locked lines", () => {
    const locked = { ...demo, budget: { ...demo.budget, lines: demo.budget.lines.map((l) => (l.category === "decor" ? { ...l, locked: true } : l)) } };
    expect(applyScenario(locked, scenario({ tiers: { decor: "high" } }), CTX).diff.budgetDeltaPaise).toBe(0);
  });
});

describe("describeScenario", () => {
  it("summarises for the change log", () => {
    expect(describeScenario(scenario({ guestCount: 300, tiers: { catering: "low" }, dropFunctions: ["Gaye Holud"] }))).toBe("300 guests, catering low, without Gaye Holud");
    expect(describeScenario(scenario())).toBe("No changes");
  });
});

describe("POST /api/events/:id/whatif", () => {
  const params = (id: string) => ({ params: Promise.resolve({ id }) });
  const req = (body: unknown) => new Request("http://test", { method: "POST", body: JSON.stringify(body) });

  beforeEach(() => {
    vi.stubEnv("DEMO_MODE", "true");
  });
  afterEach(() => {
    vi.stubEnv("DEMO_MODE", "true");
  });

  async function newEvent(): Promise<StoredEvent> {
    return ((await (await createEvent(req(BODY))).json()) as { event: StoredEvent }).event;
  }
  const read = async (id: string) => ((await (await getEvent(new Request("http://test"), params(id))).json()) as { event: StoredEvent }).event;

  it("projects without saving", async () => {
    const event = await newEvent();
    const res = await whatif(req({ scenario: { guestCount: 300 } }), params(event.id));
    const { projection } = (await res.json()) as { projection: WhatIfProjection };
    expect(projection.deltaPaise).toBe(rupees(1_03_600));
    expect(await read(event.id)).toMatchObject({ version: 1, answers: { guestCount: 250 } });
  });

  it("applies as a logged change that Undo restores exactly", async () => {
    const event = await newEvent();
    const res = await whatif(req({ scenario: { guestCount: 300, dropFunctions: ["Gaye Holud"] }, apply: true }), params(event.id));
    expect(res.status).toBe(200);
    const { event: updated, diff } = (await res.json()) as { event: StoredEvent; diff: PlanDiff };
    expect(updated.version).toBe(2);
    expect(diff.explanation).toContain("300 guests, without Gaye Holud");

    await undo(req({}), params(event.id));
    const restored = await read(event.id);
    expect(restored.plan).toEqual(event.plan);
    expect(restored.budget).toEqual(event.budget);
    expect(restored.timeline).toEqual(event.timeline);
  });

  it("validates input and the event", async () => {
    const event = await newEvent();
    expect((await whatif(req({ scenario: { guestCount: 0 } }), params(event.id))).status).toBe(400);
    expect((await whatif(req({ scenario: { tiers: { catering: "luxury" } } }), params(event.id))).status).toBe(400);
    expect((await whatif(req({ scenario: {} }), params("00000000-0000-0000-0000-000000000000"))).status).toBe(404);
  });
});
