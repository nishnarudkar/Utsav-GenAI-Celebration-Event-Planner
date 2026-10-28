/**
 * Deterministic budget calculator (CLAUDE.md §7.1 rule 1: math is never done by the LLM).
 * All money is integer paise. Pure functions, no I/O.
 */

import type { BenchmarkRow } from "@/lib/kb/pricing";
import type { BudgetBasis } from "@/lib/schemas/budget";
import type { BudgetCategory, BudgetUnit, CityTier, PriceTier } from "@/lib/schemas/enums";

function assertPaise(value: number, what = "amount"): void {
  if (!Number.isSafeInteger(value)) throw new RangeError(`${what} must be integer paise, got ${value}`);
}

/** Sum paise values exactly; throws if any input or the total stops being a safe integer. */
export function sumPaise(values: Iterable<number>): number {
  let total = 0;
  for (const v of values) {
    assertPaise(v);
    total += v;
  }
  assertPaise(total, "total");
  return total;
}

// ---------- benchmarks ----------

export type BenchmarkKey = `${BudgetCategory}:${BudgetUnit}:${CityTier}`;
export type BenchmarkIndex = ReadonlyMap<BenchmarkKey, BenchmarkRow>;

export const benchmarkKey = (category: BudgetCategory, unit: BudgetUnit, cityTier: CityTier): BenchmarkKey =>
  `${category}:${unit}:${cityTier}`;

/** Index benchmark rows by (category, unit, city tier). Throws on duplicates. */
export function indexBenchmarks(rows: readonly BenchmarkRow[]): BenchmarkIndex {
  const index = new Map<BenchmarkKey, BenchmarkRow>();
  for (const row of rows) {
    const key = benchmarkKey(row.category, row.unit, row.city_tier);
    if (index.has(key)) throw new Error(`Duplicate benchmark for ${key}`);
    index.set(key, row);
  }
  return index;
}

const TIER_FIELD: Record<PriceTier, "low_paise" | "mid_paise" | "high_paise"> = {
  low: "low_paise",
  mid: "mid_paise",
  high: "high_paise",
};

/** Unit price for a category/unit/tier in a city tier, or null when there's no benchmark. */
export function unitPricePaise(
  index: BenchmarkIndex,
  q: { category: BudgetCategory; unit: BudgetUnit; cityTier: CityTier; tier: PriceTier },
): number | null {
  const row = index.get(benchmarkKey(q.category, q.unit, q.cityTier));
  return row ? row[TIER_FIELD[q.tier]] : null;
}

/** quantity × unit price, rounded to the nearest paisa. */
export function lineEstimatePaise(quantity: number, unitPaise: number): number {
  if (!Number.isFinite(quantity) || quantity <= 0) throw new RangeError(`quantity must be positive, got ${quantity}`);
  assertPaise(unitPaise, "unit price");
  const estimate = Math.round(quantity * unitPaise);
  assertPaise(estimate, "estimate");
  return estimate;
}

// ---------- resolving AI proposals ----------

export interface ProposedLine {
  category: BudgetCategory;
  basis: BudgetBasis;
}

/** The persisted basis: the AI's choice plus the price code looked up, so "Why?" can show the working. */
export interface ResolvedBasis extends BudgetBasis {
  unitPaise: number;
  cityTier: CityTier;
}

export type ResolvedLine<T extends ProposedLine> = Omit<T, "basis"> & {
  basis: ResolvedBasis;
  estimatePaise: number;
};

/**
 * Price every proposed line from benchmarks. Lines with no matching benchmark are returned
 * in `unpriced` (the UI asks for a quote) instead of guessing a number.
 */
export function resolveBudgetLines<T extends ProposedLine>(
  proposals: readonly T[],
  index: BenchmarkIndex,
  cityTier: CityTier,
): { lines: ResolvedLine<T>[]; unpriced: T[] } {
  const lines: ResolvedLine<T>[] = [];
  const unpriced: T[] = [];
  for (const p of proposals) {
    const unitPaise = unitPricePaise(index, { category: p.category, unit: p.basis.unit, cityTier, tier: p.basis.unitTier });
    if (unitPaise === null) {
      unpriced.push(p);
      continue;
    }
    lines.push({
      ...p,
      basis: { ...p.basis, unitPaise, cityTier },
      estimatePaise: lineEstimatePaise(p.basis.quantity, unitPaise),
    });
  }
  return { lines, unpriced };
}

// ---------- allocation ----------

/**
 * Split a total across categories by weight (e.g. the Planner's allocation %), in whole paise,
 * summing exactly to the total. Uses largest-remainder rounding; weights need not sum to 100.
 */
export function allocateByWeight<K extends string>(totalPaise: number, weights: Readonly<Partial<Record<K, number>>>): Record<K, number> {
  assertPaise(totalPaise, "total");
  if (totalPaise < 0) throw new RangeError("total must be non-negative");
  const entries = (Object.entries(weights) as Array<[K, number | undefined]>).filter(
    (e): e is [K, number] => e[1] !== undefined,
  );
  for (const [k, w] of entries) if (!Number.isFinite(w) || w < 0) throw new RangeError(`invalid weight for ${k}: ${w}`);
  const weightSum = entries.reduce((s, [, w]) => s + w, 0);
  if (weightSum <= 0) throw new RangeError("weights must sum to more than 0");

  const shares = entries.map(([k, w]) => {
    const exact = (totalPaise * w) / weightSum;
    return { k, floor: Math.floor(exact), frac: exact - Math.floor(exact) };
  });
  let leftover = totalPaise - shares.reduce((s, x) => s + x.floor, 0);
  // Hand out remaining paise by largest fractional part; ties broken by input order.
  const order = shares.map((_, i) => i).sort((a, b) => (shares[b]?.frac ?? 0) - (shares[a]?.frac ?? 0) || a - b);
  for (const i of order) {
    if (leftover <= 0) break;
    const s = shares[i];
    if (s) s.floor += 1;
    leftover--;
  }
  return Object.fromEntries(shares.map((s) => [s.k, s.floor])) as Record<K, number>;
}

// ---------- taxes ----------

/**
 * GST on an amount at `ratePercent` (e.g. 18), rounded to the nearest paisa.
 * Rates depend on the service; callers pass the rate (shown on the quote or set by the user).
 */
export function gstPaise(amountPaise: number, ratePercent: number): number {
  assertPaise(amountPaise);
  if (!Number.isFinite(ratePercent) || ratePercent < 0 || ratePercent > 100) {
    throw new RangeError(`invalid GST rate ${ratePercent}`);
  }
  // Scale the rate to basis points so the product stays integral before one rounding step.
  const bps = Math.round(ratePercent * 100);
  return Math.round((amountPaise * bps) / 10_000);
}

// ---------- summary ----------

export interface BudgetLineAmounts {
  category: BudgetCategory;
  estimatePaise: number;
  quotedPaise?: number | null;
  actualPaise?: number | null;
}

/** Best current figure for a line: actual spend, else the vendor quote, else the estimate. */
export const committedPaise = (l: BudgetLineAmounts): number => l.actualPaise ?? l.quotedPaise ?? l.estimatePaise;

export interface BudgetSummary {
  totalBudgetPaise: number;
  committedPaise: number;
  byCategory: Partial<Record<BudgetCategory, number>>;
  /** Budget left (0 when over budget). */
  remainingPaise: number;
  /** How far over budget (0 when within). */
  overBudgetPaise: number;
}

export function summarizeBudget(lines: readonly BudgetLineAmounts[], totalBudgetPaise: number): BudgetSummary {
  assertPaise(totalBudgetPaise, "budget");
  const byCategory: Partial<Record<BudgetCategory, number>> = {};
  for (const l of lines) byCategory[l.category] = sumPaise([byCategory[l.category] ?? 0, committedPaise(l)]);
  const committed = sumPaise(lines.map(committedPaise));
  const diff = totalBudgetPaise - committed;
  return {
    totalBudgetPaise,
    committedPaise: committed,
    byCategory,
    remainingPaise: Math.max(0, diff),
    overBudgetPaise: Math.max(0, -diff),
  };
}
