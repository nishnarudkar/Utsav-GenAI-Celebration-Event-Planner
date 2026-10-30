import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { BudgetDonut } from "@/components/plan/BudgetDonut";
import { EventHeader } from "@/components/plan/EventHeader";
import { ExportLinks } from "@/components/plan/ExportLinks";
import { IssueList } from "@/components/plan/IssueList";
import { NextTasks } from "@/components/plan/NextTasks";
import { PlanControls } from "@/components/plan/PlanControls";
import { StatCards } from "@/components/plan/StatCards";
import { formatDate } from "@/lib/format";
import { summarizeDashboard } from "@/lib/plan/dashboard";
import { getEventRepository } from "@/lib/plan/event-repo";
import { toISTDate } from "@/lib/rules/dates";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const event = await getEventRepository().get((await params).id);
  return { title: event ? `${event.title} — Utsav` : "Event not found — Utsav" };
}

function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-white p-5">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="font-display text-xl text-maroon">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export default async function EventDashboardPage({ params }: Props) {
  const { id } = await params;
  const event = await getEventRepository().get(id);
  if (!event) notFound();

  const today = toISTDate(new Date());
  const summary = summarizeDashboard(event, today);
  const { plan } = event;

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-5 px-4 py-6">
      <EventHeader event={event} active="overview" />

      <StatCards summary={summary} />
      <IssueList issues={summary.issues} />
      <PlanControls
        eventId={event.id}
        guestCount={event.answers.guestCount}
        budgetTotalPaise={event.budget.budgetTotalPaise}
        budgetIsEstimate={event.budget.budgetIsEstimate}
      />

      <div className="grid gap-5 md:grid-cols-2">
        <Section title="Next up" aside={<span className="text-sm text-muted">{summary.tasks.total} tasks</span>}>
          <NextTasks tasks={summary.nextTasks} today={today} />
        </Section>

        <Section
          title="Budget"
          aside={
            <Link href={`/events/${event.id}/budget`} className="text-sm font-medium text-marigold-ink hover:underline">
              See all
            </Link>
          }
        >
          <BudgetDonut slices={summary.donut} totalPaise={summary.budget.committedPaise} />
        </Section>
      </div>

      <Section title="Functions" aside={<span className="text-sm text-muted">{plan.functions.length}</span>}>
        <ol className="flex flex-col divide-y divide-line">
          {plan.functions.map((f) => (
            <li key={f.name} className="flex items-baseline justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
              <span className="text-ink">{f.name}</span>
              <span className="shrink-0 text-right text-sm text-muted tabular-nums">
                {formatDate(f.date)} · {f.startTime}
              </span>
            </li>
          ))}
        </ol>
      </Section>
      <ExportLinks eventId={event.id} />
    </main>
  );
}
