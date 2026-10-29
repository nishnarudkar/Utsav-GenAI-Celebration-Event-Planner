import { z } from "zod";
import { isISODate } from "@/lib/rules/dates";
import { BudgetCategory, Culture, EventType } from "@/lib/schemas/enums";

/** Shared schemas for creating an event and the Planner agent's output. */

export const ISODateString = z.string().refine(isISODate, "expected a calendar date YYYY-MM-DD");
export const ClockTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "expected HH:MM (24h)");

/** The six onboarding answers (CLAUDE.md §9), as posted to POST /api/events. */
export const OnboardingAnswers = z.object({
  eventType: EventType,
  culture: Culture,
  city: z.string().trim().min(1).max(80),
  /** The main day (wedding ceremony, birthday, festival day). Other functions are placed around it. */
  startDate: ISODateString,
  guestCount: z.number().int().min(1).max(5000),
  /** null = "not sure? I'll estimate" — the total then comes from priced budget lines. */
  budgetTotalPaise: z.number().int().positive().nullable(),
  title: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(1000).optional(),
});
export type OnboardingAnswers = z.infer<typeof OnboardingAnswers>;

/** What the Planner model returns: structure and relative timing only, no money or dates. */
export const EventPlanDraft = z.object({
  functions: z
    .array(
      z.object({
        name: z.string().min(1).max(80),
        /** Ritual keys from the Culture agent held at this function. */
        ritualKeys: z.array(z.string()),
        /** Days relative to the main day: -2 = two days before, 0 = main day. */
        dayOffset: z.number().int().min(-60).max(30),
        startTime: ClockTime,
        /** May be earlier than startTime for functions that run past midnight. */
        endTime: ClockTime,
        expectedGuests: z.number().int().positive(),
        notes: z.string().max(200).optional(),
      }),
    )
    .min(1)
    .max(12),
  allocation: z
    .array(z.object({ category: BudgetCategory, percent: z.number().min(0).max(100) }))
    .min(1),
  highLevelTasks: z
    .array(z.object({ title: z.string().min(1).max(120), category: BudgetCategory.optional() }))
    .max(25),
  rationale: z.string().max(400),
});
export type EventPlanDraft = z.infer<typeof EventPlanDraft>;

/** The Planner's result after code has resolved dates and money. */
export interface PlannedFunction {
  name: string;
  ritualKeys: string[];
  date: string;
  startTime: string;
  endTime: string;
  expectedGuests: number;
  /** Seats at the booked venue, once known (set by the family or the demo seed). */
  venueCapacity?: number;
  notes?: string;
}

export interface PlannedEvent {
  functions: PlannedFunction[];
  /** First and last function dates. */
  startDate: string;
  endDate: string;
  /** Normalised to sum to 100. */
  allocationPercent: Partial<Record<BudgetCategory, number>>;
  /** Exact paise per category summing to the budget; null when the budget is still to be estimated. */
  allocationPaise: Partial<Record<BudgetCategory, number>> | null;
  highLevelTasks: EventPlanDraft["highLevelTasks"];
  rationale: string;
  /** Ritual keys the model didn't place in any function (shown to the user, never silently lost). */
  unassignedRitualKeys: string[];
  /** Adjustments code made to the model's draft, for the "Why?" panel and logs. */
  adjustments: string[];
}
