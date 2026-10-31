import type { StoredEvent } from "@/lib/plan/types";
import type { ISODate } from "@/lib/rules/dates";
import { buildRunOfShow, slotTime } from "@/lib/rules/run-of-show";

/** View model for the Live page. Pure; unit-tested. */

export interface LiveSlotRow {
  id: string;
  name: string;
  time: string;
  /** Minutes behind the agreed plan. */
  delayMinutes: number;
}

export interface LiveGroup {
  functionName: string;
  slots: LiveSlotRow[];
}

/** Today if something happens today, otherwise the main day, so the page can be rehearsed. */
export function liveDate(event: Pick<StoredEvent, "plan" | "answers">, today: ISODate): ISODate {
  return event.plan.functions.some((f) => f.date === today) ? today : event.answers.startDate;
}

export function liveGroups(event: Pick<StoredEvent, "plan" | "rituals" | "live">, date: ISODate): LiveGroup[] {
  const groups: LiveGroup[] = [];
  for (const s of buildRunOfShow(event.plan.functions, event.rituals.rituals, date, event.live.shifts)) {
    const row = { id: s.id, name: s.name, time: `${slotTime(s.startMin)} – ${slotTime(s.endMin)}`, delayMinutes: event.live.shifts[s.id] ?? 0 };
    const last = groups.at(-1);
    if (last?.functionName === s.functionName) last.slots.push(row);
    else groups.push({ functionName: s.functionName, slots: [row] });
  }
  return groups;
}
