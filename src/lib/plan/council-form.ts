import { formatINRCompact, parseINR } from "@/lib/format";
import { Preferences, StakeholderInput } from "@/lib/schemas/council";
import type { StakeholderRole } from "@/lib/schemas/enums";

/** Stakeholder form logic and display text. Pure and client-safe. */

export const ROLE_LABELS: Record<StakeholderRole, string> = {
  couple: "The couple",
  bride_family: "Bride's family",
  groom_family: "Groom's family",
  organizer: "Organiser",
  parent: "Parent",
};

const VENUE_LABELS = { banquet_hall: "Banquet hall", lawn: "Lawn", home: "Home", community_hall: "Community hall" } as const;
const FUNCTION_LABELS = { fewer: "Fewer functions", as_planned: "Functions as planned", more: "More functions" } as const;
const MENU_LABELS = { veg: "Vegetarian menu", non_veg: "Non-vegetarian menu", mixed: "Mixed menu" } as const;

export const VENUE_OPTIONS = Object.entries(VENUE_LABELS).map(([value, label]) => ({ value, label }));
export const FUNCTION_OPTIONS = Object.entries(FUNCTION_LABELS).map(([value, label]) => ({ value, label }));
export const MENU_OPTIONS = Object.entries(MENU_LABELS).map(([value, label]) => ({ value, label }));

export interface StakeholderFormValues {
  name: string;
  role: StakeholderRole;
  guestCount: string;
  budgetMax: string;
  venueStyle: string;
  functions: string;
  menu: string;
  notes: string;
}

export const EMPTY_FORM: StakeholderFormValues = { name: "", role: "couple", guestCount: "", budgetMax: "", venueStyle: "", functions: "", menu: "", notes: "" };

/** Turn the form into an API body, or a friendly message. Blank preference fields are left out. */
export function parseStakeholderForm(f: StakeholderFormValues): { ok: true; value: StakeholderInput } | { ok: false; message: string } {
  if (!f.name.trim()) return { ok: false, message: "Add a name, such as “Bride's parents”." };

  const preferences: Record<string, unknown> = {};
  if (f.guestCount.trim()) {
    const n = Number(f.guestCount.replace(/[,\s]/g, ""));
    if (!Number.isInteger(n) || n < 1 || n > 5000) return { ok: false, message: "Guests should be a whole number between 1 and 5,000." };
    preferences.guestCount = n;
  }
  if (f.budgetMax.trim()) {
    const paise = parseINR(f.budgetMax);
    if (paise === null || paise <= 0) return { ok: false, message: "Try a budget limit like 12L or ₹12,00,000." };
    preferences.budgetMaxPaise = paise;
  }
  if (f.venueStyle) preferences.venueStyle = f.venueStyle;
  if (f.functions) preferences.functions = f.functions;
  if (f.menu) preferences.menu = f.menu;
  if (f.notes.trim()) preferences.notes = f.notes.trim();

  const parsed = StakeholderInput.safeParse({ name: f.name, role: f.role, preferences, weight: 1 });
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false, message: "Please check the details and try again." };
}

/** Preferences as short phrases for the stakeholder card. */
export function preferenceSummary(input: unknown): string[] {
  const parsed = Preferences.safeParse(input);
  if (!parsed.success) return [];
  const p = parsed.data;
  const out: string[] = [];
  if (p.guestCount !== undefined) out.push(`${p.guestCount.toLocaleString("en-IN")} guests`);
  if (p.budgetMaxPaise !== undefined) out.push(`Budget up to ${formatINRCompact(p.budgetMaxPaise)}`);
  if (p.venueStyle && p.venueStyle !== "no_preference") out.push(VENUE_LABELS[p.venueStyle]);
  if (p.functions) out.push(FUNCTION_LABELS[p.functions]);
  if (p.menu && p.menu !== "no_preference") out.push(MENU_LABELS[p.menu]);
  if (p.notes) out.push(p.notes);
  return out;
}
