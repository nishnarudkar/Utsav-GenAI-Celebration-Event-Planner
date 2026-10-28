import { describe, expect, it } from "vitest";
import { getPricing } from "@/lib/kb/pricing";
import { indexBenchmarks, lineEstimatePaise, resolveBudgetLines, sumPaise } from "@/lib/rules/budget-math";
import { BUDGET_CATEGORIES, type BudgetCategory, type BudgetUnit, type PriceTier } from "@/lib/schemas/enums";

/** Lints kb/pricing/vendor-benchmarks-india.json and sanity-checks it against the demo event. */

describe("vendor benchmarks", () => {
  const pricing = getPricing(); // throws if the file fails the Zod schema (incl. low ≤ mid ≤ high)
  const index = indexBenchmarks(pricing.rows); // throws on duplicate (category, unit, tier)

  it("is labelled as indicative", () => {
    expect(pricing.disclaimer.toLowerCase()).toContain("indicative");
  });

  it("covers every budget category in every city tier", () => {
    for (const category of BUDGET_CATEGORIES) {
      for (const tier of [1, 2, 3] as const) {
        expect(pricing.rows.some((r) => r.category === category && r.city_tier === tier), `${category} tier ${tier}`).toBe(true);
      }
    }
  });

  it("has every (category, unit) in all three tiers", () => {
    const combos = new Set(pricing.rows.map((r) => `${r.category}:${r.unit}`));
    for (const combo of combos) {
      for (const tier of [1, 2, 3]) expect(index.has(`${combo}:${tier}` as never), `${combo} tier ${tier}`).toBe(true);
    }
  });

  it("is not more expensive in smaller cities (mid price)", () => {
    for (const r of pricing.rows.filter((x) => x.city_tier === 1)) {
      const t2 = index.get(`${r.category}:${r.unit}:2`);
      const t3 = index.get(`${r.category}:${r.unit}:3`);
      expect(t2 && t3, `${r.category}:${r.unit}`).toBeTruthy();
      expect(t2!.mid_paise).toBeLessThanOrEqual(r.mid_paise);
      expect(t3!.mid_paise).toBeLessThanOrEqual(t2!.mid_paise);
    }
  });

  it("can fit the demo wedding (Kolkata, 250 guests, ₹15L) with sensible choices", () => {
    const guests = 250;
    const line = (category: BudgetCategory, unit: BudgetUnit, quantity: number, unitTier: PriceTier) => ({
      category,
      basis: { unit, quantity, unitTier },
    });
    const plan = [
      line("venue", "per_day", 2, "low"),
      line("catering", "per_plate", guests * 2, "low"), // wedding dinner + Bou Bhaat
      line("decor", "flat", 2, "low"),
      line("photography", "per_day", 2, "low"),
      line("photography", "flat", 1, "low"),
      line("attire", "per_item", 4, "mid"),
      line("jewelry", "flat", 1, "mid"),
      line("invites", "per_item", 100, "mid"),
      line("music", "per_hour", 6, "low"),
      line("transport", "per_day", 10, "low"),
      line("gifts", "per_guest", guests, "low"),
      line("priest", "flat", 1, "mid"),
      line("misc", "flat", 1, "mid"),
    ];
    const { lines, unpriced } = resolveBudgetLines(plan, index, 1);
    expect(unpriced).toEqual([]);
    const total = sumPaise(lines.map((l) => l.estimatePaise));
    expect(total).toBeGreaterThan(10_00_000_00); // more than ₹10L: not unrealistically cheap
    expect(total).toBeLessThanOrEqual(15_00_000_00); // fits ₹15L at low/mid tiers

    // and +100 guests (the demo's cascade) pushes catering up by a visible amount
    const cateringUnit = lines.find((l) => l.category === "catering")!.basis.unitPaise;
    expect(lineEstimatePaise(200, cateringUnit)).toBeGreaterThanOrEqual(1_00_000_00); // ≥ ₹1L more
  });
});
