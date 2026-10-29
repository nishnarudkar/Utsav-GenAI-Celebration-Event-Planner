/**
 * Deterministic analysis of an extracted vendor quote (CLAUDE.md §7.1 rule 1).
 * Checks arithmetic, compares rates with city benchmarks, and collects flags.
 */

import { formatINR, formatINRCompact, rupeesToPaise } from "@/lib/format";
import type { BenchmarkRow } from "@/lib/kb/pricing";
import { gstPaise, indexBenchmarks, sumPaise } from "@/lib/rules/budget-math";
import type { BudgetCategory, BudgetUnit, CityTier } from "@/lib/schemas/enums";
import type { QuoteExtraction, QuoteLineItem } from "@/lib/schemas/quote";

/** A unit price this far above the city's mid benchmark gets flagged. */
export const ABOVE_BENCHMARK_FLAG = 0.15;
/** Tolerance for rounding on printed quotes, in paise (₹1). */
const ROUNDING_PAISE = 100;

export interface AnalyzedLine extends QuoteLineItem {
  unitPricePaise: number | null;
  /** Printed amount, or quantity × unit price when only those are printed. */
  amountPaise: number | null;
  /** false when quantity × unit price doesn't match the printed amount. */
  arithmeticOk: boolean | null;
  benchmark?: { midPaise: number; highPaise: number; diffPercent: number; label: string };
}

export interface QuoteFlag {
  id: string;
  severity: "info" | "warn" | "critical";
  title: string;
  detail: string;
}

export interface QuoteAnalysis {
  category: BudgetCategory;
  vendorName: string | null;
  lines: AnalyzedLine[];
  /** Sum of line amounts that have one. */
  computedSubtotalPaise: number;
  statedTotalPaise: number | null;
  /** stated − computed, when a total is printed and differs. */
  totalMismatchPaise: number | null;
  /** Lines with no price ("as per actuals", "extra"). */
  unpricedLines: number;
  gst: { status: QuoteExtraction["gst"]["status"]; percent: number | null; amountPaise: number | null };
  /** Best known total: stated or computed, plus GST when it's extra at a known rate. */
  totalWithGstPaise: number;
  flags: QuoteFlag[];
  terms: string[];
}

const BENCHMARKED_UNITS: ReadonlySet<BudgetUnit> = new Set(["per_plate", "per_guest", "per_day", "per_hour", "per_item"]);

export function analyzeQuote(
  extraction: QuoteExtraction,
  ctx: { category: BudgetCategory; cityTier: CityTier; benchmarkRows: readonly BenchmarkRow[] },
): QuoteAnalysis {
  const index = indexBenchmarks(ctx.benchmarkRows);
  const flags: QuoteFlag[] = [];

  const lines: AnalyzedLine[] = extraction.lineItems.map((item) => {
    const unitPricePaise = item.unitPriceRupees === null ? null : rupeesToPaise(item.unitPriceRupees);
    const printed = item.amountRupees === null ? null : rupeesToPaise(item.amountRupees);
    const product = unitPricePaise !== null && item.quantity !== null ? Math.round(unitPricePaise * item.quantity) : null;
    const arithmeticOk = printed !== null && product !== null ? Math.abs(printed - product) <= ROUNDING_PAISE : null;

    let benchmark: AnalyzedLine["benchmark"];
    if (unitPricePaise !== null && item.unit !== "other" && BENCHMARKED_UNITS.has(item.unit)) {
      const row = index.get(`${ctx.category}:${item.unit}:${ctx.cityTier}`);
      if (row && row.mid_paise > 0) {
        benchmark = {
          midPaise: row.mid_paise,
          highPaise: row.high_paise,
          diffPercent: Math.round(((unitPricePaise - row.mid_paise) / row.mid_paise) * 100),
          label: row.label,
        };
      }
    }
    return { ...item, unitPricePaise, amountPaise: printed ?? product, arithmeticOk, ...(benchmark ? { benchmark } : {}) };
  });

  // Arithmetic per line.
  for (const l of lines) {
    if (l.arithmeticOk === false) {
      flags.push({
        id: `math:${l.description}`,
        severity: "critical",
        title: "Line doesn't add up",
        detail: `“${l.description}”: ${l.quantity} × ${formatINR(l.unitPricePaise!)} is ${formatINR(Math.round(l.unitPricePaise! * l.quantity!))}, but the quote says ${formatINR(rupeesToPaise(l.amountRupees!))}.`,
      });
    }
  }

  // Total vs sum of lines.
  const computedSubtotalPaise = sumPaise(lines.flatMap((l) => (l.amountPaise === null ? [] : [l.amountPaise])));
  const statedRupees = extraction.statedTotalRupees ?? extraction.statedSubtotalRupees;
  const statedTotalPaise = statedRupees === null ? null : rupeesToPaise(statedRupees);
  const totalMismatchPaise =
    statedTotalPaise !== null && extraction.gst.status !== "included" && Math.abs(statedTotalPaise - computedSubtotalPaise) > ROUNDING_PAISE
      ? statedTotalPaise - computedSubtotalPaise
      : null;
  if (totalMismatchPaise !== null) {
    flags.push({
      id: "total_mismatch",
      severity: "critical",
      title: "Total doesn't match the items",
      detail: `The items add up to ${formatINR(computedSubtotalPaise)}, but the quote's total is ${formatINR(statedTotalPaise!)}.`,
    });
  }

  // Unpriced lines.
  const unpriced = lines.filter((l) => l.amountPaise === null);
  for (const l of unpriced) {
    flags.push({ id: `unpriced:${l.description}`, severity: "warn", title: "No price given", detail: `“${l.description}” has no price — ask for a fixed amount.` });
  }

  // GST.
  const base = statedTotalPaise ?? computedSubtotalPaise;
  let gstAmount: number | null = null;
  if (extraction.gst.status === "extra") {
    if (extraction.gst.percent !== null) gstAmount = gstPaise(base, extraction.gst.percent);
    flags.push({
      id: "gst_extra",
      severity: "warn",
      title: "GST not included",
      detail:
        gstAmount !== null
          ? `GST at ${extraction.gst.percent}% adds ${formatINR(gstAmount)} on top.`
          : "The quote says GST is extra but doesn't state the rate — ask which rate applies.",
    });
  } else if (extraction.gst.status === "not_mentioned") {
    flags.push({ id: "gst_unclear", severity: "warn", title: "GST not mentioned", detail: "Ask whether the prices include GST." });
  }

  // Benchmarks.
  for (const l of lines) {
    if (l.benchmark && l.benchmark.diffPercent > ABOVE_BENCHMARK_FLAG * 100) {
      flags.push({
        id: `benchmark:${l.description}`,
        severity: "warn",
        title: "Above typical prices",
        detail: `“${l.description}” at ${formatINR(l.unitPricePaise!)} is ${l.benchmark.diffPercent}% above the typical ${formatINR(l.benchmark.midPaise)} in this city (indicative).`,
      });
    }
  }

  // Hidden costs and missing items from the model's reading of the document.
  extraction.hiddenCosts.forEach((h, i) =>
    flags.push({ id: `hidden:${i}`, severity: "warn", title: "Possible hidden cost", detail: `“${h.quote}” — ${h.concern}` }),
  );
  extraction.missingItems.forEach((m, i) => flags.push({ id: `missing:${i}`, severity: "info", title: `Not mentioned: ${m.item}`, detail: m.why }));

  const rank = { critical: 0, warn: 1, info: 2 } as const;
  return {
    category: ctx.category,
    vendorName: extraction.vendorName,
    lines,
    computedSubtotalPaise,
    statedTotalPaise,
    totalMismatchPaise,
    unpricedLines: unpriced.length,
    gst: { status: extraction.gst.status, percent: extraction.gst.percent, amountPaise: gstAmount },
    totalWithGstPaise: base + (gstAmount ?? 0),
    flags: flags.map((f, i) => ({ f, i })).sort((a, b) => rank[a.f.severity] - rank[b.f.severity] || a.i - b.i).map(({ f }) => f),
    terms: extraction.terms,
  };
}

/** Facts for the negotiation message, every amount pre-formatted (the model never computes). */
export function negotiationFacts(a: QuoteAnalysis, ctx: { guestCount: number; eventLabel: string }): string {
  const priced = a.lines.filter((l) => l.amountPaise !== null);
  const above = a.lines.filter((l) => l.benchmark && l.benchmark.diffPercent > ABOVE_BENCHMARK_FLAG * 100);
  return [
    `Event: ${ctx.eventLabel}, about ${ctx.guestCount} guests.`,
    `Vendor: ${a.vendorName ?? "the vendor"}.`,
    `Quoted total: ${formatINR(a.statedTotalPaise ?? a.computedSubtotalPaise)} (${formatINRCompact(a.statedTotalPaise ?? a.computedSubtotalPaise)}).`,
    `Items: ${priced.map((l) => `${l.description} ${l.amountPaise === null ? "" : formatINR(l.amountPaise)}`).join("; ")}.`,
    above.length
      ? `Above typical city rates: ${above.map((l) => `${l.description} at ${formatINR(l.unitPricePaise!)} vs typical ${formatINR(l.benchmark!.midPaise)} (${l.benchmark!.diffPercent}% higher)`).join("; ")}.`
      : "Rates are within typical city ranges.",
    `Questions to raise: ${a.flags.filter((f) => f.severity !== "info").map((f) => f.detail).join(" ") || "none"}`,
    a.flags.some((f) => f.severity === "info") ? `Not mentioned in the quote: ${a.flags.filter((f) => f.severity === "info").map((f) => f.title.replace("Not mentioned: ", "")).join(", ")}.` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
