import { z } from "zod";
import raw from "../../../kb/checklists/permits-india.json";
import { addDays, type ISODate } from "@/lib/rules/dates";

/**
 * Permits and NOC checklist for community events (kb/checklists/permits-india.json, CLAUDE.md F9).
 * Fixed data with dates worked out in code, so no AI is involved. Always shown with its disclaimer.
 */

export const PermitItem = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]*$/),
  title: z.string().min(1),
  authority: z.string().min(1),
  appliesIf: z.string().min(1),
  why: z.string().min(1).max(200),
  /** Rough days before the event to apply by. Our planning estimate, not a legal deadline. */
  leadDays: z.number().int().positive(),
});
export type PermitItem = z.infer<typeof PermitItem>;

export const PermitsFile = z.object({ version: z.number().int(), disclaimer: z.string().min(1), items: z.array(PermitItem).min(1) });
export type PermitsFile = z.infer<typeof PermitsFile>;

export const getPermits = (): PermitsFile => PermitsFile.parse(raw);

export interface PermitRow extends PermitItem {
  applyBy: ISODate;
  /** The apply-by date has passed and it isn't done. */
  late: boolean;
  done: boolean;
}

/** The checklist for an event, soonest apply-by date first. */
export function permitRows(items: readonly PermitItem[], startDate: ISODate, today: ISODate, done: readonly string[]): PermitRow[] {
  const ticked = new Set(done);
  return items
    .map((p) => {
      const applyBy = addDays(startDate, -p.leadDays);
      const isDone = ticked.has(p.id);
      return { ...p, applyBy, done: isDone, late: !isDone && applyBy < today };
    })
    .sort((a, b) => a.applyBy.localeCompare(b.applyBy));
}
