# PROJECT.md — Utsav 🪔
### GenAI Celebration & Event Planner · Hackathon Challenge 5

> **"Checklists tell you what to do. Utsav understands how your decisions affect each other, and your family."**

---

## Table of Contents
1. [Executive Summary](#1-executive-summary)
2. [Problem Statement](#2-problem-statement)
3. [Our Solution](#3-our-solution)
4. [What Makes Utsav Unique](#4-what-makes-utsav-unique)
5. [Target Users & Personas](#5-target-users--personas)
6. [Feature Specifications](#6-feature-specifications)
7. [User Journeys](#7-user-journeys)
8. [System Architecture](#8-system-architecture)
9. [AI Design](#9-ai-design)
10. [Data Model Overview](#10-data-model-overview)
11. [Tech Stack & Rationale](#11-tech-stack--rationale)
12. [Responsible AI & Safety](#12-responsible-ai--safety)
13. [Roadmap & Milestones](#13-roadmap--milestones)
14. [Success Metrics](#14-success-metrics)
15. [Risks & Mitigations](#15-risks--mitigations)
16. [Business Model & Future Scope](#16-business-model--future-scope)
17. [Demo Plan](#17-demo-plan)
18. [Team & Responsibilities](#18-team--responsibilities)
19. [Glossary](#19-glossary)

---

## 1. Executive Summary

Utsav is a GenAI-powered planning assistant for **weddings, birthdays and community events**. It turns a few conversational answers into a complete, culturally accurate event plan: budget, timeline, ritual sequences, vendor checklists and personalized ideas.

Unlike existing planners, Utsav models an event as a **living plan graph**. Every budget line, task, function, guest count and vendor is connected. When anything changes, Utsav recalculates what's affected, explains the impact in plain language, flags conflicts, and proposes recovery options.

Utsav is built for the realities of Indian celebrations:
- multi-day, multi-ritual functions
- regional and religious variation
- large guest lists
- and many family decision-makers

---

## 2. Problem Statement

### The pain
- The Indian wedding market is one of the world's largest. A typical wedding involves **10–20 vendors, 3–7 functions, and months of coordination**.
- Planning lives in scattered WhatsApp groups, Excel sheets, notebooks and phone calls.
- **Budgets overrun** because one decision (e.g., inviting 100 more guests) silently affects catering, venue, transport, gifts and invitations, and nobody sees the full impact until it's too late.
- **Family conflicts** about guest lists, venue and spending are a top source of stress, and no tool addresses them.
- **Cultural knowledge is fragmented.** Young couples often don't know the complete ritual sequence or the items required, and they depend on elders or priests at the last minute.
- **Vendor quotes are opaque.** Hidden charges (GST, overtime, "setup extra", per-plate exclusions) catch families off guard.
- **Event-day chaos.** Delays cascade, and vendors are informed one phone call at a time.

### Why existing tools fall short
| Existing approach | Limitation |
|---|---|
| Generic checklists/templates | Static and not personalized; ignore cultural context |
| Wedding marketplaces | Optimized to sell vendor listings, not to plan |
| Spreadsheets | No intelligence; manual recalculation |
| Generic AI chatbots | One-off answers; no persistent plan, no dependency awareness, can hallucinate rituals |

---

## 3. Our Solution

Utsav combines **structured planning**, **generative AI**, and **deterministic calculation** into one assistant.

```
  Conversation  ──►  AI Agents  ──►  Plan Graph  ──►  Live Dashboard
   (6 questions)     (structure,      (linked budget,    (budget, timeline,
                      ideas, rituals)  tasks, rituals)    checklists, diffs)
                                           ▲
                         Any change ───────┘  → cascade → diff → conflicts → fixes
```

### Core principles
1. **AI for judgment, code for math.** LLMs propose structure, ideas and language. Deterministic code calculates money, dates and capacity.
2. **Grounded culture.** Ritual guidance comes from a curated knowledge base (RAG), with sources and confidence levels.
3. **Explain every change.** Users always see *what changed, why, and what to do about it*.
4. **Built for families, not individuals.** Multiple stakeholders are first-class citizens.

---

## 4. What Makes Utsav Unique

| # | Differentiator | Why it matters |
|---|---|---|
| 1 | **Cascade Engine + Change Diff** | The first planner that shows the ripple effect of every decision, with recovery options |
| 2 | **Cultural Ritual Engine** | RAG-grounded ritual sequences and item lists for many Indian traditions, with sources |
| 3 | **Family Council Mode** | Collects preferences from each stakeholder, detects conflicts, proposes fair compromises |
| 4 | **Vendor Quote X-Ray** | Snap a quote; AI extracts line items, flags hidden costs, drafts a negotiation message |
| 5 | **Budget What-If Simulator** | Sliders show live tradeoffs before you commit |
| 6 | **Vibe-to-Plan** | Inspiration images become a palette, theme, décor list and vendor search terms |
| 7 | **Day-of Copilot** | Live run-of-show; delays reshuffle the timeline and notify vendors on WhatsApp |

---

## 5. Target Users & Personas

### Persona 1: Priya & Arjun, the couple (primary)
- 28 and 30, working professionals in Bengaluru, planning a Bengali–Tamil wedding in Kolkata
- **Needs:** a clear budget, a ritual sequence for *both* traditions, fewer family arguments
- **Frustration:** "Every relative has an opinion and no one knows the total cost."

### Persona 2: Sunita, the parent (secondary)
- 55, mother of the bride, less tech-savvy, mostly uses WhatsApp
- **Needs:** her preferences heard (a bigger guest list, specific rituals); updates on WhatsApp
- **Frustration:** "The kids decide everything on their laptops."

### Persona 3: Rahul, the community organizer
- 35, RWA cultural secretary running the society's Ganesh Chaturthi festival
- **Needs:** volunteer coordination, a sponsorship pitch, a permits checklist, budget tracking
- **Frustration:** "Same chaos every year; nothing carries over."

### Persona 4: Meera, the birthday planner
- 32, planning her daughter's first birthday (annaprashan plus party)
- **Needs:** quick themed ideas, a guest checklist, a small-budget plan within an hour
- **Frustration:** "Pinterest gives ideas, not a plan."

---

## 6. Feature Specifications

Priority: **P0** = must ship for the demo · **P1** = strong differentiator · **P2** = stretch

### F1: Conversational Onboarding → Event Plan (P0)
**Description:** A chat with suggestion chips collects event type, tradition, city, dates, guest count and budget (with an "estimate for me" option).
**Output:** functions/sub-events, a budget allocated by category, a task timeline, and vendor categories.
**Acceptance criteria:**
- At most 6 questions; total time to a plan under 60 seconds
- The plan includes at least 1 function, at least 8 budget categories, and at least 20 tasks with due dates
- All money is shown in INR lakh notation (₹4.5L)

### F2: Plan Graph & Cascade Engine (P0)
**Description:** Editing any watched field (guest count, budget, date, city, venue, number of functions) triggers a cascade.
**Output:** a diff panel showing changed, added and removed items, the budget delta, conflicts, a plain-English explanation, and recovery options.
**Acceptance criteria:**
- Deterministic recalculation finishes in under 500 ms; a full AI-assisted cascade in under 8 s
- Locked items are never modified
- Accept and Undo work (undo restores the previous version)

### F3: Cultural Ritual Engine (P0)
**Description:** For the selected tradition, generates an ordered ritual list. Each ritual has a duration, participants, required items, a one-line significance, sources, and a confidence level.
**Coverage at launch:** Bengali Hindu, Tamil Brahmin, Punjabi/Sikh, Marathi, Gujarati, Muslim Nikah and Christian weddings; birthday; annaprashan; Ganesh Chaturthi; Durga Puja; Diwali society events.
**Acceptance criteria:**
- Every ritual response cites at least 1 KB source, or shows a "low confidence — verify with elders" badge
- Item lists turn into checklists the user can tick off

### F4: Vendor Quote X-Ray (P1)
**Description:** Upload a photo or PDF of a quotation.
**Output:** extracted line items, hidden or ambiguous costs, missing standard items, a comparison against city benchmarks, and a ready-to-send negotiation message.
**Acceptance criteria:** correctly extracts at least 90% of line items on the sample fixtures.

### F5: Family Council Mode (P1)
**Description:** Add stakeholders (couple, families, organizers). Each one submits preferences separately; a shareable link is optional.
**Output:** a conflict matrix (topic × stakeholder positions × severity) and 2–4 compromise options, each with who gains, who compromises, the cost delta, and a one-click apply.
**Acceptance criteria:** applying an option runs a cascade and records the decision.

### F6: Budget What-If Simulator (P1)
**Description:** Sliders for guests, venue tier, décor level, number of functions and catering tier.
**Output:** live projected total, a category breakdown, and ranked "Save ₹X" suggestions.
**Acceptance criteria:** dry-run only (nothing saved until the user clicks Apply); updates in under 1 s.

### F7: Vibe-to-Plan (P2)
**Description:** Upload up to 5 inspiration images, plus optional text ("royal Rajasthani, minimal").
**Output:** a colour palette, theme name, keywords, décor list, attire suggestions, and vendor search terms, shown as a moodboard.

### F8: Day-of Copilot (P2)
**Description:** Live run-of-show mode. The user reports an incident ("baraat 40 min late").
**Output:** a reshuffled timeline and WhatsApp messages to the affected vendors (mocked in the demo).

### F9: Community Event Extras (P2)
- volunteer roster and task assignment
- sponsorship pitch generator
- permits/NOC checklist (police, municipal, sound, fire)
- crowd-safety estimator

### F10: Export (P2)
- PDF plan booklet
- `.ics` calendar of tasks and functions
- shareable read-only link

---

## 7. User Journeys

### Journey A: Create a wedding plan (P0)
1. The user lands on the home page and clicks **Plan a celebration**.
2. Onboarding chat: Wedding → Bengali Hindu → Kolkata → 14 Feb 2027 → 250 guests → ₹15L.
3. A progress animation runs: *Finding rituals → Allocating budget → Building timeline → Creating checklist*.
4. The dashboard shows 112 days to go, ₹15L budget, 46 tasks and 0 conflicts.
5. The user opens the Timeline and sees the ritual cards (Aashirbaad, Gaye Holud, Biye, Bashor Raat, Bou Bhaat), each with an item checklist.

### Journey B: A change ripples through (P0)
1. Mom asks for 100 more guests, so the user changes 250 to 350.
2. The diff panel shows:
   - catering +₹1.6L
   - invitations +₹12K
   - return gifts +₹35K
   - ⚠ venue capacity of 300 exceeded
   - ⚠ over budget by ₹2.1L
3. Recovery options:
   - (a) Move the reception to the lawn: saves the venue upgrade
   - (b) Switch to a buffet tier: saves ₹90K
   - (c) Cut the décor level: saves ₹60K
4. The user applies (a) + (b). The plan updates, and the change is logged.

### Journey C: Family Council (P1)
1. The user adds stakeholders: Couple, Bride's parents, Groom's parents.
2. Each submits preferences on guest count, venue type, number of functions and menu.
3. Utsav detects 3 conflicts and offers options like "Intimate ceremony (150) + large reception (400)".
4. The family picks one together, and it's applied to the plan.

### Journey D: Quote check (P1)
1. Upload the caterer quote photo.
2. X-Ray flags:
   - GST not included
   - "Live counters extra"
   - per-plate rate 18% above the city mid benchmark
3. The user copies the generated polite negotiation message into WhatsApp.

---

## 8. System Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│                        Next.js Web App (Vercel)                     │
│  Onboarding Chat · Dashboard · Budget · Timeline · Vendors ·        │
│  Council · Vibe · Live                                              │
└───────────────┬────────────────────────────────────────────────────┘
                │ REST + SSE (Route Handlers)
┌───────────────▼────────────────────────────────────────────────────┐
│                         Application Layer                           │
│  ┌──────────────┐  ┌─────────────────┐  ┌────────────────────────┐ │
│  │ Orchestrator │─►│  AI Agents      │  │ Deterministic Rules    │ │
│  │ (intent)     │  │ Planner, Budget,│  │ budget-math, capacity, │ │
│  └──────────────┘  │ Timeline,Culture│  │ conflicts, date math   │ │
│                    │ Vendor, Council,│  └───────────┬────────────┘ │
│                    │ Vibe, Day-of    │              │              │
│                    └───────┬─────────┘              │              │
│                            ▼                        ▼              │
│                  ┌──────────────────────────────────────┐          │
│                  │   Plan Graph + Cascade Engine + Diff  │          │
│                  └──────────────────┬───────────────────┘          │
└─────────────────────────────────────┼──────────────────────────────┘
        ┌─────────────────────────────┼─────────────────────────┐
        ▼                             ▼                         ▼
┌───────────────┐        ┌────────────────────────┐   ┌──────────────────┐
│ Claude API    │        │ Supabase Postgres      │   │ Twilio WhatsApp  │
│ (tool use,    │        │ + pgvector (KB chunks) │   │ (or mock mode)   │
│  vision)      │        │ + Storage (uploads)    │   └──────────────────┘
└───────────────┘        └────────────────────────┘
```

### Request flow: a cascade
1. `PATCH /api/events/:id { guest_count: 350 }`
2. `computeImpact()` looks up the dependency rules and returns the affected nodes.
3. Deterministic recalculation runs (budget math, capacity, conflicts).
4. Agents are called only for nodes that need judgment (venue alternatives, rebalancing).
5. A `PlanDiff` is built, the Explainer writes the summary, and recovery options are attached.
6. The change is saved to `plan_changes`, the version is bumped, and the diff is returned to the UI.

---

## 9. AI Design

### 9.1 Multi-agent approach
| Agent | Responsibility | Model tier |
|---|---|---|
| Orchestrator | Classify user intent, extract parameters | Fast |
| Planner | Functions, budget allocation, high-level tasks | Smart |
| Budget | Line items with *basis* (unit, qty, tier); code computes totals | Smart |
| Timeline | Tasks with relative due dates and dependencies | Smart |
| Culture | RAG-grounded ritual sequence + items + sources | Smart |
| Vendor | Questions to ask, red flags, lead times, enquiry draft | Fast |
| Quote X-Ray | Vision extraction + benchmark comparison + negotiation | Smart (vision) |
| Council | Conflict detection + compromise options | Smart |
| Vibe | Image → palette, theme, décor | Smart (vision) |
| Day-of | Incident → reshuffle + vendor messages | Smart |
| Explainer | Plain-English diff summary | Fast |

### 9.2 Reliability techniques
- **Structured outputs:** every agent returns JSON through forced tool use, validated with Zod, with one auto-retry on a validation error.
- **Hybrid computation:** the LLM picks a *unit and tier* (e.g., "per plate, mid tier, 250 plates"), and code turns that into ₹ using city benchmarks. This prevents arithmetic hallucinations.
- **RAG grounding:** ritual knowledge is retrieved with metadata filters (culture, event type). Sources are shown to the user, and a low-confidence badge appears when retrieval is weak.
- **Prompt caching:** static system prompts and KB context are cached to cut latency and cost.
- **Demo mode:** recorded LLM fixtures guarantee a smooth demo even when offline or rate-limited.

### 9.3 Prompt strategy
- One versioned system prompt per agent, with role, constraints, India-specific defaults and 1–2 few-shot examples
- An explicit refusal policy (dowry, caste assumptions)
- Temperature 0.4 for planning, 0.8 for creative ideas

---

## 10. Data Model Overview

| Entity | Purpose |
|---|---|
| `events` | Top-level event: type, culture, city, dates, guests, budget, version |
| `functions` | Sub-events (mehendi, sangeet, ceremony, cake-cutting…) |
| `budget_items` | Line items with estimate/quoted/actual (paise), basis, locked flag |
| `tasks` | Checklist items with due dates, dependencies, source |
| `ritual_items` | Items required per ritual/function |
| `vendors` / `quotes` | Vendor pipeline and analyzed quotations |
| `stakeholders` / `council_resolutions` | Family Council data |
| `plan_changes` | Version history and diffs (powers Undo) |
| `notifications` | WhatsApp/mock message log |
| `kb_chunks` | Embedded knowledge base for RAG |

All money is stored as **integer paise**. The full schema is in `CLAUDE.md`, §6.

---

## 11. Tech Stack & Rationale

| Choice | Why |
|---|---|
| **Next.js 15 + TypeScript** | One language for frontend and backend; fast to ship; Vercel deploy |
| **Tailwind + shadcn/ui** | Polished UI quickly; accessible components |
| **Supabase Postgres + pgvector** | Relational plan data and vector search in one managed DB |
| **Drizzle ORM** | Type-safe, lightweight, simple migrations |
| **Claude API** | Strong reasoning, reliable tool use/structured output, vision for quotes and moodboards |
| **Zod** | One schema for validation, types and LLM tool definitions |
| **Recharts** | Simple, responsive charts |
| **Twilio WhatsApp** | Families live on WhatsApp; sandbox for the demo |
| **Vitest + Playwright** | Fast unit tests plus one critical end-to-end path |

---

## 12. Responsible AI & Safety

- **Cultural respect:** traditions are presented neutrally and accurately, grounded in a curated KB, with sources and confidence. Users can edit or remove any ritual.
- **No harmful practices:** Utsav never plans for or suggests dowry and never assumes caste or sub-community.
- **Transparency:** every AI suggestion has a "Why?" explanation. Price benchmarks are labeled *indicative estimates*.
- **Human in control:** AI changes appear as diffs to accept or undo. Locked items are never touched.
- **Privacy:** guest and stakeholder data stays in the project's DB. No personal data goes in URLs. API keys stay server-side only.
- **Messaging consent:** WhatsApp messages are sent only after the user confirms them (mock mode by default).
- **Accessibility:** WCAG AA contrast, labeled inputs, and diffs that don't rely on color alone.

---

## 13. Roadmap & Milestones

### Hackathon build (≈ 18–24 hours)
| Phase | Scope | Est. time | Exit criteria |
|---|---|---|---|
| 0 | Scaffold, DB, AI client, formatters | 1 h | `pnpm dev` runs; `callStructured` tested |
| 1 | F1 + F3: onboarding → full plan; KB + RAG | 4 h | Demo event generated end to end |
| 2 | F2: cascade engine + diff panel + undo | 3 h | Guest-count change shows correct diff |
| 3 | F4, F5, F6 | 4 h | Quote, council and what-if flows work |
| 4 | F7–F10 (stretch) | 3–4 h | Any subset, if stable |
| 5 | Polish, seed data, demo mode, e2e test | 2 h | 3-minute demo runs flawlessly twice |

### Post-hackathon
- **v1.1:** auth and multi-user collaboration; a WhatsApp bot for stakeholder input; Hindi, Bengali and Tamil UI
- **v1.2:** real vendor directory integrations; payment reminders; expense tracking with receipt OCR
- **v2.0:** muhurat/auspicious-date suggestions with a panchang API; guest RSVP and seating planner; a post-event memory book and thank-you note generator

---

## 14. Success Metrics

### Hackathon / demo
- Time from first question to complete plan: **< 60 s**
- Cascade diff correctness on test scenarios: **100%** (deterministic tests)
- Quote extraction accuracy on fixtures: **≥ 90%** of line items
- Zero crashes during the demo run

### Product (post-launch)
- Plan completion rate (onboarding → dashboard): > 70%
- Weekly active planners per event: > 2 (shows multi-stakeholder use)
- Users who apply at least 1 recovery option: > 40%
- Self-reported budget overrun reduced by 30% vs. baseline survey

---

## 15. Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| LLM hallucinates rituals | Cultural offense, loss of trust | RAG grounding, sources, confidence badges, editable output |
| LLM arithmetic errors | Wrong budgets | All math in deterministic code; LLM only picks units and tiers |
| API latency/rate limits during demo | Broken demo | Demo mode with cached fixtures; fast model for simple calls |
| Inaccurate price benchmarks | Misleading estimates | Labeled "indicative"; city tiers; user can override any value |
| Scope creep | Unfinished P0 | Strict P0 → P1 → P2 order; P2 is optional |
| Sensitive social topics | Reputational harm | Explicit refusal policy; neutral language review |
| Invalid structured output | Runtime errors | Zod validation + retry + typed errors + friendly UI fallbacks |

---

## 16. Business Model & Future Scope

- **Freemium:** a free basic plan; **Utsav Plus** (₹999 per event) adds Family Council, Quote X-Ray, Day-of Copilot and exports.
- **Vendor partnerships:** verified-vendor listings and qualified leads, kept separate from AI recommendations to stay unbiased.
- **B2B:** a white-label planner for wedding planners, banquet halls and housing societies.
- **Community edition:** free for non-profit and community festivals.

---

## 17. Demo Plan

**Seed event:** Bengali wedding · Kolkata · 14 Feb 2027 · ₹15L · 250 guests · 3 stakeholders · 1 sample caterer quote

| Time | Scene | Shows |
|---|---|---|
| 0:00–0:30 | Problem hook + start onboarding | Pain points; 6-question chat |
| 0:30–1:00 | Plan appears; open Timeline | Rituals with items and sources |
| 1:00–1:45 | Change 250 → 350 guests | **Cascade diff**, conflicts, recovery options |
| 1:45–2:20 | Family Council | Conflict matrix → compromise → plan update |
| 2:20–2:45 | Quote X-Ray | Hidden costs flagged; negotiation message |
| 2:45–3:00 | Live mode (bonus) + pitch line | Reshuffle + WhatsApp messages |

**Backup:** demo mode toggle (cached responses) plus a pre-recorded video.

---

## 18. Team & Responsibilities
*(Fill in your team's details.)*

| Member | Role | Owns |
|---|---|---|
| — | Product / Pitch | PROJECT.md, demo script, slides |
| — | Frontend | Onboarding, dashboard, diff panel, charts |
| — | Backend / AI | Agents, prompts, cascade engine, RAG |
| — | Data / Content | Ritual KB docs, pricing benchmarks, fixtures |

---

## 19. Glossary
| Term | Meaning |
|---|---|
| **Plan graph** | The linked model of all event entities and their dependencies |
| **Cascade** | Recomputation triggered by a change, following dependency rules |
| **Diff** | A summary of everything a cascade changed |
| **Function** | A sub-event of a celebration (e.g., haldi, sangeet, reception) |
| **Basis** | How a budget line is computed (unit × quantity × price tier) |
| **Paise** | 1/100 of a rupee; the unit used to store money |
| **RAG** | Retrieval-Augmented Generation: grounding AI answers in retrieved documents |
| **Muhurat** | An auspicious date/time chosen for ceremonies |
| **Lakh / Crore** | ₹1,00,000 / ₹1,00,00,000 |
