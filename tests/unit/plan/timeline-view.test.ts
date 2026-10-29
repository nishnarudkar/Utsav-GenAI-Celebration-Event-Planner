import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { loadKbChunks } from "@/lib/ai/rag";
import { buildEventPlan } from "@/lib/plan/build-plan";
import { MemoryEventRepository } from "@/lib/plan/event-repo";
import { checklistItemIds, ganttLayout, ritualGroups, tasksByMonth, type CitedChunk } from "@/lib/plan/timeline-view";
import type { StoredEvent } from "@/lib/plan/types";
import type { PlannedFunction } from "@/lib/schemas/event";

let demo: StoredEvent;
let cited: CitedChunk[];

beforeAll(async () => {
  vi.stubEnv("DEMO_MODE", "true");
  const plan = await buildEventPlan(
    { eventType: "wedding", culture: "bengali_hindu", city: "Kolkata", startDate: "2027-02-14", guestCount: 250, budgetTotalPaise: 15_00_000_00 },
    { today: "2026-10-29" },
  );
  demo = await new MemoryEventRepository().create(plan);
  cited = await loadKbChunks(path.join(process.cwd(), "kb"));
});
afterAll(() => {
  vi.unstubAllEnvs();
});

const fn = (name: string, date: string, startTime: string, endTime: string): PlannedFunction => ({
  name,
  ritualKeys: [],
  date,
  startTime,
  endTime,
  expectedGuests: 10,
});

describe("ganttLayout", () => {
  it("spans the event days and positions bars by time", () => {
    const { days, bars } = ganttLayout(demo.plan.functions);
    expect(days.map((d) => d.label)).toEqual(["12 Feb", "13 Feb", "14 Feb", "15 Feb", "16 Feb"]);
    const aashirbaad = bars.find((b) => b.name === "Aashirbaad")!;
    expect(aashirbaad).toMatchObject({ leftPct: 9.17, widthPct: 2.08, overnight: false }); // 11:00–13:30 on day 1 of 5
    const bashor = bars.find((b) => b.name === "Bashor Raat")!;
    expect(bashor).toMatchObject({ leftPct: 59.58, widthPct: 3.75, overnight: true }); // 23:30 → 04:00
    for (const b of bars) expect(b.leftPct + b.widthPct).toBeLessThanOrEqual(100);
  });

  it("adds a day when the last function runs past midnight", () => {
    const { days, bars } = ganttLayout([fn("Sangeet", "2027-01-10", "20:00", "02:00")]);
    expect(days.map((d) => d.date)).toEqual(["2027-01-10", "2027-01-11"]);
    expect(bars[0]).toMatchObject({ leftPct: 41.67, widthPct: 12.5, overnight: true });
  });

  it("handles no functions", () => {
    expect(ganttLayout([])).toEqual({ days: [], bars: [] });
  });
});

describe("ritualGroups", () => {
  it("groups rituals under their functions in order, with checklist ids and citations", () => {
    const groups = ritualGroups(demo, cited);
    expect(groups.map((g) => g.functionName)).toEqual([
      "Aashirbaad",
      "Gaye Holud",
      "Biye (wedding ceremony)",
      "Bashor Raat",
      "Bidaai and Bou Boron",
      "Bou Bhaat (reception)",
    ]);
    const gayeHolud = groups[1]!.rituals.find((r) => r.key === "gaye_holud")!;
    expect(gayeHolud.items[0]).toEqual({ id: "gaye_holud#0", item: "Turmeric paste", procured: false });
    expect(gayeHolud.citation).toBe("Bengali Hindu wedding › Gaye Holud");
    expect(groups.flatMap((g) => g.rituals)).toHaveLength(14);
    expect(groups.flatMap((g) => g.rituals).every((r) => r.citation)).toBe(true);
  });

  it("marks ticked items and collects unplaced rituals at the end", () => {
    const event = {
      ...demo,
      procuredItems: ["gaye_holud#0"],
      plan: { ...demo.plan, functions: demo.plan.functions.filter((f) => f.name !== "Bashor Raat") },
    };
    const groups = ritualGroups(event, cited);
    expect(groups.at(-1)).toMatchObject({ functionName: null, rituals: [expect.objectContaining({ key: "bashor_raat" })] });
    expect(groups.flatMap((g) => g.rituals).find((r) => r.key === "gaye_holud")?.items[0]?.procured).toBe(true);
  });

  it("gives no citation for chunks the plan didn't cite", () => {
    const groups = ritualGroups({ ...demo, rituals: { ...demo.rituals, sources: [] } }, cited);
    expect(groups.flatMap((g) => g.rituals).some((r) => r.citation)).toBe(false);
  });
});

describe("checklistItemIds", () => {
  it("lists every item of every ritual", () => {
    const ids = checklistItemIds(demo);
    expect(ids.has("gaye_holud#0")).toBe(true);
    expect(ids.has("gaye_holud#99")).toBe(false);
    expect(ids.size).toBe(demo.rituals.rituals.reduce((n, r) => n + r.items.length, 0));
  });
});

describe("tasksByMonth", () => {
  it("groups the sorted task list by month", () => {
    const groups = tasksByMonth(demo.timeline.tasks);
    expect(groups.map((g) => g.month)).toEqual(["Oct 2026", "Nov 2026", "Dec 2026", "Jan 2027", "Feb 2027"]);
    expect(groups.reduce((n, g) => n + g.tasks.length, 0)).toBe(33);
  });
});

describe("MemoryEventRepository.setItemProcured", () => {
  it("ticks and unticks items idempotently", async () => {
    const repo = new MemoryEventRepository();
    const { procuredItems: _p, id: _i, status: _s, version: _v, createdAt: _c, updatedAt: _u, ...plan } = demo;
    const event = await repo.create(plan);
    expect(await repo.setItemProcured(event.id, "b#1", true)).toEqual(["b#1"]);
    expect(await repo.setItemProcured(event.id, "a#0", true)).toEqual(["a#0", "b#1"]);
    expect(await repo.setItemProcured(event.id, "a#0", true)).toEqual(["a#0", "b#1"]);
    expect(await repo.setItemProcured(event.id, "b#1", false)).toEqual(["a#0"]);
    expect((await repo.get(event.id))?.procuredItems).toEqual(["a#0"]);
    expect(await repo.setItemProcured("missing", "a#0", true)).toBeNull();
  });
});
