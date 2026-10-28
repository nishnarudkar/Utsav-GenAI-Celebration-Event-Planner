import { describe, expect, it } from "vitest";
import {
  formatClock,
  formatDate,
  formatINR,
  formatINRCompact,
  formatINRDelta,
  formatTime,
  parseINR,
  rupeesToPaise,
} from "@/lib/format";

const rupees = (r: number) => r * 100;

describe("formatINR", () => {
  it("uses Indian digit grouping", () => {
    expect(formatINR(rupees(0))).toBe("₹0");
    expect(formatINR(rupees(999))).toBe("₹999");
    expect(formatINR(rupees(1_000))).toBe("₹1,000");
    expect(formatINR(rupees(1_50_000))).toBe("₹1,50,000");
    expect(formatINR(rupees(15_00_000))).toBe("₹15,00,000");
    expect(formatINR(rupees(1_20_00_000))).toBe("₹1,20,00,000");
  });

  it("rounds to whole rupees unless showPaise is set", () => {
    expect(formatINR(12_345_67)).toBe("₹12,346");
    expect(formatINR(12_345_67, { showPaise: true })).toBe("₹12,345.67");
    expect(formatINR(12_345_05, { showPaise: true })).toBe("₹12,345.05");
    expect(formatINR(rupees(500), { showPaise: true })).toBe("₹500");
  });

  it("formats negatives with a minus sign", () => {
    expect(formatINR(rupees(-2_10_000))).toBe("−₹2,10,000");
  });

  it("rejects non-integer paise", () => {
    expect(() => formatINR(10.5)).toThrow(RangeError);
    expect(() => formatINR(Number.NaN)).toThrow(RangeError);
  });
});

describe("formatINRCompact", () => {
  it.each([
    [0, "₹0"],
    [950, "₹950"],
    [1_000, "₹1K"],
    [12_000, "₹12K"],
    [12_500, "₹12.5K"],
    [88_000, "₹88K"],
    [1_00_000, "₹1L"],
    [1_60_000, "₹1.6L"],
    [4_50_000, "₹4.5L"],
    [15_00_000, "₹15L"],
    [99_00_000, "₹99L"],
    [1_00_00_000, "₹1Cr"],
    [1_20_00_000, "₹1.2Cr"],
    [25_00_00_000, "₹25Cr"],
  ])("₹%i → %s", (r, expected) => {
    expect(formatINRCompact(rupees(r))).toBe(expected);
  });

  it("promotes values that round up into the next unit", () => {
    expect(formatINRCompact(rupees(999.6))).toBe("₹1K");
    expect(formatINRCompact(rupees(99_960))).toBe("₹1L");
    expect(formatINRCompact(rupees(99_96_000))).toBe("₹1Cr");
  });

  it("handles negatives", () => {
    expect(formatINRCompact(rupees(-90_000))).toBe("−₹90K");
  });
});

describe("formatINRDelta", () => {
  it("signs deltas for diff rows", () => {
    expect(formatINRDelta(rupees(1_60_000))).toBe("+₹1.6L");
    expect(formatINRDelta(rupees(-90_000))).toBe("−₹90K");
    expect(formatINRDelta(0)).toBe("₹0");
  });
});

describe("rupeesToPaise", () => {
  it("converts and rounds to integer paise", () => {
    expect(rupeesToPaise(15_00_000)).toBe(15_00_00_000);
    expect(rupeesToPaise(0.1 + 0.2)).toBe(30);
    expect(rupeesToPaise(850.555)).toBe(85_056);
  });

  it("rejects non-finite input", () => {
    expect(() => rupeesToPaise(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});

describe("parseINR", () => {
  it.each([
    ["15L", 15_00_000],
    ["15 lakh", 15_00_000],
    ["15 Lakhs", 15_00_000],
    ["4.5 lac", 4_50_000],
    ["₹15,00,000", 15_00_000],
    ["Rs. 50000", 50_000],
    ["INR 2500", 2_500],
    ["80k", 80_000],
    ["1.2 cr", 1_20_00_000],
    ["1.2Crore", 1_20_00_000],
    ["  750  ", 750],
  ])("%s → ₹%i", (input, r) => {
    expect(parseINR(input)).toBe(rupees(r));
  });

  it.each(["", "abc", "15 million", "-5L", "1.2.3", "not sure"])("rejects %j", (input) => {
    expect(parseINR(input)).toBeNull();
  });
});

describe("formatDate", () => {
  it("formats calendar dates as '14 Feb 2027'", () => {
    expect(formatDate("2027-02-14")).toBe("14 Feb 2027");
    expect(formatDate("2026-09-05")).toBe("5 Sep 2026");
  });

  it("can include the weekday", () => {
    expect(formatDate("2027-02-14", { weekday: true })).toBe("Sun, 14 Feb 2027");
  });

  it("shows instants on the IST calendar", () => {
    // 20:00 UTC on 13 Feb is 01:30 IST on 14 Feb
    expect(formatDate(new Date("2027-02-13T20:00:00Z"))).toBe("14 Feb 2027");
    expect(formatDate(new Date("2027-02-13T18:00:00Z"))).toBe("13 Feb 2027");
  });

  it("rejects invalid calendar dates", () => {
    expect(() => formatDate("2027-02-30")).toThrow(RangeError);
    expect(() => formatDate("14/02/2027")).toThrow(RangeError);
  });
});

describe("formatTime / formatClock", () => {
  it("formats instants in IST", () => {
    expect(formatTime(new Date("2027-02-14T14:00:00Z"))).toBe("7:30 PM");
    expect(formatTime(new Date("2027-02-13T18:30:00Z"))).toBe("12:00 AM");
    expect(formatTime(new Date("2027-02-14T06:30:00Z"))).toBe("12:00 PM");
  });

  it("formats 24h clock strings", () => {
    expect(formatClock("18:30")).toBe("6:30 PM");
    expect(formatClock("00:05")).toBe("12:05 AM");
    expect(formatClock("12:00")).toBe("12:00 PM");
    expect(() => formatClock("24:00")).toThrow(RangeError);
  });
});
