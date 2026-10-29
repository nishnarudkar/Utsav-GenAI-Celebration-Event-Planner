import { describe, expect, it } from "vitest";
import { conflictIssues, diffRows } from "@/lib/plan/diff-view";
import type { PlanDiff } from "@/lib/schemas/diff";

const rupees = (r: number) => r * 100;

const diff = (changed: PlanDiff["changed"], conflicts: PlanDiff["conflicts"] = []): PlanDiff => ({
  version: 2,
  budgetDeltaPaise: 0,
  changed,
  added: [],
  removed: [],
  conflicts,
  recoveryOptions: [],
  explanation: "",
});

describe("diffRows", () => {
  it("formats the field change itself", () => {
    expect(diffRows(diff([{ nodeId: "field:guest_count", label: "Guest count", from: 250, to: 350, reason: "Changed by you" }]))).toEqual([
      { key: "field:guest_count", label: "Guest count", from: "250 guests", to: "350 guests", direction: "up", reason: "Changed by you" },
    ]);
    const [budget] = diffRows(diff([{ nodeId: "field:budget_total", label: "Budget", from: rupees(15_00_000), to: rupees(12_00_000), reason: "" }]));
    expect(budget).toMatchObject({ from: "₹15L", to: "₹12L", direction: "down" });
    const [date] = diffRows(diff([{ nodeId: "field:start_date", label: "Main day", from: "2027-02-14", to: "2027-02-21", reason: "" }]));
    expect(date).toMatchObject({ from: "14 Feb 2027", to: "21 Feb 2027", direction: "neutral" });
  });

  it("shows budget lines with exact amounts and a signed delta", () => {
    const [row] = diffRows(
      diff([
        {
          nodeId: "line:2",
          label: "Wedding dinner — buffet",
          from: { quantity: 250, unitPaise: rupees(900), estimatePaise: rupees(2_25_000) },
          to: { quantity: 350, unitPaise: rupees(900), estimatePaise: rupees(3_15_000) },
          reason: "250 → 350 guests at Biye",
        },
      ]),
    );
    expect(row).toEqual({
      key: "line:2",
      label: "Wedding dinner — buffet",
      from: "₹2,25,000",
      to: "₹3,15,000",
      direction: "up",
      delta: "+₹90K",
      reason: "250 → 350 guests at Biye",
    });
  });

  it("marks savings as down", () => {
    const [row] = diffRows(
      diff([{ nodeId: "line:0", label: "Outfits", from: { estimatePaise: rupees(1_20_000) }, to: { estimatePaise: rupees(45_000) }, reason: "Recovery option" }]),
    );
    expect(row).toMatchObject({ direction: "down", delta: "−₹75K" });
  });

  it("describes function and timeline changes", () => {
    const rows = diffRows(
      diff([
        { nodeId: "function:2", label: "Biye", from: { expectedGuests: 250 }, to: { expectedGuests: 350 }, reason: "Follows the new guest count" },
        { nodeId: "function:0", label: "Aashirbaad", from: { date: "2027-02-12" }, to: { date: "2027-02-19" }, reason: "Moved 7 days later" },
        { nodeId: "timeline:all", label: "Task due dates", from: "2027-02-14", to: "2027-02-21", reason: "33 tasks moved 7 days later" },
      ]),
    );
    expect(rows.map((r) => [r.from, r.to, r.direction])).toEqual([
      ["250 guests", "350 guests", "neutral"],
      ["12 Feb 2027", "19 Feb 2027", "neutral"],
      ["14 Feb 2027", "21 Feb 2027", "neutral"],
    ]);
  });

  it("is robust to unexpected shapes", () => {
    expect(diffRows(diff([{ nodeId: "function:1", label: "X", from: null, to: "?", reason: "" }]))[0]).toMatchObject({ from: "—", to: "—" });
  });
});

describe("conflictIssues", () => {
  it("maps conflicts to titled issues keeping severity", () => {
    expect(
      conflictIssues([
        { type: "over_budget", severity: "critical", message: "Over budget by ₹1.5L." },
        { type: "something_new", severity: "info", message: "Hmm." },
      ]),
    ).toEqual([
      { id: "over_budget-0", severity: "critical", title: "Over budget", detail: "Over budget by ₹1.5L." },
      { id: "something_new-1", severity: "info", title: "Note", detail: "Hmm." },
    ]);
  });
});
