-- Custom migration: Supabase serves the public schema through its REST API, and the anon key is
-- public by design. With RLS on and no policies, that API can read nothing. The app connects as
-- the database owner through DATABASE_URL, which bypasses RLS, so only the server sees family data.
ALTER TABLE "budget_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "council_resolutions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "functions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "kb_chunks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "plan_changes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "quotes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ritual_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "stakeholders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tasks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "vendors" ENABLE ROW LEVEL SECURITY;
