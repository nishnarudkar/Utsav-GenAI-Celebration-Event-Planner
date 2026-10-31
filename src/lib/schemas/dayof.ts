import { z } from "zod";
import { BudgetCategory } from "@/lib/schemas/enums";

/**
 * Day-of Copilot (CLAUDE.md §7.3, F8). The model reads an incident and says where the delay starts
 * and how long it is; code moves the times. Messages carry placeholders instead of clock times,
 * so a vendor is never sent a time the model worked out (rule 1).
 */

export const IncidentInput = z.object({ incident: z.string().trim().min(3).max(300) });

export const ReshuffleDraft = z.object({
  summary: z.string().min(1).max(160),
  /** Slot where the delay starts; null when no times need to move. */
  fromSlotId: z.string().nullable(),
  delayMinutes: z.number().int().min(0).max(240),
  notify: z
    .array(
      z.object({
        category: BudgetCategory,
        reason: z.string().min(1).max(120),
        /** May use {new_time} and {slot}; code fills them in. */
        message: z.string().min(1).max(400),
      }),
    )
    .max(8),
});
export type ReshuffleDraft = z.infer<typeof ReshuffleDraft>;

export interface SlotMove {
  slotId: string;
  name: string;
  functionName: string;
  from: string;
  to: string;
  deltaMinutes: number;
}

export interface OutgoingMessage {
  category: BudgetCategory;
  to: string;
  reason: string;
  body: string;
}

/** CLAUDE.md `Reshuffle`: what would change, held until the family confirms it. */
export interface LiveProposal {
  id: string;
  incident: string;
  summary: string;
  moves: SlotMove[];
  warnings: string[];
  messages: OutgoingMessage[];
  /** Minutes to add to each slot if confirmed. */
  deltas: Record<string, number>;
}

/** CLAUDE.md §6 notifications. */
export interface LiveNotification {
  id: string;
  channel: "whatsapp";
  to: string;
  body: string;
  /** "logged" = mock mode: recorded and shown, not delivered. */
  status: "logged";
  sentAt: string;
}

export interface LiveLogEntry {
  id: string;
  incident: string;
  summary: string;
  at: string;
}

/** The day as it's actually running. Kept outside the plan, so the schedule stays as agreed. */
export interface LiveState {
  /** Total minutes each slot has moved. */
  shifts: Record<string, number>;
  proposal: LiveProposal | null;
  incidents: LiveLogEntry[];
  /** Newest first. */
  notifications: LiveNotification[];
}
