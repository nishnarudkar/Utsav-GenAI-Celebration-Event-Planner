import { describe, expect, it } from "vitest";
import { checkVenueCapacity, rescaleQuantity, scaleFunctionGuests } from "@/lib/rules/capacity";
import { detectConflicts, overBudgetConflict, timelineOverlaps } from "@/lib/rules/conflicts";
import type { PlannedFunction } from "@/lib/schemas/event";

const rupees = (r: number) => r * 100;

const fn = (name: string, expectedGuests: number, over: Partial<PlannedFunction> = {}): PlannedFunction => ({
  name,
  ritualKeys: [],
  date: "2027-02-14",
  startTime: "10:00",
  endTime: "12:00",
  expectedGuests,
  ...over,
});

/** The demo wedding's functions (Planner fixture), with the 300-seat hall from the demo script. */
const DEMO = [
  fn("Aashirbaad", 40, { date: "2027-02-12", startTime: "11:00", endTime: "13:30" }),
  fn("Gaye Holud", 60, { startTime: "05:30", endTime: "10:30" }),
  fn("Biye (wedding ceremony)", 250, { startTime: "18:30", endTime: "23:30", venueCapacity: 300 }),
  fn("Bashor Raat", 30, { startTime: "23:30", endTime: "04:00" }),
  fn("Bidaai and Bou Boron", 50, { date: "2027-02-15", startTime: "10:00", endTime: "14:00" }),
  fn("Bou Bhaat (reception)", 250, { date: "2027-02-16", startTime: "19:00", endTime: "23:00" }),
];

describe("scaleFunctionGuests", () => {
  it("full-list functions follow the new count; small ones keep theirs (demo: 250 → 350)", () => {
    expect(scaleFunctionGuests(DEMO, 250, 350).map((f) => f.expectedGuests)).toEqual([40, 60, 350, 30, 50, 350]);
  });

  it("caps small functions at a lower new total", () => {
    expect(scaleFunctionGuests(DEMO, 250, 45).map((f) => f.expectedGuests)).toEqual([40, 45, 45, 30, 45, 45]);
  });

  it("returns the same objects for untouched functions", () => {
    const out = scaleFunctionGuests(DEMO, 250, 350);
    expect(out[0]).toBe(DEMO[0]);
    expect(out[2]).not.toBe(DEMO[2]);
  });
});

describe("rescaleQuantity", () => {
  it("scales proportionally and rounds to whole units", () => {
    expect(rescaleQuantity(250, 250, 350)).toBe(350);
    expect(rescaleQuantity(120, 250, 350)).toBe(168); // invitation cards
    expect(rescaleQuantity(60, 250, 125)).toBe(30);
  });

  it("never goes below 1 and ignores a zero baseline", () => {
    expect(rescaleQuantity(2, 250, 10)).toBe(1);
    expect(rescaleQuantity(7, 0, 100)).toBe(7);
    expect(rescaleQuantity(7, 100, 100)).toBe(7);
  });
});

describe("checkVenueCapacity", () => {
  it("is critical when guests exceed the venue (demo: 350 in a 300-seat hall)", () => {
    expect(checkVenueCapacity(scaleFunctionGuests(DEMO, 250, 350))).toEqual([
      { type: "venue_capacity", severity: "critical", message: "Biye (wedding ceremony): 350 guests expected but the venue holds 300." },
    ]);
  });

  it("warns at 90% or more, and is quiet below", () => {
    expect(checkVenueCapacity([fn("Hall", 270, { venueCapacity: 300 })])[0]?.severity).toBe("warn");
    expect(checkVenueCapacity([fn("Hall", 269, { venueCapacity: 300 })])).toEqual([]);
    expect(checkVenueCapacity(DEMO)).toEqual([]); // 250 of 300
  });

  it("ignores functions without a known venue capacity", () => {
    expect(checkVenueCapacity([fn("Party", 5000)])).toEqual([]);
  });
});

describe("overBudgetConflict", () => {
  it("reports the overshoot in compact rupees", () => {
    expect(overBudgetConflict(rupees(17_10_000), rupees(15_00_000))).toEqual({
      type: "over_budget",
      severity: "critical",
      message: "Over budget by ₹2.1L (estimate ₹17.1L vs budget ₹15L).",
    });
    expect(overBudgetConflict(rupees(15_00_000), rupees(15_00_000))).toBeNull();
  });
});

describe("timelineOverlaps", () => {
  it("finds none in the demo plan (Biye ends as Bashor Raat starts)", () => {
    expect(timelineOverlaps(DEMO)).toEqual([]);
  });

  it("flags overlapping functions, including ones that run past midnight", () => {
    const sangeet = fn("Sangeet", 100, { date: "2027-02-13", startTime: "20:00", endTime: "01:00" });
    const haldi = fn("Haldi", 50, { date: "2027-02-14", startTime: "00:30", endTime: "03:00" });
    expect(timelineOverlaps([sangeet, haldi])).toEqual([{ type: "timeline_overlap", severity: "warn", message: "Sangeet and Haldi overlap in time." }]);
  });
});

describe("detectConflicts", () => {
  it("puts critical conflicts first", () => {
    const functions = [...scaleFunctionGuests(DEMO, 250, 350), fn("Mehendi", 20, { startTime: "09:00", endTime: "11:00" })];
    const conflicts = detectConflicts({ functions, totalEstimatePaise: rupees(17_10_000), budgetTotalPaise: rupees(15_00_000), budgetIsEstimate: false });
    expect(conflicts.map((c) => [c.type, c.severity])).toEqual([
      ["over_budget", "critical"],
      ["venue_capacity", "critical"],
      ["timeline_overlap", "warn"], // Mehendi overlaps Gaye Holud
    ]);
  });

  it("skips the over-budget check when Utsav is estimating the budget", () => {
    expect(detectConflicts({ functions: [], totalEstimatePaise: 200, budgetTotalPaise: 100, budgetIsEstimate: true })).toEqual([]);
  });
});
