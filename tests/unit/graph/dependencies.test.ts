import { describe, expect, it } from "vitest";
import { computeImpact, DEPENDENCIES, guestScaling } from "@/lib/graph/dependencies";
import { FieldChange, WATCHED_FIELDS } from "@/lib/graph/types";

describe("DEPENDENCIES", () => {
  it("defines rules for every watched field", () => {
    for (const f of WATCHED_FIELDS) expect(DEPENDENCIES[f].length, f).toBeGreaterThan(0);
  });

  it("guest count reaches catering, invites, gifts, transport, venue capacity and the budget check", () => {
    const targets = DEPENDENCIES.guest_count.map((r) => r.target);
    expect(targets).toEqual(
      expect.arrayContaining(["budget:catering", "budget:invites", "budget:gifts", "budget:transport", "check:venue_capacity", "check:over_budget"]),
    );
    expect(targets).not.toContain("budget:venue");
  });

  it("has no duplicate targets per field", () => {
    for (const f of WATCHED_FIELDS) {
      const targets = DEPENDENCIES[f].map((r) => r.target);
      expect(new Set(targets).size, f).toBe(targets.length);
    }
  });
});

describe("computeImpact", () => {
  it("returns the field's rules", () => {
    expect(computeImpact({ field: "budget_total", value: 12_00_000_00, from: 15_00_000_00 })).toEqual(DEPENDENCIES.budget_total);
  });

  it("returns nothing when the value is unchanged", () => {
    expect(computeImpact({ field: "guest_count", value: 250, from: 250 })).toEqual([]);
  });
});

describe("guestScaling", () => {
  it.each([
    ["catering", "per_plate", "function_guests"],
    ["gifts", "per_guest", "function_guests"],
    ["transport", "per_guest", "function_guests"],
    ["invites", "per_item", "event_guests"],
    ["gifts", "per_item", "fixed"], // ceremonial trays don't grow with guests
    ["venue", "per_day", "fixed"],
    ["decor", "flat", "fixed"],
  ] as const)("%s %s → %s", (category, unit, expected) => {
    expect(guestScaling({ category, basis: { unit } })).toBe(expected);
  });
});

describe("FieldChange", () => {
  it("validates each field's value", () => {
    expect(FieldChange.safeParse({ field: "guest_count", value: 350 }).success).toBe(true);
    expect(FieldChange.safeParse({ field: "guest_count", value: 0 }).success).toBe(false);
    expect(FieldChange.safeParse({ field: "start_date", value: "2027-02-30" }).success).toBe(false);
    expect(FieldChange.safeParse({ field: "budget_total", value: 1.5 }).success).toBe(false);
    expect(FieldChange.safeParse({ field: "venue", value: "x" }).success).toBe(false);
  });
});
