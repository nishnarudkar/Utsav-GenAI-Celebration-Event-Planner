import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { runCascade } from "@/lib/graph/cascade";
import { buildEventPlan } from "@/lib/plan/build-plan";
import type { EventPlan } from "@/lib/plan/types";
import { sumPaise } from "@/lib/rules/budget-math";
import { PlanDiff } from "@/lib/schemas/diff";

const TODAY = "2026-10-29";
const CTX = { version: 1, today: TODAY };
const rupees = (r: number) => r * 100;

let demo: EventPlan;

beforeAll(async () => {
  vi.stubEnv("DEMO_MODE", "true");
  const plan = await buildEventPlan(
    { eventType: "wedding", culture: "bengali_hindu", city: "Kolkata", startDate: "2027-02-14", guestCount: 250, budgetTotalPaise: rupees(15_00_000) },
    { today: TODAY },
  );
  // The demo script's 300-seat wedding hall.
  demo = {
    ...plan,
    plan: { ...plan.plan, functions: plan.plan.functions.map((f) => (f.name === "Biye (wedding ceremony)" ? { ...f, venueCapacity: 300 } : f)) },
  };
});
afterAll(() => {
  vi.unstubAllEnvs();
});

const lineByLabel = (state: EventPlan, label: string) => state.budget.lines.find((l) => l.label === label)!;

describe("guest count 250 → 350 (demo scenario)", () => {
  it("recalculates only guest-driven lines and reports the budget delta", () => {
    const { state, diff, noop } = runCascade(demo, { field: "guest_count", value: 350 }, CTX);
    expect(noop).toBe(false);
    expect(PlanDiff.safeParse(diff).success).toBe(true);
    expect(diff.version).toBe(2);

    const lines = diff.changed.filter((c) => c.nodeId.startsWith("line:")).map((c) => [c.label, c.reason]);
    expect(lines).toEqual([
      ["Wedding dinner — buffet", "250 → 350 guests at Biye (wedding ceremony)"],
      ["Bou Bhaat feast", "250 → 350 guests at Bou Bhaat (reception)"],
      ["Printed invitation cards", "250 → 350 guests"],
      ["Return gifts for guests", "250 → 350 guests at Bou Bhaat (reception)"],
    ]);
    // +100 plates × ₹900 twice, +48 cards × ₹150, +100 gifts × ₹200
    expect(diff.budgetDeltaPaise).toBe(rupees(90_000 + 90_000 + 7_200 + 20_000));
    expect(state.budget.totalEstimatePaise).toBe(rupees(16_47_200));
    expect(sumPaise(state.budget.lines.map((l) => l.estimatePaise))).toBe(state.budget.totalEstimatePaise);

    // Close-family functions keep their numbers; venue, décor and tattva trays don't change.
    expect(lineByLabel(state, "Gaye Holud breakfast").basis.quantity).toBe(60);
    expect(lineByLabel(state, "Tattva gift trays").estimatePaise).toBe(lineByLabel(demo, "Tattva gift trays").estimatePaise);
    expect(lineByLabel(state, "Wedding venue — banquet hall").estimatePaise).toBe(lineByLabel(demo, "Wedding venue — banquet hall").estimatePaise);
    expect(diff.changed.filter((c) => c.nodeId.startsWith("function:")).map((c) => c.label)).toEqual([
      "Biye (wedding ceremony)",
      "Bou Bhaat (reception)",
    ]);
  });

  it("flags over budget and venue capacity, and explains it", () => {
    const { diff, state } = runCascade(demo, { field: "guest_count", value: 350 }, CTX);
    expect(diff.conflicts.map((c) => [c.type, c.severity])).toEqual([
      ["over_budget", "critical"],
      ["venue_capacity", "critical"],
    ]);
    expect(state.budget.overBudgetPaise).toBe(rupees(1_47_200));
    expect(diff.explanation).toBe(
      "Guest count changed from 250 to 350. 4 budget items were recalculated (+₹2.1L). 2 conflicts need attention: over budget, venue capacity.",
    );
  });

  it("leaves the input state untouched (pure, safe for dry runs)", () => {
    const before = structuredClone(demo);
    runCascade(demo, { field: "guest_count", value: 350 }, CTX);
    expect(demo).toEqual(before);
  });

  it("never changes a locked line, and flags it", () => {
    const locked: EventPlan = {
      ...demo,
      budget: { ...demo.budget, lines: demo.budget.lines.map((l) => (l.label === "Wedding dinner — buffet" ? { ...l, locked: true } : l)) },
    };
    const { state, diff } = runCascade(locked, { field: "guest_count", value: 350 }, CTX);
    expect(lineByLabel(state, "Wedding dinner — buffet")).toEqual(lineByLabel(locked, "Wedding dinner — buffet"));
    expect(diff.changed.some((c) => c.label === "Wedding dinner — buffet")).toBe(false);
    expect(diff.conflicts).toContainEqual({
      type: "locked_item",
      severity: "info",
      message: '"Wedding dinner — buffet" is locked, so it wasn\'t changed — it would need 350 instead of 250 for 350 guests.',
    });
  });
});

describe("budget cut by 20% (₹15L → ₹12L)", () => {
  it("rescales category targets, changes no lines, and flags over budget", () => {
    const { state, diff } = runCascade(demo, { field: "budget_total", value: rupees(12_00_000) }, CTX);
    expect(diff.budgetDeltaPaise).toBe(0);
    expect(diff.changed.map((c) => c.nodeId)).toEqual(["field:budget_total"]);
    expect(state.budget.budgetTotalPaise).toBe(rupees(12_00_000));
    expect(sumPaise(Object.values(state.plan.allocationPaise ?? {}))).toBe(rupees(12_00_000));
    expect(state.budget.byCategory.catering?.allocatedPaise).toBe(rupees(4_32_000)); // 36%
    expect(state.budget.overBudgetPaise).toBe(rupees(2_40_000));
    expect(diff.conflicts[0]).toMatchObject({ type: "over_budget", severity: "critical" });
    expect(diff.explanation).toBe(
      "Budget changed from ₹15L to ₹12L. No budget items changed. Category targets were rescaled to the new budget. 1 conflict needs attention: over budget.",
    );
  });

  it("ends 'estimate for me' mode when the family sets a budget", () => {
    const estimated: EventPlan = { ...demo, answers: { ...demo.answers, budgetTotalPaise: null }, budget: { ...demo.budget, budgetIsEstimate: true } };
    const { state } = runCascade(estimated, { field: "budget_total", value: rupees(20_00_000) }, CTX);
    expect(state.budget).toMatchObject({ budgetIsEstimate: false, budgetTotalPaise: rupees(20_00_000), remainingPaise: rupees(5_60_000) });
  });
});

describe("main day moved a week later (14 → 21 Feb 2027)", () => {
  it("shifts every function and AI/KB task, with a note to check timings", () => {
    const { state, diff } = runCascade(demo, { field: "start_date", value: "2027-02-21" }, CTX);
    expect(state.plan.functions.map((f) => f.date)).toEqual(["2027-02-19", "2027-02-21", "2027-02-21", "2027-02-21", "2027-02-22", "2027-02-23"]);
    expect([state.plan.startDate, state.plan.endDate]).toEqual(["2027-02-19", "2027-02-23"]);
    expect(diff.budgetDeltaPaise).toBe(0);
    expect(diff.changed.find((c) => c.nodeId === "timeline:all")?.reason).toBe("33 tasks moved 7 days later");
    expect(diff.conflicts).toEqual([{ type: "date_note", severity: "info", message: "New date: check the timings with your priest or elders." }]);

    const before = new Map(demo.timeline.tasks.map((t) => [t.ref, t]));
    for (const t of state.timeline.tasks) {
      const b = before.get(t.ref)!;
      expect(t.idealDueDate > b.idealDueDate).toBe(true);
      expect(t.dueDate >= TODAY).toBe(true);
    }
    // The photographer booking (T-110d) was overdue; a week later it no longer is.
    expect(state.timeline.tasks.filter((t) => t.overdue)).toHaveLength(6);
  });

  it("leaves the family's own tasks where they are", () => {
    const userTask = { ...demo.timeline.tasks[10]!, ref: "my_task", title: "Call Mashi", source: "user" as const };
    const withUser: EventPlan = { ...demo, timeline: { ...demo.timeline, tasks: [...demo.timeline.tasks, userTask] } };
    const { state, diff } = runCascade(withUser, { field: "start_date", value: "2027-02-21" }, CTX);
    expect(state.timeline.tasks.find((t) => t.ref === "my_task")).toEqual(userTask);
    expect(diff.changed.find((c) => c.nodeId === "timeline:all")?.reason).toBe("33 tasks moved 7 days later; 1 of your own tasks left as they were");
  });
});

describe("city", () => {
  it("re-prices every line when the city tier changes (Kolkata → Jaipur)", () => {
    const { state, diff } = runCascade(demo, { field: "city", value: "Jaipur" }, CTX);
    expect(state).toMatchObject({ cityTier: 2, cityTierKnown: true, answers: { city: "Jaipur" } });
    expect(lineByLabel(state, "Wedding dinner — buffet").basis).toMatchObject({ unitPaise: rupees(700), cityTier: 2 });
    expect(diff.budgetDeltaPaise).toBeLessThan(0);
    // Every line is re-priced except jewellery, whose low-tier price (₹50,000) is the same in tiers 1 and 2.
    const changed = diff.changed.filter((c) => c.nodeId.startsWith("line:")).map((c) => c.label);
    expect(changed).toHaveLength(demo.budget.lines.length - 1);
    expect(changed).not.toContain("Shankha-pola and wedding jewellery additions");
  });

  it("keeps prices within the same tier (Kolkata → Mumbai)", () => {
    const { diff, state } = runCascade(demo, { field: "city", value: "Mumbai" }, CTX);
    expect(diff.budgetDeltaPaise).toBe(0);
    expect(diff.changed.map((c) => c.nodeId)).toEqual(["field:city"]);
    expect(state.answers.city).toBe("Mumbai");
  });
});

describe("no-op changes", () => {
  it("returns noop with the same state and version", () => {
    const result = runCascade(demo, { field: "guest_count", value: 250 }, CTX);
    expect(result.noop).toBe(true);
    expect(result.state).toBe(demo);
    expect(result.diff).toMatchObject({ version: 1, changed: [], explanation: "Guest count is already 250." });
  });
});

describe("estimated budgets", () => {
  it("follow the estimate, so there's no over-budget conflict", () => {
    const estimated: EventPlan = { ...demo, budget: { ...demo.budget, budgetIsEstimate: true, budgetTotalPaise: demo.budget.totalEstimatePaise } };
    const { state, diff } = runCascade(estimated, { field: "guest_count", value: 350 }, CTX);
    expect(state.budget.budgetTotalPaise).toBe(state.budget.totalEstimatePaise);
    expect(diff.conflicts.map((c) => c.type)).toEqual(["venue_capacity"]);
  });
});
