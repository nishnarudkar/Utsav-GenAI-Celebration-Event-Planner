import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { buildEventPlan } from "@/lib/plan/build-plan";
import { basisText, buildBudgetView, dominantTier } from "@/lib/plan/budget-view";
import type { EventPlan } from "@/lib/plan/types";

const rupees = (r: number) => r * 100;
let demo: EventPlan;

beforeAll(async () => {
  vi.stubEnv("DEMO_MODE", "true");
  demo = await buildEventPlan(
    { eventType: "wedding", culture: "bengali_hindu", city: "Kolkata", startDate: "2027-02-14", guestCount: 250, budgetTotalPaise: rupees(15_00_000) },
    { today: "2026-10-29" },
  );
});
afterAll(() => {
  vi.unstubAllEnvs();
});

describe("buildBudgetView (demo wedding)", () => {
  it("lists all 12 categories, biggest first, with target and difference", () => {
    const view = buildBudgetView(demo);
    expect(view.rows).toHaveLength(12);
    expect(view.rows[0]).toMatchObject({
      category: "catering",
      label: "Catering",
      estimatePaise: rupees(5_40_000),
      allocatedPaise: rupees(5_40_000),
      deltaPaise: 0,
    });
    const venue = view.rows.find((r) => r.category === "venue");
    expect(venue?.deltaPaise).toBe(rupees(1_60_000) - rupees(1_65_000)); // ₹5,000 under target
    const estimates = view.rows.map((r) => r.estimatePaise);
    expect(estimates).toEqual([...estimates].sort((a, b) => b - a));
  });

  it("groups lines under their category, biggest first, covering every line", () => {
    const view = buildBudgetView(demo);
    const catering = view.rows.find((r) => r.category === "catering")!;
    expect(catering.lines.map((l) => l.label)).toEqual([
      "Wedding dinner — buffet",
      "Bou Bhaat feast",
      "Gaye Holud breakfast",
      "Aashirbaad lunch",
    ]);
    expect(view.rows.reduce((n, r) => n + r.lines.length, 0)).toBe(demo.budget.lines.length);
    for (const r of view.rows) expect(r.lines.reduce((s, l) => s + l.estimatePaise, 0)).toBe(r.estimatePaise);
  });

  it("carries the totals", () => {
    expect(buildBudgetView(demo)).toMatchObject({
      totalEstimatePaise: rupees(14_40_000),
      budgetTotalPaise: rupees(15_00_000),
      remainingPaise: rupees(60_000),
      overBudgetPaise: 0,
      isEstimate: false,
      unpriced: [],
    });
  });

  it("has no target difference when the budget is an estimate", () => {
    const byCategory = { venue: { allocatedPaise: null, estimatePaise: 100 } };
    const view = buildBudgetView({ budget: { ...demo.budget, byCategory, lines: [] } });
    expect(view.rows).toEqual([expect.objectContaining({ category: "venue", allocatedPaise: null, deltaPaise: null })]);
  });
});

describe("basisText", () => {
  it.each([
    [{ unit: "per_plate", quantity: 250, unitTier: "low", unitPaise: rupees(900), cityTier: 1 }, "250 plates × ₹900 · low tier · metro prices"],
    [{ unit: "per_day", quantity: 1, unitTier: "mid", unitPaise: rupees(1_20_000), cityTier: 2 }, "1 day × ₹1,20,000 · mid tier · large-city prices"],
    [{ unit: "flat", quantity: 2, unitTier: "high", unitPaise: rupees(30_000), cityTier: 3 }, "2 packages × ₹30,000 · high tier · smaller-city prices"],
    [{ unit: "per_guest", quantity: 1200, unitTier: "low", unitPaise: rupees(200), cityTier: 1 }, "1,200 guests × ₹200 · low tier · metro prices"],
    [{ unit: "per_hour", quantity: 1.5, unitTier: "mid", unitPaise: rupees(6_000), cityTier: 1 }, "1.5 hours × ₹6,000 · mid tier · metro prices"],
  ] as const)("%o", (basis, text) => {
    expect(basisText(basis)).toBe(text);
  });
});

describe("dominantTier", () => {
  const line = (category: "decor" | "venue", unitTier: "low" | "mid" | "high") =>
    ({ category, basis: { unitTier } }) as unknown as Parameters<typeof dominantTier>[0][number];

  it("picks the most used tier, the cheaper on a tie, and nothing for an empty category", () => {
    expect(dominantTier([line("decor", "high"), line("decor", "high"), line("decor", "low")], "decor")).toBe("high");
    expect(dominantTier([line("decor", "mid"), line("decor", "low")], "decor")).toBe("low");
    expect(dominantTier([line("decor", "mid")], "venue")).toBeUndefined();
  });
});
