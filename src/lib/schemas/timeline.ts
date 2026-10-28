import { z } from "zod";
import { BudgetCategory, type TaskSource } from "@/lib/schemas/enums";

/** Timeline agent output (CLAUDE.md §7.3): tasks with relative due dates and dependencies. */

export const TaskRef = z.string().regex(/^[a-z][a-z0-9_]{0,59}$/, "ref must be snake_case");

export const ProposedTask = z.object({
  /** Short id used only to express dependencies inside this proposal. */
  ref: TaskRef,
  title: z.string().min(1).max(120),
  description: z.string().max(300).optional(),
  category: BudgetCategory.optional(),
  functionName: z.string().optional(),
  /** Days relative to the main day: -90 means "T-90d". Code turns this into a date. */
  dueOffsetDays: z.number().int().min(-540).max(60),
  dependsOn: z.array(TaskRef),
});
export type ProposedTask = z.infer<typeof ProposedTask>;

export const TimelineProposal = z.object({
  tasks: z.array(ProposedTask).min(1).max(60),
});
export type TimelineProposal = z.infer<typeof TimelineProposal>;

export interface ScheduledTask {
  ref: string;
  title: string;
  description?: string;
  category?: z.infer<typeof BudgetCategory>;
  functionName?: string;
  /** When the task is actually scheduled (never before today). */
  dueDate: string;
  /** When it ideally should have been due; differs from dueDate when that day has passed. */
  idealDueDate: string;
  /** Ideal date had already passed when the plan was made, so the task is due now. */
  overdue: boolean;
  dependsOn: string[];
  source: Extract<TaskSource, "ai" | "ritual_kb">;
}

export interface TimelinePlan {
  tasks: ScheduledTask[];
  adjustments: string[];
}
