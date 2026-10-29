import { formatDate, formatINR, parseINR } from "@/lib/format";
import { diffDays, isISODate, type ISODate } from "@/lib/rules/dates";
import type { Culture, EventType } from "@/lib/schemas/enums";
import type { OnboardingAnswers } from "@/lib/schemas/event";

/**
 * The six onboarding questions (CLAUDE.md §9). Pure and client-safe: each step parses what the
 * person typed or tapped into a typed value, or returns a friendly message.
 */

export type StepId = "eventType" | "culture" | "city" | "startDate" | "guestCount" | "budget";
export const STEP_ORDER: readonly StepId[] = ["eventType", "culture", "city", "startDate", "guestCount", "budget"];

export interface Chip {
  label: string;
  /** What the chip submits (same as typing it). */
  value: string;
}

export type Parsed<T> = { ok: true; value: T; display: string } | { ok: false; message: string };

export interface CollectedAnswers {
  eventType?: EventType;
  culture?: Culture;
  city?: string;
  startDate?: ISODate;
  guestCount?: number;
  /** null = "estimate for me". */
  budgetTotalPaise?: number | null;
}

const EVENT_TYPE_CHIPS: Chip[] = [
  { label: "Wedding", value: "wedding" },
  { label: "Birthday", value: "birthday" },
  { label: "Community event", value: "community" },
  { label: "Something else", value: "other" },
];

const CULTURE_LABELS: Record<Culture, string> = {
  bengali_hindu: "Bengali Hindu",
  tamil_brahmin: "Tamil Brahmin",
  punjabi_sikh: "Punjabi / Sikh",
  marathi: "Marathi",
  gujarati: "Gujarati",
  muslim: "Muslim",
  christian: "Christian",
  generic: "No specific tradition",
};

export const cultureLabel = (c: Culture) => CULTURE_LABELS[c];

const MAX_YEARS_AHEAD = 3;

/** Question text, chips and input hints per step. Some depend on earlier answers. */
export function stepPrompt(step: StepId, answers: CollectedAnswers): {
  question: string;
  chips: Chip[];
  inputLabel: string;
  placeholder: string;
  inputType: "text" | "date" | "number";
  /** Steps answered only by chips hide the text box. */
  chipsOnly: boolean;
} {
  switch (step) {
    case "eventType":
      return { question: "Namaste! What are we celebrating?", chips: EVENT_TYPE_CHIPS, inputLabel: "Event type", placeholder: "", inputType: "text", chipsOnly: true };
    case "culture": {
      const order: Culture[] =
        answers.eventType === "wedding"
          ? ["bengali_hindu", "tamil_brahmin", "punjabi_sikh", "marathi", "gujarati", "muslim", "christian", "generic"]
          : ["generic", "bengali_hindu", "tamil_brahmin", "punjabi_sikh", "marathi", "gujarati", "muslim", "christian"];
      return {
        question: "Which tradition should the rituals follow? Pick the closest, or none — you can mix and adjust later.",
        chips: order.map((c) => ({ label: CULTURE_LABELS[c], value: c })),
        inputLabel: "Tradition",
        placeholder: "",
        inputType: "text",
        chipsOnly: true,
      };
    }
    case "city":
      return {
        question: "Which city is it in?",
        chips: ["Kolkata", "Mumbai", "Delhi", "Bengaluru", "Chennai", "Pune"].map((c) => ({ label: c, value: c })),
        inputLabel: "City",
        placeholder: "Type a city",
        inputType: "text",
        chipsOnly: false,
      };
    case "startDate":
      return {
        question: answers.eventType === "wedding" ? "When is the main wedding day?" : "When is the main day?",
        chips: [],
        inputLabel: "Main day",
        placeholder: "",
        inputType: "date",
        chipsOnly: false,
      };
    case "guestCount":
      return {
        question: "Roughly how many guests?",
        chips: ["50", "150", "250", "500"].map((n) => ({ label: n, value: n })),
        inputLabel: "Guest count",
        placeholder: "e.g. 250",
        inputType: "number",
        chipsOnly: false,
      };
    case "budget":
      return {
        question: "And the overall budget? Type it any way you like — 15L, 15 lakh, ₹15,00,000.",
        chips: [
          { label: "₹5L", value: "5L" },
          { label: "₹15L", value: "15L" },
          { label: "₹30L", value: "30L" },
          { label: "Not sure? Estimate for me", value: "estimate" },
        ],
        inputLabel: "Budget",
        placeholder: "e.g. 15 lakh",
        inputType: "text",
        chipsOnly: false,
      };
  }
}

export function parseEventType(input: string): Parsed<EventType> {
  const chip = EVENT_TYPE_CHIPS.find((c) => c.value === input);
  return chip ? { ok: true, value: chip.value as EventType, display: chip.label } : { ok: false, message: "Pick one of the options." };
}

export function parseCulture(input: string): Parsed<Culture> {
  const c = (Object.keys(CULTURE_LABELS) as Culture[]).find((k) => k === input);
  return c ? { ok: true, value: c, display: CULTURE_LABELS[c] } : { ok: false, message: "Pick the closest tradition, or “No specific tradition”." };
}

export function parseCity(input: string): Parsed<string> {
  const city = input.trim().replace(/\s+/g, " ");
  if (!city) return { ok: false, message: "Which city? Just the name is fine." };
  if (city.length > 80) return { ok: false, message: "That's a bit long — just the city name, please." };
  return { ok: true, value: city, display: city };
}

export function parseStartDate(input: string, today: ISODate): Parsed<ISODate> {
  const value = input.trim();
  if (!isISODate(value)) return { ok: false, message: "Pick a date from the calendar." };
  const days = diffDays(today, value);
  if (days < 0) return { ok: false, message: "That date has passed — pick an upcoming one." };
  if (days > MAX_YEARS_AHEAD * 366) return { ok: false, message: `Utsav plans up to ${MAX_YEARS_AHEAD} years ahead — pick a nearer date.` };
  return { ok: true, value, display: formatDate(value, { weekday: true }) };
}

export function parseGuestCount(input: string): Parsed<number> {
  const cleaned = input.trim().replace(/[,\s]/g, "");
  if (!/^\d+$/.test(cleaned)) return { ok: false, message: "Just a number, like 250." };
  const n = Number(cleaned);
  if (n < 1) return { ok: false, message: "At least one guest, surely!" };
  if (n > 5000) return { ok: false, message: "Utsav handles up to 5,000 guests." };
  return { ok: true, value: n, display: `${n.toLocaleString("en-IN")} guests` };
}

const ESTIMATE_WORDS = /^(estimate|not sure|don'?t know|no idea|skip)\b/i;

export function parseBudget(input: string): Parsed<number | null> {
  if (ESTIMATE_WORDS.test(input.trim())) return { ok: true, value: null, display: "Not sure — estimate for me" };
  const paise = parseINR(input);
  if (paise === null) return { ok: false, message: "Try something like 15L, 15 lakh or ₹15,00,000." };
  if (paise < 10_000_00) return { ok: false, message: "That seems low — budgets start from ₹10,000." };
  if (paise > 1_000_00_00_000_00) return { ok: false, message: "That's beyond what Utsav can plan — check the amount?" };
  return { ok: true, value: paise, display: formatINR(paise) };
}

/** Parse the answer for a step and merge it into the collected answers. */
export function applyAnswer(
  step: StepId,
  input: string,
  answers: CollectedAnswers,
  today: ISODate,
): { ok: true; answers: CollectedAnswers; display: string } | { ok: false; message: string } {
  const merge = <K extends keyof CollectedAnswers>(key: K, r: Parsed<NonNullable<CollectedAnswers[K]> | null>) =>
    r.ok ? { ok: true as const, answers: { ...answers, [key]: r.value }, display: r.display } : r;
  switch (step) {
    case "eventType":
      return merge("eventType", parseEventType(input));
    case "culture":
      return merge("culture", parseCulture(input));
    case "city":
      return merge("city", parseCity(input));
    case "startDate":
      return merge("startDate", parseStartDate(input, today));
    case "guestCount":
      return merge("guestCount", parseGuestCount(input));
    case "budget":
      return merge("budgetTotalPaise", parseBudget(input));
  }
}

/** The POST /api/events body once every step is answered; null if something's missing. */
export function toOnboardingAnswers(a: CollectedAnswers): OnboardingAnswers | null {
  if (!a.eventType || !a.culture || !a.city || !a.startDate || a.guestCount === undefined || a.budgetTotalPaise === undefined) return null;
  return {
    eventType: a.eventType,
    culture: a.culture,
    city: a.city,
    startDate: a.startDate,
    guestCount: a.guestCount,
    budgetTotalPaise: a.budgetTotalPaise,
  };
}
