import { describe, expect, it } from "vitest";
import type { BenchmarkRow } from "@/lib/kb/pricing";
import { fitTiersToBudget, indexBenchmarks, type ProposedLine } from "@/lib/rules/budget-math";

const rupees = (r: number) => r * 100;
const row = (category: BenchmarkRow["category"], low: number, mid: number, high: number) =>
  ({
    category,
    unit: "flat",
    city_tier: 1,
    label: category,
    low_paise: rupees(low),
    mid_paise: rupees(mid),
    high_paise: rupees(high),
  }) as BenchmarkRow;

const INDEX = indexBenchmarks([row("venue", 100, 200, 400), row("decor", 50, 80, 300)]);
const flat = (category: ProposedLine["category"], unitTier: ProposedLine["basis"]["unitTier"]): ProposedLine => ({
  category,
  basis: { unit: "flat", quantity: 1, unitTier },
});
const fit = (lines: ProposedLine[], budget: number) => fitTiersToBudget(lines, INDEX, 1, rupees(budget));

describe("fitTiersToBudget", () => {
  it("changes nothing when the plan already fits", () => {
    const lines = [flat("venue", "high")];
    expect(fit(lines, 400)).toEqual({ lines, steps: [] });
  });

  it("takes the smallest step that clears the overage", () => {
    // 700 against 600: venue high→mid saves 200, décor high→mid saves 220. Both clear it.
    const { lines, steps } = fit([flat("venue", "high"), flat("decor", "high")], 600);
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({ from: "high", to: "mid" });
    expect(lines.map((l) => l.basis.unitTier)).toEqual(["mid", "high"]);
  });

  it("takes the biggest step when none clears it alone, then carries on", () => {
    // 700 against 300: décor saves 220 first, then venue 200 clears the rest.
    const { lines, steps } = fit([flat("venue", "high"), flat("decor", "high")], 300);
    expect(steps.map((s) => s.line.category)).toEqual(["decor", "venue"]);
    expect(lines.map((l) => l.basis.unitTier)).toEqual(["mid", "mid"]);
  });

  it("stops at the lowest tier if the budget still can't be met", () => {
    const { lines } = fit([flat("venue", "high"), flat("decor", "high")], 10);
    expect(lines.map((l) => l.basis.unitTier)).toEqual(["low", "low"]);
  });

  it("ignores lines with no benchmark, and doesn't change the input", () => {
    const input = [flat("music", "high"), flat("venue", "high")];
    const { lines } = fit(input, 200);
    expect(lines.map((l) => l.basis.unitTier)).toEqual(["high", "mid"]);
    expect(input[1]?.basis.unitTier).toBe("high");
  });
});
