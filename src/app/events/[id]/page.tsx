import { ChevronRight } from "lucide-react";
import Link from "next/link";
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
import { eventMetadata, loadEvent, type EventPageProps } from "@/lib/plan/event-page";
import { toISTDate } from "@/lib/rules/dates";

export const dynamic = "force-dynamic";

export const generateMetadata = eventMetadata();

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

export default async function EventDashboardPage(props: EventPageProps) {
  const event = await loadEvent(props);

  const today = toISTDate(new Date());
  const summary = summarizeDashboard(event, today);
  const { plan } = event;

  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-5 px-4 py-6">
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
      {event.answers.eventType === "community" && (
        <Link
          href={`/events/${event.id}/community`}
          className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-white p-5 hover:border-maroon"
        >
          <span>
            <span className="block font-display text-xl text-maroon">Community tools</span>
            <span className="block text-sm text-muted">Permissions, crowd safety, volunteers and sponsors.</span>
          </span>
          <ChevronRight className="size-5 shrink-0 text-maroon" aria-hidden />
        </Link>
      )}
      <Link
        href={`/events/${event.id}/vibe`}
        className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-white p-5 hover:border-maroon"
      >
        <span>
          <span className="block font-display text-xl text-maroon">Look &amp; feel</span>
          <span className="block text-sm text-muted">
            {event.vibe ? event.vibe.theme : "Turn photos you love into colours and décor ideas."}
          </span>
        </span>
        <ChevronRight className="size-5 shrink-0 text-maroon" aria-hidden />
      </Link>
      <ExportLinks eventId={event.id} />
    </main>
  );
}
