import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
  vector,
} from "drizzle-orm/pg-core";
import {
  BUDGET_CATEGORIES,
  CULTURES,
  EVENT_STATUSES,
  EVENT_TYPES,
  KB_DOC_TYPES,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_STATUSES,
  STAKEHOLDER_ROLES,
  TASK_SOURCES,
  TASK_STATUSES,
  VENDOR_STATUSES,
} from "../schemas/enums"; // relative: drizzle-kit loads this file outside Next's path aliases

/**
 * Database schema (CLAUDE.md §6).
 * - UUID primary keys; created_at / updated_at on every table.
 * - Money is integer paise in BIGINT (int4 would cap at ₹2.1Cr).
 * - Calendar dates are DATE returned as "YYYY-MM-DD" strings (see lib/rules/dates.ts).
 * - JSONB columns are typed `unknown` here and parsed with Zod in lib/db/queries.ts.
 */

// ---------- enums ----------
export const eventTypeEnum = pgEnum("event_type", EVENT_TYPES);
export const cultureEnum = pgEnum("culture", CULTURES);
export const eventStatusEnum = pgEnum("event_status", EVENT_STATUSES);
export const budgetCategoryEnum = pgEnum("budget_category", BUDGET_CATEGORIES);
export const taskStatusEnum = pgEnum("task_status", TASK_STATUSES);
export const taskSourceEnum = pgEnum("task_source", TASK_SOURCES);
export const vendorStatusEnum = pgEnum("vendor_status", VENDOR_STATUSES);
export const stakeholderRoleEnum = pgEnum("stakeholder_role", STAKEHOLDER_ROLES);
export const notificationChannelEnum = pgEnum("notification_channel", NOTIFICATION_CHANNELS);
export const notificationStatusEnum = pgEnum("notification_status", NOTIFICATION_STATUSES);
export const kbDocTypeEnum = pgEnum("kb_doc_type", KB_DOC_TYPES);

// ---------- shared columns ----------
const id = () => uuid("id").primaryKey().defaultRandom();
const timestamps = () => ({
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
const paise = (name: string) => bigint(name, { mode: "number" });
const eventRef = () =>
  uuid("event_id")
    .notNull()
    .references(() => events.id, { onDelete: "cascade" });

/** "HH:MM" 24h, local event time (IST). */
const HHMM = sql`'^([01][0-9]|2[0-3]):[0-5][0-9]$'`;

// ---------- tables ----------
export const events = pgTable(
  "events",
  {
    id: id(),
    title: text("title").notNull(),
    eventType: eventTypeEnum("event_type").notNull(),
    culture: cultureEnum("culture").notNull().default("generic"),
    city: text("city").notNull(),
    cityTier: smallint("city_tier").notNull(),
    startDate: date("start_date", { mode: "string" }).notNull(),
    endDate: date("end_date", { mode: "string" }).notNull(),
    guestCount: integer("guest_count").notNull(),
    budgetTotalPaise: paise("budget_total_paise").notNull(),
    vibeJson: jsonb("vibe_json"),
    status: eventStatusEnum("status").notNull().default("draft"),
    /** Incremented on every cascade; plan_changes rows are keyed by it. */
    version: integer("version").notNull().default(1),
    ...timestamps(),
  },
  (t) => [
    check("events_city_tier_range", sql`${t.cityTier} between 1 and 3`),
    check("events_guest_count_nonneg", sql`${t.guestCount} >= 0`),
    check("events_budget_nonneg", sql`${t.budgetTotalPaise} >= 0`),
    check("events_dates_ordered", sql`${t.endDate} >= ${t.startDate}`),
  ],
);

/** A venue is a vendor with category "venue"; its capacity drives the venue-capacity check. */
export const vendors = pgTable(
  "vendors",
  {
    id: id(),
    eventId: eventRef(),
    category: budgetCategoryEnum("category").notNull(),
    name: text("name").notNull(),
    phone: text("phone"),
    whatsapp: text("whatsapp"),
    status: vendorStatusEnum("status").notNull().default("shortlisted"),
    rating: smallint("rating"),
    capacity: integer("capacity"),
    notes: text("notes"),
    ...timestamps(),
  },
  (t) => [
    index("vendors_event_idx").on(t.eventId),
    check("vendors_rating_range", sql`${t.rating} is null or ${t.rating} between 1 and 5`),
    check("vendors_capacity_pos", sql`${t.capacity} is null or ${t.capacity} > 0`),
  ],
);

/** Sub-events: mehendi, haldi, sangeet, ceremony, reception, cake-cutting… */
export const functions = pgTable(
  "functions",
  {
    id: id(),
    eventId: eventRef(),
    name: text("name").notNull(),
    ritualKey: text("ritual_key"),
    date: date("date", { mode: "string" }).notNull(),
    startTime: text("start_time"),
    endTime: text("end_time"),
    venueId: uuid("venue_id").references(() => vendors.id, { onDelete: "set null" }),
    expectedGuests: integer("expected_guests"),
    notes: text("notes"),
    ...timestamps(),
  },
  (t) => [
    index("functions_event_idx").on(t.eventId),
    check("functions_start_time_fmt", sql`${t.startTime} is null or ${t.startTime} ~ ${HHMM}`),
    check("functions_end_time_fmt", sql`${t.endTime} is null or ${t.endTime} ~ ${HHMM}`),
    check("functions_guests_nonneg", sql`${t.expectedGuests} is null or ${t.expectedGuests} >= 0`),
  ],
);

export const budgetItems = pgTable(
  "budget_items",
  {
    id: id(),
    eventId: eventRef(),
    functionId: uuid("function_id").references(() => functions.id, { onDelete: "set null" }),
    category: budgetCategoryEnum("category").notNull(),
    label: text("label").notNull(),
    estimatePaise: paise("estimate_paise").notNull(),
    quotedPaise: paise("quoted_paise"),
    actualPaise: paise("actual_paise"),
    /** How the estimate was computed, e.g. { unit: "per_plate", quantity: 250, unitTier: "mid", unitPaise: 85000 }. */
    basisJson: jsonb("basis_json"),
    /** User-locked items are never changed by a cascade (CLAUDE.md §7.1 rule 4). */
    locked: boolean("locked").notNull().default(false),
    ...timestamps(),
  },
  (t) => [
    index("budget_items_event_idx").on(t.eventId),
    check("budget_items_estimate_nonneg", sql`${t.estimatePaise} >= 0`),
  ],
);

export const tasks = pgTable(
  "tasks",
  {
    id: id(),
    eventId: eventRef(),
    functionId: uuid("function_id").references(() => functions.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    description: text("description"),
    category: budgetCategoryEnum("category"),
    owner: text("owner"),
    dueDate: date("due_date", { mode: "string" }),
    status: taskStatusEnum("status").notNull().default("todo"),
    dependsOn: uuid("depends_on").array().notNull().default(sql`'{}'::uuid[]`),
    source: taskSourceEnum("source").notNull().default("ai"),
    ...timestamps(),
  },
  (t) => [index("tasks_event_idx").on(t.eventId), index("tasks_due_idx").on(t.eventId, t.dueDate)],
);

export const ritualItems = pgTable(
  "ritual_items",
  {
    id: id(),
    functionId: uuid("function_id")
      .notNull()
      .references(() => functions.id, { onDelete: "cascade" }),
    item: text("item").notNull(),
    quantity: text("quantity"),
    notes: text("notes"),
    procured: boolean("procured").notNull().default(false),
    ...timestamps(),
  },
  (t) => [index("ritual_items_function_idx").on(t.functionId)],
);

export const quotes = pgTable(
  "quotes",
  {
    id: id(),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id, { onDelete: "cascade" }),
    fileUrl: text("file_url").notNull(),
    extractedJson: jsonb("extracted_json"),
    analysisJson: jsonb("analysis_json"),
    totalPaise: paise("total_paise"),
    ...timestamps(),
  },
  (t) => [index("quotes_vendor_idx").on(t.vendorId)],
);

export const stakeholders = pgTable(
  "stakeholders",
  {
    id: id(),
    eventId: eventRef(),
    name: text("name").notNull(),
    role: stakeholderRoleEnum("role").notNull(),
    preferencesJson: jsonb("preferences_json"),
    /** Influence weight in Family Council; not money, so a float is fine. */
    weight: real("weight").notNull().default(1),
    ...timestamps(),
  },
  (t) => [index("stakeholders_event_idx").on(t.eventId), check("stakeholders_weight_pos", sql`${t.weight} > 0`)],
);

export const councilResolutions = pgTable(
  "council_resolutions",
  {
    id: id(),
    eventId: eventRef(),
    conflictsJson: jsonb("conflicts_json").notNull(),
    optionsJson: jsonb("options_json").notNull(),
    chosenOptionId: text("chosen_option_id"),
    ...timestamps(),
  },
  (t) => [index("council_resolutions_event_idx").on(t.eventId)],
);

/** Audit log of cascades; powers the diff panel and Undo. */
export const planChanges = pgTable(
  "plan_changes",
  {
    id: id(),
    eventId: eventRef(),
    version: integer("version").notNull(),
    triggerJson: jsonb("trigger_json").notNull(),
    diffJson: jsonb("diff_json").notNull(),
    explanation: text("explanation"),
    ...timestamps(),
  },
  (t) => [unique("plan_changes_event_version_uq").on(t.eventId, t.version)],
);

export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    eventId: eventRef(),
    vendorId: uuid("vendor_id").references(() => vendors.id, { onDelete: "set null" }),
    channel: notificationChannelEnum("channel").notNull().default("whatsapp"),
    to: text("to").notNull(),
    body: text("body").notNull(),
    status: notificationStatusEnum("status").notNull().default("queued"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [index("notifications_event_idx").on(t.eventId)],
);

export const EMBEDDING_DIMENSIONS = 1024;

/** Knowledge-base chunks for RAG (CLAUDE.md §7.5). */
export const kbChunks = pgTable(
  "kb_chunks",
  {
    id: id(),
    sourcePath: text("source_path").notNull(),
    chunkIndex: integer("chunk_index").notNull(),
    /** Nearest heading, shown in citations. */
    heading: text("heading"),
    docType: kbDocTypeEnum("doc_type").notNull(),
    culture: cultureEnum("culture"),
    eventType: eventTypeEnum("event_type"),
    content: text("content").notNull(),
    embedding: vector("embedding", { dimensions: EMBEDDING_DIMENSIONS }).notNull(),
    ...timestamps(),
  },
  (t) => [
    unique("kb_chunks_source_chunk_uq").on(t.sourcePath, t.chunkIndex),
    index("kb_chunks_filter_idx").on(t.docType, t.culture, t.eventType),
    index("kb_chunks_embedding_idx").using("hnsw", t.embedding.op("vector_cosine_ops")),
  ],
);
