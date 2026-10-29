import { describe, expect, it, vi } from "vitest";
import type { PricedBudget } from "@/lib/ai/agents/budget";
import { buildEventPlan, defaultTitle, type BuildPlanDeps } from "@/lib/plan/build-plan";
import { MemoryEventRepository } from "@/lib/plan/event-repo";
import type { OnboardingAnswers, PlannedEvent } from "@/lib/schemas/event";
import type { RitualPlan } from "@/lib/schemas/ritual";
import type { TimelinePlan } from "@/lib/schemas/timeline";

const ANSWERS: OnboardingAnswers = {
  eventType: "wedding",
  culture: "bengali_hindu",
  city: "Kolkata",
  startDate: "2027-02-14",
  guestCount: 250,
  budgetTotalPaise: 15_00_000_00,
  notes: "Keep Bashor Raat",
};

const RITUALS: RitualPlan = { rituals: [], sources: [], confidence: "high" };
const PLAN = { functions: [], highLevelTasks: [], allocationPaise: null } as unknown as PlannedEvent;
const BUDGET = { budgetTotalPaise: 15_00_000_00 } as PricedBudget;
const TIMELINE: TimelinePlan = { tasks: [], adjustments: [] };

function fakeDeps(log: string[]) {
  const deps: BuildPlanDeps = {
    culture: vi.fn(async () => (log.push("culture"), RITUALS)),
    planner: vi.fn(async () => (log.push("planner"), PLAN)),
    budget: vi.fn(async () => (log.push("budget"), BUDGET)),
    timeline: vi.fn(async () => (log.push("timeline"), TIMELINE)),
  };
  return deps;
}

describe("buildEventPlan", () => {
  it("runs Culture → Planner → Budget ∥ Timeline and reports progress", async () => {
    const log: string[] = [];
    const steps: string[] = [];
    const deps = fakeDeps(log);
    const plan = await buildEventPlan(ANSWERS, { deps, onStep: (s) => steps.push(s), today: "2026-10-29" });

    expect(log.slice(0, 2)).toEqual(["culture", "planner"]);
    expect(steps).toEqual(["rituals", "structure", "budget", "timeline"]);
    expect(deps.culture).toHaveBeenCalledWith({ culture: "bengali_hindu", eventType: "wedding", notes: "Keep Bashor Raat" });
    expect(deps.budget).toHaveBeenCalledWith({ answers: ANSWERS, cityTier: 1, plan: PLAN });
    expect(deps.timeline).toHaveBeenCalledWith({ answers: ANSWERS, plan: PLAN, rituals: [], today: "2026-10-29" });
    expect(plan).toMatchObject({ title: "Bengali Hindu wedding in Kolkata", cityTier: 1, cityTierKnown: true });
  });

  it("starts Budget and Timeline together", async () => {
    let releaseBudget!: () => void;
    const deps = fakeDeps([]);
    deps.budget = () => new Promise((resolve) => (releaseBudget = () => resolve(BUDGET)));
    const timeline = vi.fn(async () => TIMELINE);
    deps.timeline = timeline;

    const pending = buildEventPlan(ANSWERS, { deps });
    await vi.waitFor(() => expect(timeline).toHaveBeenCalled()); // timeline started while budget still pending
    releaseBudget();
    await expect(pending).resolves.toMatchObject({ budget: BUDGET });
  });

  it("flags unknown cities and uses the given title", async () => {
    const plan = await buildEventPlan({ ...ANSWERS, city: "Shantiniketan", title: "  Ananya & Rohan  " }, { deps: fakeDeps([]) });
    expect(plan).toMatchObject({ title: "Ananya & Rohan", cityTier: 2, cityTierKnown: false });
  });
});

describe("defaultTitle", () => {
  it.each([
    [{ culture: "tamil_brahmin", eventType: "wedding", city: "Chennai" }, "Tamil Brahmin wedding in Chennai"],
    [{ culture: "generic", eventType: "birthday", city: " Pune " }, "Birthday in Pune"],
    [{ culture: "marathi", eventType: "community", city: "Thane" }, "Marathi community event in Thane"],
  ] as const)("%o → %s", (answers, title) => {
    expect(defaultTitle(answers)).toBe(title);
  });
});

describe("MemoryEventRepository", () => {
  const plan = { title: "T", answers: ANSWERS, cityTier: 1, cityTierKnown: true, rituals: RITUALS, plan: PLAN, budget: BUDGET, timeline: TIMELINE } as const;

  it("creates, gets and lists events newest first", async () => {
    let t = Date.parse("2026-10-29T00:00:00Z");
    const repo = new MemoryEventRepository(new Map(), () => new Date((t += 1000)));
    const a = await repo.create(plan);
    const b = await repo.create({ ...plan, title: "Second" });

    expect(a).toMatchObject({ status: "planning", version: 1, title: "T" });
    expect(a.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(await repo.get(a.id)).toEqual(a);
    expect(await repo.get("missing")).toBeNull();
    expect((await repo.list()).map((e) => e.title)).toEqual(["Second", "T"]);
    expect((await repo.list())[0]).toEqual({
      id: b.id,
      title: "Second",
      eventType: "wedding",
      city: "Kolkata",
      startDate: "2027-02-14",
      guestCount: 250,
      budgetTotalPaise: 15_00_000_00,
      status: "planning",
    });
  });

  it("returns copies, so callers can't mutate stored events", async () => {
    const repo = new MemoryEventRepository();
    const a = await repo.create(plan);
    a.title = "changed";
    expect((await repo.get(a.id))?.title).toBe("T");
  });
});
