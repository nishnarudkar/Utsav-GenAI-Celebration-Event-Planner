import { addDays, type ISODate } from "@/lib/rules/dates";
import type { PlannedFunction } from "@/lib/schemas/event";
import type { ScheduledTask } from "@/lib/schemas/timeline";
import type { StoredEvent } from "@/lib/plan/types";

/**
 * Calendar export (CLAUDE.md F10, RFC 5545). Pure. Functions are timed events in UTC, so they show
 * correctly for relatives abroad; tasks are all-day and don't mark the day as busy. UIDs are
 * stable, so importing an updated plan replaces events instead of duplicating them.
 */

type IcsEvent = Pick<StoredEvent, "id" | "title" | "version" | "updatedAt" | "answers" | "plan" | "rituals" | "timeline">;

const CRLF = "\r\n";
const MAX_LINE_BYTES = 75;

const escapeText = (text: string) => text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Split long lines at 75 bytes without breaking a character; continuation lines start with a space. */
function foldLine(line: string): string {
  const encoder = new TextEncoder();
  const out: string[] = [];
  let current = "";
  let bytes = 0;
  for (const char of line) {
    const size = encoder.encode(char).length;
    if (bytes + size > MAX_LINE_BYTES) {
      out.push(current);
      current = " ";
      bytes = 1;
    }
    current += char;
    bytes += size;
  }
  out.push(current);
  return out.join(CRLF);
}

const utcStamp = (instant: Date) => instant.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const istInstant = (date: ISODate, hhmm: string) => new Date(`${date}T${hhmm}:00+05:30`);
const dateValue = (date: ISODate) => date.replace(/-/g, "");
const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function functionEvent(event: IcsEvent, f: PlannedFunction, common: string[]): string[] {
  const start = istInstant(f.date, f.startTime);
  const sameDayEnd = istInstant(f.date, f.endTime);
  // Functions may run past midnight, e.g. 23:30 → 04:00.
  const end = sameDayEnd > start ? sameDayEnd : istInstant(addDays(f.date, 1), f.endTime);

  const rituals = f.ritualKeys.flatMap((key) => event.rituals.rituals.find((r) => r.key === key)?.name ?? []);
  const description = [`${f.expectedGuests.toLocaleString("en-IN")} guests expected`, rituals.length ? `Rituals: ${rituals.join(", ")}` : null, f.notes ?? null]
    .filter(Boolean)
    .join("\n");

  return [
    "BEGIN:VEVENT",
    `UID:${event.id}-function-${slug(f.name)}@utsav`,
    ...common,
    `DTSTART:${utcStamp(start)}`,
    `DTEND:${utcStamp(end)}`,
    `SUMMARY:${escapeText(f.name)}`,
    `DESCRIPTION:${escapeText(description)}`,
    `LOCATION:${escapeText(event.answers.city)}`,
    "END:VEVENT",
  ];
}

function taskEvent(event: IcsEvent, t: ScheduledTask, common: string[]): string[] {
  return [
    "BEGIN:VEVENT",
    `UID:${event.id}-task-${t.ref}@utsav`,
    ...common,
    `DTSTART;VALUE=DATE:${dateValue(t.dueDate)}`,
    `DTEND;VALUE=DATE:${dateValue(addDays(t.dueDate, 1))}`,
    `SUMMARY:${escapeText(`To do: ${t.title}`)}`,
    ...(t.description ? [`DESCRIPTION:${escapeText(t.description)}`] : []),
    "TRANSP:TRANSPARENT",
    "END:VEVENT",
  ];
}

export function eventToICS(event: IcsEvent): string {
  const common = [`DTSTAMP:${utcStamp(new Date(event.updatedAt))}`, `SEQUENCE:${event.version}`];
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Utsav//Celebration Planner//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(event.title)}`,
    ...event.plan.functions.flatMap((f) => functionEvent(event, f, common)),
    ...event.timeline.tasks.flatMap((t) => taskEvent(event, t, common)),
    "END:VCALENDAR",
  ];
  return lines.map(foldLine).join(CRLF) + CRLF;
}

/** "Ananya & Rohan’s wedding" → "utsav-ananya-rohan-s-wedding.pdf". */
export function exportFileName(title: string, extension: "ics" | "pdf"): string {
  const name = slug(title).slice(0, 60).replace(/-$/, "");
  return `utsav-${name || "plan"}.${extension}`;
}
