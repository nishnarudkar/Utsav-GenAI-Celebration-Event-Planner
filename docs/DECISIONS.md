# Decisions

Log of non-obvious choices (CLAUDE.md: "note it in docs/DECISIONS.md").

## 2026-10-25 — Phase 0 scaffold

- **Manual scaffold instead of `create-next-app`.** The project folder already contains docs and its name has spaces and `&`, which `create-next-app` rejects. Config files were written by hand to match the CLI's defaults.
- **Tailwind CSS v4** (CSS-first `@theme` tokens in `globals.css`, no `tailwind.config.js`). Brand colors are Tailwind utilities: `bg-maroon`, `text-marigold`, `bg-cream`, plus diff colors `saved` / `increased` / `conflict`.
- **Next.js page/layout files use `export default`.** Next.js requires it and rejects extra exports from `page.tsx`. Everything else follows the named-exports rule.
- **`noUncheckedIndexedAccess` enabled** on top of `strict`, to catch undefined array/record lookups in budget math and graph code.
- **`DEMO_MODE` added to `.env.example`.** The README referenced it but CLAUDE.md §4 omitted it.
- **`EMBEDDING_PROVIDER` defaults to `mock`** in `.env.example` so the app runs before a Voyage key exists.
- **Vitest stubs `server-only`** (`tests/stubs/server-only.ts`) so server modules can be unit-tested.
- **PATCH payload shape:** `{ field, value }` (README form). The server reads the previous value from the DB rather than trusting a client-sent `from`.

## 2026-10-25 — Formatting & date rules

- **Vitest runs single-threaded with a plain `@` → `src` alias.** On this dev laptop (under memory pressure) the default worker pool (one per core) ran out of memory, and `vite-tsconfig-paths` hung while scanning. Unit tests finish in under a second on one thread. `vite-tsconfig-paths` is no longer used and can be removed from devDependencies.
- **Calendar dates are ISO strings (`"2027-02-14"`), computed at UTC midnight.** Event dates are days, not instants, so this avoids host-timezone drift. "Now" is converted to the IST calendar day (`toISTDate`). Date arithmetic lives in `lib/rules/dates.ts`, display in `lib/format.ts`.
- **Month names are hard-coded** rather than taken from `Intl` en-IN, whose output differs between ICU versions ("Sep" vs "Sept").
- **Compact INR uses K / L / Cr** with one decimal (`₹12.5K`, `₹4.5L`, `₹1.2Cr`), promoting values that round into the next unit (`₹99,960` → `₹1L`). Negatives use a typographic minus (`−₹90K`).
- **`parseINR`** accepts how people type budgets in onboarding ("15L", "15 lakh", "₹15,00,000", "1.2 cr", "80k") and returns paise or `null`.

## 2026-10-28 — AI client & callStructured

- **Structured outputs instead of forced tool use.** CLAUDE.md §7.1 rule 2 says to force `tool_choice: {type: "tool"}`, but that returns a 400 on Claude Sonnet 5.5 (our smart model). `callStructured` sends `output_config.format` with a JSON schema generated from the Zod schema by the SDK helper `zodOutputFormat`. The guarantee is the same: the reply is JSON matching the schema. The CLAUDE.md option `toolName` is therefore called `name`. It's also the demo fixture file name.
- **Our own Zod validation still runs on every reply.** The API's JSON schema can't express every Zod constraint (e.g. `.max(200)` on strings), so the helper drops those and we enforce them locally. One corrective retry with the Zod issues appended, then `AIValidationError` (rule 2 unchanged).
- **No `temperature`.** Since API version `2026-10-21` (which SDK 1.3.0 sends), `temperature`/`top_p`/`top_k` return a 400 on every model. Sonnet 5.5 and Haiku 5.5 already accepted only the default, so nothing is lost. The 0.4 / 0.8 values in CLAUDE.md §7.2 no longer apply. Creative agents (Vibe) get variety from their prompt instead. `effort` (`low`/`medium`/`high`) is exposed for depth/cost tuning.
- **No `zod-to-json-schema` dependency.** Zod 4 + the SDK's `zodOutputFormat` replace it.
- **Default `maxTokens` is 16000, not 4096.** Thinking is always on for Sonnet 5.5 and counts against `max_tokens`, so 4096 risks truncated JSON. A `max_tokens` stop is treated as a validation failure and retried with a "be more concise" note.
- **Server-side refusal fallback on the smart tier** (`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`). If Sonnet 5.5's safety classifier declines a request, the API re-runs it on a fallback model in the same call. Haiku 5.5 has no server-side fallback. A final refusal throws `AIRefusalError`. Text before a fallback switch point is ignored.
- **Retries/backoff come from the SDK** (`maxRetries: 3`, exponential backoff on 429/5xx/connection errors, 120 s timeout). No custom retry loop.
- **Demo mode** (`DEMO_MODE=true`) reads `tests/fixtures/llm/<name>.json` (override dir with `DEMO_FIXTURES_DIR`; pick variants with `fixtureKey`), validates it against the same schema, and never calls the API.
- **All calls use `client.beta.messages.create`** (one code path; the fallback parameter is beta-only).

## 2026-10-28 — Database schema

- **12 tables, as listed in CLAUDE.md §6.** Drizzle schema in `src/lib/db/schema.ts`; migrations `drizzle/0000_enable_pgvector.sql` (custom: `CREATE EXTENSION vector`, since drizzle-kit doesn't manage extensions) and `drizzle/0001_initial_schema.sql`.
- **Money columns are `BIGINT` paise** (`mode: "number"`). `INTEGER` paise would cap at about ₹2.1Cr, which large weddings can exceed. `bigint` in number mode is exact up to about ₹90 lakh crore.
- **Venues are vendors.** §6 has `functions.venue_id` but no venues table. A venue is a `vendors` row with `category = 'venue'`, and a nullable `vendors.capacity` column was added for the venue-capacity check.
- **Enums have one source:** `src/lib/schemas/enums.ts` exports the value lists. Both the `pgEnum`s and the Zod enums are built from them.
- **Function times are `text` "HH:MM"** with a regex check constraint (not `time`, which returns "HH:MM:SS"), matching `formatClock`.
- **`kb_chunks` gained `chunk_index` and `heading`.** The pair `(source_path, chunk_index)` is unique, so `kb:embed` can upsert. `heading` is shown in citations. There's an HNSW cosine index on `embedding`.
- **`plan_changes` is unique on `(event_id, version)`.** `events.version` starts at 1.
- **`notifications.status` includes `mocked`** for `MESSAGING_MODE=mock` rows shown in the Sent messages panel.
- **JSONB columns are `unknown`** in Drizzle and get parsed with Zod when read (Zod at every boundary), rather than trusting `$type<>()` casts.
- **The schema imports enums by relative path**, because drizzle-kit loads `schema.ts` without Next's `@/` alias.
- **`getDb()` connects lazily** with `prepare: false`, which Supabase's transaction pooler requires. `drizzle.config.ts` loads `.env.local` itself via `process.loadEnvFile`.

## 2026-10-28 — Knowledge base: ritual docs & parser

- **Ritual docs use a fixed bullet format** under each `## Ritual` heading: Key, When, Typical duration (minutes), Participants, Items, Significance (max 160 chars, matching `RitualPlan`). `tests/unit/kb/kb-content.test.ts` lints every doc in `kb/rituals/`, so a malformed edit fails the tests rather than the demo.
- **Launch docs:** Bengali Hindu wedding, Tamil Brahmin wedding, Punjabi Sikh (Anand Karaj), and a generic birthday. Written in our own words from general knowledge. Each intro says practice varies by family and to confirm with the family priest or elders. Durations are planning estimates, not religious rules.
- **No sub-community assumptions.** The Tamil doc mentions that Iyer and Iyengar practice differs without picking one. The birthday doc says to ask which religious element, if any, a family includes. The content test also fails if a doc mentions dowry or caste (rule 6).
- **Hand-written frontmatter parser** (flat `key: value` lines) instead of adding `gray-matter`; our frontmatter is three or four flat fields.
- **Chunking:** one chunk per `## ` section plus one for the intro, each prefixed with `# Title` so it stands alone in retrieval. Sections over ~500 tokens split on line boundaries with ~50 tokens of overlap. Token counts are estimated at 4 characters per token, which is enough for sizing.
- **Parser lives in `src/lib/kb/parse.ts`** (pure functions, no I/O), shared by `scripts/embed-kb.ts` and tests.

## 2026-10-28 — Pricing benchmarks & budget math

- **`kb/pricing/vendor-benchmarks-india.json`** is an object with metadata (`version`, `currency`, `updated`, `disclaimer`, `city_tiers`) and a `rows` array of `{ category, unit, city_tier, low_paise, mid_paise, high_paise, label }`. That's the §7.5 row shape plus a human-readable `label` saying what one unit means. 63 rows: 21 category/unit combinations × 3 tiers.
- **The numbers are rough indicative market ranges I estimated**, not researched quotes. The `disclaimer` field says so and the UI must show it. `tests/unit/kb/pricing.test.ts` enforces: full category × tier coverage, low ≤ mid ≤ high, tier 3 ≤ tier 2 ≤ tier 1 at mid, and that the demo wedding (Kolkata, 250 guests) fits ₹15L at low/mid tiers (about ₹14.1L) while +100 guests adds at least ₹1L of catering.
- **`budget-math.ts` never guesses a price.** A proposed line with no benchmark for its (category, unit, tier) comes back in `unpriced` for the UI to ask for a quote. The persisted basis records `unitPaise` and `cityTier` next to the AI's unit, quantity and tier, so "Why?" can show the working.
- **`allocateByWeight` uses largest-remainder rounding**, so category allocations always sum exactly to the budget in whole paise. Weights are normalised and don't have to sum to 100.
- **GST takes the rate as an argument;** there's no built-in rate table. GST rates differ by service and have changed recently, so the rate comes from the quote or the user rather than a hard-coded guess.
- **Committed spend per line is** actual, else quoted, else estimate.
- **City tiers** (`lib/rules/city-tier.ts`) are loosely based on India's X/Y/Z city classification plus metro suburbs (e.g. Gurugram, Thane). Unknown cities default to tier 2 with `known: false`, so onboarding can confirm.
- **New shared enums:** `BUDGET_UNITS` and `PRICE_TIERS`. `BudgetLineProposal` (§8) lives in `src/lib/schemas/budget.ts`.

## 2026-10-29 — Culture agent & local retrieval

- **Local file retriever first, pgvector later.** `createLocalRetriever()` in `src/lib/ai/rag.ts` reads `kb/` from disk, filters by culture, event type and doc type, and ranks by keyword overlap. It needs no database or embedding key, and for a KB this small the metadata filter does most of the work. It implements the same `Retriever` signature (`(query, filters, k)`) that a pgvector retriever will. Citation ids are `kb/<dir>/<file>.md#<chunkIndex>`, matching `kb_chunks (source_path, chunk_index)`.
- **Grounding is enforced in code, not only in the prompt.** `enforceGrounding()` drops any cited source that wasn't among the supplied excerpts and forces `confidence: "low"` when none remain (rule 3). It also renumbers ritual order 1..n.
- **The Culture agent retrieves k = 24 chunks**, not the default 6, so a full wedding sequence (up to 16 chunks) reaches the model in order.
- **Prompt caching:** the system prompt is two cached blocks, the static `CULTURE_PROMPT_V1` and the KB excerpts (stable per culture × event type). The user's notes go in the user message.
- **Demo fixtures come from the KB, not from model output.** `pnpm fixtures:rituals` (`scripts/gen-ritual-fixtures.ts`) writes `tests/fixtures/llm/emit_ritual_plan.<culture>.<event_type>.json` from `kb/rituals/*.md`, citing real chunk ids. A test checks every fixture validates and cites existing chunks, and a demo-mode end-to-end test runs the agent with no API call.
- **Removed `tests/fixtures/.gitkeep`**, since the folder now has content.

## 2026-10-29 — Planner agent

- **The Planner returns structure only** (`EventPlanDraft`): functions with ritual keys, a `dayOffset` relative to the main day, "HH:MM" times and expected guests, plus a budget split as percentages and undated high-level tasks. `finalizeEventPlan()` does every date and rupee: `addDays` for dates, normalised percentages, `allocateByWeight` for exact paise (rule 1).
- **`startDate` in onboarding means the main day** (the wedding ceremony, birthday or festival day). Other functions are placed around it with negative or positive offsets, and the event's start/end dates are derived from the first and last function.
- **Code repairs the draft rather than rejecting it,** and logs every repair in `adjustments` for the "Why?" panel: unknown ritual keys are dropped, a ritual listed twice stays on its first function, guest counts are capped at the invite list, and percentages that don't sum to 100 are scaled. Rituals the model didn't place come back in `unassignedRitualKeys`, so they're never silently lost. Only an allocation with no positive percentage throws.
- **Unknown budget** (`budgetTotalPaise: null`, the "not sure? I'll estimate" option) gives percentages but `allocationPaise: null`. The total will come from the Budget agent's priced lines.
- **Functions may end after midnight** (`endTime < startTime`, e.g. Bashor Raat 23:30 → 04:00); same-day functions are ordered by start time.
- **The allocation is an array of `{ category, percent }`**, not a record, so the JSON schema stays simple for structured outputs; duplicates are merged.
- **Demo fixtures** for the Planner are hand-written for the Bengali wedding (six functions, 12–16 Feb 2027) and a generic birthday. A test runs Culture → Planner in demo mode and checks every KB ritual is placed and the split sums to exactly ₹15L. Other traditions have no Planner fixture yet, so demo mode reports a missing fixture for them.

## 2026-10-29 — Budget agent

- **The model sees a price menu for the city tier** (a second cached system block listing each category/unit with its low/mid/high price) and the Planner's target per category in ₹. It picks unit, quantity and tier; it never writes totals. `priceBudgetProposal()` prices every line with `budget-math.ts`.
- **Quantity caps:** a `per_guest` line is capped at its function's expected guests (or the event guest count if event-wide). A `per_plate` line is capped at 2 meals per guest at its function (or across all functions). Caps are logged in `adjustments`, as are function names that don't match a planned function (the line becomes event-wide).
- **Lines with no benchmark** for their category/unit return in `unpriced` with a "needs a quote" note, never a guessed price.
- **"Estimate for me" budgets:** when `budgetTotalPaise` is null, the priced total becomes the suggested budget (`budgetIsEstimate: true`) and per-category allocations are null.
- **Result shape:** each category reports the Planner's allocation next to the priced estimate, plus overall over-budget/remaining amounts. That's what the Budget page and later the cascade diff will use.
- **Demo data is consistent end to end:** the Bengali Budget fixture prices to ₹14.4L against ₹15L, and the Planner fixture's split was rebalanced (small fractional percentages are allowed) so every category's estimate stays within its allocation. A demo-mode test runs Culture → Planner → Budget and checks this.

## 2026-10-29 — Timeline agent & scheduling rules

- **Relative due dates are integers** (`dueOffsetDays`, -90 = "T-90d") rather than "T-90d" strings, so the JSON schema enforces them and there's nothing to parse. The UI can still display them as T-90d.
- **Scheduling lives in `src/lib/rules/schedule.ts`** (pure, unit-tested), and the agent stays thin. `scheduleTasks()`:
  1. drops duplicate refs, self-dependencies and unknown dependencies, and breaks cycles (checked in input order, so the earlier-listed edge wins);
  2. makes every dependency due no later than the tasks that need it, by moving dependencies *earlier* (moving dependents later could push pre-event work past the event);
  3. resolves offsets against the main day and schedules anything ideally due before today *for today*, with `overdue: true` and `idealDueDate` kept.

  Every repair is logged in `adjustments`; overdue tasks get one summary line, not one each.
- **The model is told how many days remain** (computed in code), so it can plan realistic lead times. It still writes offsets only.
- **Ritual prep tasks come from the KB, not the model:** one "Gather ritual items for X" task (source `ritual_kb`, category `priest`) a week before each function that has ritual items, listing up to 8 items. The prompt tells the model not to create these.
- **"Today" is injectable** (`TimelineInput.today`) and defaults to the IST calendar date. Tests fix it at 2026-10-29: the demo wedding is then 108 days away and 7 early bookings (venue, purohit, photographer…) show as due now, which is realistic for a wedding 3½ months out.
- **Task refs** are short snake_case ids that exist only to express dependencies. They map to UUIDs (`tasks.depends_on`) when persisted.

## 2026-10-29 — Plan builder & events API

- **`buildEventPlan()`** (`src/lib/plan/build-plan.ts`) runs Culture → Planner → (Budget ∥ Timeline). Budget and Timeline both need only the Planner's output, so they run in parallel. An `onStep` callback reports `rituals → structure → budget → timeline` for the "Building your plan" progress list. Agents are injectable for tests.
- **In-memory event store for now.** `EventRepository` has a `MemoryEventRepository` implementation kept on `globalThis` (survives dev hot-reload, not a server restart). It returns deep copies, so callers can't mutate stored events. A Drizzle/Supabase implementation of the same interface comes once `DATABASE_URL` is set; until then, events vanish on restart and the 404 message says so.
- **Routes:** `POST /api/events` (onboarding answers → 201 `{ event }`), `GET /api/events` (summaries, newest first) and `GET /api/events/:id`. Handlers stay thin: Zod-parse, call the service, return JSON. They use the standard `Response.json` rather than `NextResponse`.
- **Error mapping** (`src/lib/api/errors.ts`):
  - 400 `INVALID_INPUT` with one message per field;
  - 404 `NOT_FOUND`;
  - 422 `DEMO_FIXTURE_MISSING` when demo mode has no saved plan for a tradition (the message suggests a Bengali wedding or a birthday);
  - 502 `AI_FAILED` "Couldn't generate that — try again.";
  - 500 `INTERNAL`.

  Details go to the server log only.
- **Default titles** read "Bengali Hindu wedding in Kolkata"; the generic culture gives "Birthday in Pune". A title from onboarding wins.
- **Verified against the real dev server** in demo mode: POST returns the full plan (14 rituals, 6 functions, ₹14.4L budget, 33 tasks).

## 2026-10-29 — Onboarding chat

- **No shadcn/ui yet.** The chat needs only buttons, an input and bubbles, so it's plain Tailwind with the brand tokens. shadcn/ui gets added when a component earns it (dialog, slider for What-If, tabs), to avoid pulling in Radix and its helpers for nothing. `lucide-react` is in for icons.
- **Onboarding logic is a pure, client-safe module** (`src/lib/onboarding/steps.ts`) with unit tests. The six steps follow CLAUDE.md §9; each step's parser turns typed or tapped input into a typed value with friendly messages, instead of Zod's defaults. The UI component only holds state.
- **Tradition chips** start with specific traditions for weddings and with "No specific tradition" for other events. Its wording ("Pick the closest, or none — you can mix and adjust later") avoids presuming a community.
- **Budget** accepts anything `parseINR` understands, plus "estimate / not sure / don't know", which becomes `null`. Budgets under ₹10,000 are rejected as likely typos.
- **Dates** use a native date picker, must be upcoming and within 3 years. "Today" comes from the server (IST) as a prop, so server and client agree.
- **Editing answers:** each answer has a pencil button that rewinds to that question and clears the later answers, since later chips can depend on earlier ones.
- **Build progress is paced on the client** (one step every 1.4 s, holding on the last) because `POST /api/events` returns once. Streaming real progress can come with SSE later. Errors show the API's friendly message with a "Try again" button.
- **`/events/[id]` is a placeholder** summary card until the dashboard lands.
- **Dev-server note:** a long-running `next dev` on this laptop once failed every dynamic page with "Jest worker encountered 2 child process exceptions". This followed earlier memory pressure, and a fresh restart fixed it. If dynamic pages suddenly 500 in dev, restart the dev server.

## 2026-10-29 — Dashboard

- **The dashboard data is a pure module** (`src/lib/plan/dashboard.ts`) that returns everything the page renders: days to go, budget used/total and %, tasks done / due now, the next 5 tasks, plan issues and donut slices. It's unit-tested on the real demo plan; the page and components are presentational.
- **The donut has 6 slices, not 12.** Following the dataviz guidance (5–6 colours per chart; fold the tail into "Other"), Catering, Venue, Décor, Attire and Photography get fixed slices, and everything else becomes "Other" with its members listed. **Each colour belongs to its category, not its rank**, so slices keep their colours when amounts change. The Budget page will show all 12 categories as a table.
- **Chart colours** (`--color-series-1..5`, `--color-series-other` in `globals.css`) are the dataviz skill's validated reference hues. Validated on our cream surface: lightness, chroma, colour-blind and normal-vision separation all pass. The grey "Other" fails only the chroma check, which is intended because it's a neutral. Three slices fall below 3:1 contrast on cream, so the legend always shows label, amount and % (no meaning by colour alone). There's a 2px cream gap between slices and a hover tooltip, and the chart has an `aria-label` summary.
- **Brand colours stay in the UI chrome** (headings, buttons, the budget meter), not in the data series.
- **"Open conflicts" counts warn and critical issues** found by `detectIssues()`: over budget, unpriced lines, unplaced rituals and low-confidence rituals. An unknown city tier is an info note that doesn't count. The Phase 2 conflict checks (venue capacity, timeline overlap) will feed this same list.
- **"Tasks done" is 0 / n for now:** tasks have no status until task tracking lands. "Due now" counts tasks due today or earlier.
- **No dark mode yet:** the app is light-only (cream identity). Adding one later means re-validating the chart palette against the dark surface.
- **Friendly not-found page** for `/events/[id]`, explaining that in-memory plans vanish on restart.

## 2026-10-29 — Budget page

- **`/events/[id]/budget`** lists every category (biggest first) with its target and its difference from target, and every line with a native `<details>` "Why?" panel. The panel shows the working ("250 plates × ₹900 · low tier · metro prices", from `basisText`) and the model's rationale. Native `<details>` gives keyboard and screen-reader support without client JS.
- **Exact rupees on this page, compact elsewhere.** Compact rounding (₹1,65,000 → ₹1.7L, ₹1,60,000 → ₹1.6L) made a "₹5K under target" row look wrong. Category totals and targets on the Budget page use full Indian-grouped amounts; differences stay compact (₹5K). Dashboard tiles keep compact notation.
- **Differences carry an icon and words** ("₹5K under target", "On target") as well as colour (§9 accessibility).
- **The view model is pure** (`src/lib/plan/budget-view.ts`): rows, grouped lines and totals, unit-tested on the demo plan (12 categories, line totals match category totals).
- **Shared `EventHeader`** with section tabs (Overview, Budget; Timeline joins next). The tab strip bleeds to the screen edge so it can scroll horizontally on narrow phones.
- **"Regenerate" isn't wired yet.** It needs an endpoint that re-runs one agent and goes through the cascade/diff flow, which comes in Phase 2.

## 2026-10-29 — Timeline page & ritual checklists

- **CSS-only Gantt** (`components/plan/Gantt.tsx`): one row per function with an absolutely positioned bar across the whole event span (days × 24 h), day dividers, and the date/times as text on every row (bars are `aria-hidden`; the text carries the information). Functions ending after midnight extend into the next day and are labelled "next day". If the last function runs overnight, an extra day is added. At 375px a 5-hour function is about 12px wide, so position reads better than duration; the text times cover the detail.
- **Ritual cards are grouped by function**, in the Planner's order, with unplaced rituals in a final "Not yet scheduled" group. Each card shows order, duration, significance, participants, a tickable item checklist and its **source citation**. The citation is found by matching the ritual's `**Key:**` line inside the chunks the plan actually cited, so a ritual whose chunk wasn't cited shows no source.
- **Confidence note:** low confidence shows the exact §7.1 wording "General suggestion — verify with your family priest/elders." High and medium say the content comes from (or is adapted from) Utsav's ritual guide and that customs vary.
- **Ticked items are saved server-side**: `StoredEvent.procuredItems` holds item ids `"<ritual key>#<index>"`, updated via `PUT /api/events/:id/ritual-items { itemId, procured }`. The route only accepts ids that exist on the event's checklist. The client updates optimistically and rolls back with a message if saving fails. This maps onto `ritual_items.procured` when the DB repository lands.
- **Tasks** on this page are the full list grouped by month, reusing `NextTasks`.
- **Timeline tab** added to `EventHeader`.

## 2026-10-29 — Cascade foundations: dependencies, capacity, conflicts

- **Watched fields** are `guest_count`, `budget_total`, `start_date` and `city`. `FieldChange` (Zod, discriminated on `field`) validates PATCH bodies `{ field, value }`. The previous value always comes from the stored plan, never from the client.
- **`DEPENDENCIES`** (`lib/graph/dependencies.ts`) follows §7.4. Changes from the spec example: return gifts are the `gifts` category; guest count also reaches `functions:guests`, `budget:misc` and the over-budget check; a date change also re-runs the timeline-overlap check. `computeImpact` returns nothing when the value didn't change.
- **Which budget lines follow guests** (`guestScaling`): `per_plate` and `per_guest` lines scale with their function's guests; invitation cards (`invites` × `per_item`) scale with the event's guest count; everything else is fixed (venue days, décor packages, tattva trays). Scaling rounds to whole units, minimum 1.
- **Functions and a new guest count:** a function that had the whole guest list (ceremony, reception) takes the new count; smaller functions keep their number, capped at the new total.
- **Venue capacity** is a new optional `venueCapacity` on functions, because the Planner doesn't book venues. It's set by the family (UI later) or the demo seed (300 for the wedding hall, so 250 → 350 trips it). Over capacity is critical; ≥ 90% full is a warning; no capacity means no check.
- **Conflicts** (`lib/rules/conflicts.ts`): over budget (critical, skipped when Utsav is estimating the budget), venue capacity, and function time overlaps (warn; functions that just touch, like Biye 23:30 → Bashor Raat 23:30, don't count; overnight functions extend into the next day). Results are sorted critical-first. These will replace the dashboard's interim `detectIssues` checks once the cascade lands.
- **`PlanDiff`** Zod schema (§8) is in `lib/schemas/diff.ts`, ready for `cascade.ts` and `diff.ts`.
