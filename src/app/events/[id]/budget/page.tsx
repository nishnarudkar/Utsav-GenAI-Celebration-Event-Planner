import { AlertTriangle, Info } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BudgetTable } from "@/components/plan/BudgetTable";
import { EventHeader } from "@/components/plan/EventHeader";
import { WhatIfSimulator } from "@/components/plan/WhatIfSimulator";
import { formatINR, formatINRCompact } from "@/lib/format";
import { getPricing } from "@/lib/kb/pricing";
import { CATEGORY_LABELS } from "@/lib/labels";
import { buildBudgetView, dominantTier } from "@/lib/plan/budget-view";
import { getEventRepository } from "@/lib/plan/event-repo";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const event = await getEventRepository().get((await params).id);
  return { title: event ? `Budget · ${event.title} — Utsav` : "Event not found — Utsav" };
}

export default async function BudgetPage({ params }: Props) {
  const { id } = await params;
  const event = await getEventRepository().get(id);
  if (!event) notFound();

  const view = buildBudgetView(event);
  const over = view.overBudgetPaise > 0;

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-5 px-4 py-6">
      <EventHeader event={event} active="budget" />

      <section aria-label="Budget summary" className="rounded-2xl border border-line bg-white p-5">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-sm text-muted">Estimated cost</dt>
            <dd className="font-display text-2xl text-maroon lining-nums tabular-nums">{formatINRCompact(view.totalEstimatePaise)}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted">{view.isEstimate ? "Suggested budget" : "Your budget"}</dt>
            <dd className="font-display text-2xl text-maroon lining-nums tabular-nums">{formatINRCompact(view.budgetTotalPaise)}</dd>
          </div>
          {!view.isEstimate && (
            <div className="col-span-2 sm:col-span-1">
              <dt className="text-sm text-muted">{over ? "Over budget" : "Left to plan with"}</dt>
              <dd className={`flex items-center gap-1.5 font-display text-2xl lining-nums tabular-nums ${over ? "text-increased" : "text-saved"}`}>
                {over && <AlertTriangle className="size-5" aria-hidden />}
                {formatINRCompact(over ? view.overBudgetPaise : view.remainingPaise)}
              </dd>
            </div>
          )}
        </dl>
        {view.isEstimate && (
          <p className="mt-3 text-sm text-muted">You asked Utsav to estimate, so the suggested budget is the total of the items below.</p>
        )}
      </section>

      <WhatIfSimulator
        eventId={event.id}
        guestCount={event.answers.guestCount}
        currentTiers={{
          venue: dominantTier(event.budget.lines, "venue"),
          catering: dominantTier(event.budget.lines, "catering"),
          decor: dominantTier(event.budget.lines, "decor"),
        }}
        functions={event.plan.functions.map((f) => ({ name: f.name, guests: f.expectedGuests }))}
      />

      <section className="rounded-2xl border border-line bg-white p-5">
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <h2 className="font-display text-xl text-maroon">By category</h2>
          <span className="text-sm text-muted">{event.budget.lines.length} items</span>
        </div>
        <BudgetTable rows={view.rows} />
      </section>

      {view.unpriced.length > 0 && (
        <section className="rounded-2xl border border-conflict/40 bg-white p-5">
          <h2 className="flex items-center gap-2 font-display text-xl text-maroon">
            <AlertTriangle className="size-5 text-conflict" aria-hidden /> Needs a quote
          </h2>
          <p className="mt-1 text-sm text-muted">We don&apos;t have price data for these yet. Ask vendors for a quote.</p>
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            {view.unpriced.map((u) => (
              <li key={u.label} className="flex justify-between gap-3">
                <span className="text-ink">{u.label}</span>
                <span className="text-muted">{CATEGORY_LABELS[u.category]}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {view.adjustments.length > 0 && (
        <details className="rounded-2xl border border-line bg-white p-5 text-sm">
          <summary className="cursor-pointer font-medium text-ink">Adjustments Utsav made ({view.adjustments.length})</summary>
          <ul className="mt-2 list-disc pl-5 text-muted">
            {view.adjustments.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </details>
      )}

      <p className="flex gap-2 text-xs text-muted">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        <span>
          {getPricing().disclaimer} Totals are exact sums of the items above ({formatINR(view.totalEstimatePaise)}).
        </span>
      </p>
    </main>
  );
}
