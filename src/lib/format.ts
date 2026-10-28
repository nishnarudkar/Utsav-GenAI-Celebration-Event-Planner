/**
 * Display formatting for India defaults (CLAUDE.md §7.1 rule 5):
 * money as INR in lakh/crore notation, dates as "12 Feb 2027", times in IST.
 *
 * Money is always integer paise (₹1 = 100 paise). Nothing here does planning maths.
 */

import { IST_OFFSET_MS, isISODate, type ISODate } from "@/lib/rules/dates";

const PAISE_PER_RUPEE = 100;
const THOUSAND = 1_000;
const LAKH = 1_00_000;
const CRORE = 1_00_00_000;
const MINUS = "−"; // typographic minus, reads better than "-" next to ₹

function assertPaise(paise: number): void {
  if (!Number.isSafeInteger(paise)) throw new RangeError(`Money must be integer paise, got ${paise}`);
}

/** Indian digit grouping: 1500000 → "15,00,000". */
function groupIndian(whole: number): string {
  const s = String(whole);
  if (s.length <= 3) return s;
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `${rest},${last3}`;
}

/** Round to 1 decimal and drop a trailing ".0": 4.5 → "4.5", 15 → "15". */
function oneDecimal(n: number): string {
  return (Math.round(n * 10) / 10).toFixed(1).replace(/\.0$/, "");
}

/**
 * Full rupee amount with Indian grouping: 1_50_00_000 paise → "₹1,50,000".
 * Whole rupees by default; `showPaise` keeps two decimals when non-zero.
 */
export function formatINR(paise: number, opts: { showPaise?: boolean } = {}): string {
  assertPaise(paise);
  const sign = paise < 0 ? MINUS : "";
  const abs = Math.abs(paise);
  if (opts.showPaise && abs % PAISE_PER_RUPEE !== 0) {
    const whole = Math.floor(abs / PAISE_PER_RUPEE);
    const frac = String(abs % PAISE_PER_RUPEE).padStart(2, "0");
    return `${sign}₹${groupIndian(whole)}.${frac}`;
  }
  return `${sign}₹${groupIndian(Math.round(abs / PAISE_PER_RUPEE))}`;
}

/**
 * Compact amount for cards and diffs: ₹950, ₹12K, ₹4.5L, ₹1.2Cr.
 * Rounds to one decimal; a value that rounds up to the next unit is promoted (₹99,990 → ₹1L).
 */
export function formatINRCompact(paise: number): string {
  assertPaise(paise);
  const sign = paise < 0 ? MINUS : "";
  const rupees = Math.abs(paise) / PAISE_PER_RUPEE;

  const units: Array<[number, string]> = [
    [CRORE, "Cr"],
    [LAKH, "L"],
    [THOUSAND, "K"],
  ];
  for (const [i, [size, suffix]] of units.entries()) {
    if (rupees < size) continue;
    const scaled = Math.round((rupees / size) * 10) / 10;
    const bigger = units[i - 1];
    // e.g. 99.96L rounds to 100L → show as 1Cr
    if (bigger && scaled * size >= bigger[0]) return `${sign}₹${oneDecimal((scaled * size) / bigger[0])}${bigger[1]}`;
    return `${sign}₹${oneDecimal(scaled)}${suffix}`;
  }
  const whole = Math.round(rupees);
  if (whole >= THOUSAND) return `${sign}₹1K`; // 999.5 rounds to 1000
  return `${sign}₹${whole}`;
}

/** Signed compact delta for diff rows: +₹1.6L, −₹90K, ₹0. */
export function formatINRDelta(paise: number): string {
  assertPaise(paise);
  if (paise === 0) return "₹0";
  return paise > 0 ? `+${formatINRCompact(paise)}` : formatINRCompact(paise);
}

/** Convert a rupee amount (possibly fractional) to integer paise. */
export function rupeesToPaise(rupees: number): number {
  if (!Number.isFinite(rupees)) throw new RangeError(`Invalid rupee amount: ${rupees}`);
  return Math.round(rupees * PAISE_PER_RUPEE);
}

const UNIT_WORDS: Record<string, number> = {
  k: THOUSAND,
  thousand: THOUSAND,
  l: LAKH,
  lac: LAKH,
  lacs: LAKH,
  lakh: LAKH,
  lakhs: LAKH,
  cr: CRORE,
  crore: CRORE,
  crores: CRORE,
};

/**
 * Parse what people type for a budget into paise.
 * Accepts "15L", "15 lakh", "₹15,00,000", "1.2 cr", "80k", "Rs. 50000".
 * Returns null when the text isn't a recognisable non-negative amount.
 */
export function parseINR(input: string): number | null {
  const cleaned = input
    .trim()
    .toLowerCase()
    .replace(/^(₹|rs\.?|inr)\s*/, "")
    .replace(/,/g, "");
  const m = /^(\d+(?:\.\d+)?)\s*([a-z]+)?$/.exec(cleaned);
  if (!m) return null;
  const amount = Number(m[1]);
  const unit = m[2];
  let multiplier = 1;
  if (unit !== undefined) {
    const found = UNIT_WORDS[unit];
    if (found === undefined) return null;
    multiplier = found;
  }
  return rupeesToPaise(amount * multiplier);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** UTC-field view of an instant shifted into IST, so getUTC* reads IST wall-clock values. */
function istFields(instant: Date): Date {
  return new Date(instant.getTime() + IST_OFFSET_MS);
}

function calendarFields(date: ISODate | Date): Date {
  if (date instanceof Date) return istFields(date);
  if (!isISODate(date)) throw new RangeError(`Invalid ISO date: ${date}`);
  return new Date(`${date}T00:00:00Z`);
}

/**
 * "14 Feb 2027". Accepts a calendar date ("2027-02-14") or an instant (shown on the IST calendar).
 * Month names are hard-coded: Intl's en-IN output varies by ICU version ("Sep" vs "Sept").
 */
export function formatDate(date: ISODate | Date, opts: { weekday?: boolean } = {}): string {
  const f = calendarFields(date);
  const base = `${f.getUTCDate()} ${MONTHS[f.getUTCMonth()]} ${f.getUTCFullYear()}`;
  return opts.weekday ? `${WEEKDAYS[f.getUTCDay()]}, ${base}` : base;
}

/** "7:30 PM" in IST. */
export function formatTime(instant: Date): string {
  const f = istFields(instant);
  const h24 = f.getUTCHours();
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const mm = String(f.getUTCMinutes()).padStart(2, "0");
  return `${h12}:${mm} ${h24 < 12 ? "AM" : "PM"}`;
}

/** "18:30" (24h, local event time) → "6:30 PM". Used for function start/end times stored as text. */
export function formatClock(hhmm: string): string {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm);
  if (!m) throw new RangeError(`Invalid time: ${hhmm}`);
  const h24 = Number(m[1]);
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${m[2]} ${h24 < 12 ? "AM" : "PM"}`;
}
