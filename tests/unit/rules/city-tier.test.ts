import { describe, expect, it } from "vitest";
import { cityTier, normalizeCity } from "@/lib/rules/city-tier";

describe("normalizeCity", () => {
  it("lowercases, strips punctuation and the region after a comma", () => {
    expect(normalizeCity("  New Delhi, NCR ")).toBe("new delhi");
    expect(normalizeCity("Thiruvananthapuram (Kerala)")).toBe("thiruvananthapuram kerala");
    expect(normalizeCity("Navi-Mumbai")).toBe("navi mumbai");
  });
});

describe("cityTier", () => {
  it.each([
    ["Kolkata", 1],
    ["calcutta", 1],
    ["Bangalore", 1],
    ["Gurgaon, Haryana", 1],
    ["Jaipur", 2],
    ["Kochi", 2],
    ["Mysore", 2],
  ] as const)("%s → tier %i", (city, tier) => {
    expect(cityTier(city)).toEqual({ tier, known: true });
  });

  it("defaults unknown towns to tier 2 and flags them", () => {
    expect(cityTier("Shantiniketan")).toEqual({ tier: 2, known: false });
    expect(cityTier("")).toEqual({ tier: 2, known: false });
  });
});
