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
