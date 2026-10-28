import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { z } from "zod";
import { generateRitualPlan } from "@/lib/ai/agents/culture";
import { finalizeEventPlan, planEvent, type PlannerInput } from "@/lib/ai/agents/planner";
import { createLocalRetriever } from "@/lib/ai/rag";
import { callStructured, defaultStructuredDeps, type CallStructuredOptions } from "@/lib/ai/structured";
import { sumPaise } from "@/lib/rules/budget-math";
import { EventPlanDraft, type OnboardingAnswers } from "@/lib/schemas/event";

const FIXTURES_DIR = path.join(process.cwd(), "tests", "fixtures", "llm");
const KB_DIR = path.join(process.cwd(), "kb");

const ANSWERS: OnboardingAnswers = {
  eventType: "wedding",
  culture: "bengali_hindu",
  city: "Kolkata",
  startDate: "2027-02-14",
  guestCount: 250,
  budgetTotalPaise: 15_00_000_00,
};

const RITUALS = [
  { key: "aashirbaad", name: "Aashirbaad", durationMinutes: 60 },
  { key: "gaye_holud", name: "Gaye Holud", durationMinutes: 90 },
  { key: "bou_bhaat", name: "Bou Bhaat", durationMinutes: 240 },
];

const input: PlannerInput = { answers: ANSWERS, rituals: RITUALS };

const fn = (over: Partial<EventPlanDraft["functions"][number]>): EventPlanDraft["functions"][number] => ({
  name: "Function",
  ritualKeys: [],
  dayOffset: 0,
  startTime: "10:00",
  endTime: "12:00",
  expectedGuests: 50,
  ...over,
});

const draft = (over: Partial<EventPlanDraft> = {}): EventPlanDraft => ({
  functions: [
    fn({ name: "Bou Bhaat", ritualKeys: ["bou_bhaat"], dayOffset: 2, startTime: "19:00", expectedGuests: 250 }),
    fn({ name: "Aashirbaad", ritualKeys: ["aashirbaad"], dayOffset: -2 }),
    fn({ name: "Gaye Holud", ritualKeys: ["gaye_holud"], dayOffset: 0, startTime: "06:00" }),
  ],
  allocation: [
    { category: "catering", percent: 60 },
    { category: "venue", percent: 40 },
  ],
  highLevelTasks: [{ title: "Book venue", category: "venue" }],
  rationale: "Simple.",
  ...over,
});

describe("finalizeEventPlan", () => {
  it("resolves day offsets to dates and sorts functions chronologically", () => {
    const plan = finalizeEventPlan(draft(), input);
    expect(plan.functions.map((f) => [f.name, f.date])).toEqual([
      ["Aashirbaad", "2027-02-12"],
      ["Gaye Holud", "2027-02-14"],
      ["Bou Bhaat", "2027-02-16"],
    ]);
    expect(plan.startDate).toBe("2027-02-12");
    expect(plan.endDate).toBe("2027-02-16");
    expect(plan.adjustments).toEqual([]);
  });

  it("orders same-day functions by start time", () => {
    const plan = finalizeEventPlan(
      draft({ functions: [fn({ name: "Evening", startTime: "18:00" }), fn({ name: "Morning", startTime: "06:00" })] }),
      input,
    );
    expect(plan.functions.map((f) => f.name)).toEqual(["Morning", "Evening"]);
  });

  it("splits the budget into exact paise by percentage", () => {
    const plan = finalizeEventPlan(draft(), input);
    expect(plan.allocationPaise).toEqual({ catering: 9_00_000_00, venue: 6_00_000_00 });
    expect(plan.allocationPercent).toEqual({ catering: 60, venue: 40 });
  });

  it("normalises percentages that don't sum to 100 and merges duplicate categories", () => {
    const plan = finalizeEventPlan(
      draft({
        allocation: [
          { category: "catering", percent: 30 },
          { category: "venue", percent: 30 },
          { category: "catering", percent: 30 },
        ],
      }),
      input,
    );
    expect(plan.allocationPercent).toEqual({ catering: 66.7, venue: 33.3 });
    expect(sumPaise(Object.values(plan.allocationPaise ?? {}))).toBe(ANSWERS.budgetTotalPaise);
    expect(plan.adjustments).toContain("Budget split summed to 90%; scaled to 100%.");
  });

  it("returns no paise allocation when the budget is still to be estimated", () => {
    const plan = finalizeEventPlan(draft(), { ...input, answers: { ...ANSWERS, budgetTotalPaise: null } });
    expect(plan.allocationPaise).toBeNull();
    expect(plan.allocationPercent).toEqual({ catering: 60, venue: 40 });
  });

  it("drops unknown ritual keys, de-duplicates, and reports unplaced rituals", () => {
    const plan = finalizeEventPlan(
      draft({
        functions: [
          fn({ name: "A", ritualKeys: ["aashirbaad", "made_up"], dayOffset: -1 }),
          fn({ name: "B", ritualKeys: ["aashirbaad"], dayOffset: 0 }),
        ],
      }),
      input,
    );
    expect(plan.functions.map((f) => f.ritualKeys)).toEqual([["aashirbaad"], []]);
    expect(plan.unassignedRitualKeys).toEqual(["gaye_holud", "bou_bhaat"]);
    expect(plan.adjustments).toEqual([
      'Dropped unknown ritual "made_up" from A.',
      'Ritual "aashirbaad" was listed twice; kept it at its first function.',
    ]);
  });

  it("caps expected guests at the event's guest count", () => {
    const plan = finalizeEventPlan(draft({ functions: [fn({ name: "Reception", expectedGuests: 400 })] }), input);
    expect(plan.functions[0]?.expectedGuests).toBe(250);
    expect(plan.adjustments).toContain("Reception: guests capped at 250 (was 400).");
  });

  it("rejects an allocation with nothing in it", () => {
    expect(() => finalizeEventPlan(draft({ allocation: [{ category: "misc", percent: 0 }] }), input)).toThrow(RangeError);
  });
});

describe("planEvent", () => {
  it("asks the smart model with the answers and ritual list, then finalises", async () => {
    const structured = vi.fn(async (_opts: CallStructuredOptions<typeof EventPlanDraft>) => draft());
    const plan = await planEvent(input, { structured });

    const opts = structured.mock.calls[0]?.[0];
    expect(opts).toMatchObject({ name: "emit_event_plan", fixtureKey: "emit_event_plan.bengali_hindu.wedding", model: "smart" });
    const msg = String(opts?.messages[0]?.content);
    expect(msg).toContain("Main day: 2027-02-14");
    expect(msg).toContain("Budget: ₹15,00,000");
    expect(msg).toContain("- gaye_holud: Gaye Holud (~90 min)");
    expect(plan.functions[0]?.date).toBe("2027-02-12");
  });

  it("tells the model when the budget is undecided", async () => {
    const structured = vi.fn(async (_opts: CallStructuredOptions<typeof EventPlanDraft>) => draft());
    await planEvent({ ...input, answers: { ...ANSWERS, budgetTotalPaise: null } }, { structured });
    expect(String(structured.mock.calls[0]?.[0].messages[0]?.content)).toContain("Budget: not decided");
  });
});

describe("planner demo fixtures", () => {
  it.each(["emit_event_plan.bengali_hindu.wedding.json", "emit_event_plan.generic.birthday.json"])("%s is a valid draft", (file) => {
    EventPlanDraft.parse(JSON.parse(readFileSync(path.join(FIXTURES_DIR, file), "utf8")));
  });

  it("runs Culture → Planner for the demo wedding without an API key", async () => {
    const structuredDeps = defaultStructuredDeps({ DEMO_MODE: "true", DEMO_FIXTURES_DIR: FIXTURES_DIR });
    structuredDeps.createMessage = async () => {
      throw new Error("must not call the API in demo mode");
    };
    const structured = <S extends z.ZodType>(opts: CallStructuredOptions<S>) => callStructured(opts, structuredDeps);

    const rituals = await generateRitualPlan(
      { culture: "bengali_hindu", eventType: "wedding" },
      { retrieve: createLocalRetriever(KB_DIR), structured },
    );
    const plan = await planEvent({ answers: ANSWERS, rituals: rituals.rituals }, { structured });

    expect(plan.unassignedRitualKeys).toEqual([]); // every KB ritual lands in a function
    expect(plan.adjustments).toEqual([]);
    expect(plan.startDate).toBe("2027-02-12");
    expect(plan.endDate).toBe("2027-02-16");
    expect(plan.functions.find((f) => f.ritualKeys.includes("bou_bhaat"))?.date).toBe("2027-02-16");
    expect(sumPaise(Object.values(plan.allocationPaise ?? {}))).toBe(15_00_000_00);
    expect(Object.keys(plan.allocationPaise ?? {})).toHaveLength(12);
  });
});
