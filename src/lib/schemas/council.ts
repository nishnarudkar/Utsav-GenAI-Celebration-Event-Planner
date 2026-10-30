import { z } from "zod";
import { StakeholderRole } from "@/lib/schemas/enums";

/**
 * Family Council (CLAUDE.md F5). Stakeholders state preferences; the model finds conflicts and
 * proposes compromises as typed patches. Costs are computed in code by dry-running each patch,
 * so the model's output has no money field (rule 1).
 */

export const Preferences = z.object({
  guestCount: z.number().int().min(1).max(5000).optional(),
  budgetMaxPaise: z.number().int().positive().optional(),
  venueStyle: z.enum(["banquet_hall", "lawn", "home", "community_hall", "no_preference"]).optional(),
  functions: z.enum(["fewer", "as_planned", "more"]).optional(),
  menu: z.enum(["veg", "non_veg", "mixed", "no_preference"]).optional(),
  notes: z.string().trim().max(300).optional(),
});
export type Preferences = z.infer<typeof Preferences>;

export const StakeholderInput = z.object({
  name: z.string().trim().min(1).max(80),
  role: StakeholderRole,
  preferences: Preferences,
  weight: z.number().positive().max(5).default(1),
});
export type StakeholderInput = z.infer<typeof StakeholderInput>;

export interface Stakeholder extends StakeholderInput {
  id: string;
}

/** The only plan changes a compromise can make. Every field is a choice, not a calculation. */
export const CouncilPatch = z.object({
  guestCount: z.number().int().min(1).max(5000).nullable(),
  functionGuests: z.array(z.object({ functionName: z.string().min(1), guests: z.number().int().min(1).max(5000) })),
  budgetTotalPaise: z.number().int().positive().nullable(),
});
export type CouncilPatch = z.infer<typeof CouncilPatch>;

/** What the model returns. `ref` values identify stakeholders (see stakeholderRefs). */
export const CouncilDraft = z.object({
  conflicts: z
    .array(
      z.object({
        topic: z.string().min(1).max(80),
        positions: z.array(z.object({ ref: z.string(), wants: z.string().min(1).max(160) })).min(2),
        severity: z.enum(["low", "medium", "high"]),
      }),
    )
    .max(8),
  options: z
    .array(
      z.object({
        id: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/),
        title: z.string().min(1).max(100),
        description: z.string().min(1).max(300),
        satisfies: z.array(z.string()),
        compromises: z.array(z.string()),
        patch: CouncilPatch,
      }),
    )
    .min(2)
    .max(4),
});
export type CouncilDraft = z.infer<typeof CouncilDraft>;

export interface CouncilConflict {
  topic: string;
  severity: "low" | "medium" | "high";
  positions: Array<{ stakeholder: string; wants: string }>;
}

export interface CouncilOption {
  id: string;
  title: string;
  description: string;
  /** Stakeholder names. */
  satisfies: string[];
  compromises: string[];
  /** Measured by dry-running the patch; positive means the plan costs more. */
  costDeltaPaise: number;
  /** Plan problems this option would leave or create. */
  conflictsAfter: string[];
  patch: CouncilPatch;
}

/** CLAUDE.md §8 CouncilResolution, plus when it was made and what was chosen. */
export interface CouncilResolution {
  id: string;
  conflicts: CouncilConflict[];
  options: CouncilOption[];
  chosenOptionId: string | null;
  /** The event version these options were measured against; they go stale if the plan moves on. */
  planVersion: number;
  createdAt: string;
}
