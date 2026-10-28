import "server-only";
import { TIMELINE_PROMPT_V1 } from "@/lib/ai/prompts/timeline";
import { callStructured, type CallStructuredOptions } from "@/lib/ai/structured";
import { formatDate } from "@/lib/format";
import { daysUntil, toISTDate, type ISODate } from "@/lib/rules/dates";
import { ritualPrepTasks, scheduleTasks, sortByDue } from "@/lib/rules/schedule";
import type { OnboardingAnswers, PlannedEvent } from "@/lib/schemas/event";
import type { Ritual } from "@/lib/schemas/ritual";
import { TimelineProposal, type TimelinePlan } from "@/lib/schemas/timeline";

/**
 * Timeline agent: plan → tasks with relative offsets and dependencies. Dates, dependency
 * repair and ritual-item prep tasks are deterministic (lib/rules/schedule.ts).
 */

export interface TimelineInput {
  answers: OnboardingAnswers;
  plan: Pick<PlannedEvent, "functions" | "highLevelTasks">;
  rituals: ReadonlyArray<Pick<Ritual, "key" | "items">>;
  /** IST calendar date; defaults to today. Injected in tests and demo mode. */
  today?: ISODate;
}

export interface TimelineDeps {
  structured: (opts: CallStructuredOptions<typeof TimelineProposal>) => Promise<TimelineProposal>;
}

const defaultDeps: TimelineDeps = { structured: (opts) => callStructured(opts) };

export async function planTimeline(input: TimelineInput, deps: TimelineDeps = defaultDeps): Promise<TimelinePlan> {
  const today = input.today ?? toISTDate(new Date());
  const proposal = await deps.structured({
    schema: TimelineProposal,
    name: "emit_timeline",
    fixtureKey: `emit_timeline.${input.answers.culture}.${input.answers.eventType}`,
    model: "smart",
    system: TIMELINE_PROMPT_V1,
    messages: [{ role: "user", content: userMessage(input, today) }],
  });
  return buildTimeline(proposal, { ...input, today });
}

function userMessage({ answers, plan }: TimelineInput, today: ISODate): string {
  const main = answers.startDate;
  const days = daysUntil(main, new Date(`${today}T12:00:00+05:30`));
  return [
    `Event: ${answers.eventType}, ${answers.culture.replace(/_/g, " ")}, ${answers.city}, ${answers.guestCount} guests`,
    `Main day: ${formatDate(main)} — ${days} days from today.`,
    "",
    "Functions:",
    ...plan.functions.map((f) => `- ${f.name}: ${formatDate(f.date)}`),
    "",
    "High-level tasks to cover:",
    ...plan.highLevelTasks.map((t) => `- ${t.title}${t.category ? ` [${t.category}]` : ""}`),
  ].join("\n");
}

/** Deterministic part: schedule the model's tasks and add ritual prep tasks. */
export function buildTimeline(proposal: TimelineProposal, input: TimelineInput & { today: ISODate }): TimelinePlan {
  const { tasks, adjustments } = scheduleTasks(proposal.tasks, {
    mainDate: input.answers.startDate,
    today: input.today,
    functionNames: new Set(input.plan.functions.map((f) => f.name)),
  });

  const itemsByRitual = new Map(input.rituals.map((r) => [r.key, r.items.map((i) => i.item)]));
  const prep = ritualPrepTasks(
    input.plan.functions.map((f) => ({
      name: f.name,
      date: f.date,
      items: [...new Set(f.ritualKeys.flatMap((k) => itemsByRitual.get(k) ?? []))],
    })),
    input.today,
  );

  // Keep refs unique if the model happened to use a prep_* id.
  const taken = new Set(tasks.map((t) => t.ref));
  const prepUnique = prep.map((t) => (taken.has(t.ref) ? { ...t, ref: `${t.ref}_kb` } : t));

  return { tasks: sortByDue([...tasks, ...prepUnique]), adjustments };
}
