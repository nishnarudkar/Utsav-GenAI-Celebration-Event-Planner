import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as createDemo } from "@/app/api/demo/route";
import { GET as getEvent } from "@/app/api/events/[id]/route";
import { runCouncil } from "@/lib/ai/agents/council";
import { runCascade } from "@/lib/graph/cascade";
import { generateRecoveryOptions } from "@/lib/graph/recovery";
import { summarizeDashboard } from "@/lib/plan/dashboard";
import { createDemoEvent, DEMO_VENUE } from "@/lib/plan/demo-event";
import { MemoryEventRepository } from "@/lib/plan/event-repo";
import type { StoredEvent } from "@/lib/plan/types";

const rupees = (r: number) => r * 100;
const today = "2026-10-30";
const ctx = { version: 1, today };

beforeEach(() => {
  vi.stubEnv("DEMO_MODE", "true");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

const demo = () => createDemoEvent(new MemoryEventRepository(), { today });

describe("createDemoEvent", () => {
  it("creates the wedding from the demo script, within budget", async () => {
    const event = await demo();
    expect(event.answers).toMatchObject({ culture: "bengali_hindu", city: "Kolkata", startDate: "2027-02-14", guestCount: 250 });
    expect(event.budget).toMatchObject({ budgetTotalPaise: rupees(15_00_000), totalEstimatePaise: rupees(14_40_000), overBudgetPaise: 0 });
    expect(event.plan.functions.find((f) => f.name === DEMO_VENUE.functionName)?.venueCapacity).toBe(300);
  });

  it("has three people who disagree on guest numbers, and one checked quote", async () => {
    const event = await demo();
    expect(event.stakeholders.map((s) => s.role)).toEqual(["couple", "bride_family", "groom_family"]);
    expect(new Set(event.stakeholders.map((s) => s.preferences.guestCount)).size).toBe(3);
    expect(event.quotes).toHaveLength(1);
    expect(event.quotes[0]).toMatchObject({ fileName: "sample-caterer-quote.pdf" });
    expect(event.quotes[0]?.negotiationMessage).toBeTruthy();
  });

  it("gives the demo's cascade: 350 guests means over budget, too big for the hall, with fixes", async () => {
    const event = await demo();
    const { state, diff } = runCascade(event, { field: "guest_count", value: 350 }, ctx);
    expect(diff.budgetDeltaPaise).toBe(rupees(2_07_200));
    expect(state.budget.overBudgetPaise).toBe(rupees(1_47_200));
    expect(diff.conflicts.some((c) => c.severity === "critical" && c.message.includes("the venue holds 300"))).toBe(true);
    expect(generateRecoveryOptions(state, ctx).length).toBeGreaterThanOrEqual(3);
  });

  it("counts both the budget and the hall as open conflicts on the dashboard after that change", async () => {
    const event = await demo();
    expect(summarizeDashboard(event, today).openIssueCount).toBe(0);
    const { state } = runCascade(event, { field: "guest_count", value: 350 }, ctx);
    const { issues, openIssueCount } = summarizeDashboard(state, today);
    expect(openIssueCount).toBe(2);
    expect(issues.map((i) => i.title)).toEqual(["Over budget", "Venue capacity"]);
  });

  it("gives the Council a conflict for all three people, naming them", async () => {
    const event = await demo();
    const { conflicts, options } = await runCouncil(event, event.stakeholders, ctx);
    expect(conflicts[0]?.positions.map((p) => p.stakeholder)).toEqual(event.stakeholders.map((s) => s.name));
    expect(options).toHaveLength(3);
  });
});

describe("POST /api/demo", () => {
  const post = async () => {
    const res = await createDemo();
    expect(res.status).toBe(201);
    return ((await res.json()) as { event: StoredEvent }).event;
  };

  it("stores a fresh copy on every call", async () => {
    const [first, second] = [await post(), await post()];
    expect(first.id).not.toBe(second.id);
    const res = await getEvent(new Request("http://test"), { params: Promise.resolve({ id: first.id }) });
    expect(res.status).toBe(200);
  });

  it("explains a failure without leaking details", async () => {
    vi.stubEnv("DEMO_FIXTURES_DIR", "tests/fixtures/does-not-exist");
    const res = await createDemo();
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ error: { code: "DEMO_FIXTURE_MISSING" } });
  });
});
