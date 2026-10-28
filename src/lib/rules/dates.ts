/**
 * Calendar-date arithmetic in IST. Pure functions, no LLM (CLAUDE.md §7.1 rule 1).
 *
 * Event dates are calendar dates ("2027-02-14"), not instants, so they are kept as
 * ISO date strings and computed on a UTC-midnight basis — that avoids DST and
 * host-timezone drift. "Now" is an instant and is converted to the IST calendar day.
 */

export type ISODate = string; // "YYYY-MM-DD"

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;
/** IST is UTC+05:30 all year (no DST). */
export const IST_OFFSET_MS = 330 * 60_000;

export function isISODate(value: string): value is ISODate {
  const m = ISO_DATE_RE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

function toUTCMidnight(date: ISODate): number {
  if (!isISODate(date)) throw new RangeError(`Invalid ISO date: ${date}`);
  const [y, mo, d] = date.split("-").map(Number) as [number, number, number];
  return Date.UTC(y, mo - 1, d);
}

function fromUTCMidnight(ms: number): ISODate {
  return new Date(ms).toISOString().slice(0, 10);
}

/** The IST calendar date for an instant, e.g. 2027-02-13T20:00Z → "2027-02-14". */
export function toISTDate(instant: Date): ISODate {
  return fromUTCMidnight(instant.getTime() + IST_OFFSET_MS);
}

export function addDays(date: ISODate, days: number): ISODate {
  if (!Number.isInteger(days)) throw new RangeError(`days must be an integer, got ${days}`);
  return fromUTCMidnight(toUTCMidnight(date) + days * MS_PER_DAY);
}

/** Whole days from `from` to `to` (negative if `to` is earlier). */
export function diffDays(from: ISODate, to: ISODate): number {
  return Math.round((toUTCMidnight(to) - toUTCMidnight(from)) / MS_PER_DAY);
}

/** Days remaining until `eventDate`, counted on the IST calendar. 0 on the day itself. */
export function daysUntil(eventDate: ISODate, now: Date = new Date()): number {
  return diffDays(toISTDate(now), eventDate);
}
