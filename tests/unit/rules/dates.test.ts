import { describe, expect, it } from "vitest";
import { addDays, daysUntil, diffDays, isISODate, toISTDate } from "@/lib/rules/dates";

describe("isISODate", () => {
  it("accepts real calendar dates only", () => {
    expect(isISODate("2027-02-14")).toBe(true);
    expect(isISODate("2028-02-29")).toBe(true); // leap year
    expect(isISODate("2027-02-29")).toBe(false);
    expect(isISODate("2027-13-01")).toBe(false);
    expect(isISODate("2027-2-14")).toBe(false);
  });
});

describe("addDays", () => {
  it("adds and subtracts across month and year boundaries", () => {
    expect(addDays("2027-02-14", 1)).toBe("2027-02-15");
    expect(addDays("2027-02-28", 1)).toBe("2027-03-01");
    expect(addDays("2027-02-14", -90)).toBe("2026-11-16"); // T-90d
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("rejects fractional days and bad dates", () => {
    expect(() => addDays("2027-02-14", 1.5)).toThrow(RangeError);
    expect(() => addDays("2027-02-30", 1)).toThrow(RangeError);
  });
});

describe("diffDays", () => {
  it("counts whole days, signed", () => {
    expect(diffDays("2026-10-25", "2027-02-14")).toBe(112);
    expect(diffDays("2027-02-14", "2026-10-25")).toBe(-112);
    expect(diffDays("2027-02-14", "2027-02-14")).toBe(0);
  });
});

describe("toISTDate / daysUntil", () => {
  it("uses the IST calendar day for 'now'", () => {
    expect(toISTDate(new Date("2026-10-24T18:29:59Z"))).toBe("2026-10-24");
    expect(toISTDate(new Date("2026-10-24T18:30:00Z"))).toBe("2026-10-25");
  });

  it("counts days to go from the IST date", () => {
    const now = new Date("2026-10-25T04:00:00Z"); // 09:30 IST, 25 Oct
    expect(daysUntil("2027-02-14", now)).toBe(112);
    expect(daysUntil("2026-10-25", now)).toBe(0);
    expect(daysUntil("2026-10-20", now)).toBe(-5);
  });
});
