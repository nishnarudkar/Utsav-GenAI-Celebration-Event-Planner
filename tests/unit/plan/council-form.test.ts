import { describe, expect, it } from "vitest";
import { EMPTY_FORM, parseStakeholderForm, preferenceSummary } from "@/lib/plan/council-form";

const form = (over: Partial<typeof EMPTY_FORM>) => ({ ...EMPTY_FORM, name: "Mr & Mrs Sen", ...over });

describe("parseStakeholderForm", () => {
  it("builds an API body, leaving blank preferences out", () => {
    expect(parseStakeholderForm(form({ role: "bride_family", guestCount: "1,200", budgetMax: "12 lakh", venueStyle: "lawn", notes: "  Elders first  " }))).toEqual({
      ok: true,
      value: {
        name: "Mr & Mrs Sen",
        role: "bride_family",
        weight: 1,
        preferences: { guestCount: 1200, budgetMaxPaise: 12_00_000_00, venueStyle: "lawn", notes: "Elders first" },
      },
    });
    expect(parseStakeholderForm(form({}))).toMatchObject({ ok: true, value: { preferences: {} } });
  });

  it("gives friendly messages", () => {
    expect(parseStakeholderForm(EMPTY_FORM)).toMatchObject({ ok: false, message: expect.stringContaining("name") });
    expect(parseStakeholderForm(form({ guestCount: "lots" }))).toMatchObject({ ok: false, message: expect.stringContaining("Guests") });
    expect(parseStakeholderForm(form({ guestCount: "9000" })).ok).toBe(false);
    expect(parseStakeholderForm(form({ budgetMax: "plenty" }))).toMatchObject({ ok: false, message: expect.stringContaining("budget limit") });
  });
});

describe("preferenceSummary", () => {
  it("lists preferences as short phrases", () => {
    expect(preferenceSummary({ guestCount: 350, budgetMaxPaise: 12_00_000_00, venueStyle: "banquet_hall", functions: "fewer", menu: "mixed", notes: "Shehnai please" })).toEqual([
      "350 guests",
      "Budget up to ₹12L",
      "Banquet hall",
      "Fewer functions",
      "Mixed menu",
      "Shehnai please",
    ]);
  });

  it("skips 'no preference' and tolerates bad data", () => {
    expect(preferenceSummary({ venueStyle: "no_preference", menu: "no_preference" })).toEqual([]);
    expect(preferenceSummary("nonsense")).toEqual([]);
  });
});
