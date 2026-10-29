import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { runCascade } from "@/lib/graph/cascade";
import { applyRecoveryPatch, generateRecoveryOptions, RecoveryPatch } from "@/lib/graph/recovery";
import { buildEventPlan } from "@/lib/plan/build-plan";
import type { EventPlan } from "@/lib/plan/types";

const TODAY = "2026-10-29";
const CTX = { version: 1, today: TODAY };
const rupees = (r: number) => r * 100;

let demo: EventPlan;
let after350: ReturnType<typeof runCascade>;

beforeAll(async () => {
  vi.stubEnv("DEMO_MODE", "true");
  const plan = await buildEventPlan(
    { eventType: "wedding", culture: "bengali_hindu", city: "Kolkata", startDate: "2027-02-14", guestCount: 250, budgetTotalPaise: rupees(15_00_000) },
    { today: TODAY },
  );
  demo = {
    ...plan,
    plan: { ...plan.plan, functions: plan.plan.functions.map((f) => (f.name === "Biye (wedding ceremony)" ? { ...f, venueCapacity: 300 } : f)) },
  };
  after350 = runCascade(demo, { field: "guest_count", value: 350 }, CTX);
});
afterAll(() => {
  vi.unstubAllEnvs();
});

describe("generateRecoveryOptions (demo: 350 guests, ₹1.47L over)", () => {
  it("offers the three biggest exact savings", () => {
    const options = generateRecoveryOptions(after350.state, { ...CTX, version: 2, trigger: after350.change });
    expect(options.map((o) => [o.id, o.title, o.savesPaise])).toEqual([
      ["guests:300", "Keep the guest list at 300", rupees(1_03_600)], // 50 fewer plates ×2 feasts, cards and gifts
      ["tier:attire", "Choose budget-friendly attire", rupees(93_000)], // outfits mid→low + makeup mid→low
      ["tier:gifts", "Choose budget-friendly gifts", rupees(25_000)], // tattva trays mid→low
    ]);
    expect(options[0]?.impact).toBe("Saves ₹1L — covers 70% of the ₹1.5L overrun; fits the 300-seat venue.");
  });

  it("never suggests cutting priest and ritual costs", () => {
    const options = generateRecoveryOptions(after350.state, { ...CTX, trigger: after350.change });
    expect(options.some((o) => o.id.includes("priest"))).toBe(false);
  });

  it("offers nothing when the plan is within budget or the budget is an estimate", () => {
    expect(generateRecoveryOptions(demo, CTX)).toEqual([]);
    const estimated = { ...after350.state, budget: { ...after350.state.budget, budgetIsEstimate: true } };
    expect(generateRecoveryOptions(estimated, CTX)).toEqual([]);
  });

  it("produces patches that validate", () => {
    for (const o of generateRecoveryOptions(after350.state, { ...CTX, trigger: after350.change })) {
      expect(RecoveryPatch.safeParse(o.patch).success, o.id).toBe(true);
    }
  });

  it("says when one option alone brings the plan within budget", () => {
    // ₹15.5L budget: only ₹97,200 over, so keeping 300 guests (₹1.04L) is enough.
    const tight = { ...after350.state, budget: { ...after350.state.budget, budgetTotalPaise: rupees(15_50_000), overBudgetPaise: rupees(97_200) } };
    const [first] = generateRecoveryOptions(tight, { ...CTX, trigger: after350.change });
    expect(first?.impact).toBe("Saves ₹1L — brings you within budget; fits the 300-seat venue.");
  });
});

describe("demo explanation", () => {
  it("is grounded in the demo scenario's facts, so demo mode shows it", async () => {
    const { explainChange } = await import("@/lib/ai/agents/explainer");
    const options = generateRecoveryOptions(after350.state, { ...CTX, trigger: after350.change });
    const diff = { ...after350.diff, recoveryOptions: options };
    const text = await explainChange({
      trigger: after350.change,
      diff,
      totalEstimatePaise: after350.state.budget.totalEstimatePaise,
      budgetTotalPaise: after350.state.budget.budgetTotalPaise,
      overBudgetPaise: after350.state.budget.overBudgetPaise,
    });
    expect(text).not.toBe(diff.explanation);
    expect(text).toContain("Keeping the guest list at 300 would save ₹1L");
  });
});

describe("applyRecoveryPatch", () => {
  it("re-prices lines at the lower tier and reports the saving", () => {
    const [, attire] = generateRecoveryOptions(after350.state, { ...CTX, trigger: after350.change });
    const { state, diff } = applyRecoveryPatch(after350.state, RecoveryPatch.parse(attire!.patch), { ...CTX, version: 2 });
    expect(diff.budgetDeltaPaise).toBe(-rupees(93_000));
    expect(diff.changed.map((c) => c.label)).toEqual(["Bride's Benarasi, groom's dhoti-panjabi and reception outfit", "Bridal makeup and hair"]);
    expect(state.budget.lines.filter((l) => l.category === "attire").every((l) => l.basis.unitTier === "low")).toBe(true);
    expect(state.budget.totalEstimatePaise).toBe(after350.state.budget.totalEstimatePaise - rupees(93_000));
  });

  it("runs the cascade for field patches", () => {
    const { state, diff } = applyRecoveryPatch(after350.state, { kind: "field", change: { field: "guest_count", value: 300 } }, { ...CTX, version: 2 });
    expect(state.answers.guestCount).toBe(300);
    // The hall fits now, but it's full — a warning, no longer critical.
    expect(diff.conflicts.map((c) => [c.type, c.severity])).toEqual([
      ["over_budget", "critical"],
      ["venue_capacity", "warn"],
    ]);
  });

  it("switches printed cards to digital invitations", () => {
    const i = after350.state.budget.lines.findIndex((l) => l.category === "invites");
    const { state } = applyRecoveryPatch(after350.state, { kind: "lines", updates: [{ lineIndex: i, basis: { unit: "flat", quantity: 1, unitTier: "low" } }] }, CTX);
    expect(state.budget.lines[i]).toMatchObject({ basis: { unit: "flat", quantity: 1 }, estimatePaise: rupees(3_000) });
  });

  it("offers digital invitations instead of a cheaper card tier, not both", () => {
    const [, attire] = generateRecoveryOptions(after350.state, { ...CTX, trigger: after350.change });
    const { state } = applyRecoveryPatch(after350.state, RecoveryPatch.parse(attire!.patch), CTX);
    const ids = generateRecoveryOptions(state, CTX).map((o) => o.id);
    expect(ids.some((id) => id.startsWith("digital_invites"))).toBe(true);
    expect(ids).not.toContain("tier:invites");
  });

  it("skips locked lines", () => {
    const locked = { ...after350.state, budget: { ...after350.state.budget, lines: after350.state.budget.lines.map((l) => (l.category === "attire" ? { ...l, locked: true } : l)) } };
    const opts = generateRecoveryOptions(locked, { ...CTX, trigger: after350.change });
    expect(opts.some((o) => o.id === "tier:attire")).toBe(false);
  });
});
