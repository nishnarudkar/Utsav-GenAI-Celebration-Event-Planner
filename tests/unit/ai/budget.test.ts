import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { z } from "zod";
import { priceBudgetProposal, proposeBudget, type BudgetInput } from "@/lib/ai/agents/budget";
import { generateRitualPlan } from "@/lib/ai/agents/culture";
import { planEvent } from "@/lib/ai/agents/planner";
import { renderPriceMenu } from "@/lib/ai/prompts/budget";
import { createLocalRetriever } from "@/lib/ai/rag";
import { callStructured, defaultStructuredDeps, type CallStructuredOptions } from "@/lib/ai/structured";
import { getPricing } from "@/lib/kb/pricing";
import { BudgetProposal, type BudgetLineProposal } from "@/lib/schemas/budget";
import type { OnboardingAnswers, PlannedFunction } from "@/lib/schemas/event";

const FIXTURES_DIR = path.join(process.cwd(), "tests", "fixtures", "llm");
const KB_DIR = path.join(process.cwd(), "kb");
const rupees = (r: number) => r * 100;

const ANSWERS: OnboardingAnswers = {
  eventType: "wedding",
  culture: "bengali_hindu",
  city: "Kolkata",
  startDate: "2027-02-14",
  guestCount: 250,
  budgetTotalPaise: rupees(15_00_000),
};

const fn = (name: string, expectedGuests: number): PlannedFunction => ({
  name,
  ritualKeys: [],
  date: "2027-02-14",
  startTime: "18:00",
  endTime: "23:00",
  expectedGuests,
});

const INPUT: BudgetInput = {
  answers: ANSWERS,
  cityTier: 1,
  plan: {
    functions: [fn("Biye", 250), fn("Gaye Holud", 60)],
    allocationPaise: { catering: rupees(6_00_000), venue: rupees(2_00_000) },
  },
};

const line = (over: Partial<BudgetLineProposal> & Pick<BudgetLineProposal, "category" | "basis">): BudgetLineProposal => ({
  label: `${over.category} line`,
  rationale: "Because.",
  ...over,
});

describe("priceBudgetProposal", () => {
  it("prices lines from benchmarks and compares with the allocation", () => {
    const out = priceBudgetProposal(
      {
        lines: [
          line({ category: "catering", functionName: "Biye", basis: { unit: "per_plate", quantity: 250, unitTier: "low" } }),
          line({ category: "venue", functionName: "Biye", basis: { unit: "per_day", quantity: 1, unitTier: "mid" } }),
        ],
      },
      INPUT,
    );
    expect(out.lines.map((l) => [l.category, l.estimatePaise])).toEqual([
      ["catering", rupees(2_25_000)], // 250 × ₹900 (tier 1 low)
      ["venue", rupees(2_00_000)], // 1 × ₹2,00,000 (tier 1 mid)
    ]);
    expect(out.totalEstimatePaise).toBe(rupees(4_25_000));
    expect(out.byCategory).toEqual({
      catering: { allocatedPaise: rupees(6_00_000), estimatePaise: rupees(2_25_000) },
      venue: { allocatedPaise: rupees(2_00_000), estimatePaise: rupees(2_00_000) },
    });
    expect(out.budgetIsEstimate).toBe(false);
    expect(out.remainingPaise).toBe(rupees(10_75_000));
    expect(out.overBudgetPaise).toBe(0);
    expect(out.adjustments).toEqual([]);
  });

  it("reports how far over budget", () => {
    const out = priceBudgetProposal(
      { lines: [line({ category: "catering", functionName: "Biye", basis: { unit: "per_plate", quantity: 500, unitTier: "high" } })] },
      { ...INPUT, answers: { ...ANSWERS, budgetTotalPaise: rupees(10_00_000) } },
    );
    expect(out.totalEstimatePaise).toBe(rupees(14_00_000)); // 500 × ₹2,800
    expect(out.overBudgetPaise).toBe(rupees(4_00_000));
  });

  it("uses the priced total as the budget when the family asked for an estimate", () => {
    const out = priceBudgetProposal(
      { lines: [line({ category: "venue", basis: { unit: "per_day", quantity: 2, unitTier: "low" } })] },
      { ...INPUT, answers: { ...ANSWERS, budgetTotalPaise: null }, plan: { ...INPUT.plan, allocationPaise: null } },
    );
    expect(out.budgetIsEstimate).toBe(true);
    expect(out.budgetTotalPaise).toBe(rupees(1_60_000));
    expect(out.byCategory.venue).toEqual({ allocatedPaise: null, estimatePaise: rupees(1_60_000) });
  });

  it("clears function names that don't exist", () => {
    const out = priceBudgetProposal(
      { lines: [line({ category: "decor", label: "Mehendi décor", functionName: "Mehendi", basis: { unit: "flat", quantity: 1, unitTier: "low" } })] },
      INPUT,
    );
    expect(out.lines[0]).not.toHaveProperty("functionName");
    expect(out.adjustments).toEqual(['"Mehendi décor": unknown function "Mehendi", treated as event-wide.']);
  });

  it("caps per-guest and per-plate quantities at the guest list", () => {
    const out = priceBudgetProposal(
      {
        lines: [
          line({ category: "gifts", label: "Return gifts", basis: { unit: "per_guest", quantity: 400, unitTier: "low" } }),
          line({ category: "catering", label: "Breakfast", functionName: "Gaye Holud", basis: { unit: "per_plate", quantity: 200, unitTier: "low" } }),
          line({ category: "catering", label: "All meals", basis: { unit: "per_plate", quantity: 2000, unitTier: "low" } }),
        ],
      },
      INPUT,
    );
    expect(out.lines.map((l) => l.basis.quantity)).toEqual([250, 120, 620]); // 250 guests; 2×60; 2×(250+60)
    expect(out.adjustments).toEqual([
      '"Return gifts": per_guest quantity capped at 250 (was 400).',
      '"Breakfast": per_plate quantity capped at 120 (was 200).',
      '"All meals": per_plate quantity capped at 620 (was 2000).',
    ]);
  });

  it("returns lines without a benchmark as unpriced", () => {
    const out = priceBudgetProposal(
      { lines: [line({ category: "priest", label: "Pandit hourly", basis: { unit: "per_hour", quantity: 3, unitTier: "mid" } })] },
      INPUT,
    );
    expect(out.lines).toEqual([]);
    expect(out.unpriced).toHaveLength(1);
    expect(out.adjustments).toEqual(['"Pandit hourly": no benchmark for priest per_hour; needs a quote.']);
  });
});

describe("proposeBudget", () => {
  it("sends the prompt and the city-tier price menu as cached system blocks", async () => {
    const structured = vi.fn(async (_opts: CallStructuredOptions<typeof BudgetProposal>) => ({
      lines: [line({ category: "venue", basis: { unit: "per_day", quantity: 1, unitTier: "low" } })],
    }));
    await proposeBudget(INPUT, { structured });
    const opts = structured.mock.calls[0]?.[0];
    expect(opts).toMatchObject({ name: "emit_budget_proposal", fixtureKey: "emit_budget_proposal.bengali_hindu.wedding" });
    const [prompt, menu] = opts!.system as Array<{ text: string }>;
    expect(prompt?.text).toContain("Never write totals");
    expect(menu?.text).toContain('city_tier="1"');
    expect(menu?.text).toContain("catering / per_plate");
    const msg = String(opts?.messages[0]?.content);
    expect(msg).toContain("- Biye: 14 Feb 2027, 18:00–23:00, 250 guests");
    expect(msg).toContain("- catering: about ₹6,00,000");
  });
});

describe("renderPriceMenu", () => {
  it("lists only the requested tier with formatted prices", () => {
    const menu = renderPriceMenu(getPricing().rows, 2);
    expect(menu).toContain("catering / per_plate: Per plate per meal, veg or non-veg buffet. low ₹700, mid ₹1,200, high ₹2,200");
    expect(menu).not.toContain("₹900,"); // tier 1 low catering
  });
});

describe("demo wedding: Culture → Planner → Budget (no API key)", () => {
  it("fixture is a valid proposal", () => {
    BudgetProposal.parse(JSON.parse(readFileSync(path.join(FIXTURES_DIR, "emit_budget_proposal.bengali_hindu.wedding.json"), "utf8")));
  });

  it("prices every line, fits ₹15L and needs no corrections", async () => {
    const structuredDeps = defaultStructuredDeps({ DEMO_MODE: "true", DEMO_FIXTURES_DIR: FIXTURES_DIR });
    structuredDeps.createMessage = async () => {
      throw new Error("must not call the API in demo mode");
    };
    const structured = <S extends z.ZodType>(opts: CallStructuredOptions<S>) => callStructured(opts, structuredDeps);

    const rituals = await generateRitualPlan({ culture: "bengali_hindu", eventType: "wedding" }, { retrieve: createLocalRetriever(KB_DIR), structured });
    const plan = await planEvent({ answers: ANSWERS, rituals: rituals.rituals }, { structured });
    const budget = await proposeBudget({ answers: ANSWERS, cityTier: 1, plan }, { structured });

    expect(budget.unpriced).toEqual([]);
    expect(budget.adjustments).toEqual([]);
    expect(budget.totalEstimatePaise).toBe(rupees(14_40_000));
    expect(budget.overBudgetPaise).toBe(0);
    // every category stays within its Planner allocation
    for (const [cat, b] of Object.entries(budget.byCategory)) {
      expect(b.estimatePaise, cat).toBeLessThanOrEqual(b.allocatedPaise ?? 0);
    }
  });
});
