import { z } from "zod";
import { BUDGET_CATEGORIES } from "@/lib/schemas/enums";

/** The event assistant: free text in, an answer or a proposed action out. */

const ASSISTANT_FIELDS = ["guest_count", "budget_total", "start_date", "city"] as const;
export const ASSISTANT_TOOLS = ["budget", "timeline", "vendors", "council", "live", "vibe", "community"] as const;
export type AssistantTool = (typeof ASSISTANT_TOOLS)[number];

/** Offered as buttons. They have saved wording, so they're instant and work without AI quota. */
export const ASSISTANT_SUGGESTIONS = [
  "Mom wants 100 more guests",
  "What should we book first?",
  "How much budget is left?",
  "The family disagrees on the guest list",
];

/** Figures only code may supply. The model writes these and `fillPlaceholders` replaces them. */
const PLACEHOLDERS = [
  "guest_count",
  "budget_total",
  "estimate",
  "budget_position",
  "days_to_go",
  "main_day",
  "city",
  "next_tasks",
  "open_issues",
  ...BUDGET_CATEGORIES.map((c) => `spend:${c}`),
];

export const PLACEHOLDER = /\{([a-z_:]+)\}/g;

const Reply = z
  .string()
  .min(1)
  .max(500)
  .superRefine((text, ctx) => {
    if (/[0-9₹]/.test(text))
      ctx.addIssue({
        code: "custom",
        message: "Write no digits or amounts. Use a placeholder such as {budget_position}.",
      });
    for (const [, name] of text.matchAll(PLACEHOLDER)) {
      if (name && !PLACEHOLDERS.includes(name))
        ctx.addIssue({ code: "custom", message: `Unknown placeholder {${name}}.` });
    }
  });

/**
 * What the model returns. A change is a request, not a result: "100 more guests" is
 * { op: "add", amount: 100 }, and code works out the new value from the current plan.
 */
export const AssistantDraft = z.object({
  intent: z.enum(["change_plan", "answer", "open_tool"]),
  reply: Reply,
  change: z
    .object({
      field: z.enum(ASSISTANT_FIELDS),
      op: z.enum(["set", "add", "percent"]),
      /** Guests, whole rupees, days to move the date, or a percentage. Negative lowers it. */
      amount: z.number().nullable(),
      /** A city name, or a date as YYYY-MM-DD, for "set". */
      text: z.string().max(80).nullable(),
    })
    .nullable(),
  tool: z.enum(ASSISTANT_TOOLS).nullable(),
});
export type AssistantDraft = z.infer<typeof AssistantDraft>;
export type AssistantChange = NonNullable<AssistantDraft["change"]>;

export const AssistantRequest = z.object({
  message: z.string().trim().min(1).max(300),
  /** Recent turns, so "make it 400" can follow on. Held by the browser, not stored. */
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(600) }))
    .max(6)
    .default([]),
});
export type AssistantRequest = z.infer<typeof AssistantRequest>;
