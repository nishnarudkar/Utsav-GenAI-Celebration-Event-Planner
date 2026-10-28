CREATE TYPE "public"."budget_category" AS ENUM('venue', 'catering', 'decor', 'photography', 'attire', 'jewelry', 'invites', 'music', 'transport', 'gifts', 'priest', 'misc');--> statement-breakpoint
CREATE TYPE "public"."culture" AS ENUM('bengali_hindu', 'tamil_brahmin', 'punjabi_sikh', 'marathi', 'gujarati', 'muslim', 'christian', 'generic');--> statement-breakpoint
CREATE TYPE "public"."event_status" AS ENUM('draft', 'planning', 'live', 'done');--> statement-breakpoint
CREATE TYPE "public"."event_type" AS ENUM('wedding', 'birthday', 'community', 'other');--> statement-breakpoint
CREATE TYPE "public"."kb_doc_type" AS ENUM('ritual', 'checklist', 'pricing');--> statement-breakpoint
CREATE TYPE "public"."notification_channel" AS ENUM('whatsapp');--> statement-breakpoint
CREATE TYPE "public"."notification_status" AS ENUM('queued', 'sent', 'failed', 'mocked');--> statement-breakpoint
CREATE TYPE "public"."stakeholder_role" AS ENUM('couple', 'bride_family', 'groom_family', 'organizer', 'parent');--> statement-breakpoint
CREATE TYPE "public"."task_source" AS ENUM('ai', 'user', 'ritual_kb');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('todo', 'doing', 'done', 'blocked');--> statement-breakpoint
CREATE TYPE "public"."vendor_status" AS ENUM('shortlisted', 'contacted', 'quoted', 'booked');--> statement-breakpoint
CREATE TABLE "budget_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"function_id" uuid,
	"category" "budget_category" NOT NULL,
	"label" text NOT NULL,
	"estimate_paise" bigint NOT NULL,
	"quoted_paise" bigint,
	"actual_paise" bigint,
	"basis_json" jsonb,
	"locked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "budget_items_estimate_nonneg" CHECK ("budget_items"."estimate_paise" >= 0)
);
--> statement-breakpoint
CREATE TABLE "council_resolutions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"conflicts_json" jsonb NOT NULL,
	"options_json" jsonb NOT NULL,
	"chosen_option_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"event_type" "event_type" NOT NULL,
	"culture" "culture" DEFAULT 'generic' NOT NULL,
	"city" text NOT NULL,
	"city_tier" smallint NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"guest_count" integer NOT NULL,
	"budget_total_paise" bigint NOT NULL,
	"vibe_json" jsonb,
	"status" "event_status" DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "events_city_tier_range" CHECK ("events"."city_tier" between 1 and 3),
	CONSTRAINT "events_guest_count_nonneg" CHECK ("events"."guest_count" >= 0),
	CONSTRAINT "events_budget_nonneg" CHECK ("events"."budget_total_paise" >= 0),
	CONSTRAINT "events_dates_ordered" CHECK ("events"."end_date" >= "events"."start_date")
);
--> statement-breakpoint
CREATE TABLE "functions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"name" text NOT NULL,
	"ritual_key" text,
	"date" date NOT NULL,
	"start_time" text,
	"end_time" text,
	"venue_id" uuid,
	"expected_guests" integer,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "functions_start_time_fmt" CHECK ("functions"."start_time" is null or "functions"."start_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
	CONSTRAINT "functions_end_time_fmt" CHECK ("functions"."end_time" is null or "functions"."end_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
	CONSTRAINT "functions_guests_nonneg" CHECK ("functions"."expected_guests" is null or "functions"."expected_guests" >= 0)
);
--> statement-breakpoint
CREATE TABLE "kb_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_path" text NOT NULL,
	"chunk_index" integer NOT NULL,
	"heading" text,
	"doc_type" "kb_doc_type" NOT NULL,
	"culture" "culture",
	"event_type" "event_type",
	"content" text NOT NULL,
	"embedding" vector(1024) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kb_chunks_source_chunk_uq" UNIQUE("source_path","chunk_index")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"vendor_id" uuid,
	"channel" "notification_channel" DEFAULT 'whatsapp' NOT NULL,
	"to" text NOT NULL,
	"body" text NOT NULL,
	"status" "notification_status" DEFAULT 'queued' NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"trigger_json" jsonb NOT NULL,
	"diff_json" jsonb NOT NULL,
	"explanation" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_changes_event_version_uq" UNIQUE("event_id","version")
);
--> statement-breakpoint
CREATE TABLE "quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"file_url" text NOT NULL,
	"extracted_json" jsonb,
	"analysis_json" jsonb,
	"total_paise" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ritual_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"function_id" uuid NOT NULL,
	"item" text NOT NULL,
	"quantity" text,
	"notes" text,
	"procured" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stakeholders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"name" text NOT NULL,
	"role" "stakeholder_role" NOT NULL,
	"preferences_json" jsonb,
	"weight" real DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stakeholders_weight_pos" CHECK ("stakeholders"."weight" > 0)
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"function_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"category" "budget_category",
	"owner" text,
	"due_date" date,
	"status" "task_status" DEFAULT 'todo' NOT NULL,
	"depends_on" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"source" "task_source" DEFAULT 'ai' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"category" "budget_category" NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"whatsapp" text,
	"status" "vendor_status" DEFAULT 'shortlisted' NOT NULL,
	"rating" smallint,
	"capacity" integer,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vendors_rating_range" CHECK ("vendors"."rating" is null or "vendors"."rating" between 1 and 5),
	CONSTRAINT "vendors_capacity_pos" CHECK ("vendors"."capacity" is null or "vendors"."capacity" > 0)
);
--> statement-breakpoint
ALTER TABLE "budget_items" ADD CONSTRAINT "budget_items_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_items" ADD CONSTRAINT "budget_items_function_id_functions_id_fk" FOREIGN KEY ("function_id") REFERENCES "public"."functions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "council_resolutions" ADD CONSTRAINT "council_resolutions_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "functions" ADD CONSTRAINT "functions_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "functions" ADD CONSTRAINT "functions_venue_id_vendors_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."vendors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_changes" ADD CONSTRAINT "plan_changes_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ritual_items" ADD CONSTRAINT "ritual_items_function_id_functions_id_fk" FOREIGN KEY ("function_id") REFERENCES "public"."functions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stakeholders" ADD CONSTRAINT "stakeholders_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_function_id_functions_id_fk" FOREIGN KEY ("function_id") REFERENCES "public"."functions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "budget_items_event_idx" ON "budget_items" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "council_resolutions_event_idx" ON "council_resolutions" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "functions_event_idx" ON "functions" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "kb_chunks_filter_idx" ON "kb_chunks" USING btree ("doc_type","culture","event_type");--> statement-breakpoint
CREATE INDEX "kb_chunks_embedding_idx" ON "kb_chunks" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "notifications_event_idx" ON "notifications" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "quotes_vendor_idx" ON "quotes" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX "ritual_items_function_idx" ON "ritual_items" USING btree ("function_id");--> statement-breakpoint
CREATE INDEX "stakeholders_event_idx" ON "stakeholders" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "tasks_event_idx" ON "tasks" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "tasks_due_idx" ON "tasks" USING btree ("event_id","due_date");--> statement-breakpoint
CREATE INDEX "vendors_event_idx" ON "vendors" USING btree ("event_id");