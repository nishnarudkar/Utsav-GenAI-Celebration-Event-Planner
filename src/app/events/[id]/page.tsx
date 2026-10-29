import Link from "next/link";
import { notFound } from "next/navigation";
import { formatDate, formatINRCompact } from "@/lib/format";
import { getEventRepository } from "@/lib/plan/event-repo";

export const dynamic = "force-dynamic";

/** Placeholder landing page after onboarding; the full dashboard replaces it in the next step. */
export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const event = await getEventRepository().get(id);
  if (!event) notFound();

  const stats = [
    { label: "Rituals", value: String(event.rituals.rituals.length) },
    { label: "Functions", value: String(event.plan.functions.length) },
    { label: "Estimated cost", value: formatINRCompact(event.budget.totalEstimatePaise) },
    { label: "Tasks", value: String(event.timeline.tasks.length) },
  ];

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col gap-6 px-4 py-6">
      <Link href="/" className="font-display text-2xl text-maroon">
        Utsav
      </Link>
      <div>
        <p className="text-sm font-semibold uppercase tracking-widest text-marigold-ink">Your plan is ready</p>
        <h1 className="mt-1 font-display text-3xl text-maroon">{event.title}</h1>
        <p className="mt-1 text-muted">
          {formatDate(event.plan.startDate)} – {formatDate(event.plan.endDate)} · {event.answers.guestCount} guests
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl border border-line bg-white p-4">
            <dt className="text-sm text-muted">{s.label}</dt>
            <dd className="mt-1 font-display text-2xl text-maroon">{s.value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-sm text-muted">The full dashboard (budget, timeline, rituals) is coming next.</p>
    </main>
  );
}
