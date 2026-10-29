import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { buildEventPlan } from "@/lib/plan/build-plan";
import { DONUT_CATEGORIES, detectIssues, donutSlices, summarizeDashboard } from "@/lib/plan/dashboard";
import type { EventPlan } from "@/lib/plan/types";

const TODAY = "2026-10-29";
const rupees = (r: number) => r * 100;

let demo: EventPlan;

beforeAll(async () => {
  vi.stubEnv("DEMO_MODE", "true");
  demo = await buildEventPlan(
    { eventType: "wedding", culture: "bengali_hindu", city: "Kolkata", startDate: "2027-02-14", guestCount: 250, budgetTotalPaise: rupees(15_00_000) },
    { today: TODAY },
  );
});
afterAll(() => {
  vi.unstubAllEnvs();
});

describe("summarizeDashboard (demo wedding)", () => {
  it("fills the four top cards", () => {
    const s = summarizeDashboard(demo, TODAY);
    expect(s.daysToGo).toBe(108);
    expect(s.budget).toEqual({ committedPaise: rupees(14_40_000), totalPaise: rupees(15_00_000), isEstimate: false, percentUsed: 96, overBudgetPaise: 0 });
    expect(s.tasks).toEqual({ done: 0, total: 33, dueNow: 7 });
    expect(s.openIssueCount).toBe(0);
    expect(s.issues).toEqual([]);
  });

  it("lists the next five tasks, earliest first", () => {
    const s = summarizeDashboard(demo, TODAY);
    expect(s.nextTasks).toHaveLength(5);
    expect(s.nextTasks.every((t) => t.dueDate === TODAY)).toBe(true);
    expect(s.nextTasks[0]?.ref).toBe("confirm_lagna");
  });
});

describe("donutSlices", () => {
  it("gives the five fixed categories their own slice and folds the rest into Other", () => {
    const slices = donutSlices(demo);
    expect(slices.map((s) => s.key)).toEqual([...DONUT_CATEGORIES, "other"]);
    expect(slices.find((s) => s.key === "catering")).toMatchObject({ paise: rupees(5_40_000), percent: 37.5, label: "Catering" });
    const other = slices.find((s) => s.key === "other");
    expect(other?.members).toEqual(["Gifts", "Music", "Jewellery", "Priest & rituals", "Transport", "Miscellaneous", "Invitations"]);
    expect(slices.reduce((s, x) => s + x.paise, 0)).toBe(rupees(14_40_000));
  });

  it("keeps each category's slot when amounts change (colour follows the entity)", () => {
    const bigJewellery: EventPlan = {
      ...demo,
      budget: { ...demo.budget, byCategory: { ...demo.budget.byCategory, jewelry: { allocatedPaise: null, estimatePaise: rupees(50_00_000) } } },
    };
    expect(donutSlices(bigJewellery).map((s) => s.key)).toEqual([...DONUT_CATEGORIES, "other"]);
  });

  it("skips empty categories and returns nothing when there's no priced total", () => {
    const onlyVenue = { budget: { ...demo.budget, byCategory: { venue: { allocatedPaise: null, estimatePaise: 100 } } } };
    expect(donutSlices(onlyVenue).map((s) => [s.key, s.percent])).toEqual([["venue", 100]]);
    expect(donutSlices({ budget: { ...demo.budget, byCategory: {} } })).toEqual([]);
  });
});

describe("detectIssues", () => {
  it("flags over budget as critical", () => {
    const issues = detectIssues({ ...demo, budget: { ...demo.budget, overBudgetPaise: rupees(2_10_000) } });
    expect(issues).toEqual([expect.objectContaining({ id: "over_budget", severity: "critical" })]);
  });

  it("flags unpriced lines, unplaced rituals and low-confidence rituals as warnings", () => {
    const unpriced = { category: "music" as const, label: "Dhol player", basis: { unit: "per_hour" as const, quantity: 2, unitTier: "mid" as const }, rationale: "" };
    const issues = detectIssues({
      ...demo,
      budget: { ...demo.budget, unpriced: [unpriced] },
      plan: { ...demo.plan, unassignedRitualKeys: ["kaal_ratri"] },
      rituals: { ...demo.rituals, confidence: "low" },
    });
    expect(issues.map((i) => [i.id, i.severity])).toEqual([
      ["unpriced", "warn"],
      ["unassigned_rituals", "warn"],
      ["ritual_confidence", "warn"],
    ]);
    expect(issues[0]?.title).toBe("1 item needs a quote");
  });

  it("notes an unknown city as info, which doesn't count as an open conflict", () => {
    const plan = { ...demo, cityTierKnown: false };
    expect(detectIssues(plan)).toEqual([expect.objectContaining({ id: "city_tier", severity: "info" })]);
    expect(summarizeDashboard(plan, TODAY).openIssueCount).toBe(0);
  });
});

describe("estimated budgets", () => {
  it("reports the estimate without a percentage of a budget", () => {
    const s = summarizeDashboard({ ...demo, budget: { ...demo.budget, budgetIsEstimate: true, budgetTotalPaise: demo.budget.totalEstimatePaise } }, TODAY);
    expect(s.budget).toMatchObject({ isEstimate: true, percentUsed: 100 });
  });
});
