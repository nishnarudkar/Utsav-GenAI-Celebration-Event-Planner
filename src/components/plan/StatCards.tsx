import { AlertTriangle, CalendarHeart, CheckCircle2, ListChecks, Wallet } from "lucide-react";
import type { ReactNode } from "react";
import { formatINRCompact } from "@/lib/format";
import type { DashboardSummary } from "@/lib/plan/dashboard";

function Card({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-line bg-white p-4">
      <dt className="flex items-center gap-1.5 text-sm text-muted">
        <span aria-hidden className="text-marigold-ink">
          {icon}
        </span>
        {label}
      </dt>
      <dd className="flex flex-col gap-1">{children}</dd>
    </div>
  );
}

const big = "font-display text-2xl leading-tight text-maroon lining-nums tabular-nums";

export function StatCards({ summary }: { summary: DashboardSummary }) {
  const { daysToGo, budget, tasks, openIssueCount } = summary;
  const over = budget.overBudgetPaise > 0;
  const meter = Math.min(100, budget.percentUsed);

  return (
    <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Card icon={<CalendarHeart className="size-4" />} label="Days to go">
        <span className={big}>{daysToGo > 0 ? daysToGo : daysToGo === 0 ? "Today!" : "Done"}</span>
        {daysToGo > 0 && <span className="text-xs text-muted">until the main day</span>}
      </Card>

      <Card icon={<Wallet className="size-4" />} label={budget.isEstimate ? "Estimated budget" : "Budget used"}>
        <span className={big}>{formatINRCompact(budget.committedPaise)}</span>
        {budget.isEstimate ? (
          <span className="text-xs text-muted">Utsav&apos;s estimate</span>
        ) : (
          <>
            <span className="text-xs text-muted">of {formatINRCompact(budget.totalPaise)} · {budget.percentUsed}%</span>
            <span
              className="h-1.5 w-full overflow-hidden rounded-full bg-marigold-light/60"
              role="meter"
              aria-label="Budget used"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={budget.percentUsed}
            >
              <span className={`block h-full rounded-full ${over ? "bg-increased" : "bg-marigold"}`} style={{ width: `${meter}%` }} />
            </span>
            {over && (
              <span className="flex items-center gap-1 text-xs font-medium text-increased">
                <AlertTriangle className="size-3.5" aria-hidden /> Over by {formatINRCompact(budget.overBudgetPaise)}
              </span>
            )}
          </>
        )}
      </Card>

      <Card icon={<ListChecks className="size-4" />} label="Tasks done">
        <span className={big}>
          {tasks.done}
          <span className="text-base text-muted"> / {tasks.total}</span>
        </span>
        {tasks.dueNow > 0 && <span className="text-xs text-muted">{tasks.dueNow} due now</span>}
      </Card>

      <Card icon={openIssueCount > 0 ? <AlertTriangle className="size-4" /> : <CheckCircle2 className="size-4" />} label="Open conflicts">
        <span className={big}>{openIssueCount}</span>
        <span className="text-xs text-muted">{openIssueCount === 0 ? "All clear" : "Needs a look"}</span>
      </Card>
    </dl>
  );
}
