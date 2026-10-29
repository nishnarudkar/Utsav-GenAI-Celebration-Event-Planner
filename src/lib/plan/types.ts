import type { PricedBudget } from "@/lib/ai/agents/budget";
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
  createdAt: string;
  updatedAt: string;
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
