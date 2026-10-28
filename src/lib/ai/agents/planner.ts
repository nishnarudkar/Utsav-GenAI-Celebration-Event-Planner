import "server-only";
import { PLANNER_PROMPT_V1 } from "@/lib/ai/prompts/planner";
import { callStructured, type CallStructuredOptions } from "@/lib/ai/structured";
import { formatINR } from "@/lib/format";
import { allocateByWeight } from "@/lib/rules/budget-math";
import { addDays } from "@/lib/rules/dates";
import type { BudgetCategory } from "@/lib/schemas/enums";
import { EventPlanDraft, type OnboardingAnswers, type PlannedEvent, type PlannedFunction } from "@/lib/schemas/event";
import type { Ritual } from "@/lib/schemas/ritual";

/**
 * Planner agent: onboarding answers + ritual sequence → functions, budget split and
 * high-level tasks. The model returns structure (EventPlanDraft); `finalizeEventPlan`
 * resolves dates and paise deterministically.
 */

export interface PlannerInput {
  answers: OnboardingAnswers;
  rituals: ReadonlyArray<Pick<Ritual, "key" | "name" | "durationMinutes">>;
}

export interface PlannerDeps {
  structured: (opts: CallStructuredOptions<typeof EventPlanDraft>) => Promise<EventPlanDraft>;
}

const defaultDeps: PlannerDeps = { structured: (opts) => callStructured(opts) };

export async function planEvent(input: PlannerInput, deps: PlannerDeps = defaultDeps): Promise<PlannedEvent> {
  const { answers } = input;
  const draft = await deps.structured({
    schema: EventPlanDraft,
    name: "emit_event_plan",
    fixtureKey: `emit_event_plan.${answers.culture}.${answers.eventType}`,
    model: "smart",
    system: PLANNER_PROMPT_V1,
    messages: [{ role: "user", content: userMessage(input) }],
  });
  return finalizeEventPlan(draft, input);
}

function userMessage({ answers, rituals }: PlannerInput): string {
  const ritualLines = rituals.length
    ? rituals.map((r) => `- ${r.key}: ${r.name} (~${r.durationMinutes} min)`).join("\n")
    : "- (none; plan the functions this event type usually has)";
  return [
    `Event type: ${answers.eventType}`,
    `Tradition: ${answers.culture.replace(/_/g, " ")}`,
    `City: ${answers.city}`,
    `Main day: ${answers.startDate}`,
    `Guest count: ${answers.guestCount}`,
    `Budget: ${answers.budgetTotalPaise === null ? "not decided; plan proportions only" : formatINR(answers.budgetTotalPaise)}`,
    `Family notes: ${answers.notes?.trim() || "none"}`,
    "",
    "Ritual sequence, in order:",
    ritualLines,
  ].join("\n");
}

/**
 * Deterministic post-processing of the model's draft:
 * - day offsets → calendar dates; functions sorted chronologically
 * - unknown ritual keys dropped, duplicates kept on the first function only, missing ones reported
 * - expected guests capped at the event's guest count
 * - allocation percentages normalised to 100 and split into exact paise (if the budget is known)
 * Every change is recorded in `adjustments`.
 */
export function finalizeEventPlan(draft: EventPlanDraft, input: PlannerInput): PlannedEvent {
  const { answers } = input;
  const adjustments: string[] = [];
  const knownKeys = new Set(input.rituals.map((r) => r.key));
  const placed = new Set<string>();

  const ordered = draft.functions
    .map((f, i) => ({ f, i }))
    .sort((a, b) => a.f.dayOffset - b.f.dayOffset || a.f.startTime.localeCompare(b.f.startTime) || a.i - b.i);

  const functions: PlannedFunction[] = ordered.map(({ f }) => {
    const ritualKeys: string[] = [];
    for (const key of f.ritualKeys) {
      if (!knownKeys.has(key)) {
        adjustments.push(`Dropped unknown ritual "${key}" from ${f.name}.`);
      } else if (placed.has(key)) {
        adjustments.push(`Ritual "${key}" was listed twice; kept it at its first function.`);
      } else {
        placed.add(key);
        ritualKeys.push(key);
      }
    }
    let expectedGuests = f.expectedGuests;
    if (expectedGuests > answers.guestCount) {
      adjustments.push(`${f.name}: guests capped at ${answers.guestCount} (was ${expectedGuests}).`);
      expectedGuests = answers.guestCount;
    }
    return {
      name: f.name,
      ritualKeys,
      date: addDays(answers.startDate, f.dayOffset),
      startTime: f.startTime,
      endTime: f.endTime,
      expectedGuests,
      ...(f.notes ? { notes: f.notes } : {}),
    };
  });

  const unassignedRitualKeys = input.rituals.map((r) => r.key).filter((k) => !placed.has(k));

  // Merge duplicate categories, then normalise to 100.
  const weights: Partial<Record<BudgetCategory, number>> = {};
  for (const { category, percent } of draft.allocation) weights[category] = (weights[category] ?? 0) + percent;
  const weightSum = Object.values(weights).reduce((s, w) => s + (w ?? 0), 0);
  if (weightSum <= 0) throw new RangeError("Planner allocation has no positive percentages");
  if (Math.abs(weightSum - 100) > 0.5) adjustments.push(`Budget split summed to ${round1(weightSum)}%; scaled to 100%.`);
  const allocationPercent = Object.fromEntries(
    Object.entries(weights).map(([k, w]) => [k, round1(((w ?? 0) * 100) / weightSum)]),
  ) as Partial<Record<BudgetCategory, number>>;

  const allocationPaise = answers.budgetTotalPaise === null ? null : allocateByWeight(answers.budgetTotalPaise, weights);

  const dates = functions.map((f) => f.date).sort();
  return {
    functions,
    startDate: dates[0] ?? answers.startDate,
    endDate: dates.at(-1) ?? answers.startDate,
    allocationPercent,
    allocationPaise,
    highLevelTasks: draft.highLevelTasks,
    rationale: draft.rationale,
    unassignedRitualKeys,
    adjustments,
  };
}

const round1 = (n: number) => Math.round(n * 10) / 10;
