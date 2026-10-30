import Link from "next/link";
import { DemoButton } from "@/components/plan/DemoButton";

const HIGHLIGHTS = [
  { title: "Rituals, grounded", body: "Ritual sequences and item checklists from a curated knowledge base, with sources." },
  { title: "Budgets that add up", body: "City-specific estimates. AI picks the structure; code does the maths." },
  { title: "Plans that react", body: "Change the guest count and see every ripple — costs, conflicts and fixes." },
];

export default function HomePage() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-10 px-4 py-14 sm:py-20">
      <header className="flex flex-col gap-5">
        <p className="text-sm font-semibold uppercase tracking-widest text-marigold-ink">Utsav</p>
        <h1 className="font-display text-4xl leading-tight text-maroon sm:text-5xl">
          Plan the celebration, not the spreadsheet.
        </h1>
        <p className="text-lg text-muted">
          Checklists tell you what to do. Utsav understands how your decisions affect each other, and your family.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/new"
            className="inline-flex items-center rounded-full bg-maroon px-6 py-3 font-medium text-cream transition-colors hover:bg-maroon-dark"
          >
            Plan a celebration
          </Link>
          <DemoButton />
        </div>
      </header>

      <ul className="grid gap-4 sm:grid-cols-3">
        {HIGHLIGHTS.map((h) => (
          <li key={h.title} className="rounded-2xl border border-line bg-white/60 p-5">
            <h2 className="font-display text-lg text-maroon">{h.title}</h2>
            <p className="mt-2 text-sm text-muted">{h.body}</p>
          </li>
        ))}
      </ul>
    </main>
  );
}
