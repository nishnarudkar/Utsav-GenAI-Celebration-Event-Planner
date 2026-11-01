import { describe, expect, it, vi } from "vitest";
import { finalizeCouncil } from "@/lib/ai/agents/council";
import { matchFunctionName } from "@/lib/graph/council";
import { createDemoEvent } from "@/lib/plan/demo-event";
import { MemoryEventRepository } from "@/lib/plan/event-repo";
import { proposeReshuffle } from "@/lib/plan/live-service";
import type { StoredEvent } from "@/lib/plan/types";
import { toISTMinutes } from "@/lib/rules/dates";
import { upcomingSlots, type RunSlot } from "@/lib/rules/run-of-show";
import type { CouncilDraft } from "@/lib/schemas/council";
import type { ReshuffleDraft } from "@/lib/schemas/dayof";

/** Each case here comes from a mismatch seen in real model replies, which fixtures never show. */

const FUNCTIONS = ["Aashirbaad", "Biye (wedding ceremony)", "Bou Bhaat (reception)", "Bou Bhaat (lunch)"];

describe("matchFunctionName", () => {
  it.each([
    ["Biye (wedding ceremony)", "Biye (wedding ceremony)"],
    ["aashirbaad", "Aashirbaad"],
    ["Biye", "Biye (wedding ceremony)"],
    [" biye ", "Biye (wedding ceremony)"],
  ])("matches %s", (name, expected) => {
    expect(matchFunctionName(name, FUNCTIONS)).toBe(expected);
  });

  it("refuses a guess when the name is ambiguous or unknown", () => {
    expect(matchFunctionName("Bou Bhaat", FUNCTIONS)).toBeNull();
    expect(matchFunctionName("Sangeet", FUNCTIONS)).toBeNull();
    expect(matchFunctionName("Bi", FUNCTIONS)).toBeNull();
  });
});

async function demoEvent(): Promise<{ repo: MemoryEventRepository; event: StoredEvent }> {
  vi.stubEnv("DEMO_MODE", "true");
  const repo = new MemoryEventRepository();
  const event = await createDemoEvent(repo, { today: "2026-11-01" });
  vi.unstubAllEnvs();
  return { repo, event };
}

describe("finalizeCouncil", () => {
  const draft = (functionName: string): CouncilDraft => {
    const option = (id: string, name: string) => ({ id, title: id, description: "d", satisfies: [], compromises: [], patch: { guestCount: null, functionGuests: [{ functionName: name, guests: 150 }], budgetTotalPaise: null } });
    return { conflicts: [], options: [option("a", functionName), option("b", functionName)] };
  };

  it("applies a shortened function name, so the option does what it says", async () => {
    const { event } = await demoEvent();
    const [option] = finalizeCouncil(draft("Biye"), event, event.stakeholders, { version: 1, today: "2026-11-01" }).options;
    expect(option?.patch.functionGuests[0]?.functionName).toBe("Biye (wedding ceremony)");
    expect(option?.costDeltaPaise).toBeLessThan(0);
  });

  it("says so when part of an option can't be applied", async () => {
    const { event } = await demoEvent();
    const [option] = finalizeCouncil(draft("Sangeet"), event, event.stakeholders, { version: 1, today: "2026-11-01" }).options;
    expect(option?.patch.functionGuests).toEqual([]);
    expect(option?.conflictsAfter[0]).toContain("“Sangeet” isn't in the plan");
  });
});

describe("upcomingSlots", () => {
  const slot = (id: string, startMin: number, endMin: number): RunSlot => ({ id, name: id, functionName: "f", isRitual: true, startMin, endMin });
  const DAY = [slot("dawn", 330, 360), slot("evening", 1110, 1140)];

  it("leaves out what has finished, and keeps what's under way", () => {
    expect(upcomingSlots(DAY, 400).map((s) => s.id)).toEqual(["evening"]);
    expect(upcomingSlots(DAY, 1120).map((s) => s.id)).toEqual(["evening"]);
  });

  it("falls back to the whole day once it's over", () => {
    expect(upcomingSlots(DAY, 1439)).toHaveLength(2);
  });
});

describe("proposeReshuffle", () => {
  const draftFor = (fromSlotId: string): ReshuffleDraft => ({ summary: "The photographer is late.", fromSlotId, delayMinutes: 30, notify: [] });

  it("offers the model only slots still to come on the day", async () => {
    const { repo, event } = await demoEvent();
    const structured = vi.fn(async () => draftFor("bor_boron"));
    await proposeReshuffle(repo, event.id, "Photographer late", { today: event.answers.startDate, nowMinutes: 18 * 60 }, { structured });
    const prompt = JSON.stringify(structured.mock.calls[0]);
    expect(prompt).toContain("bor_boron");
    expect(prompt).not.toContain("dodhi_mangal");
  });

  it("shows the whole order when rehearsing before the day", async () => {
    const { repo, event } = await demoEvent();
    const structured = vi.fn(async () => draftFor("bor_boron"));
    await proposeReshuffle(repo, event.id, "Photographer late", { today: "2026-11-01", nowMinutes: 23 * 60 }, { structured });
    expect(JSON.stringify(structured.mock.calls[0])).toContain("bor_boron");
  });
});

describe("toISTMinutes", () => {
  it("converts to the IST clock", () => {
    expect(toISTMinutes(new Date("2027-02-14T12:30:00Z"))).toBe(18 * 60);
    expect(toISTMinutes(new Date("2027-02-13T20:00:00Z"))).toBe(90);
  });
});
