import "server-only";
import { proposeBudget, type BudgetInput, type PricedBudget } from "@/lib/ai/agents/budget";
import { generateRitualPlan, type CultureInput } from "@/lib/ai/agents/culture";
import { planEvent, type PlannerInput } from "@/lib/ai/agents/planner";
import { planTimeline, type TimelineInput } from "@/lib/ai/agents/timeline";
import { cityTier } from "@/lib/rules/city-tier";
import type { ISODate } from "@/lib/rules/dates";
import type { OnboardingAnswers, PlannedEvent } from "@/lib/schemas/event";
import type { RitualPlan } from "@/lib/schemas/ritual";
import type { TimelinePlan } from "@/lib/schemas/timeline";
import type { BuildStep, EventPlan } from "@/lib/plan/types";

/**
 * Runs the four Phase 1 agents for a new event:
 *   Culture → Planner → (Budget ∥ Timeline)
 * Budget and Timeline both depend only on the Planner's output, so they run in parallel.
 */

export interface BuildPlanDeps {
  culture: (input: CultureInput) => Promise<RitualPlan>;
  planner: (input: PlannerInput) => Promise<PlannedEvent>;
  budget: (input: BudgetInput) => Promise<PricedBudget>;
  timeline: (input: TimelineInput) => Promise<TimelinePlan>;
}

export const defaultBuildPlanDeps: BuildPlanDeps = {
  culture: (input) => generateRitualPlan(input),
  planner: (input) => planEvent(input),
  budget: (input) => proposeBudget(input),
  timeline: (input) => planTimeline(input),
};

export interface BuildPlanOptions {
  /** Called as each step starts, for the "Building your plan" progress list. */
  onStep?: (step: BuildStep) => void;
  /** IST calendar date; defaults to today. */
  today?: ISODate;
  deps?: BuildPlanDeps;
}

export async function buildEventPlan(answers: OnboardingAnswers, opts: BuildPlanOptions = {}): Promise<EventPlan> {
  const deps = opts.deps ?? defaultBuildPlanDeps;
  const step = opts.onStep ?? (() => {});
  const tier = cityTier(answers.city);

  step("rituals");
  const rituals = await deps.culture({ culture: answers.culture, eventType: answers.eventType, notes: answers.notes });

  step("structure");
  const plan = await deps.planner({ answers, rituals: rituals.rituals });

  step("budget");
  const budgetP = deps.budget({ answers, cityTier: tier.tier, plan });
  step("timeline");
  const timelineP = deps.timeline({ answers, plan, rituals: rituals.rituals, ...(opts.today ? { today: opts.today } : {}) });
  const [budget, timeline] = await Promise.all([budgetP, timelineP]);

  return {
    title: answers.title?.trim() || defaultTitle(answers),
    answers,
    cityTier: tier.tier,
    cityTierKnown: tier.known,
    rituals,
    plan,
    budget,
    timeline,
  };
}

const EVENT_NOUN: Record<OnboardingAnswers["eventType"], string> = {
  wedding: "wedding",
  birthday: "birthday",
  community: "community event",
  other: "celebration",
};

/** "Bengali Hindu wedding in Kolkata", "Birthday in Pune". */
export function defaultTitle(answers: Pick<OnboardingAnswers, "culture" | "eventType" | "city">): string {
  const noun = EVENT_NOUN[answers.eventType];
  const tradition = answers.culture === "generic" ? "" : answers.culture.split("_").map(capitalize).join(" ");
  const base = tradition ? `${tradition} ${noun}` : capitalize(noun);
  return `${base} in ${answers.city.trim()}`;
}

const capitalize = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);
