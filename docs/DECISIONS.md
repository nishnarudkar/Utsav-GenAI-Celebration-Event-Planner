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

## 2026-10-29 — Cascade engine & diff

- **`runCascade(state, change, ctx)` is pure.** It returns `{ noop, change, state, diff }` and persists nothing, so the What-If simulator can use it as a dry run unchanged. The previous value is read from the state (`readCurrentValue`), never from the request. An unchanged value returns `noop: true`, the same state object and the current version.
- **One handler per watched field**, then shared steps: re-total the budget (`retotal`), run `detectConflicts`, build a `PlanDiff` (version + 1), and write a deterministic `describeCascade` explanation. The AI Explainer will improve the wording and add recovery options; this text stays as the fallback.
  - **guest_count:** functions follow the new count (`scaleFunctionGuests`); guest-driven lines are rescaled by their function's or the event's guests, at the same unit price.
  - **budget_total:** category targets are re-split from the Planner's percentages with `allocateByWeight`; no line changes. Setting a budget ends "estimate for me" mode.
  - **start_date:** functions and AI/KB tasks shift by the same number of days, and tasks that land before today are re-clamped. User tasks stay put. For non-generic weddings there's an info note, "check the timings with your priest or elders" (neutral wording, since not every tradition uses a muhurat).
  - **city:** a different city tier re-prices every unlocked line from the benchmarks; the same tier only changes the name.
- **Locked lines and user tasks are never modified** (rule 4). When a change would affect a locked line, an info-level `locked_item` conflict says what it would have become. To support this, `PricedLine` gained an optional `locked` flag, and `ScheduledTask.source` now allows `"user"`.
- **Undo will restore a stored snapshot** (the state before the change) instead of replaying an inverse change. Rescaling 350 → 250 rounds quantities and may not exactly reverse 250 → 350; a snapshot is exact and simpler. CLAUDE.md §7.4 describes undo as "apply the inverse diff"; this gives the same result reliably.
- **Diff entries:** `field:<name>` for the change itself, `function:<i>` for changed functions (only the changed fields), `line:<i>` for budget lines (quantity, unit price and estimate before/after, with a reason like "250 → 350 guests at Biye (wedding ceremony)"), and one aggregated `timeline:all` entry for task dates instead of 33 rows.
- **Demo numbers** (tested): 250 → 350 guests changes 4 lines, +₹2,07,200, a total of ₹16,47,200, ₹1,47,200 over budget, plus the venue-capacity conflict with the 300-seat hall. Cutting the budget to ₹12L leaves the plan ₹2.4L over. Moving the date a week later shifts all 33 tasks and leaves 6 overdue instead of 7.

## 2026-10-29 — Cascade API, change log & undo

- **`PATCH /api/events/:id`** with `{ field, value }` (validated by `FieldChange`) runs the cascade through `changeEvent()` (`lib/plan/change-service.ts`) and returns `{ event, diff }`. An unchanged value returns `{ noop: true }` without bumping the version. **`?dryRun=true`** returns the projected event and diff without storing anything; the What-If simulator will use this.
- **Change log:** `applyChange()` replaces the plan, bumps the version and appends a `ChangeRecord` (the trigger with its `from`, the diff, and the full plan **before** the change). `GET /api/events/:id/changes` lists them newest first; snapshots never leave the server.
- **Optimistic concurrency:** `applyChange` takes the version the cascade started from and refuses with `version_conflict` (409 "This plan changed while you were editing") if it moved meanwhile.
- **Undo** (`POST /api/events/:id/undo`) restores the snapshot of the latest change that hasn't been undone, so repeated undos step back through history. It's recorded as a **new version** (versions only increase), and the change is marked `undone`. 409 `NOTHING_TO_UNDO` when there's nothing left. Undo is exact: the test restores the original budget, plan and timeline byte for byte.
- **Ritual checklist ticks survive changes and undo**, because they live on the stored event, outside the plan snapshot.
- **The in-memory store** now holds `{ events, changes }` on `globalThis.__utsavStore`. The Drizzle version will map change records to `plan_changes` (`trigger_json`, `diff_json`, and a snapshot column to add).

## 2026-10-29 — Recovery options & Explainer

- **Recovery options are generated in code** (`lib/graph/recovery.ts`), only when the plan is over a family-set budget. The candidates are: one tier lower per category (`tier:<category>`), printed cards → digital invitations, and, after a guest increase that overfills a venue, keeping the list at the venue's capacity (`guests:<n>`). Each option is a typed `RecoveryPatch` (`lines` re-basis, or a `field` change that runs the cascade). **Savings are exact:** each patch is applied as a dry run and totals are compared. The top 3 by saving are returned, with an impact line ("covers 70% of the ₹1.5L overrun" or "brings you within budget").
- **Never suggested as cuts:** priest and ritual costs, and locked lines. The ritual budget is the family's call.
- **CLAUDE.md's demo story** ("move the reception to the lawn", "buffet tier") assumes venue alternatives and catering tiers the demo plan doesn't have (its catering is already low tier). The options here come from the plan's real levers. For the demo (350 guests, 300-seat hall) they are: keep 300 guests (₹1,03,600), budget attire (₹93,000), budget gift trays (₹25,000).
- **The Explainer** (fast model, `EXPLAINER_PROMPT_V1`) gets the facts with every amount pre-formatted and writes 2–4 sentences. **Guard:** every ₹ amount in its text must appear in those facts (`amountsAreGrounded`), so it can't calculate or invent money (rule 1). If it does, or the AI call fails, the deterministic `describeCascade` text is used. A demo fixture (`emit_explanation.guest_count`) covers the demo scenario; the guard rejects it when its amounts don't apply (e.g. no venue capacity set).
- **PATCH responses and the change log now carry** `recoveryOptions` and the Explainer's text. Applying an option through the API comes with the diff panel.

## 2026-10-29 — Diff panel, recovery API & editable plan

- **`POST /api/events/:id/recovery { optionId }`** applies an option offered by the **latest change that hasn't been undone**. That's always correct, because Undo restores exact snapshots. The change is logged with a `RecoveryTrigger` (`field: "recovery"`, the option's title), so it can be undone like any change, and fresh options are offered if the plan is still over budget. An option that's no longer offered returns 409.
- **The dashboard's "Adjust plan" card** (`PlanControls`) edits guest count and budget, one field per submit (each is its own cascade and log entry), validated client-side with friendly messages. After every change, apply or undo it calls `router.refresh()`, so the stat cards and lists re-render from the server.
- **`DiffPanel`:**
  - the Explainer's text and the total delta
  - one row per change, with ▲ (costs more, red), ▼ (saves, green) or ▸ (moved): icon, words and exact amounts, never colour alone
  - problems via the shared `IssueList`
  - "Ways to get back on budget" with **Apply** buttons whose accessible names include the option
  - **Accept** (dismiss) and **Undo** (latest change)
  - a word joiner keeps "+₹2.1L" from wrapping between sign and amount
- **The diff view model** (`lib/plan/diff-view.ts`, pure, tested) formats from/to per entry type and maps conflicts to titled issues.
- **Option wording:** "Choose budget-friendly attire" (not "… options"). When printed cards can switch to digital invitations, no separate "cheaper cards" tier option is offered for the same line.
- **Not yet in the UI:** setting a venue's capacity, and changing the date or city (both supported by the API). The Phase 5 seed sets the demo hall to 300 seats.

## 2026-10-29 — Quote X-Ray: extraction, analysis, negotiation

- **No `pdf-parse`.** Quote PDFs go to Claude as native `document` content blocks and images as `image` blocks. One code path handles typed PDFs, scanned PDFs and phone photos, with no extra dependency. CLAUDE.md §2 listed `pdf-parse`; this replaces it.
- **The model transcribes; code checks** (rule 1). `QuoteExtraction` holds line items exactly as printed (rupees as numbers, `null` when a figure isn't printed; the prompt forbids working numbers out), the stated subtotal/total, GST status/rate, and its critical reading: verbatim phrases that hide cost ("as per actuals", overtime), commonly expected items that are missing, and terms.
- **`analyzeQuote()`** (`lib/rules/quote-analysis.ts`, pure, tested) converts to paise and checks:
  - quantity × rate against each printed amount (₹1 rounding tolerance), and the printed total against the sum of lines;
  - lines with no price;
  - GST: computed only when the quote states a rate, otherwise "ask which rate applies" (we don't assume a rate);
  - per-unit rates against the city's **mid** benchmark, flagged above +15%.

  Hidden costs and missing items come from the model's reading. Flags are sorted critical → warn → info.
- **The negotiation message** (fast model) gets pre-formatted facts only, and the same `amountsAreGrounded` guard as the Explainer. A deterministic, polite fallback message is used if the model fails or invents an amount.
- **Demo quote:** a fictional "Shubho Bhoj Caterers" (₹1,770/plate × 250 = ₹4,42,500, 18% above the ₹1,500 Kolkata mid; GST extra with no rate; live counters "as per actuals"; overtime after 11 PM), with fixtures for extraction (`emit_quote_extraction.catering`) and negotiation (`emit_negotiation.catering`). Demo extraction fixtures are keyed by category, so in demo mode any uploaded catering file returns this quote.

## 2026-10-30 — Quote X-Ray: upload and Vendors page

- **`POST /api/events/:id/quotes`** (multipart `file` + `category`) runs extraction → analysis → negotiation and stores the result in `StoredEvent.quotes` (newest first). `GET` lists them. **The uploaded file isn't kept**, only the analysis; with a database, file storage would go to Supabase Storage (`quotes.file_url`).
- **Upload checks:** a size limit of 10 MB, rejected from `Content-Length` before buffering where possible, and the real type is detected from the file's first bytes (`sniffMediaType`), not its name or claimed type. That detected type is what gets sent to the model.
- **Quotes live outside the plan snapshot**, so Undo doesn't remove them, same as checklist ticks.
- **`/events/[id]/vendors`:** the uploader, plus a "Try the sample quote" button posting `public/samples/sample-caterer-quote.pdf` (generated by `scripts/gen-sample-quote.ts`; clearly marked fictional; "Rs." because the PDF's built-in font has no ₹). Quote cards reuse `IssueList` for flags, with a line-by-line check, terms, and the draft with a Copy button that falls back to a message if the clipboard is unavailable.
- **Not built yet:** the vendor kanban from CLAUDE.md §5, and feeding a quote's amount into the budget line's `quotedPaise`.
- **Testing note:** under phone emulation the browser pane's `computer` click can land off-target (seen scaled by 3/4). Check with a click listener before suspecting the app.

## 2026-10-30 — Family Council backend

- **Stakeholders** have structured preferences (guests, budget limit, venue style, number of functions, menu, notes). They and the latest result live on the stored event, outside the plan snapshot. Adding or removing someone clears the result, which no longer applies.
- **`costDeltaPaise` is computed, not generated.** CLAUDE.md §8 includes it in the Council's output, but rule 1 says the LLM never does maths, so `CouncilDraft` has no money field. `finalizeCouncil()` dry-runs each patch and measures the real difference, plus any plan problems it would leave.
- **Compromises are typed patches** (`CouncilPatch`: guest count, per-function guests, budget), not free-form `patch: unknown`. Function-level guests are new (`applyFunctionGuests`), needed for "small ceremony, big reception"; locked lines are protected there as well. If a function needs more guests than the event has, the guest list is raised.
- **Refs, not names:** the model and fixtures identify people by role ("couple", "parent_2"), so demo fixtures work for any family. Code maps refs to names and drops unknown ones, and any conflict left with fewer than two sides.
- **Resolutions record `planVersion`.** Applying after the plan has moved on returns 409 and asks to hold the council again, so a family never acts on stale costs. Applying is a logged change (`trigger.field: "council"`), so Undo works and clears the recorded choice.
- **Birthday demo fixtures added.** Budget and Timeline fixtures for `generic.birthday` were missing, so birthdays failed in demo mode despite the app's message suggesting one. Found by the Council tests; a route test now covers it.
- **Council demo fixture** exists only for the Bengali wedding; other plans get a clear 422 in demo mode.

## 2026-10-30 — Family Council page

- **`/events/[id]/council`** (tab "Family"): add people with optional preferences, hold the council, see where they differ, choose a compromise. Choosing shows the shared `DiffPanel`, so Accept, Undo and recovery options work as on the dashboard.
- **The conflict "matrix" is stacked:** one block per topic with each person's position, instead of a topic × person table that wouldn't fit a phone.
- **Severity and outcomes carry words and icons:** "Needs settling" / "Worth discussing" / "Minor", "Gets their wish" / "Gives a little".
- **Stale options** are disabled with an explanation whenever the plan's version differs from the one they were measured against. That includes after Undo, even though the plan is then back to its earlier state: versions only increase, so the council has to be held again. A little conservative, but never wrong.
- **Form logic is pure** (`lib/plan/council-form.ts`, tested). `apiCall` (`lib/plan/client-api.ts`) is shared by `PlanControls` and `CouncilPanel`.
- **Tabs:** five tabs overflowed at 375px and cut off the active one, so they're tighter on phones (13px text, less padding), with a hidden scrollbar on narrower screens.
- **Not built:** the optional per-person shareable link from PROJECT.md F5 (needs auth or signed links, which are out of scope).

## 2026-10-30 — What-If Simulator

- **Lives on the Budget page** (`WhatIfSimulator`), per CLAUDE.md §5. `POST /api/events/:id/whatif { scenario }` is a pure dry run (`projectScenario`) with no AI: about 30–50 ms on the dev server, plus a 250 ms client debounce, so it meets the "under 1 s" target. In-flight requests are aborted when a slider moves again. `{ scenario, apply: true }` saves it as a logged change (`trigger.field: "whatif"`), so Undo restores it exactly.
- **It uses its own endpoint rather than `PATCH ?dryRun`** because a scenario combines several changes at once and the slider path must skip the Explainer.
- **Sliders for guests and for venue/catering/décor tier.** Each tier slider starts at the category's most used tier and is only sent once moved, so an untouched mixed-tier category isn't flattened.
- **"Number of functions" is a keep/drop tick list, not a count slider.** A count can't say which function goes, and that's a family decision that shouldn't be guessed. Dropping removes the function, its budget lines and its tasks (user tasks stay, dangling dependencies are cleaned), and its rituals go to `unassignedRitualKeys`, so they show as unplaced rather than vanishing. A function with locked lines can't be dropped, and at least one function always stays.
- **"Save ₹X" suggestions** reuse the recovery candidates via `evenWithinBudget`, ranked by exact saving. Priest and ritual costs stay excluded. They're informational; the sliders make the changes.
- **`PlanDiff.removed`** is now populated, and `DiffPanel` shows removed items.
- **Dev note:** Bash `netstat | grep` can silently return nothing on this machine. Use PowerShell `Get-NetTCPConnection -LocalPort 3001 -State Listen` to find or stop dev servers.

## 2026-10-30 — Demo event (Phase 5)

- **"Try the demo wedding" on the landing page** (`POST /api/demo`, `lib/plan/demo-event.ts`) creates a fresh copy each click: Bengali wedding, Kolkata, 14 Feb 2027, ₹15L, 250 guests, a 300-seat hall on the Biye, three stakeholders and one checked caterer quote. It goes through the normal services, so it can't drift from real events, and rehearsing never dirties the next run.
- **`pnpm db:seed` calls `POST /api/demo` on a running server** instead of writing to a database, because events live in the server's memory. It should seed the database once the Drizzle repository exists.
- **The demo mode toggle is still the `DEMO_MODE` env var**, not an in-app switch. A switch would change behaviour for every visitor of a shared server. Event pages now say "Demo mode: the AI answers here are saved samples." so samples never pass as live AI. A local `.env.local` (gitignored) sets `DEMO_MODE=true`, so `pnpm dev` works without a key.
- **Bug found by walking the demo: the dashboard ignored venue and timeline conflicts.** `detectIssues` only checked the budget, so the tile said 1 while the diff listed 2. It now includes capacity and overlap checks.
- **Bug found by walking the demo: the Council fixture assumed 250 guests.** After the script's 250→350 step, it offered "Stay with the current 250", "stays within budget". That option is now "Keep the guest list as it is", worded to be true at any guest count, with nobody named as winning or losing.

## 2026-10-30 — Playwright tests and demo script

- **`@playwright/test` added** as a dev dependency. The `test:e2e` script already existed, but the package didn't.
- **Tests use the installed Edge, not a downloaded browser** (`channel: "msedge"`), to avoid a large download on a memory-tight laptop. `PW_CHANNEL=chrome` switches browser, and an empty `PW_CHANNEL` uses Playwright's own Chromium, which needs `playwright install chromium`, for example on CI.
- **Two tests, not one.** Besides the required happy path, a second test walks the demo script with real clicks, because that's the flow that can't fail on stage. It covers the recovery Apply button, the file picker and Copy.
- **Tests start their own server on port 3100** with `DEMO_MODE=true`, so they never call the real API and don't clash with `pnpm dev`.
- **The chat-built event has no hall size**, so the demo moves to the seeded copy after step 1. Onboarding doesn't ask for capacity.
- **`docs/DEMO_SCRIPT.md` leaves out live mode**, since Day-of Copilot (P2) isn't built.
