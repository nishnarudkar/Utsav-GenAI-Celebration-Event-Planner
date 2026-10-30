import { AlertOctagon, AlertTriangle, Info } from "lucide-react";
import type { CouncilConflict } from "@/lib/schemas/council";

const SEVERITY = {
  high: { icon: AlertOctagon, className: "text-increased", label: "Needs settling" },
  medium: { icon: AlertTriangle, className: "text-conflict", label: "Worth discussing" },
  low: { icon: Info, className: "text-muted", label: "Minor" },
} as const;

/** Topic × person × position. Stacked rather than a wide table, so it reads on a phone. */
export function ConflictMatrix({ conflicts }: { conflicts: CouncilConflict[] }) {
  if (conflicts.length === 0) return <p className="text-sm text-muted">No real disagreements found — the family is broadly aligned.</p>;
  return (
    <ul className="flex flex-col gap-3">
      {conflicts.map((c) => {
        const s = SEVERITY[c.severity];
        const Icon = s.icon;
        return (
          <li key={c.topic} className="rounded-xl border border-line p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h4 className="font-medium text-ink">{c.topic}</h4>
              <span className={`inline-flex items-center gap-1 text-xs ${s.className}`}>
                <Icon className="size-3.5" aria-hidden /> {s.label}
              </span>
            </div>
            <dl className="mt-2 flex flex-col gap-1.5 text-sm">
              {c.positions.map((p) => (
                <div key={p.stakeholder} className="sm:flex sm:gap-2">
                  <dt className="shrink-0 font-medium text-muted sm:w-40">{p.stakeholder}</dt>
                  <dd className="text-ink">{p.wants}</dd>
                </div>
              ))}
            </dl>
          </li>
        );
      })}
    </ul>
  );
}
