<div align="center">

# 🪔 Utsav

### AI-powered celebration & event planner for weddings, birthdays and community events

**Budgets · Timelines · Rituals · Vendor checklists · Personalized ideas: all connected.**

![Next.js](https://img.shields.io/badge/Next.js-15-black)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)
![Supabase](https://img.shields.io/badge/Supabase-Postgres%20%2B%20pgvector-3ECF8E)
![Claude](https://img.shields.io/badge/AI-Claude%20API-D97757)
![License](https://img.shields.io/badge/license-MIT-green)

</div>

---

## ✨ What is Utsav?

Utsav turns a 60-second conversation into a complete event plan. Tell it *"Bengali wedding in Kolkata, Feb 2027, 250 guests, ₹15 lakh,"* and it builds:

- 📿 **Ritual sequence** with required items, grounded in a cultural knowledge base
- 💰 **Budget** broken down by category, using city-specific price benchmarks
- 🗓️ **Timeline** of tasks working back from the event date
- 📋 **Vendor checklists** with questions to ask and red flags to watch for
- 🎨 **Personalized ideas** for themes, décor and palettes

### The big idea: plans that react
Utsav models your event as a **living plan graph**. Change one thing, and it shows you everything that ripples:

```
You: "Make it 350 guests instead of 250"

Utsav:  Catering        ₹6.2L → ₹7.8L   (+₹1.6L)
        Invitations     ₹30K  → ₹42K    (+₹12K)
        Return gifts    ₹88K  → ₹1.2L   (+₹35K)
        ⚠ Venue capacity (300) exceeded
        ⚠ Over budget by ₹2.1L

        Recovery options:
        [Move reception to lawn — saves ₹1.1L]  [Buffet tier — saves ₹90K]  [Lighter décor — saves ₹60K]
```

---

## 🚀 Features

| Feature | Description | Status |
|---|---|---|
| 💬 **Conversational Onboarding** | 6 quick questions → full plan | P0 |
| 🔗 **Cascade Engine** | Every change shows a diff, conflicts and recovery options; undo anytime | P0 |
| 📿 **Cultural Ritual Engine** | Ritual sequences + item checklists for 12+ traditions, with sources | P0 |
| 🧾 **Vendor Quote X-Ray** | Upload a quote → line items, hidden costs, negotiation message | P1 |
| 👨‍👩‍👧 **Family Council** | Each stakeholder's preferences → conflicts → fair compromises | P1 |
| 🎚️ **What-If Simulator** | Sliders show budget tradeoffs live, before you commit | P1 |
| 🎨 **Vibe-to-Plan** | Inspiration images → palette, theme, décor list | P2 |
| 📱 **Day-of Copilot** | Report a delay → timeline reshuffles → vendors notified on WhatsApp | P2 |
| 🏘️ **Community Extras** | Volunteers, sponsorship pitch, permits checklist | P2 |
| 📤 **Export** | PDF booklet + calendar (.ics) | P2 |

---

## 🧱 Tech Stack

- **Frontend:** Next.js 15 (App Router), TypeScript, Tailwind CSS, shadcn/ui, Recharts, Zustand, TanStack Query
- **Backend:** Next.js Route Handlers, Drizzle ORM, Zod
- **Database:** Supabase Postgres + pgvector (RAG) + Storage (uploads)
- **AI:** Anthropic Claude API (tool use for structured output, vision for quotes and moodboards)
- **Embeddings:** Voyage AI (swappable)
- **Messaging:** Twilio WhatsApp (with mock mode)
- **Testing:** Vitest, Playwright
- **Deploy:** Vercel

---

## 🏗️ Architecture

```
Next.js UI  ──►  Route Handlers  ──►  Orchestrator ──► AI Agents (Claude)
                                          │                │
                                          ▼                ▼
                               Deterministic Rules ──► Plan Graph + Cascade Engine
                               (money, dates, capacity)        │
                                                               ▼
                                        Supabase Postgres + pgvector · Twilio WhatsApp
```

**Key design rule:** *AI decides structure, code does the math.* The LLM picks units and tiers ("per plate, mid tier, 250 plates"), and deterministic code computes rupees. That keeps budgets accurate.

See [`PROJECT.md`](./PROJECT.md) for the full product and architecture document, and [`CLAUDE.md`](./CLAUDE.md) for implementation rules.

---

## 📦 Getting Started

### Prerequisites
- **Node.js** ≥ 20
- **pnpm** ≥ 9 (`npm i -g pnpm`)
- A **Supabase** project (free tier is fine) with the `vector` extension enabled
- An **Anthropic API key**: https://console.anthropic.com
- *(Optional)* A Voyage AI key for embeddings, and Twilio credentials for WhatsApp

### 1. Clone & install
```bash
git clone https://github.com/<your-username>/utsav.git
cd utsav
pnpm install
```

### 2. Configure environment
```bash
cp .env.example .env.local
```
Fill in `.env.local`:

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | ✅ | Claude API key |
| `CLAUDE_MODEL_SMART` | ✅ | Default `claude-sonnet-5-5` |
| `CLAUDE_MODEL_FAST` | ✅ | Default `claude-haiku-5-5` |
| `DATABASE_URL` | ✅ | Supabase Postgres connection string |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Server-side only, for seeding and storage |
| `EMBEDDING_PROVIDER` | ✅ | `voyage` or `mock` |
| `VOYAGE_API_KEY` | ⬜ | Needed if the provider is `voyage` |
| `MESSAGING_MODE` | ✅ | `mock` (default) or `twilio` |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_WHATSAPP_FROM` | ⬜ | Needed only for real WhatsApp |
| `DEMO_MODE` | ⬜ | `true` serves cached AI responses (offline-safe demo) |

### 3. Set up the database
In the Supabase SQL editor, enable pgvector:
```sql
create extension if not exists vector;
```
Then run:
```bash
pnpm db:generate   # generate migrations from schema
pnpm db:migrate    # apply migrations
pnpm kb:embed      # embed the ritual/checklist/pricing knowledge base
pnpm db:seed       # create the demo event (Bengali wedding, Kolkata)
```

### 4. Run
```bash
pnpm dev
```
Open **http://localhost:3000** 🎉

---

## 🛠️ Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Start the dev server |
| `pnpm build` / `pnpm start` | Production build / serve |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | TypeScript check |
| `pnpm test` | Unit tests (Vitest; AI calls are mocked) |
| `pnpm test:e2e` | Playwright happy-path test |
| `pnpm db:generate` / `pnpm db:migrate` | Drizzle migrations |
| `pnpm db:seed` | Seed demo data |
| `pnpm kb:embed` | Re-embed the knowledge base after editing `kb/` |

---

## 📁 Project Structure

```
utsav/
├── kb/                     # Knowledge base (rituals, checklists, pricing benchmarks)
├── scripts/                # seed + embedding scripts
├── drizzle/                # DB migrations
├── src/
│   ├── app/                # pages + API route handlers
│   │   ├── new/            # onboarding chat
│   │   ├── events/[id]/    # dashboard, budget, timeline, vendors, council, vibe, live
│   │   └── api/            # REST endpoints
│   ├── components/         # UI (plan, chat, council, shadcn ui)
│   ├── lib/
│   │   ├── ai/             # Claude client, structured calls, RAG, prompts, agents
│   │   ├── graph/          # plan graph, dependencies, cascade, diff
│   │   ├── rules/          # deterministic budget/capacity/conflict logic
│   │   ├── db/             # Drizzle schema + queries
│   │   ├── schemas/        # Zod schemas
│   │   └── messaging/      # WhatsApp (twilio | mock)
│   └── store/              # Zustand plan store
├── tests/                  # unit, fixtures, e2e
├── CLAUDE.md               # rules for building with Claude Code
├── PROJECT.md              # product & architecture document
└── README.md
```

---

## 🔌 API Overview

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/api/events` | Create an event from onboarding answers → full plan |
| `GET` | `/api/events/:id` | Get an event with its plan |
| `PATCH` | `/api/events/:id` | Update a field → runs a cascade → returns `PlanDiff` |
| `POST` | `/api/events/:id/chat` | Streaming assistant chat (SSE) |
| `POST` | `/api/events/:id/whatif` | Dry-run scenario → projected budget |
| `POST` | `/api/events/:id/quotes` | Upload a quote → `QuoteAnalysis` |
| `POST` | `/api/events/:id/council` | Submit stakeholder preferences → `CouncilResolution` |
| `POST` | `/api/events/:id/vibe` | Upload images → `VibeProfile` |
| `POST` | `/api/events/:id/live` | Report an incident → reshuffled timeline + messages |
| `GET` | `/api/events/:id/export?format=pdf\|ics` | Export the plan |

**Example: create an event**
```bash
curl -X POST http://localhost:3000/api/events \
  -H "Content-Type: application/json" \
  -d '{
    "eventType": "wedding",
    "culture": "bengali_hindu",
    "city": "Kolkata",
    "startDate": "2027-02-14",
    "guestCount": 250,
    "budgetTotalPaise": 150000000
  }'
```

**Example: trigger a cascade**
```bash
curl -X PATCH http://localhost:3000/api/events/<id> \
  -H "Content-Type: application/json" \
  -d '{ "field": "guest_count", "value": 350 }'
```

Errors are returned as `{ "error": { "code": "...", "message": "..." } }`.

---

## 📚 Knowledge Base

The ritual, checklist and pricing knowledge lives in `kb/` as markdown with frontmatter:

```markdown
---
doc_type: ritual
culture: bengali_hindu
event_type: wedding
---
# Gaye Holud
...
```

To add a new tradition:
1. Create `kb/rituals/<culture>-<event>.md`, written in your own words.
2. Run `pnpm kb:embed`.
3. Add the culture key to `src/lib/schemas/culture.ts`.

Price benchmarks in `kb/pricing/vendor-benchmarks-india.json` are **indicative estimates** by city tier, and the UI labels them that way.

---

## 🧪 Testing

```bash
pnpm test        # unit tests: budget math, cascade, diff, conflicts, formatters
pnpm test:e2e    # onboarding → plan → change guest count → diff visible
```
- AI calls are **never** made in tests; responses come from `tests/fixtures/llm/`.
- Every function in `lib/rules` and `lib/graph` has unit tests.

---

## 🎬 Demo

1. Run `pnpm db:seed`, then open the seeded **"Ananya & Rohan — Kolkata Wedding"** event.
2. Set `DEMO_MODE=true` for a reliable demo without network or rate-limit risk.
3. Follow the 3-minute script in [`docs/DEMO_SCRIPT.md`](./docs/DEMO_SCRIPT.md) (also summarized in `PROJECT.md` §17).

---

## 🛡️ Responsible AI

- Ritual content is **grounded in a curated knowledge base**, with sources and confidence badges. Users can edit anything.
- **No dowry planning, no caste assumptions.** Traditions are presented respectfully and neutrally.
- All AI changes appear as **diffs you can accept or undo**. Locked items are never changed.
- API keys are **server-side only**. WhatsApp messages are sent only after confirmation (mock by default).

---

## 🗺️ Roadmap

- [x] Product design & architecture
- [ ] P0: onboarding, plan generation, ritual engine, cascade engine
- [ ] P1: Quote X-Ray, Family Council, What-If Simulator
- [ ] P2: Vibe-to-Plan, Day-of Copilot, community extras, export
- [ ] Post-hackathon: auth & collaboration, WhatsApp bot, regional languages, RSVP & seating, muhurat suggestions

---

## 🤝 Building with Claude Code

This repo is set up to be built with Claude Code:
1. Open Claude Code in the project root. It reads `CLAUDE.md` automatically.
2. Work phase by phase:
   > "Read CLAUDE.md and complete Phase 0."
   > "Now complete Phase 1. Run typecheck, lint and tests when done."
3. Review each phase before moving on.

---

## 👥 Team

| Name | Role |
|---|---|
| — | Product & Pitch |
| — | Frontend |
| — | Backend & AI |
| — | Data & Content |

---

## 📄 License

MIT. See `LICENSE`.

<div align="center">
Made with ❤️ for every celebration · <b>Utsav</b>
</div>
