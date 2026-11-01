ALTER TABLE "events" ADD COLUMN "state_json" jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "plan_changes" ADD COLUMN "before_json" jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "plan_changes" ADD COLUMN "undone" boolean DEFAULT false NOT NULL;