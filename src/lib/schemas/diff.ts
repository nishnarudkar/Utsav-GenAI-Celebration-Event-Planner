import { z } from "zod";

/** The cascade engine's output (CLAUDE.md §8). Shared by the API, the diff panel and plan_changes. */

export const ConflictSeverity = z.enum(["info", "warn", "critical"]);
export type ConflictSeverity = z.infer<typeof ConflictSeverity>;

export const Conflict = z.object({
  type: z.string(),
  severity: ConflictSeverity,
  message: z.string(),
});
export type Conflict = z.infer<typeof Conflict>;

export const RecoveryOption = z.object({
  id: z.string(),
  title: z.string(),
  savesPaise: z.number().int(),
  impact: z.string(),
  patch: z.unknown(),
});
export type RecoveryOption = z.infer<typeof RecoveryOption>;

export const PlanDiff = z.object({
  version: z.number().int(),
  budgetDeltaPaise: z.number().int(),
  changed: z.array(z.object({ nodeId: z.string(), label: z.string(), from: z.unknown(), to: z.unknown(), reason: z.string() })),
  added: z.array(z.object({ nodeId: z.string(), label: z.string() })),
  removed: z.array(z.object({ nodeId: z.string(), label: z.string() })),
  conflicts: z.array(Conflict),
  recoveryOptions: z.array(RecoveryOption),
  explanation: z.string(),
});
export type PlanDiff = z.infer<typeof PlanDiff>;
