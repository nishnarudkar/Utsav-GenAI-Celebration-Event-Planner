import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { z } from "zod";
import { generateRitualPlan } from "@/lib/ai/agents/culture";
import { planEvent } from "@/lib/ai/agents/planner";
import { buildTimeline, planTimeline, type TimelineInput } from "@/lib/ai/agents/timeline";
import { createLocalRetriever } from "@/lib/ai/rag";
import { callStructured, defaultStructuredDeps, type CallStructuredOptions } from "@/lib/ai/structured";
import type { OnboardingAnswers } from "@/lib/schemas/event";
import { TimelineProposal } from "@/lib/schemas/timeline";

const FIXTURES_DIR = path.join(process.cwd(), "tests", "fixtures", "llm");
const KB_DIR = path.join(process.cwd(), "kb");
const TODAY = "2026-10-29";

const ANSWERS: OnboardingAnswers = {
  eventType: "wedding",
  culture: "bengali_hindu",
  city: "Kolkata",
  startDate: "2027-02-14",
  guestCount: 250,
  budgetTotalPaise: 15_00_000_00,
};

const INPUT: TimelineInput = {
  answers: ANSWERS,
  today: TODAY,
  plan: {
    functions: [
      { name: "Gaye Holud", ritualKeys: ["gaye_holud"], date: "2027-02-14", startTime: "06:00", endTime: "10:00", expectedGuests: 60 },
    ],
    highLevelTasks: [{ title: "Book the venue", category: "venue" }],
  },
  rituals: [{ key: "gaye_holud", items: [{ item: "Turmeric paste" }, { item: "Mustard oil" }] }],
};

describe("buildTimeline", () => {
  it("schedules model tasks and adds ritual prep tasks from the ritual items", () => {
    const plan = buildTimeline({ tasks: [{ ref: "book_venue", title: "Book the venue", dueOffsetDays: -90, dependsOn: [] }] }, { ...INPUT, today: TODAY });
    expect(plan.tasks.map((t) => [t.ref, t.dueDate, t.source])).toEqual([
      ["book_venue", "2026-11-16", "ai"],
      ["prep_gaye_holud", "2027-02-07", "ritual_kb"],
    ]);
    expect(plan.tasks[1]?.description).toBe("Turmeric paste, Mustard oil");
  });

  it("keeps refs unique when the model used a prep_* id", () => {
    const plan = buildTimeline(
      { tasks: [{ ref: "prep_gaye_holud", title: "Prep", dueOffsetDays: -3, dependsOn: [] }] },
      { ...INPUT, today: TODAY },
    );
    expect(plan.tasks.map((t) => t.ref).sort()).toEqual(["prep_gaye_holud", "prep_gaye_holud_kb"]);
  });
});

describe("planTimeline", () => {
  it("tells the model how many days are left and what to cover", async () => {
    const structured = vi.fn(async (_opts: CallStructuredOptions<typeof TimelineProposal>) => ({
      tasks: [{ ref: "book_venue", title: "Book the venue", dueOffsetDays: -90, dependsOn: [] }],
    }));
    await planTimeline(INPUT, { structured });
    const opts = structured.mock.calls[0]?.[0];
    expect(opts).toMatchObject({ name: "emit_timeline", fixtureKey: "emit_timeline.bengali_hindu.wedding", model: "smart" });
    const msg = String(opts?.messages[0]?.content);
    expect(msg).toContain("Main day: 14 Feb 2027 — 108 days from today.");
    expect(msg).toContain("- Gaye Holud: 14 Feb 2027");
    expect(msg).toContain("- Book the venue [venue]");
  });
});

describe("demo wedding: all four agents (no API key)", () => {
  it("fixture is a valid proposal", () => {
    TimelineProposal.parse(JSON.parse(readFileSync(path.join(FIXTURES_DIR, "emit_timeline.bengali_hindu.wedding.json"), "utf8")));
  });

  it("produces 20+ dated tasks with consistent dependencies", async () => {
    const structuredDeps = defaultStructuredDeps({ DEMO_MODE: "true", DEMO_FIXTURES_DIR: FIXTURES_DIR });
    structuredDeps.createMessage = async () => {
      throw new Error("must not call the API in demo mode");
    };
    const structured = <S extends z.ZodType>(opts: CallStructuredOptions<S>) => callStructured(opts, structuredDeps);

    const rituals = await generateRitualPlan({ culture: "bengali_hindu", eventType: "wedding" }, { retrieve: createLocalRetriever(KB_DIR), structured });
    const plan = await planEvent({ answers: ANSWERS, rituals: rituals.rituals }, { structured });
    const timeline = await planTimeline({ answers: ANSWERS, plan, rituals: rituals.rituals, today: TODAY }, { structured });

    // CLAUDE.md F1 acceptance: at least 20 tasks with due dates
    expect(timeline.tasks.length).toBeGreaterThanOrEqual(20);
    expect(timeline.tasks.filter((t) => t.source === "ritual_kb")).toHaveLength(6); // one per function
    // only the "already late" note: the fixture's dependencies are consistent
    expect(timeline.adjustments).toEqual(["7 tasks were ideally due before today (29 Oct 2026) and are scheduled for today."]);

    const byRef = new Map(timeline.tasks.map((t) => [t.ref, t]));
    for (const t of timeline.tasks) {
      expect(t.dueDate >= TODAY, t.ref).toBe(true);
      for (const d of t.dependsOn) expect(byRef.get(d)!.dueDate <= t.dueDate, `${d} before ${t.ref}`).toBe(true);
    }
    // sorted by due date
    const dates = timeline.tasks.map((t) => t.dueDate);
    expect(dates).toEqual([...dates].sort());
  });
});
