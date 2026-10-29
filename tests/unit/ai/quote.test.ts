import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { draftNegotiation, extractQuote, fallbackNegotiation, type QuoteDeps } from "@/lib/ai/agents/quote";
import { AIValidationError } from "@/lib/ai/errors";
import { callStructured, defaultStructuredDeps, type CallStructuredOptions } from "@/lib/ai/structured";
import { getPricing } from "@/lib/kb/pricing";
import { analyzeQuote } from "@/lib/rules/quote-analysis";
import { NegotiationDraft, QuoteExtraction, type QuoteExtraction as Extraction } from "@/lib/schemas/quote";

const FIXTURES_DIR = path.join(process.cwd(), "tests", "fixtures", "llm");
const CTX = { category: "catering" as const, cityTier: 1 as const, benchmarkRows: getPricing().rows };
const EVENT = { guestCount: 250, eventLabel: "Bengali Hindu wedding in Kolkata" };

/** callStructured in demo mode: serves fixtures, never touches the API. */
function demoDeps(): QuoteDeps {
  const deps = defaultStructuredDeps({ DEMO_MODE: "true", DEMO_FIXTURES_DIR: FIXTURES_DIR });
  deps.createMessage = async () => {
    throw new Error("must not call the API in demo mode");
  };
  return { extract: (o) => callStructured(o, deps), negotiate: (o) => callStructured(o, deps) };
}

const SMALL: Extraction = {
  vendorName: null,
  lineItems: [{ description: "Dinner", quantity: 100, unit: "per_plate", unitPriceRupees: 2000, amountRupees: 200000 }],
  statedSubtotalRupees: null,
  statedTotalRupees: 200000,
  gst: { status: "extra", percent: null },
  hiddenCosts: [],
  missingItems: [],
  terms: [],
};

describe("extractQuote", () => {
  it("sends PDFs as document blocks and images as image blocks", async () => {
    const extract = vi.fn(async (_o: CallStructuredOptions<typeof QuoteExtraction>) => SMALL);
    const deps = { extract, negotiate: vi.fn() } as unknown as QuoteDeps;

    await extractQuote({ mediaType: "application/pdf", base64: "JVBERi0=" }, { category: "catering" }, deps);
    await extractQuote({ mediaType: "image/jpeg", base64: "/9j/" }, { category: "decor" }, deps);

    const [pdfCall, imgCall] = extract.mock.calls.map((c) => c[0]);
    expect(pdfCall).toMatchObject({ name: "emit_quote_extraction", fixtureKey: "emit_quote_extraction.catering", model: "smart" });
    const pdfContent = pdfCall?.messages[0]?.content as Array<{ type: string; source?: { media_type: string } }>;
    expect(pdfContent[0]).toMatchObject({ type: "document", source: { media_type: "application/pdf" } });
    const imgContent = imgCall?.messages[0]?.content as Array<{ type: string; text?: string; source?: { media_type: string } }>;
    expect(imgContent[0]).toMatchObject({ type: "image", source: { media_type: "image/jpeg" } });
    expect(imgContent[1]?.text).toContain("décor");
  });
});

describe("draftNegotiation", () => {
  const analysis = analyzeQuote(SMALL, CTX);
  const negotiate = (message: string) => vi.fn(async (_o: CallStructuredOptions<typeof NegotiationDraft>) => ({ message }));

  it("uses the model's message when every amount is grounded", async () => {
    const deps = { extract: vi.fn(), negotiate: negotiate("Namaste ji, could the ₹2,000 per plate come closer to ₹1,500?") } as unknown as QuoteDeps;
    expect(await draftNegotiation(analysis, EVENT, deps)).toContain("₹1,500");
  });

  it("falls back when the model invents an amount", async () => {
    const deps = { extract: vi.fn(), negotiate: negotiate("Could you do it for ₹1,700?") } as unknown as QuoteDeps;
    expect(await draftNegotiation(analysis, EVENT, deps)).toBe(fallbackNegotiation(analysis));
  });

  it("falls back when the AI call fails", async () => {
    const deps = {
      extract: vi.fn(),
      negotiate: vi.fn(async () => {
        throw new AIValidationError("emit_negotiation", "bad");
      }),
    } as unknown as QuoteDeps;
    const text = await draftNegotiation(analysis, EVENT, deps);
    expect(text).toMatch(/^Namaste Ji,/);
    expect(text).toContain("GST is extra");
  });
});

describe("demo: caterer quote end to end (no API key)", () => {
  it("extracts, analyses and drafts a grounded negotiation message", async () => {
    const deps = demoDeps();
    const extraction = await extractQuote({ mediaType: "application/pdf", base64: "JVBERi0=" }, { category: "catering" }, deps);
    const analysis = analyzeQuote(extraction, CTX);
    const message = await draftNegotiation(analysis, EVENT, deps);

    expect(analysis.flags.some((f) => f.title === "Above typical prices")).toBe(true);
    expect(message).not.toBe(fallbackNegotiation(analysis)); // the demo draft passes the amount guard
    expect(message).toContain("₹1,770");
    expect(message).toContain("live counters");
  });
});
