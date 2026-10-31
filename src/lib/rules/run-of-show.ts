/**
 * Run of show for one day, and how a delay moves it (Day-of Copilot, CLAUDE.md F8). Pure, no LLM:
 * the model says where a delay starts and how long it is, and this code works out every time.
 * Times are minutes from midnight of the day; values of 1440 or more fall on the next day.
 */

import { formatClock } from "@/lib/format";
import type { ISODate } from "@/lib/rules/dates";
import type { PlannedFunction } from "@/lib/schemas/event";
import type { Ritual } from "@/lib/schemas/ritual";

export interface RunSlot {
  /** Ritual key, or "fn_<name>" for a function with no rituals. */
  id: string;
  name: string;
  functionName: string;
  isRitual: boolean;
  startMin: number;
  endMin: number;
}

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  return h * 60 + m;
};

const functionEnd = (f: PlannedFunction) => {
  const [start, end] = [toMinutes(f.startTime), toMinutes(f.endTime)];
  return end <= start ? end + 1440 : end;
};

/** Slots for the functions starting on `date`: rituals run back to back from the function's start. */
export function buildRunOfShow(
  functions: readonly PlannedFunction[],
  rituals: readonly Ritual[],
  date: ISODate,
  shifts: Readonly<Record<string, number>> = {},
): RunSlot[] {
  const byKey = new Map(rituals.map((r) => [r.key, r]));
  const day = functions.filter((f) => f.date === date).sort((a, b) => a.startTime.localeCompare(b.startTime));

  return day.flatMap((f): RunSlot[] => {
    const placed = f.ritualKeys.flatMap((k) => byKey.get(k) ?? []);
    if (placed.length === 0) {
      const id = `fn_${f.name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;
      const delta = shifts[id] ?? 0;
      return [{ id, name: f.name, functionName: f.name, isRitual: false, startMin: toMinutes(f.startTime) + delta, endMin: functionEnd(f) + delta }];
    }
    let cursor = toMinutes(f.startTime);
    return placed.map((r) => {
      const start = cursor;
      cursor += r.durationMinutes;
      const delta = shifts[r.key] ?? 0;
      return { id: r.key, name: r.name, functionName: f.name, isRitual: true, startMin: start + delta, endMin: start + r.durationMinutes + delta };
    });
  });
}

/**
 * Minutes each slot moves when `fromId` starts `minutes` late. Everything after it in the same
 * function moves too. A later function moves only as far as the delay actually reaches it, so
 * spare time between functions absorbs the delay. Returns null if `fromId` isn't a slot.
 */
export function applyDelay(slots: readonly RunSlot[], fromId: string, minutes: number): Record<string, number> | null {
  const from = slots.findIndex((s) => s.id === fromId);
  if (from < 0) return null;

  const deltas: Record<string, number> = {};
  const functionNames = [...new Set(slots.map((s) => s.functionName))];
  let previous: { oldEnd: number; newEnd: number } | null = null;

  for (const name of functionNames) {
    const group = slots.filter((s) => s.functionName === name);
    const last = group.at(-1)!;
    if (slots.indexOf(last) < from) continue;

    let moved = group;
    let delta = minutes;
    if (previous) {
      const first = group[0]!;
      delta = Math.max(0, previous.newEnd - first.startMin) - Math.max(0, previous.oldEnd - first.startMin);
      if (delta <= 0) break;
    } else {
      moved = group.filter((s) => slots.indexOf(s) >= from);
    }
    for (const s of moved) deltas[s.id] = delta;
    previous = { oldEnd: last.endMin, newEnd: last.endMin + delta };
  }
  return deltas;
}

/** 1110 → "6:30 PM"; 1470 → "12:30 AM (next day)". */
export function slotTime(minutes: number): string {
  const wrapped = minutes % 1440;
  const hhmm = `${String(Math.floor(wrapped / 60)).padStart(2, "0")}:${String(wrapped % 60).padStart(2, "0")}`;
  return minutes >= 1440 ? `${formatClock(hhmm)} (next day)` : formatClock(hhmm);
}

/** Functions pushed past their planned finish by these slots. */
export function overruns(functions: readonly PlannedFunction[], slots: readonly RunSlot[]): string[] {
  return functions.flatMap((f) => {
    const last = slots.filter((s) => s.functionName === f.name).at(-1);
    if (!last || last.endMin <= functionEnd(f)) return [];
    return [`${f.name} now runs until ${slotTime(last.endMin)}, past its planned finish of ${slotTime(functionEnd(f))}.`];
  });
}
