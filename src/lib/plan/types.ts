import type { PricedBudget } from "@/lib/ai/agents/budget";
import type { PlanChange } from "@/lib/graph/types";
import type { QuoteAnalysis } from "@/lib/rules/quote-analysis";
import type { CouncilResolution, Stakeholder } from "@/lib/schemas/council";
import type { PlanDiff } from "@/lib/schemas/diff";
import type { CityTier, EventStatus } from "@/lib/schemas/enums";
import type { OnboardingAnswers, PlannedEvent } from "@/lib/schemas/event";
import type { RitualPlan } from "@/lib/schemas/ritual";
import type { TimelinePlan } from "@/lib/schemas/timeline";

/** Everything Utsav generates for one event: the living plan the dashboard renders. */
export interface EventPlan {
  title: string;
  answers: OnboardingAnswers;
  cityTier: CityTier;
  /** False when the city wasn't recognised and the tier was defaulted; the UI asks to confirm. */
  cityTierKnown: boolean;
  rituals: RitualPlan;
  plan: PlannedEvent;
  budget: PricedBudget;
  timeline: TimelinePlan;
}

export interface StoredEvent extends EventPlan {
  id: string;
  status: EventStatus;
  /** Incremented by every cascade (CLAUDE.md §6). */
  version: number;
  /** Ritual items the family has ticked off, as ritual item ids ("gaye_holud#0"). */
  procuredItems: string[];
  /** Vendor quotes checked with Quote X-Ray, newest first. Kept outside the plan, so Undo leaves them. */
  quotes: StoredQuote[];
  /** Family Council members. Like quotes and ticks, kept outside the plan snapshot. */
  stakeholders: Stakeholder[];
  /** The latest Council result, or null if it hasn't run since the stakeholders last changed. */
  council: CouncilResolution | null;
  createdAt: string;
  updatedAt: string;
}

/** A checked vendor quote (CLAUDE.md §6 quotes). The uploaded file itself isn't kept. */
export interface StoredQuote {
  id: string;
  fileName: string;
  analysis: QuoteAnalysis;
  negotiationMessage: string;
  createdAt: string;
}

/** Applying a recovery option or Council compromise is logged like a change, so it can be undone. */
export interface RecoveryTrigger {
  field: "recovery" | "council";
  optionId: string;
  /** The option title, shown in the change log. */
  value: string;
  from: null;
}

export type ChangeTrigger = PlanChange | RecoveryTrigger;

/** One applied cascade (CLAUDE.md §6 plan_changes): powers the diff history and Undo. */
export interface ChangeRecord {
  id: string;
  eventId: string;
  /** The event version this change produced. */
  version: number;
  trigger: ChangeTrigger;
  diff: PlanDiff;
  /** The plan before the change; Undo restores it exactly. */
  before: EventPlan;
  undone: boolean;
  createdAt: string;
}

export interface EventSummary {
  id: string;
  title: string;
  eventType: OnboardingAnswers["eventType"];
  city: string;
  startDate: string;
  guestCount: number;
  budgetTotalPaise: number;
  status: EventStatus;
}

/** Progress steps shown while the plan builds (CLAUDE.md §9: Rituals → Budget → Timeline → Checklist). */
export const BUILD_STEPS = ["rituals", "structure", "budget", "timeline"] as const;
export type BuildStep = (typeof BUILD_STEPS)[number];
