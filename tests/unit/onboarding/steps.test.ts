import { describe, expect, it } from "vitest";
import {
  applyAnswer,
  parseBudget,
  parseCity,
  parseCulture,
  parseEventType,
  parseGuestCount,
  parseStartDate,
  STEP_ORDER,
  stepPrompt,
  toOnboardingAnswers,
  type CollectedAnswers,
} from "@/lib/onboarding/steps";
import { OnboardingAnswers } from "@/lib/schemas/event";

const TODAY = "2026-10-29";

describe("step parsers", () => {
  it("event type and tradition accept only their options", () => {
    expect(parseEventType("wedding")).toEqual({ ok: true, value: "wedding", display: "Wedding" });
    expect(parseEventType("party").ok).toBe(false);
    expect(parseCulture("punjabi_sikh")).toEqual({ ok: true, value: "punjabi_sikh", display: "Punjabi / Sikh" });
    expect(parseCulture("generic")).toMatchObject({ display: "No specific tradition" });
    expect(parseCulture("klingon").ok).toBe(false);
  });

  it("city trims and collapses spaces", () => {
    expect(parseCity("  New   Delhi ")).toEqual({ ok: true, value: "New Delhi", display: "New Delhi" });
    expect(parseCity("   ")).toEqual({ ok: false, message: "Which city? Just the name is fine." });
  });

  it("date must be a real upcoming date within 3 years", () => {
    expect(parseStartDate("2027-02-14", TODAY)).toEqual({ ok: true, value: "2027-02-14", display: "Sun, 14 Feb 2027" });
    expect(parseStartDate(TODAY, TODAY).ok).toBe(true);
    expect(parseStartDate("2026-10-28", TODAY)).toMatchObject({ ok: false, message: expect.stringContaining("passed") });
    expect(parseStartDate("2030-01-01", TODAY)).toMatchObject({ ok: false, message: expect.stringContaining("3 years") });
    expect(parseStartDate("2027-02-30", TODAY).ok).toBe(false);
  });

  it("guest count accepts digits with commas and spaces", () => {
    expect(parseGuestCount("1,200")).toEqual({ ok: true, value: 1200, display: "1,200 guests" });
    expect(parseGuestCount("250")).toMatchObject({ ok: true, value: 250 });
    expect(parseGuestCount("two hundred").ok).toBe(false);
    expect(parseGuestCount("0")).toMatchObject({ ok: false });
    expect(parseGuestCount("6000")).toMatchObject({ ok: false, message: expect.stringContaining("5,000") });
    expect(parseGuestCount("2.5").ok).toBe(false);
  });

  it("budget understands Indian notation and 'estimate for me'", () => {
    expect(parseBudget("15 lakh")).toEqual({ ok: true, value: 15_00_000_00, display: "₹15,00,000" });
    expect(parseBudget("₹1.2 cr")).toMatchObject({ ok: true, value: 1_20_00_000_00 });
    expect(parseBudget("estimate")).toEqual({ ok: true, value: null, display: "Not sure — estimate for me" });
    expect(parseBudget("Not sure")).toMatchObject({ ok: true, value: null });
    expect(parseBudget("lots").ok).toBe(false);
    expect(parseBudget("500")).toMatchObject({ ok: false, message: expect.stringContaining("₹10,000") });
  });
});

describe("stepPrompt", () => {
  it("leads wedding traditions with specific ones and other events with 'No specific tradition'", () => {
    expect(stepPrompt("culture", { eventType: "wedding" }).chips[0]?.value).toBe("bengali_hindu");
    expect(stepPrompt("culture", { eventType: "birthday" }).chips[0]?.value).toBe("generic");
  });

  it("asks about the wedding day for weddings", () => {
    expect(stepPrompt("startDate", { eventType: "wedding" }).question).toContain("wedding day");
    expect(stepPrompt("startDate", { eventType: "birthday" }).question).toBe("When is the main day?");
  });

  it("has an 'estimate for me' budget chip that parses", () => {
    const chip = stepPrompt("budget", {}).chips.find((c) => c.label.startsWith("Not sure"));
    expect(chip && parseBudget(chip.value)).toMatchObject({ ok: true, value: null });
  });

  it("every chip on every step parses", () => {
    const answers: CollectedAnswers = { eventType: "wedding" };
    for (const step of STEP_ORDER) {
      for (const chip of stepPrompt(step, answers).chips) {
        expect(applyAnswer(step, chip.value, answers, TODAY).ok, `${step}: ${chip.label}`).toBe(true);
      }
    }
  });
});

describe("applyAnswer / toOnboardingAnswers", () => {
  it("collects the demo wedding into a valid API body", () => {
    let answers: CollectedAnswers = {};
    const inputs: Record<string, string> = {
      eventType: "wedding",
      culture: "bengali_hindu",
      city: "Kolkata",
      startDate: "2027-02-14",
      guestCount: "250",
      budget: "15L",
    };
    for (const step of STEP_ORDER) {
      expect(toOnboardingAnswers(answers)).toBeNull();
      const r = applyAnswer(step, inputs[step]!, answers, TODAY);
      if (!r.ok) throw new Error(r.message);
      answers = r.answers;
    }
    const body = toOnboardingAnswers(answers);
    expect(body).toEqual({
      eventType: "wedding",
      culture: "bengali_hindu",
      city: "Kolkata",
      startDate: "2027-02-14",
      guestCount: 250,
      budgetTotalPaise: 15_00_000_00,
    });
    expect(OnboardingAnswers.safeParse(body).success).toBe(true);
  });

  it("keeps an 'estimate for me' budget as null, not missing", () => {
    const base: CollectedAnswers = { eventType: "birthday", culture: "generic", city: "Pune", startDate: "2027-01-10", guestCount: 60 };
    const r = applyAnswer("budget", "estimate", base, TODAY);
    expect(r.ok && toOnboardingAnswers(r.answers)).toMatchObject({ budgetTotalPaise: null });
  });

  it("returns the friendly message and leaves answers unchanged on bad input", () => {
    const answers: CollectedAnswers = { eventType: "wedding" };
    expect(applyAnswer("guestCount", "lots", answers, TODAY)).toEqual({ ok: false, message: "Just a number, like 250." });
  });
});
