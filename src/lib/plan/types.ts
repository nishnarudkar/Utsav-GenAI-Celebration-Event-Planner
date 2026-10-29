import type { PricedBudget } from "@/lib/ai/agents/budget";
import type { PlanChange } from "@/lib/graph/types";
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
  createdAt: string;
  updatedAt: string;
}

/** One applied cascade (CLAUDE.md §6 plan_changes): powers the diff history and Undo. */
export interface ChangeRecord {
  id: string;
  eventId: string;
  /** The event version this change produced. */
  version: number;
  trigger: PlanChange;
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
