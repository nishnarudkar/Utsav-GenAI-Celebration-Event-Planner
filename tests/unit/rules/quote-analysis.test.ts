import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getPricing } from "@/lib/kb/pricing";
import { analyzeQuote, negotiationFacts } from "@/lib/rules/quote-analysis";
import { QuoteExtraction } from "@/lib/schemas/quote";

const rupees = (r: number) => r * 100;
const DEMO = QuoteExtraction.parse(JSON.parse(readFileSync(path.join(process.cwd(), "tests/fixtures/llm/emit_quote_extraction.catering.json"), "utf8")));
const CTX = { category: "catering" as const, cityTier: 1 as const, benchmarkRows: getPricing().rows };

describe("analyzeQuote (demo caterer quote, Kolkata)", () => {
  const a = analyzeQuote(DEMO, CTX);

  it("checks each line and the total", () => {
    expect(a.lines.map((l) => [l.amountPaise, l.arithmeticOk])).toEqual([
      [rupees(4_42_500), true],
      [rupees(16_000), true],
      [0, null],
      [null, null],
      [rupees(8_500), true],
    ]);
    expect(a.computedSubtotalPaise).toBe(rupees(4_67_000));
    expect(a.statedTotalPaise).toBe(rupees(4_67_000));
    expect(a.totalMismatchPaise).toBeNull();
    expect(a.unpricedLines).toBe(1);
  });

  it("compares the per-plate rate with the city benchmark (18% above mid)", () => {
    expect(a.lines[0]?.benchmark).toMatchObject({ midPaise: rupees(1_500), diffPercent: 18 });
    expect(a.lines[1]?.benchmark).toBeUndefined(); // "other" units aren't benchmarked
  });

  it("flags GST, live counters, hidden costs, the rate, and missing items", () => {
    expect(a.flags.map((f) => [f.severity, f.title])).toEqual([
      ["warn", "No price given"],
      ["warn", "GST not included"],
      ["warn", "Above typical prices"],
      ["warn", "Possible hidden cost"],
      ["warn", "Possible hidden cost"],
      ["info", "Not mentioned: Packaged drinking water"],
      ["info", "Not mentioned: Welcome drinks"],
    ]);
    expect(a.flags.find((f) => f.id === "gst_extra")?.detail).toBe("The quote says GST is extra but doesn't state the rate — ask which rate applies.");
    expect(a.gst.amountPaise).toBeNull();
    expect(a.totalWithGstPaise).toBe(rupees(4_67_000));
  });
});

describe("analyzeQuote edge cases", () => {
  const base: QuoteExtraction = { ...DEMO, hiddenCosts: [], missingItems: [], gst: { status: "included", percent: null } };

  it("catches a line whose amount doesn't match quantity × rate", () => {
    const wrong = { ...base, lineItems: [{ description: "Dinner", quantity: 250, unit: "per_plate" as const, unitPriceRupees: 1200, amountRupees: 320000 }] };
    const a = analyzeQuote({ ...wrong, statedTotalRupees: null, statedSubtotalRupees: null }, CTX);
    expect(a.flags[0]).toMatchObject({ severity: "critical", title: "Line doesn't add up" });
    expect(a.flags[0]?.detail).toBe("“Dinner”: 250 × ₹1,200 is ₹3,00,000, but the quote says ₹3,20,000.");
  });

  it("catches a total that doesn't match the items", () => {
    const a = analyzeQuote({ ...base, gst: { status: "not_mentioned", percent: null }, statedTotalRupees: 480000 }, CTX);
    expect(a.totalMismatchPaise).toBe(rupees(13_000));
    expect(a.flags.map((f) => f.id)).toContain("total_mismatch");
    expect(a.flags.map((f) => f.id)).toContain("gst_unclear");
  });

  it("adds GST when the rate is printed", () => {
    const a = analyzeQuote({ ...base, gst: { status: "extra", percent: 18 } }, CTX);
    expect(a.gst.amountPaise).toBe(rupees(84_060));
    expect(a.totalWithGstPaise).toBe(rupees(5_51_060));
    expect(a.flags.find((f) => f.id === "gst_extra")?.detail).toBe("GST at 18% adds ₹84,060 on top.");
  });

  it("fills a missing line amount from quantity × rate", () => {
    const a = analyzeQuote({ ...base, lineItems: [{ description: "Snacks", quantity: 100, unit: "per_plate", unitPriceRupees: 300, amountRupees: null }], statedTotalRupees: null, statedSubtotalRupees: null }, CTX);
    expect(a.lines[0]?.amountPaise).toBe(rupees(30_000));
    expect(a.unpricedLines).toBe(0);
  });
});

describe("negotiationFacts", () => {
  it("pre-formats every amount the message may use", () => {
    const facts = negotiationFacts(analyzeQuote(DEMO, CTX), { guestCount: 250, eventLabel: "Bengali Hindu wedding in Kolkata" });
    expect(facts).toContain("Quoted total: ₹4,67,000 (₹4.7L).");
    expect(facts).toContain("at ₹1,770 vs typical ₹1,500 (18% higher)");
    expect(facts).toContain("₹5,000 per hour");
    expect(facts).toContain("Not mentioned in the quote: Packaged drinking water, Welcome drinks.");
  });
});
