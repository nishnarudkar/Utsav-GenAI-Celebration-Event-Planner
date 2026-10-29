import { formatDate } from "@/lib/format";
import { addDays, diffDays, type ISODate } from "@/lib/rules/dates";
import type { PlannedFunction } from "@/lib/schemas/event";
import type { Ritual } from "@/lib/schemas/ritual";
import type { ScheduledTask } from "@/lib/schemas/timeline";
import type { StoredEvent } from "@/lib/plan/types";

/** View model for the Timeline page. Pure; unit-tested. */

// ---------- Gantt ----------

export interface GanttDay {
  date: ISODate;
  label: string;
}

export interface GanttBar {
  name: string;
  date: ISODate;
  startTime: string;
  endTime: string;
  /** Position across the whole event span, in percent. */
  leftPct: number;
  widthPct: number;
  /** Ends after midnight (e.g. Bashor Raat 23:30 → 04:00). */
  overnight: boolean;
  expectedGuests: number;
}

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  return h * 60 + m;
};
const round2 = (n: number) => Math.round(n * 100) / 100;

export function ganttLayout(functions: readonly PlannedFunction[]): { days: GanttDay[]; bars: GanttBar[] } {
  if (functions.length === 0) return { days: [], bars: [] };
  const dates = functions.map((f) => f.date).sort();
  const first = dates[0]!;
  // Include the day after a function that runs past midnight on the last day.
  const spans = functions.map((f) => diffDays(first, f.date) + (minutes(f.endTime) <= minutes(f.startTime) ? 1 : 0));
  const dayCount = Math.max(...spans) + 1;
  const total = dayCount * 24 * 60;

  const days = Array.from({ length: dayCount }, (_, i) => {
    const date = addDays(first, i);
    return { date, label: formatDate(date).replace(/ \d{4}$/, "") };
  });

  const bars = functions.map((f): GanttBar => {
    const start = diffDays(first, f.date) * 1440 + minutes(f.startTime);
    let end = diffDays(first, f.date) * 1440 + minutes(f.endTime);
    const overnight = end <= start;
    if (overnight) end += 1440;
    return {
      name: f.name,
      date: f.date,
      startTime: f.startTime,
      endTime: f.endTime,
      leftPct: round2((start / total) * 100),
      widthPct: round2(((end - start) / total) * 100),
      overnight,
      expectedGuests: f.expectedGuests,
    };
  });
  return { days, bars };
}

// ---------- Rituals ----------

export interface ChecklistItem {
  /** Stable id: "<ritual key>#<item index>". */
  id: string;
  item: string;
  quantity?: string;
  procured: boolean;
}

export interface RitualCardData {
  key: string;
  name: string;
  order: number;
  durationMinutes: number;
  participants: string[];
  significance: string;
  items: ChecklistItem[];
  /** Heading of the KB section this ritual is grounded in, when one was cited. */
  citation?: string;
}

export interface RitualGroup {
  /** Function name, or null for rituals not yet placed in a function. */
  functionName: string | null;
  date?: ISODate;
  rituals: RitualCardData[];
}

/** A KB chunk the plan cited, as needed to match it to a ritual. */
export interface CitedChunk {
  id: string;
  heading: string;
  content: string;
}

export const ritualItemId = (ritualKey: string, index: number) => `${ritualKey}#${index}`;

export function ritualGroups(event: Pick<StoredEvent, "rituals" | "plan" | "procuredItems">, cited: readonly CitedChunk[]): RitualGroup[] {
  const procured = new Set(event.procuredItems);
  const citedIds = new Set(event.rituals.sources);
  const relevant = cited.filter((c) => citedIds.has(c.id));
  const citationFor = (key: string) => relevant.find((c) => c.content.includes(`**Key:** ${key}`))?.heading;

  const toCard = (r: Ritual): RitualCardData => ({
    key: r.key,
    name: r.name,
    order: r.order,
    durationMinutes: r.durationMinutes,
    participants: r.participants,
    significance: r.significance,
    items: r.items.map((it, i) => ({
      id: ritualItemId(r.key, i),
      item: it.item,
      ...(it.quantity ? { quantity: it.quantity } : {}),
      procured: procured.has(ritualItemId(r.key, i)),
    })),
    ...(citationFor(r.key) ? { citation: citationFor(r.key) } : {}),
  });

  const byKey = new Map(event.rituals.rituals.map((r) => [r.key, r]));
  const placed = new Set<string>();
  const groups: RitualGroup[] = [];
  for (const f of event.plan.functions) {
    const rituals = f.ritualKeys.flatMap((k) => {
      const r = byKey.get(k);
      if (!r) return [];
      placed.add(k);
      return [toCard(r)];
    });
    if (rituals.length) groups.push({ functionName: f.name, date: f.date, rituals });
  }
  const unplaced = event.rituals.rituals.filter((r) => !placed.has(r.key)).map(toCard);
  if (unplaced.length) groups.push({ functionName: null, rituals: unplaced });
  return groups;
}

/** All valid checklist item ids for an event (used to validate tick requests). */
export function checklistItemIds(event: Pick<StoredEvent, "rituals">): Set<string> {
  return new Set(event.rituals.rituals.flatMap((r) => r.items.map((_, i) => ritualItemId(r.key, i))));
}

// ---------- Tasks ----------

export function tasksByMonth(tasks: readonly ScheduledTask[]): Array<{ month: string; tasks: ScheduledTask[] }> {
  const groups: Array<{ month: string; tasks: ScheduledTask[] }> = [];
  for (const t of tasks) {
    const month = formatDate(t.dueDate).replace(/^\d+ /, ""); // "Nov 2026"
    const last = groups.at(-1);
    if (last?.month === month) last.tasks.push(t);
    else groups.push({ month, tasks: [t] });
  }
  return groups;
}
