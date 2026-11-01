# Utsav

### Autonomous Event Orchestration and Decision Intelligence for Indian Celebrations

Utsav is an intelligent event planning and decision-support system designed for multi-day, multi-stakeholder Indian weddings, milestone celebrations, and community festivals.

Static checklists fail in complex celebrations where decisions are deeply coupled: modifying guest counts cascades across catering thresholds, venue capacities, transport logistics, and category budgets, while introducing potential schedule or family conflicts. Utsav models celebrations as an active dependency graph, pairing structured generative AI agents with deterministic rules engines to guarantee mathematical precision, cultural authenticity, and financial control.

---

## Architectural Principles

1. **AI Proposes, Deterministic Code Decides (Zero-Math Policy)**  
   Large language models never compute budgets, sums, quantities, dates, timestamps, or safety margins. AI agents output qualitative classifications, semantic structures, and relative adjustments. All financial arithmetic, capacity verifications, calendar computations, and safety metrics are executed by pure, deterministic TypeScript functions.

2. **Schema-Governed Structured Generation**  
   All model interactions pass through a centralized execution harness (`callStructured`) enforcing strict Zod schemas. Model outputs are parsed and validated. In the event of schema divergence, an automated single-cycle corrective retry is executed with compiler issues fed back to the model.

3. **Grounded Anti-Hallucination Guardrails**  
   Generative text generation (such as plan summaries, vendor negotiations, and family mediation) is protected by numerical grounding guards. If an agent introduces currency amounts or figures not explicitly provided in its runtime context, the generation is rejected and replaced by a deterministic fallback.

4. **Bi-Directional Cascade with State Recovery**  
   Every event state modification is tracked in an append-only change log with before-and-after snapshots. If an adjustment produces an overrun or capacity violation, the system generates ranked, mathematically verified recovery patches with single-click reversibility (`Undo`).

---

## System Architecture

The following diagram illustrates the end-to-end architecture across client interactions, edge routing, deterministic graph computation, multi-agent AI execution, and data persistence:

```mermaid
flowchart TD
    subgraph Client["Client Tier (Mobile & Desktop Web)"]
        UI["Next.js 15 App Router / Tailwind CSS"]
        AssistantUI["Ask Utsav Event Assistant"]
        Modules["Specialized Panels (Budget, Timeline, Vendors, Live, Council)"]
    end

    subgraph EdgeSecurity["Edge & Security Tier"]
        Middleware["Next.js Edge Middleware (Client IP Rate Limiting)"]
        Validation["Content-Type & Byte-Level MIME Sniffing"]
    end

    subgraph CoreEngine["Application & Business Logic Tier"]
        API["REST API Route Handlers"]
        EventRepo["Event Repository Abstraction"]
        MemoryRepo["MemoryEventRepository (Isolated Demo Mode)"]
        PgRepo["PostgresEventRepository (Row-Level Locking)"]
    end

    subgraph DeterministicEngine["Deterministic Computation Engine"]
        DepGraph["Dependency Graph Resolver"]
        CascadeEngine["Plan Cascade Engine (runCascade)"]
        RulesEngine["Domain Rules (Budget Math, Venue Capacity, Schedule Overlaps, Crowd Safety)"]
        DiffEngine["PlanDiff & Recovery Candidate Generator"]
    end

    subgraph AgenticTier["Structured Agentic Orchestration"]
        StructuredClient["callStructured Client Harness"]
        GeminiAdapter["Google Gemini Adapter (REST Interactions API)"]
        ClaudeAdapter["Anthropic Claude Adapter (SDK)"]
        GroundingGuard["Anti-Hallucination & Amount Verification Guard"]
    end

    subgraph PersistenceTier["Data & Knowledge Base Tier"]
        KB["Curated Knowledge Base (Rituals, Pricing Benchmarks, Legal Permits)"]
        Postgres[("Supabase PostgreSQL (Enforced Row Level Security)")]
    end

    UI --> Middleware --> Validation --> API
    AssistantUI --> API
    Modules --> API

    API --> EventRepo
    EventRepo --> MemoryRepo
    EventRepo --> PgRepo
    PgRepo --> Postgres

    API --> CascadeEngine
    CascadeEngine --> DepGraph
    CascadeEngine --> RulesEngine
    CascadeEngine --> DiffEngine

    API --> StructuredClient
    StructuredClient --> GroundingGuard
    GroundingGuard --> GeminiAdapter
    GroundingGuard --> ClaudeAdapter
    StructuredClient --> KB
```

---

## Decision Cascade and Living Plan Lifecycle

When an event parameter (such as guest count, budget cap, main date, or city tier) changes, the engine propagates downstream adjustments across linked nodes without requiring broad, expensive generative passes:

```mermaid
sequenceDiagram
    autonumber
    actor User as Event Stakeholder
    participant UI as User Interface
    participant Route as Event API Controller
    participant Cascade as Cascade Engine & Rules
    participant Explainer as Explainer Agent (Fast LLM)
    participant Store as Repository (Postgres / Memory)

    User->>UI: Request modification (e.g., Adjust guest count: 250 -> 350)
    UI->>Route: PATCH /api/events/:id { field: "guest_count", value: 350 }
    Route->>Cascade: runCascade(currentPlan, { field: "guest_count", value: 350 })
    Note over Cascade: 1. Identify affected nodes via dependency graph<br/>2. Scale per-plate & per-guest line items<br/>3. Re-verify venue capacity against function attendees<br/>4. Check budget overrun and schedule integrity
    Cascade-->>Route: PlanDiff (Changed lines, Added conflicts, Recovery options)
    Route->>Explainer: Synthesize narrative summary (pre-calculated facts only)
    Note over Explainer: Numerical Grounding Guard validates that no unverified figures were introduced
    Explainer-->>Route: Grounded summary narrative
    Route->>Store: Save new event version + snapshot previous plan state
    Store-->>Route: Version committed
    Route-->>UI: Updated Event State + PlanDiff + Recovery Options
    UI-->>User: Render visual diff, capacity warnings, recovery actions, and Undo button
```

---

## Agent Ecosystem and Specialization

Utsav distributes tasks across 11 purpose-built agents. Generative components focus strictly on unstructured reasoning, translation, and qualitative recommendations:

| Agent | Source Path | Primary Role | Deterministic Responsibility |
|---|---|---|---|
| **Assistant Orchestrator** | `src/lib/ai/agents/assistant.ts` | Natural-language query parsing and route dispatch | Mathematical translation of relative commands ("add 100", "reduce budget by 10%") |
| **Culture & Ritual** | `src/lib/ai/agents/culture.ts` | Tradition-grounded ritual sequences and checklists | Knowledge base RAG extraction and source citation indexing |
| **Planner** | `src/lib/ai/agents/planner.ts` | Multi-day function breakdown and initial budget split | Date resolution and calendar constraint validation |
| **Budget Allocator** | `src/lib/ai/agents/budget.ts` | Qualitative price tier and basis unit assignment | Line item calculation, benchmark indexing, and total budget fitting |
| **Timeline Scheduler** | `src/lib/ai/agents/timeline.ts` | Milestone task generation with relative deadlines | Backward calendar scheduling from main celebration date |
| **Explainer** | `src/lib/ai/agents/explainer.ts` | Conversational summaries of structural plan diffs | Fact-checked currency grounding and verification guard |
| **Family Council** | `src/lib/ai/agents/council.ts` | Conflict identification across family preferences | Dry-run cascade cost and venue conflict verification |
| **Quote X-Ray (Vision)** | `src/lib/ai/agents/quote.ts` | Multimodal invoice parsing and hidden clause extraction | Line-item math validation, GST check, and city benchmark comparisons |
| **Vendor Negotiator** | `src/lib/ai/agents/quote.ts` | Polite counter-offer drafting for vendor negotiations | Grounding of rates and unbilled items against benchmark facts |
| **Day-of Copilot** | `src/lib/ai/agents/dayof.ts` | Incident disruption triage and vendor message generation | Real-time run-of-show slot propagation and spare-time absorption |
| **Vibe-to-Plan (Vision)** | `src/lib/ai/agents/vibe.ts` | Moodboard aesthetic transcription (palette, decor, attire) | Color luminance contrast calculations (`readableTextOn`) |
| **Sponsorship Pitch** | `src/lib/ai/agents/sponsorship.ts` | Narrative sponsorship proposal copy | Programmatic 40/20/5 tier calculation and crowd sizing |

---

## Structured Output and Self-Healing Pipeline

Every LLM query follows a resilient parse-validate-repair pipeline:

```mermaid
flowchart LR
    subgraph Generation["Generation"]
        Context["Prompt Context & Rules"] --> Request["LLM Invocation"]
    end

    subgraph Validation["Validation & Self-Correction"]
        Request --> Parser{"Zod Schema Validation"}
        Parser -- Success --> Guard{"Grounding & Guardrail Verification"}
        Parser -- Failure --> Repair["Self-Correction Loop (1x Retry with Diagnostic Feedback)"]
        Repair --> Request
        Guard -- Failed Check --> Fallback["Deterministic Fallback Generator"]
        Guard -- Passed Check --> Verified["Validated Output Handed to Deterministic Rules"]
    end
```

---

## Core Capabilities

- **Conversational Onboarding:** Multi-turn onboarding interview establishing celebration culture, location, target budget, and headcount.
- **Decision Cascade Engine:** Real-time impact analysis displaying line-by-line price deltas, capacity warnings, and recovery paths.
- **Family Council Mediation:** Structured stakeholder conflict matrix synthesizing balanced compromises with real-time financial impact.
- **Quote X-Ray:** Computer vision inspection of caterer and vendor estimates detecting unstated GST, variable fees, and above-benchmark rates.
- **What-If Simulation:** Client-side exploration testing alternate guest counts, package tiers, and function configurations prior to committing state.
- **Day-of Copilot:** Incident rescheduling engine recalculating event milestones upon delays while generating role-specific communications.
- **Export Engine:** Native multi-page vector PDF generation (with embedded Noto Sans typography) and RFC 5545 iCalendar (`.ics`) sync.
- **Community Tools:** Algorithmic crowd density estimation, municipal regulatory checklists, shift-based volunteer rosters, and sponsor proposals.

---

## Evaluation, Security, and Quality Assurance

### Automated Testing Suite
- **Unit & Integration:** 570 unit and integration tests across 49 test suites via Vitest, executing in under 6 seconds.
- **End-to-End Testing:** 7 full-journey browser tests using Playwright across mobile form factors (375px viewport), testing onboarding, cascades, recovery, exports, and day-of operations.
- **Hermetic Testing:** Tests run entirely hermetic without external API dependencies using deterministic JSON fixtures (`tests/fixtures/llm/`).

### Security Architecture
- **Row Level Security (RLS):** Enabled across all 12 database tables in PostgreSQL with zero public read/write access. Application access connects via server-side database credentials.
- **Prompt Injection Hardening:** System prompts treat all incoming user text and OCR transcriptions as untrusted data, explicitly instructing models to ignore embedded instructions.
- **Network Rate Limiting:** Edge middleware enforces a sliding window rate limit (30 requests per 10 minutes per IP) on all AI generation endpoints.
- **File Upload Verification:** 4 MB payload boundaries enforced across edge middleware, API routes, and client forms. Uploaded files undergo byte-level magic number inspection (`sniffImageMediaType`, `sniffMediaType`).
- **Data Privacy:** Raw quotation PDFs and moodboard images are processed in-memory and never persisted to disk or cloud storage.

### Accessibility (a11y)
- Audited against WCAG 2.2 AA standards via axe-core across 14 distinct application states.
- Color contrast ratio exceeds 4.5:1 across critical and conflict indicators.
- Native keyboard navigation support with skip-to-content links and `prefers-reduced-motion` compliance.

---

## Tech Stack

- **Framework:** Next.js 15 (App Router, Server Components)
- **Language:** TypeScript 5 (Strict Mode)
- **Styling:** Tailwind CSS 4
- **Database & ORM:** PostgreSQL (Supabase) with Drizzle ORM
- **AI Infrastructure:** Google Gemini API (REST Interactions API) with Anthropic Claude support
- **Document Generation:** `@react-pdf/renderer` with Noto Sans typography
- **Data Visualization:** Recharts
- **Testing & Verification:** Vitest, Playwright, axe-core

---

## Local Development

### Prerequisites
- Node.js 20.x or higher
- pnpm 9.x or higher

### Installation

1. Clone the repository and install dependencies:
   ```bash
   git clone https://github.com/nishnarudkar/Utsav-GenAI-Celebration-Event-Planner.git
   cd Utsav-GenAI-Celebration-Event-Planner
   pnpm install
   ```

2. Initialize environment configuration:
   ```bash
   cp .env.example .env.local
   ```

3. Run in Offline Demo Mode (no external API keys required):
   Ensure `DEMO_MODE=true` is set in `.env.local`:
   ```bash
   pnpm dev
   ```
   Navigate to `http://localhost:3000`.

### Connecting Live Infrastructure

To connect live AI providers and a persistent database, update `.env.local`:

```ini
AI_PROVIDER=gemini
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL_SMART=gemini-3.6-flash
GEMINI_MODEL_FAST=gemini-3.5-flash-lite

DATABASE_URL=postgresql://postgres:[password]@db.[ref].supabase.co:5432/postgres
DEMO_MODE=false
AI_FALLBACK=saved
```

Execute schema migrations and verification scripts:
```bash
pnpm db:migrate       # Apply Drizzle migrations
pnpm db:check         # Verify database connectivity and RLS rules
pnpm ai:check         # Verify model latency and generation accuracy
```

---

## Production Deployment on Vercel

1. Import the project into Vercel.
2. Select the **Mumbai, India (`bom1`)** deployment region in project settings to co-locate compute with your Supabase database.
3. Configure the following environment variables:

| Variable | Recommended Value | Description |
|---|---|---|
| `AI_PROVIDER` | `gemini` | Primary AI provider |
| `GEMINI_API_KEY` | `[Your API Key]` | Google Gemini API Key |
| `GEMINI_MODEL_SMART` | `gemini-3.5-flash-lite` | Optimized model tier for serverless quota latency |
| `GEMINI_MODEL_FAST` | `gemini-3.5-flash-lite` | High-throughput model tier |
| `DATABASE_URL` | `postgresql://...:6543/postgres` | Supabase Transaction Pooler string (port 6543) |
| `DEMO_MODE` | `false` | Enable persistent database operations |
| `AI_FALLBACK` | `saved` | Automatic fallback to cached fixtures during provider throttling |

---

## Repository Structure

```
├── drizzle/              # Drizzle ORM migration files and schema snapshots
├── docs/                 # Architectural decision records (DECISIONS.md, DEMO_SCRIPT.md)
├── kb/                   # Curated domain knowledge bases (rituals, pricing, legal permits)
├── public/               # Static assets and sample caterer quotation PDFs
├── scripts/              # Verification harnesses (db:check, ai:check, seed)
├── src/
│   ├── app/              # Next.js App Router pages and REST API routes
│   ├── components/       # Domain and UI components (plan, council, chat)
│   ├── lib/
│   │   ├── ai/           # Structured client, provider adapters, prompt definitions, agents
│   │   ├── db/           # Drizzle schema definitions and database client
│   │   ├── graph/        # Cascade computation engine, diff resolution, dependency graph
│   │   ├── kb/           # Knowledge base indexing and search parsers
│   │   ├── plan/         # Event repository layer and dashboard projection models
│   │   ├── rules/        # Deterministic domain logic (budget math, schedule, capacity, crowd)
│   │   └── schemas/      # Zod validation models
│   └── middleware.ts     # Edge rate limiting and request boundary guards
└── tests/
    ├── e2e/              # Playwright mobile-viewport end-to-end test suites
    ├── fixtures/         # Hermetic JSON LLM interaction test fixtures
    └── unit/             # Vitest unit and integration test suites
```

---

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
