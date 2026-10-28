import { describe, expect, it } from "vitest";
import type { BenchmarkRow } from "@/lib/kb/pricing";
import {
  allocateByWeight,
  benchmarkKey,
  committedPaise,
  gstPaise,
  indexBenchmarks,
  lineEstimatePaise,
  resolveBudgetLines,
  sumPaise,
  summarizeBudget,
  unitPricePaise,
} from "@/lib/rules/budget-math";

const rupees = (r: number) => r * 100;

const ROWS: BenchmarkRow[] = [
  { category: "catering", unit: "per_plate", city_tier: 1, low_paise: rupees(900), mid_paise: rupees(1500), high_paise: rupees(2800), label: "plate" },
  { category: "catering", unit: "per_plate", city_tier: 2, low_paise: rupees(700), mid_paise: rupees(1200), high_paise: rupees(2200), label: "plate" },
  { category: "venue", unit: "per_day", city_tier: 1, low_paise: rupees(80_000), mid_paise: rupees(2_00_000), high_paise: rupees(6_00_000), label: "hall" },
];
const index = indexBenchmarks(ROWS);

describe("sumPaise", () => {
  it("sums integers exactly", () => {
    expect(sumPaise([rupees(1_50_000), rupees(2_500), 1])).toBe(rupees(1_52_500) + 1);
    expect(sumPaise([])).toBe(0);
  });

  it("rejects fractional paise", () => {
    expect(() => sumPaise([100, 0.5])).toThrow(RangeError);
  });
});

describe("benchmarks", () => {
  it("looks up unit prices by category, unit, city tier and price tier", () => {
    expect(unitPricePaise(index, { category: "catering", unit: "per_plate", cityTier: 1, tier: "mid" })).toBe(rupees(1500));
    expect(unitPricePaise(index, { category: "catering", unit: "per_plate", cityTier: 2, tier: "low" })).toBe(rupees(700));
  });

  it("returns null when no benchmark exists", () => {
    expect(unitPricePaise(index, { category: "venue", unit: "per_day", cityTier: 3, tier: "mid" })).toBeNull();
    expect(unitPricePaise(index, { category: "music", unit: "per_hour", cityTier: 1, tier: "mid" })).toBeNull();
  });

  it("rejects duplicate benchmark rows", () => {
    expect(() => indexBenchmarks([ROWS[0]!, ROWS[0]!])).toThrow(/Duplicate benchmark for catering:per_plate:1/);
  });

  it("builds stable keys", () => {
    expect(benchmarkKey("decor", "flat", 3)).toBe("decor:flat:3");
  });
});

describe("lineEstimatePaise", () => {
  it("multiplies quantity by unit price", () => {
    expect(lineEstimatePaise(250, rupees(1500))).toBe(rupees(3_75_000));
  });

  it("rounds fractional quantities to the nearest paisa", () => {
    expect(lineEstimatePaise(1.5, rupees(2_00_000))).toBe(rupees(3_00_000));
    expect(lineEstimatePaise(1 / 3, 100)).toBe(33);
  });

  it("rejects non-positive quantities", () => {
    expect(() => lineEstimatePaise(0, 100)).toThrow(RangeError);
    expect(() => lineEstimatePaise(-2, 100)).toThrow(RangeError);
    expect(() => lineEstimatePaise(Number.NaN, 100)).toThrow(RangeError);
  });
});

describe("resolveBudgetLines", () => {
  it("prices proposals and records the working in the basis", () => {
    const proposals = [
      { category: "catering" as const, label: "Wedding dinner", basis: { unit: "per_plate" as const, quantity: 250, unitTier: "mid" as const } },
      { category: "venue" as const, label: "Banquet hall", basis: { unit: "per_day" as const, quantity: 2, unitTier: "low" as const } },
    ];
    const { lines, unpriced } = resolveBudgetLines(proposals, index, 1);

    expect(unpriced).toEqual([]);
    expect(lines).toEqual([
      {
        category: "catering",
        label: "Wedding dinner",
        basis: { unit: "per_plate", quantity: 250, unitTier: "mid", unitPaise: rupees(1500), cityTier: 1 },
        estimatePaise: rupees(3_75_000),
      },
      {
        category: "venue",
        label: "Banquet hall",
        basis: { unit: "per_day", quantity: 2, unitTier: "low", unitPaise: rupees(80_000), cityTier: 1 },
        estimatePaise: rupees(1_60_000),
      },
    ]);
  });

  it("returns lines without a benchmark as unpriced instead of guessing", () => {
    const music = { category: "music" as const, basis: { unit: "per_hour" as const, quantity: 4, unitTier: "mid" as const } };
    const { lines, unpriced } = resolveBudgetLines([music], index, 1);
    expect(lines).toEqual([]);
    expect(unpriced).toEqual([music]);
  });
});

describe("allocateByWeight", () => {
  it("splits exactly, summing to the total", () => {
    const alloc = allocateByWeight(rupees(15_00_000), { catering: 40, venue: 20, decor: 15, photography: 10, misc: 15 });
    expect(alloc).toEqual({
      catering: rupees(6_00_000),
      venue: rupees(3_00_000),
      decor: rupees(2_25_000),
      photography: rupees(1_50_000),
      misc: rupees(2_25_000),
    });
  });

  it("distributes leftover paise by largest remainder", () => {
    const alloc = allocateByWeight(100, { a: 1, b: 1, c: 1 });
    expect(alloc).toEqual({ a: 34, b: 33, c: 33 });
    expect(sumPaise(Object.values(alloc))).toBe(100);
  });

  it("normalises weights that don't sum to 100", () => {
    const alloc = allocateByWeight(rupees(1_000), { catering: 3, venue: 1 });
    expect(alloc).toEqual({ catering: rupees(750), venue: rupees(250) });
  });

  it("always sums to the total for awkward inputs", () => {
    const weights = { a: 13.3, b: 7.7, c: 41.1, d: 0.9, e: 37 };
    for (const total of [1, 7, 999, 1_50_00_001, 12_34_56_789]) {
      expect(sumPaise(Object.values(allocateByWeight(total, weights)))).toBe(total);
    }
  });

  it("skips undefined weights and rejects invalid ones", () => {
    expect(allocateByWeight(100, { a: 1, b: undefined })).toEqual({ a: 100 });
    expect(() => allocateByWeight(100, { a: -1 })).toThrow(RangeError);
    expect(() => allocateByWeight(100, { a: 0 })).toThrow(RangeError);
    expect(() => allocateByWeight(100.5, { a: 1 })).toThrow(RangeError);
  });
});

describe("gstPaise", () => {
  it("computes GST in whole paise", () => {
    expect(gstPaise(rupees(1_00_000), 18)).toBe(rupees(18_000));
    expect(gstPaise(rupees(3_75_000), 5)).toBe(rupees(18_750));
    expect(gstPaise(333, 18)).toBe(60); // 59.94 → 60
    expect(gstPaise(rupees(1000), 0)).toBe(0);
  });

  it("rejects invalid rates", () => {
    expect(() => gstPaise(100, -1)).toThrow(RangeError);
    expect(() => gstPaise(100, 101)).toThrow(RangeError);
  });
});

describe("summarizeBudget", () => {
  const lines = [
    { category: "catering" as const, estimatePaise: rupees(6_00_000), quotedPaise: rupees(6_80_000) },
    { category: "catering" as const, estimatePaise: rupees(50_000) },
    { category: "venue" as const, estimatePaise: rupees(3_00_000), quotedPaise: rupees(3_20_000), actualPaise: rupees(3_10_000) },
  ];

  it("uses actual, then quoted, then estimate", () => {
    expect(lines.map(committedPaise)).toEqual([rupees(6_80_000), rupees(50_000), rupees(3_10_000)]);
  });

  it("totals by category and reports what's left", () => {
    expect(summarizeBudget(lines, rupees(15_00_000))).toEqual({
      totalBudgetPaise: rupees(15_00_000),
      committedPaise: rupees(10_40_000),
      byCategory: { catering: rupees(7_30_000), venue: rupees(3_10_000) },
      remainingPaise: rupees(4_60_000),
      overBudgetPaise: 0,
    });
  });

  it("reports how far over budget", () => {
    const s = summarizeBudget(lines, rupees(10_00_000));
    expect(s.overBudgetPaise).toBe(rupees(40_000));
    expect(s.remainingPaise).toBe(0);
  });
});
