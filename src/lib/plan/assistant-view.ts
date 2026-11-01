import { formatDate, formatINR, formatINRCompact } from "@/lib/format";
import { FieldChange } from "@/lib/graph/types";
import { CATEGORY_LABELS } from "@/lib/labels";
import { summarizeDashboard } from "@/lib/plan/dashboard";
import type { EventPlan } from "@/lib/plan/types";
import { addDays, type ISODate } from "@/lib/rules/dates";
import { PLACEHOLDER, type AssistantChange, type AssistantDraft, type AssistantTool } from "@/lib/schemas/assistant";
import type { BudgetCategory } from "@/lib/schemas/enums";

/**
 * Turns the assistant's draft into something the page can show. Pure: every figure comes from the
 * plan, and every relative request is worked out here, so the model never does arithmetic.
 */

export type AssistantAction =
  { type: "change"; change: FieldChange; label: string } | { type: "open"; href: string; label: string };

export interface AssistantResponse {
  reply: string;
  action: AssistantAction | null;
}

const TOOL_LINKS: Record<AssistantTool, { path: string; label: string }> = {
  budget: { path: "/budget", label: "Open Budget" },
  timeline: { path: "/timeline", label: "Open Timeline" },
  vendors: { path: "/vendors", label: "Open Vendors" },
  council: { path: "/council", label: "Open Family Council" },
  live: { path: "/live", label: "Open Live mode" },
  vibe: { path: "/vibe", label: "Open Look & feel" },
  community: { path: "/community", label: "Open Community tools" },
};

const NOT_UNDERSTOOD =
  "I didn't quite catch what to change. Could you say it another way, such as “make it 300 guests”?";

/** Works out the new value from the current plan, or says why it can't. */
export function resolveChange(
  request: AssistantChange | null,
  plan: EventPlan,
): { change: FieldChange } | { problem: string } {
  if (!request) return { problem: NOT_UNDERSTOOD };
  const { field, op, amount, text } = request;
  const { guestCount, startDate } = plan.answers;

  const numeric = (current: number) => {
    if (amount === null) return null;
    if (op === "add") return current + amount;
    if (op === "percent") return current + (current * amount) / 100;
    return amount;
  };

  let value: number | string | null = null;
  if (field === "guest_count") {
    const next = numeric(guestCount);
    value = next === null ? null : Math.round(next);
  } else if (field === "budget_total") {
    // Rupees for "set" and "add"; a percentage works on paise directly.
    const current = plan.budget.budgetTotalPaise;
    const next =
      op === "percent"
        ? numeric(current)
        : amount === null
          ? null
          : op === "add"
            ? current + amount * 100
            : amount * 100;
    value = next === null ? null : Math.round(next / 100) * 100;
  } else if (field === "start_date") {
    if (op === "add" && amount !== null && Number.isInteger(amount)) value = addDays(startDate, amount);
    else if (op === "set") value = text;
  } else if (op === "set") {
    value = text;
  }

  if (value === null) return { problem: NOT_UNDERSTOOD };
  const parsed = FieldChange.safeParse({ field, value });
  if (parsed.success) return { change: parsed.data };
  if (field === "guest_count") return { problem: "Guest count needs to stay between 1 and 5,000." };
  if (field === "budget_total") return { problem: "That would leave no budget, so I can't make that change." };
  return { problem: NOT_UNDERSTOOD };
}

function currentValue(change: FieldChange, plan: EventPlan): number | string {
  switch (change.field) {
    case "guest_count":
      return plan.answers.guestCount;
    case "budget_total":
      return plan.budget.budgetTotalPaise;
    case "start_date":
      return plan.answers.startDate;
    case "city":
      return plan.answers.city;
  }
}

/** What the confirm button is about, such as "Guests: 250 → 350". */
export function describeChange(change: FieldChange, plan: EventPlan): string {
  const from = currentValue(change, plan);
  switch (change.field) {
    case "guest_count":
      return `Guests: ${from} → ${change.value}`;
    case "budget_total":
      return `Budget: ${formatINRCompact(from as number)} → ${formatINRCompact(change.value)}`;
    case "start_date":
      return `Main day: ${formatDate(from as string)} → ${formatDate(change.value)}`;
    case "city":
      return `City: ${from} → ${change.value}`;
  }
}

/** Replaces each {placeholder} with the plan's real figure. */
export function fillPlaceholders(reply: string, plan: EventPlan, today: ISODate): string {
  const summary = summarizeDashboard(plan, today);
  const { budget, answers } = plan;
  const left = budget.budgetTotalPaise - budget.totalEstimatePaise;
  const values: Record<string, string> = {
    guest_count: answers.guestCount.toLocaleString("en-IN"),
    budget_total: formatINR(budget.budgetTotalPaise),
    estimate: formatINR(budget.totalEstimatePaise),
    budget_position: left >= 0 ? `${formatINR(left)} left` : `${formatINR(-left)} over budget`,
    days_to_go: String(summary.daysToGo),
    main_day: formatDate(answers.startDate),
    city: answers.city,
    next_tasks:
      summary.nextTasks.map((t) => `${t.title} (by ${formatDate(t.dueDate)})`).join("; ") || "nothing outstanding",
    open_issues: summary.issues.map((i) => i.title).join("; ") || "no open problems",
  };
  return reply.replace(PLACEHOLDER, (_all, name: string) => {
    if (name.startsWith("spend:"))
      return formatINR(budget.byCategory[name.slice(6) as BudgetCategory]?.estimatePaise ?? 0);
    return values[name] ?? "";
  });
}

export function finalizeAssistant(
  draft: AssistantDraft,
  plan: EventPlan,
  eventId: string,
  today: ISODate,
): AssistantResponse {
  const reply = fillPlaceholders(draft.reply, plan, today);

  if (draft.intent === "change_plan") {
    const resolved = resolveChange(draft.change, plan);
    if ("problem" in resolved) return { reply: resolved.problem, action: null };
    if (currentValue(resolved.change, plan) === resolved.change.value)
      return { reply: "That's already what the plan says, so there's nothing to change.", action: null };
    return { reply, action: { type: "change", change: resolved.change, label: describeChange(resolved.change, plan) } };
  }

  if (draft.intent === "open_tool" && draft.tool) {
    if (draft.tool === "community" && plan.answers.eventType !== "community") return { reply, action: null };
    const { path, label } = TOOL_LINKS[draft.tool];
    return { reply, action: { type: "open", href: `/events/${eventId}${path}`, label } };
  }

  return { reply, action: null };
}

/** The plan as the model sees it: names and structure, never amounts. */
export function assistantContext(plan: EventPlan, today: ISODate): string {
  const summary = summarizeDashboard(plan, today);
  const { answers, rituals, budget } = plan;
  return [
    `Event: ${plan.title}. A ${answers.eventType} in ${answers.city}.`,
    `Functions: ${plan.plan.functions.map((f) => f.name).join(", ")}.`,
    `Budget categories: ${(Object.keys(budget.byCategory) as BudgetCategory[]).map((c) => `${CATEGORY_LABELS[c]} (spend:${c})`).join(", ")}.`,
    `Rituals in this plan: ${rituals.rituals.map((r) => `${r.name}: ${r.significance}`).join(" | ") || "none"}.`,
    `Ritual knowledge confidence: ${rituals.confidence}.`,
    `Next tasks: ${summary.nextTasks.map((t) => t.title).join("; ") || "none"}.`,
    `Open problems: ${summary.issues.map((i) => i.title).join("; ") || "none"}.`,
    `Today is ${today}. The main day is ${answers.startDate}.`,
  ].join("\n");
}
