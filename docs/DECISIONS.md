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
