import { ChevronDown, Equal, TrendingDown, TrendingUp } from "lucide-react";
import { formatINR, formatINRCompact } from "@/lib/format";
import { basisText, type CategoryRow } from "@/lib/plan/budget-view";

/** Difference from the Planner's target, with an icon and words so colour never carries meaning alone. */
function TargetDelta({ row }: { row: CategoryRow }) {
  if (row.allocatedPaise === null || row.deltaPaise === null) return null;
  const abs = Math.abs(row.deltaPaise);
  if (abs < 100_00) {
    return (
      <span className="inline-flex items-center gap-1 text-muted">
        <Equal className="size-3.5" aria-hidden /> On target
      </span>
    );
  }
  const over = row.deltaPaise > 0;
  const Icon = over ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-1 ${over ? "text-increased" : "text-saved"}`}>
      <Icon className="size-3.5" aria-hidden /> {formatINRCompact(abs)} {over ? "over" : "under"} target
    </span>
  );
}

export function BudgetTable({ rows }: { rows: CategoryRow[] }) {
  return (
    <ul className="flex flex-col divide-y divide-line">
      {rows.map((row, i) => (
        <li key={row.category}>
          <details className="group py-3" open={i === 0}>
            <summary className="flex cursor-pointer list-none items-start gap-3 [&::-webkit-details-marker]:hidden">
              <ChevronDown className="mt-1 size-4 shrink-0 text-muted transition-transform group-open:rotate-180" aria-hidden />
              <span className="flex flex-1 flex-col gap-0.5">
                <span className="font-medium text-ink">{row.label}</span>
                <span className="flex flex-wrap gap-x-2 text-xs text-muted">
                  {row.allocatedPaise !== null && <span className="tabular-nums">Target {formatINR(row.allocatedPaise)}</span>}
                  <TargetDelta row={row} />
                </span>
              </span>
              <span className="font-medium tabular-nums text-ink">{formatINR(row.estimatePaise)}</span>
            </summary>

            {row.lines.length === 0 ? (
              <p className="mt-2 pl-7 text-sm text-muted">No items yet in this category.</p>
            ) : (
              <ul className="mt-3 flex flex-col gap-3 pl-7">
                {row.lines.map((line) => (
                  <li key={`${line.label}-${line.functionName ?? ""}`} className="flex flex-col gap-1 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <span>
                        <span className="text-ink">{line.label}</span>
                        {line.functionName && <span className="block text-xs text-muted">{line.functionName}</span>}
                      </span>
                      <span className="shrink-0 tabular-nums text-ink">{formatINR(line.estimatePaise)}</span>
                    </div>
                    <details className="text-xs">
                      <summary className="w-fit cursor-pointer text-marigold-ink underline-offset-2 hover:underline">Why?</summary>
                      <div className="mt-1 rounded-lg bg-cream p-2 text-muted">
                        <p className="tabular-nums text-ink">{basisText(line.basis)}</p>
                        {line.rationale && <p className="mt-1">{line.rationale}</p>}
                      </div>
                    </details>
                  </li>
                ))}
              </ul>
            )}
          </details>
        </li>
      ))}
    </ul>
  );
}
