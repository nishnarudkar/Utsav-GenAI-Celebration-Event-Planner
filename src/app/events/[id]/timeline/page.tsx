import { AlertTriangle, BookOpen } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { EventHeader } from "@/components/plan/EventHeader";
import { Gantt } from "@/components/plan/Gantt";
import { NextTasks } from "@/components/plan/NextTasks";
import { RitualCard } from "@/components/plan/RitualCard";
import { loadKbChunks } from "@/lib/ai/rag";
import { formatDate } from "@/lib/format";
import { getEventRepository } from "@/lib/plan/event-repo";
import { ganttLayout, ritualGroups, tasksByMonth } from "@/lib/plan/timeline-view";
import { toISTDate } from "@/lib/rules/dates";
import type { Confidence } from "@/lib/schemas/ritual";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const event = await getEventRepository().get((await params).id);
  return { title: event ? `Timeline · ${event.title} — Utsav` : "Event not found — Utsav" };
}

/** CLAUDE.md §7.1 rule 3: low confidence shows the "verify with elders" note. */
function ConfidenceNote({ confidence }: { confidence: Confidence }) {
  if (confidence === "low") {
    return (
      <p className="flex items-start gap-2 rounded-xl border border-conflict/40 bg-white p-3 text-sm text-ink">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-conflict" aria-hidden />
        General suggestion — verify with your family priest/elders.
      </p>
    );
  }
  return (
    <p className="flex items-start gap-2 text-sm text-muted">
      <BookOpen className="mt-0.5 size-4 shrink-0" aria-hidden />
      {confidence === "high"
        ? "Based on Utsav's ritual guide. Customs vary between families — adjust with your priest or elders."
        : "Adapted from Utsav's ritual guide for your plan. Customs vary between families — confirm with your priest or elders."}
    </p>
  );
}

function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-line bg-white p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-xl text-maroon">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export default async function TimelinePage({ params }: Props) {
  const { id } = await params;
  const event = await getEventRepository().get(id);
  if (!event) notFound();

  const today = toISTDate(new Date());
  const gantt = ganttLayout(event.plan.functions);
  const groups = ritualGroups(event, await loadKbChunks(`${process.cwd()}/kb`));
  const months = tasksByMonth(event.timeline.tasks);

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-5 px-4 py-6">
      <EventHeader event={event} active="timeline" />

      <Section title="Schedule" aside={<span className="text-sm text-muted">{event.plan.functions.length} functions</span>}>
        <Gantt days={gantt.days} bars={gantt.bars} />
      </Section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <h2 className="font-display text-xl text-maroon">Rituals</h2>
          <ConfidenceNote confidence={event.rituals.confidence} />
        </div>
        {groups.map((g) => (
          <div key={g.functionName ?? "unplaced"} className="flex flex-col gap-3">
            <h3 className="flex items-baseline justify-between gap-3 border-b border-line pb-1">
              <span className="font-medium text-ink">{g.functionName ?? "Not yet scheduled"}</span>
              {g.date && <span className="text-sm text-muted">{formatDate(g.date, { weekday: true })}</span>}
            </h3>
            {g.rituals.map((r) => (
              <RitualCard key={r.key} eventId={event.id} ritual={r} />
            ))}
          </div>
        ))}
      </section>

      <Section title="All tasks" aside={<span className="text-sm text-muted">{event.timeline.tasks.length}</span>}>
        {months.map((m) => (
          <div key={m.month} className="flex flex-col gap-2">
            <h3 className="text-sm font-medium text-muted">{m.month}</h3>
            <NextTasks tasks={m.tasks} today={today} />
          </div>
        ))}
      </Section>
    </main>
  );
}
