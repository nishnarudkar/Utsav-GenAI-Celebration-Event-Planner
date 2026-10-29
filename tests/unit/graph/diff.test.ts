import { describe, expect, it } from "vitest";
import type { PricedLine } from "@/lib/ai/agents/budget";
import { budgetDelta, describeCascade, diffBudgetLines, diffFunctions } from "@/lib/graph/diff";
import type { PlannedFunction } from "@/lib/schemas/event";

const line = (label: string, quantity: number, unitPaise: number): PricedLine => ({
  category: "catering",
  label,
  rationale: "",
  basis: { unit: "per_plate", quantity, unitTier: "low", unitPaise, cityTier: 1 },
  estimatePaise: quantity * unitPaise,
});

const fn = (name: string, over: Partial<PlannedFunction> = {}): PlannedFunction => ({
  name,
  ritualKeys: [],
  date: "2027-02-14",
  startTime: "18:00",
  endTime: "22:00",
  expectedGuests: 100,
  ...over,
});

describe("diffBudgetLines", () => {
  it("lists only lines whose quantity, price or estimate changed", () => {
    const before = [line("Dinner", 250, 900_00), line("Lunch", 40, 900_00)];
    const after = [line("Dinner", 350, 900_00), line("Lunch", 40, 900_00)];
    expect(diffBudgetLines(before, after, (_b, _a, i) => `reason ${i}`)).toEqual([
      {
        nodeId: "line:0",
        label: "Dinner",
        from: { quantity: 250, unitPaise: 900_00, estimatePaise: 250 * 900_00 },
        to: { quantity: 350, unitPaise: 900_00, estimatePaise: 350 * 900_00 },
        reason: "reason 0",
      },
    ]);
  });

  it("refuses lists of different lengths", () => {
    expect(() => diffBudgetLines([line("A", 1, 1)], [], () => "")).toThrow();
  });
});

describe("diffFunctions", () => {
  it("reports only the fields that changed", () => {
    const before = [fn("Biye"), fn("Haldi", { expectedGuests: 40 })];
    const after = [fn("Biye", { expectedGuests: 350, date: "2027-02-21" }), fn("Haldi", { expectedGuests: 40 })];
    expect(diffFunctions(before, after, "why")).toEqual([
      { nodeId: "function:0", label: "Biye", from: { expectedGuests: 100, date: "2027-02-14" }, to: { expectedGuests: 350, date: "2027-02-21" }, reason: "why" },
    ]);
  });
});

describe("budgetDelta", () => {
  it("is positive when the plan costs more", () => {
    expect(budgetDelta(100, 150)).toBe(50);
    expect(budgetDelta(150, 100)).toBe(-50);
  });
});

describe("describeCascade", () => {
  it("summarises a change with one conflict", () => {
    expect(
      describeCascade({
        headline: "Guest count changed from 250 to 260.",
        linesChanged: 1,
        budgetDeltaPaise: 9_000_00,
        conflicts: [{ type: "venue_capacity", severity: "warn", message: "" }],
      }),
    ).toBe("Guest count changed from 250 to 260. 1 budget item was recalculated (+₹9K). 1 conflict needs attention: venue capacity.");
  });

  it("ignores info notes when counting conflicts", () => {
    expect(
      describeCascade({
        headline: "Main day moved.",
        linesChanged: 0,
        budgetDeltaPaise: 0,
        conflicts: [{ type: "date_note", severity: "info", message: "" }],
      }),
    ).toBe("Main day moved. No budget items changed. No conflicts.");
  });
});
