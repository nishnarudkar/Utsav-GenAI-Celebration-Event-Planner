import { z } from "zod";

/**
 * Enumerations shared by the DB schema (pgEnum), Zod validation and the UI.
 * One source of truth: add a value here and both the DB enum and the Zod enum pick it up
 * (the DB change still needs `pnpm db:generate`).
 */

export const EVENT_TYPES = ["wedding", "birthday", "community", "other"] as const;
export const EventType = z.enum(EVENT_TYPES);
export type EventType = z.infer<typeof EventType>;

/** Traditions with KB coverage. Add a key here when adding a kb/rituals doc. */
export const CULTURES = [
  "bengali_hindu",
  "tamil_brahmin",
  "punjabi_sikh",
  "marathi",
  "gujarati",
  "muslim",
  "christian",
  "generic",
] as const;
export const Culture = z.enum(CULTURES);
export type Culture = z.infer<typeof Culture>;

export const EVENT_STATUSES = ["draft", "planning", "live", "done"] as const;
export const EventStatus = z.enum(EVENT_STATUSES);
export type EventStatus = z.infer<typeof EventStatus>;

/** City tier drives price benchmarks (1 = metro). */
export const CityTier = z.union([z.literal(1), z.literal(2), z.literal(3)]);
export type CityTier = z.infer<typeof CityTier>;

export const BUDGET_CATEGORIES = [
  "venue",
  "catering",
  "decor",
  "photography",
  "attire",
  "jewelry",
  "invites",
  "music",
  "transport",
  "gifts",
  "priest",
  "misc",
] as const;
export const BudgetCategory = z.enum(BUDGET_CATEGORIES);
export type BudgetCategory = z.infer<typeof BudgetCategory>;

/** How a budget line scales. The LLM picks a unit + quantity + tier; code prices it (rule 1). */
export const BUDGET_UNITS = ["per_plate", "per_guest", "flat", "per_hour", "per_day", "per_item"] as const;
export const BudgetUnit = z.enum(BUDGET_UNITS);
export type BudgetUnit = z.infer<typeof BudgetUnit>;

export const PRICE_TIERS = ["low", "mid", "high"] as const;
export const PriceTier = z.enum(PRICE_TIERS);
export type PriceTier = z.infer<typeof PriceTier>;

export const TASK_STATUSES =["todo", "doing", "done", "blocked"] as const;
export const TaskStatus = z.enum(TASK_STATUSES);
export type TaskStatus = z.infer<typeof TaskStatus>;

/** Where a task came from. Cascades never modify "user" tasks (CLAUDE.md §7.1 rule 4). */
export const TASK_SOURCES = ["ai", "user", "ritual_kb"] as const;
export const TaskSource = z.enum(TASK_SOURCES);
export type TaskSource = z.infer<typeof TaskSource>;

export const VENDOR_STATUSES = ["shortlisted", "contacted", "quoted", "booked"] as const;
export const VendorStatus = z.enum(VENDOR_STATUSES);
export type VendorStatus = z.infer<typeof VendorStatus>;

export const STAKEHOLDER_ROLES = ["couple", "bride_family", "groom_family", "organizer", "parent"] as const;
export const StakeholderRole = z.enum(STAKEHOLDER_ROLES);
export type StakeholderRole = z.infer<typeof StakeholderRole>;

export const NOTIFICATION_CHANNELS = ["whatsapp"] as const;
export const NotificationChannel = z.enum(NOTIFICATION_CHANNELS);
export type NotificationChannel = z.infer<typeof NotificationChannel>;

/** "mocked" = logged only (MESSAGING_MODE=mock), shown in the Sent messages panel. */
export const NOTIFICATION_STATUSES = ["queued", "sent", "failed", "mocked"] as const;
export const NotificationStatus = z.enum(NOTIFICATION_STATUSES);
export type NotificationStatus = z.infer<typeof NotificationStatus>;

export const KB_DOC_TYPES = ["ritual", "checklist", "pricing"] as const;
export const KbDocType = z.enum(KB_DOC_TYPES);
export type KbDocType = z.infer<typeof KbDocType>;
