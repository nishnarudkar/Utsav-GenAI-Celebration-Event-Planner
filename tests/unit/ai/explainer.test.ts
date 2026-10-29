import { describe, expect, it, vi } from "vitest";
import { amountsAreGrounded, explainChange, explainerFacts, Explanation, type ExplainInput } from "@/lib/ai/agents/explainer";
import { AIValidationError } from "@/lib/ai/errors";
import type { CallStructuredOptions } from "@/lib/ai/structured";

const rupees = (r: number) => r * 100;

const INPUT: ExplainInput = {
  trigger: { field: "guest_count", value: 350, from: 250 },
  diff: {
    version: 2,
    budgetDeltaPaise: rupees(2_07_200),
    changed: [{ nodeId: "line:0", label: "Wedding dinner — buffet", from: {}, to: {}, reason: "250 → 350 guests at Biye" }],
    added: [],
    removed: [],
    conflicts: [{ type: "over_budget", severity: "critical", message: "Over budget by ₹1.5L (estimate ₹16.5L vs budget ₹15L)." }],
    recoveryOptions: [{ id: "tier:attire", title: "Choose budget-friendly attire options", savesPaise: rupees(93_000), impact: "Saves ₹93K — covers 63% of the ₹1.5L overrun.", patch: {} }],
    explanation: "Guest count changed from 250 to 350. 4 budget items were recalculated (+₹2.1L). 1 conflict needs attention: over budget.",
  },
  totalEstimatePaise: rupees(16_47_200),
  budgetTotalPaise: rupees(15_00_000),
  overBudgetPaise: rupees(1_47_200),
};

const fake = (explanation: string) => vi.fn(async (_o: CallStructuredOptions<typeof Explanation>) => ({ explanation }));

describe("explainerFacts", () => {
  it("gives the model every amount pre-formatted", () => {
    const facts = explainerFacts(INPUT);
    expect(facts).toContain("Change: guest count from 250 to 350.");
    expect(facts).toContain("Cost change: +₹2.1L. New estimate: ₹16.5L. Budget: ₹15L.");
    expect(facts).toContain("Over budget by ₹1.5L.");
    expect(facts).toContain('"Choose budget-friendly attire options" — Saves ₹93K');
  });
});

describe("amountsAreGrounded", () => {
  const facts = explainerFacts(INPUT);
  it("accepts amounts from the facts, with or without a sign", () => {
    expect(amountsAreGrounded("Costs rose by ₹2.1L; you're ₹1.5L over, and outfits could save ₹93K.", facts)).toBe(true);
    expect(amountsAreGrounded("No amounts here.", facts)).toBe(true);
  });
  it("rejects invented or recalculated amounts", () => {
    expect(amountsAreGrounded("That's about ₹2L more.", facts)).toBe(false);
    expect(amountsAreGrounded("Saving ₹1,47,200 would fix it.", facts)).toBe(false);
  });
});

describe("explainChange", () => {
  it("uses the fast model's wording when it's grounded", async () => {
    const structured = fake("Adding 100 guests raised the estimate by ₹2.1L. You're now ₹1.5L over budget; budget-friendly outfits would save ₹93K.");
    const text = await explainChange(INPUT, { structured });
    expect(text).toContain("₹93K");
    expect(structured.mock.calls[0]?.[0]).toMatchObject({ name: "emit_explanation", fixtureKey: "emit_explanation.guest_count", model: "fast" });
  });

  it("falls back to the deterministic summary when the model invents an amount", async () => {
    expect(await explainChange(INPUT, { structured: fake("This adds roughly ₹2 lakh.") })).toBe(INPUT.diff.explanation);
    expect(await explainChange(INPUT, { structured: fake("You'll spend ₹3L more.") })).toBe(INPUT.diff.explanation);
  });

  it("falls back when the AI call fails", async () => {
    const structured = vi.fn(async () => {
      throw new AIValidationError("emit_explanation", "bad");
    });
    expect(await explainChange(INPUT, { structured })).toBe(INPUT.diff.explanation);
  });

  it("rethrows unexpected errors", async () => {
    const structured = vi.fn(async () => {
      throw new TypeError("bug");
    });
    await expect(explainChange(INPUT, { structured })).rejects.toThrow(TypeError);
  });
});
