import { describe, expect, it } from "vitest";
import { applyDelay, buildRunOfShow, overruns, slotTime } from "@/lib/rules/run-of-show";
import type { PlannedFunction } from "@/lib/schemas/event";
import type { Ritual } from "@/lib/schemas/ritual";

const DATE = "2027-02-14";
const fn = (name: string, startTime: string, endTime: string, ritualKeys: string[] = [], date = DATE): PlannedFunction => ({
  name,
  date,
  startTime,
  endTime,
  ritualKeys,
  expectedGuests: 100,
});
const ritual = (key: string, durationMinutes: number): Ritual => ({ key, name: key.toUpperCase(), order: 1, durationMinutes, participants: [], items: [], significance: "" });

const RITUALS = [ritual("a", 60), ritual("b", 30), ritual("c", 180)];
const FUNCTIONS = [fn("Night", "22:00", "01:00", ["c"]), fn("Evening", "18:00", "21:00", ["a", "b"]), fn("Other day", "10:00", "11:00", [], "2027-02-15")];
const slots = buildRunOfShow(FUNCTIONS, RITUALS, DATE);

describe("buildRunOfShow", () => {
  it("runs rituals back to back, in time order, for that day only", () => {
    expect(slots.map((s) => [s.id, s.startMin, s.endMin])).toEqual([
      ["a", 1080, 1140],
      ["b", 1140, 1170],
      ["c", 1320, 1500],
    ]);
  });

  it("gives a function with no rituals one slot, for its full time", () => {
    const [slot] = buildRunOfShow([fn("Sangeet night", "22:00", "01:00")], [], DATE);
    expect(slot).toMatchObject({ id: "fn_sangeet_night", isRitual: false, startMin: 1320, endMin: 1500 });
  });

  it("adds stored delays", () => {
    expect(buildRunOfShow(FUNCTIONS, RITUALS, DATE, { b: 30 }).map((s) => s.startMin)).toEqual([1080, 1170, 1320]);
  });
});

describe("applyDelay", () => {
  it("moves the slot and the rest of its function, not earlier slots", () => {
    expect(applyDelay(slots, "b", 20)).toEqual({ b: 20 });
    expect(applyDelay(slots, "a", 20)).toEqual({ a: 20, b: 20 });
  });

  it("lets spare time between functions absorb a delay", () => {
    expect(applyDelay(slots, "a", 150)).toEqual({ a: 150, b: 150 }); // ends exactly at the next start
  });

  it("pushes a later function only by what's left after the spare time", () => {
    expect(applyDelay(slots, "a", 180)).toEqual({ a: 180, b: 180, c: 30 });
  });

  it("doesn't add to an overlap that was already there", () => {
    const tight = buildRunOfShow([fn("Evening", "18:00", "21:00", ["a"]), fn("Night", "18:30", "22:00", ["b"])], RITUALS, DATE);
    expect(applyDelay(tight, "a", 10)).toEqual({ a: 10, b: 10 });
  });

  it("returns null for an unknown slot", () => {
    expect(applyDelay(slots, "nope", 10)).toBeNull();
  });
});

describe("slotTime", () => {
  it("wraps past midnight and says so", () => {
    expect(slotTime(1110)).toBe("6:30 PM");
    expect(slotTime(1470)).toBe("12:30 AM (next day)");
    expect(slotTime(0)).toBe("12:00 AM");
  });
});

describe("overruns", () => {
  it("names functions pushed past their planned finish, including overnight ones", () => {
    expect(overruns(FUNCTIONS, slots)).toEqual([]);
    const late = slots.map((s) => (s.id === "c" ? { ...s, endMin: s.endMin + 30 } : s));
    expect(overruns(FUNCTIONS, late)).toEqual(["Night now runs until 1:30 AM (next day), past its planned finish of 1:00 AM (next day)."]);
  });
});
