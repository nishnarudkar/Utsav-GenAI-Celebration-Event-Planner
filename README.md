<div align="center">

# 🪔 Utsav

### A GenAI planning assistant for Indian weddings, birthdays and community events

**Checklists tell you what to do. Utsav understands how your decisions affect each other, and your family.**

**Live app:** _add your Vercel link here_ · **Demo video:** _add your video link here_

![Next.js](https://img.shields.io/badge/Next.js-15-black)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)
![Supabase](https://img.shields.io/badge/Supabase-Postgres-3ECF8E)
![Gemini](https://img.shields.io/badge/AI-Gemini-4285F4)
![Tests](https://img.shields.io/badge/tests-570%2B%20unit%20%2B%207%20e2e-brightgreen)
![License](https://img.shields.io/badge/license-MIT-green)

</div>

---

## Chosen vertical

**Celebration and Event Planner.** The persona is a family or community organiser planning a multi-day, multi-stakeholder Indian celebration on a phone, with a fixed budget and relatives who disagree.

## The problem

Planning apps give you a static checklist. Real plans are connected: adding 100 guests changes catering, return gifts, transport and the budget, and may no longer fit the venue. Families also need rituals done correctly, vendor quotes they can trust, and a way to settle disagreements.

## Approach and logic

Utsav treats a plan as a **living graph** rather than a list. Budget lines, tasks, functions, rituals and guests are linked, so one change flows through everything it affects.

Three principles shape the design:

1. **AI proposes, code decides.** The model chooses structure, wording and options. Pure, unit-tested functions do all the maths, dates and capacity checks. A model can't invent a total, and its output can't contain a price where only code may supply one.
2. **Every AI reply is checked.** All calls go through one function, `callStructured()`, which requires JSON matching a Zod schema, sends validation errors back for one corrective retry, and otherwise fails with a friendly message.
3. **Decisions depend on the user's context.** Ritual sequences come from the chosen tradition, prices from the city's tier, and compromises from each family member's stated preferences.

### What happens when something changes

```
"Make it 350 guests"
   │
   ├─ 1. Work out what's affected      dependency rules, no AI
   ├─ 2. Recalculate                   budget, capacity and conflict rules, no AI
   ├─ 3. Build a diff                  every changed line, with the reason
   ├─ 4. Explain it in plain English   fast model; amounts are checked against the facts
   └─ 5. Save a new version            with one-click Undo
```

| Agent | Job | Who does the maths |
|---|---|---|
| Assistant | Works out what a message wants: change, answer or tool | Code works out the new value and fills in every figure |
| Culture | Ritual sequence and items, cited from the knowledge base | n/a |
| Planner | Functions, timing and budget split | Code resolves dates |
| Budget | Line items with quantity and price tier | Code prices them and fits them to the budget |
| Timeline | Tasks with relative deadlines | Code resolves dates |
| Quote X-Ray | Reads a quote photo or PDF | Code checks arithmetic and benchmarks |
| Council | Finds conflicts and proposes compromises | Code measures each option's real cost |
| Vibe | Turns photos into a palette and décor list | n/a |
| Day-of Copilot | Finds where a delay starts, drafts vendor messages | Code moves every time |
| Sponsorship | Writes the pitch wording | Code sets tiers and amounts |

## How the solution works

| Feature | What it does |
|---|---|
| Conversational onboarding | Six quick questions become a full plan |
| Ask Utsav assistant | Type a question or a change in plain English. It answers from your plan, proposes changes to confirm, or sends you to the right tool |
| Cascade engine | Every change shows a diff, conflicts and recovery options, with Undo |
| Ritual engine | Ritual order, item checklists and source citations |
| Quote X-Ray | Upload a quote to find hidden costs and get a negotiation message |
| Family Council | Each person's preferences become conflicts and costed compromises |
| What-If Simulator | Try budget changes without saving them |
| Look & feel | Inspiration photos become colours, décor ideas and search terms |
| Live mode | Report a delay, review the new timings, then confirm the vendor messages |
| Community tools | Permissions checklist, crowd-safety numbers, volunteer roster, sponsorship pitch |
| Export | PDF plan and calendar file |

### Try it in 60 seconds

Open the live app and press **Try the demo wedding**. It uses saved answers, so it always works and costs no AI quota. Then:

1. In **Ask Utsav** on the Overview, press **Mom wants 100 more guests**, then confirm. Or type your own question.
2. Open **Timeline** to see the ritual sequence with sources.
3. Back on **Overview**, the venue conflict, budget overrun and recovery options show what 350 guests would do.
4. Open **Family** and choose a compromise. The plan updates.
5. Open **Vendors** to see the hidden charges in a sample quote.

The full walkthrough is in [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md).

## Assumptions

- **Prices are indicative.** Benchmarks are our own estimates by city tier, not market data, and the app labels them as estimates.
- **Ritual content is general guidance.** The knowledge base covers Bengali Hindu, Tamil Brahmin and Punjabi Sikh weddings, birthdays and neighbourhood festivals. Other traditions get a low-confidence result that says to check with a family priest or elders.
- **Permissions and crowd numbers are rules of thumb.** They weren't verified against official sources. Rules vary by city, and the page says so.
- **No login, as a hackathon scope choice.** Anyone with an event's link can open and edit it, so event IDs are random and there's no public list of events.
- **WhatsApp messages are simulated.** They're logged in the app, not sent.
- **Dates are in IST and money is in INR.** Money is stored as integer paise.
- **Search is keyword-based.** Rituals are retrieved by metadata and keyword overlap from local documents, with the database's vector search left as a later upgrade.

## Evaluation notes

### Code quality

TypeScript strict mode with no `any`. Route handlers stay thin, agents never touch the database, and pure logic lives in `lib/rules` and `lib/graph`. Non-obvious choices are recorded in [docs/DECISIONS.md](docs/DECISIONS.md).

### Security

- API keys and database access are server-side only.
- Row Level Security is on for every table, so the public Supabase key can read nothing.
- All input is validated with Zod, and uploaded files are checked by their contents, not their names.
- Routes that spend AI quota are rate-limited per client.
- Security headers are set on every response, and errors never expose internal details.
- User text and text inside uploaded images are treated as data. Prompts tell the model not to follow instructions found in them.
- Uploaded photos and quotes aren't stored.
- Plan changes from the assistant and messages to vendors happen only after a person confirms them.

### Efficiency

Only the affected parts of a plan are recalculated, and most changes need no heavy AI. Routine text uses the fast model. Plans are saved as one locked row per event, so concurrent edits queue safely.

### Testing

Over 570 unit tests and 7 browser tests. Tests never call a real AI service: replies come from fixtures in `tests/fixtures/llm/`. Two more scripts test the real services, using made-up data:

```bash
pnpm test         # unit tests
pnpm test:e2e     # browser tests at phone size, in demo mode
pnpm ai:check     # real AI connection; add --plan, --assistant or --features (uses quota)
pnpm db:check     # real database, including the Row Level Security check
```

### Accessibility

Designed for a 375px phone screen. An axe-core scan of 14 page states at that size, against WCAG 2.2 AA and best-practice rules, found no violations. Inputs have labels, status changes are announced, a skip link leads to the main content, animation respects reduced-motion settings, and the diff uses +/− signs so colour never carries meaning alone.

### Responsible AI

Rituals cite their sources and show a confidence level. Utsav never plans for dowry, never assumes caste or community, and shows every AI change as a diff you can undo.

## Tech stack

Next.js 15 (App Router), TypeScript, Tailwind CSS, Recharts, Zod, Drizzle ORM, Supabase Postgres, Google Gemini (with Anthropic Claude also supported), Vitest, Playwright, `@react-pdf/renderer`, deployed on Vercel.

## Run it locally

You need Node.js 20 or later and pnpm. **No keys are needed for demo mode.**

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Set `DEMO_MODE=true` in `.env.local` to use saved answers, then open http://localhost:3000.

To use real AI and saved events, fill in these settings and run `pnpm db:migrate`:

| Variable | Purpose |
|---|---|
| `AI_PROVIDER` | `gemini` or `anthropic` |
| `GEMINI_API_KEY` or `ANTHROPIC_API_KEY` | The provider's key |
| `GEMINI_MODEL_SMART`, `GEMINI_MODEL_FAST` | Optional model overrides |
| `DATABASE_URL` | Supabase Postgres connection string |
| `DEMO_MODE` | `true` serves saved answers and keeps events in memory |
| `AI_FALLBACK` | `saved` uses a saved answer, where one exists, if the AI is unavailable |

## Deploy on Vercel

1. Import this repository at [vercel.com/new](https://vercel.com/new).
2. Add the environment variables below, then deploy.

| Variable | Value |
|---|---|
| `AI_PROVIDER` | `gemini` |
| `GEMINI_API_KEY` | Your key |
| `GEMINI_MODEL_SMART` | `gemini-3.5-flash-lite` |
| `DEMO_MODE` | `false` |
| `AI_FALLBACK` | `saved` |
| `DATABASE_URL` | Supabase **Transaction pooler** string (port 6543) |

## Project structure

```
src/app/            Pages and API routes
src/components/     UI, by area: plan, chat, council
src/lib/ai/         Agents, prompts, callStructured, provider adapters
src/lib/rules/      Deterministic maths, dates, capacity, crowd and rate limits
src/lib/graph/      Dependency rules, cascade engine, diffs
src/lib/plan/       Plan building and event storage
kb/                 Ritual documents, price benchmarks, permissions
drizzle/            Database migrations
tests/              Unit tests, browser tests, AI fixtures
docs/               Decision log and demo script
```

## Roadmap

- Login and per-family access
- Real WhatsApp messages
- More traditions, and vector search over the knowledge base
- Vendor booking board, and feeding accepted quotes into the budget
- Regional languages

## Author

Nishant Narudkar. Built with Claude Code.

## License

MIT. See [LICENSE](LICENSE).
