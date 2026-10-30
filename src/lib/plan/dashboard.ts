import { CATEGORY_LABELS } from "@/lib/labels";
import { conflictIssues } from "@/lib/plan/diff-view";
import { checkVenueCapacity } from "@/lib/rules/capacity";
import { timelineOverlaps } from "@/lib/rules/conflicts";
import { daysUntil, type ISODate } from "@/lib/rules/dates";
import type { BudgetCategory } from "@/lib/schemas/enums";
import type { ScheduledTask } from "@/lib/schemas/timeline";
import type { EventPlan } from "@/lib/plan/types";

/**
 * Everything the dashboard shows, derived from a stored plan. Pure, so it's unit-tested and
 * the page component stays presentational.
 */

export type IssueSeverity = "info" | "warn" | "critical";

export interface PlanIssue {
  id: string;
  severity: IssueSeverity;
  title: string;
  detail: string;
}

export interface DonutSlice {
  key: BudgetCategory | "other";
  label: string;
  paise: number;
  /** Share of the priced total, 0–100 (one decimal). */
  percent: number;
  /** Categories folded into "Other". */
  members?: string[];
}

export interface DashboardSummary {
  daysToGo: number;
  budget: { committedPaise: number; totalPaise: number; isEstimate: boolean; percentUsed: number; overBudgetPaise: number };
  tasks: { done: number; total: number; dueNow: number };
  nextTasks: ScheduledTask[];
  issues: PlanIssue[];
  /** Issues that need action (warn + critical); the "open conflicts" tile. */
  openIssueCount: number;
  donut: DonutSlice[];
}

/**
 * Categories with their own donut slice, in fixed order. Colour follows the category, never
 * its rank, so slices keep their colours when amounts change. Everything else folds into
 * "Other" (charts cap at 5–6 colours; the Budget page shows all 12).
 */
export const DONUT_CATEGORIES = ["catering", "venue", "decor", "attire", "photography"] as const satisfies readonly BudgetCategory[];

const NEXT_TASKS = 5;

export function summarizeDashboard(event: EventPlan, today: ISODate): DashboardSummary {
  const { budget, timeline } = event;

  const committedPaise = budget.totalEstimatePaise;
  const totalPaise = budget.budgetTotalPaise;
  const percentUsed = totalPaise > 0 ? Math.round((committedPaise / totalPaise) * 1000) / 10 : 0;

  const tasks = timeline.tasks;
  const open = tasks.filter(isOpen);
  const dueNow = open.filter((t) => t.dueDate <= today).length;

  const issues = detectIssues(event);
  return {
    daysToGo: daysUntil(event.answers.startDate, new Date(`${today}T12:00:00+05:30`)),
    budget: { committedPaise, totalPaise, isEstimate: budget.budgetIsEstimate, percentUsed, overBudgetPaise: budget.overBudgetPaise },
    tasks: { done: tasks.length - open.length, total: tasks.length, dueNow },
    nextTasks: open.slice(0, NEXT_TASKS),
    issues,
    openIssueCount: issues.filter((i) => i.severity !== "info").length,
    donut: donutSlices(event),
  };
}

/** Tasks don't carry a status until task tracking lands; treat every task as open for now. */
function isOpen(_task: ScheduledTask): boolean {
  return true;
}

export function donutSlices(event: Pick<EventPlan, "budget">): DonutSlice[] {
  const byCategory = event.budget.byCategory;
  const total = Object.values(byCategory).reduce((s, c) => s + (c?.estimatePaise ?? 0), 0);
  if (total <= 0) return [];
  const pct = (p: number) => Math.round((p / total) * 1000) / 10;

  const slices: DonutSlice[] = [];
  for (const cat of DONUT_CATEGORIES) {
    const paise = byCategory[cat]?.estimatePaise ?? 0;
    if (paise > 0) slices.push({ key: cat, label: CATEGORY_LABELS[cat], paise, percent: pct(paise) });
  }
  const rest = (Object.entries(byCategory) as Array<[BudgetCategory, { estimatePaise: number } | undefined]>)
    .filter(([cat, c]) => !(DONUT_CATEGORIES as readonly string[]).includes(cat) && (c?.estimatePaise ?? 0) > 0)
    .sort((a, b) => (b[1]?.estimatePaise ?? 0) - (a[1]?.estimatePaise ?? 0));
  const otherPaise = rest.reduce((s, [, c]) => s + (c?.estimatePaise ?? 0), 0);
  if (otherPaise > 0) {
    slices.push({ key: "other", label: "Other", paise: otherPaise, percent: pct(otherPaise), members: rest.map(([cat]) => CATEGORY_LABELS[cat]) });
  }
  return slices;
}

/** Things the family should look at, including the conflicts that are still open after a change. */
export function detectIssues(event: EventPlan): PlanIssue[] {
  const issues: PlanIssue[] = [];
  const { budget, rituals, plan } = event;

  if (budget.overBudgetPaise > 0) {
    issues.push({ id: "over_budget", severity: "critical", title: "Over budget", detail: "The estimate is higher than your budget." });
  }
  issues.push(...conflictIssues([...checkVenueCapacity(plan.functions), ...timelineOverlaps(plan.functions)]));
  if (budget.unpriced.length > 0) {
    const n = budget.unpriced.length;
    issues.push({ id: "unpriced", severity: "warn", title: `${n} item${n === 1 ? "" : "s"} need${n === 1 ? "s" : ""} a quote`, detail: budget.unpriced.map((u) => u.label).join(", ") });
  }
  if (plan.unassignedRitualKeys.length > 0) {
    issues.push({ id: "unassigned_rituals", severity: "warn", title: "Rituals without a function", detail: `Not yet scheduled: ${plan.unassignedRitualKeys.join(", ")}` });
  }
  if (rituals.confidence === "low") {
    issues.push({ id: "ritual_confidence", severity: "warn", title: "Rituals are a general suggestion", detail: "Verify the sequence with your family priest or elders." });
  }
  if (!event.cityTierKnown) {
    issues.push({ id: "city_tier", severity: "info", title: "Prices use a typical city", detail: `We don't have price data for ${event.answers.city} yet, so estimates use mid-sized-city rates.` });
  }
  return issues;
}
