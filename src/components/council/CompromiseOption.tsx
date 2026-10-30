import { Check } from "lucide-react";
import { formatINRDelta } from "@/lib/format";
import type { CouncilOption } from "@/lib/schemas/council";

interface CompromiseOptionProps {
  option: CouncilOption;
  chosen: boolean;
  disabled: boolean;
  onChoose: () => void;
}

export function CompromiseOption({ option: o, chosen, disabled, onChoose }: CompromiseOptionProps) {
  return (
    <article className={`flex flex-col gap-2 rounded-2xl border bg-white p-4 ${chosen ? "border-2 border-marigold" : "border-line"}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="font-display text-lg text-maroon">{o.title}</h4>
        <span className="text-sm tabular-nums text-ink">{o.costDeltaPaise === 0 ? "No cost change" : `${formatINRDelta(o.costDeltaPaise)} cost`}</span>
      </div>
      <p className="text-sm text-ink">{o.description}</p>
      <dl className="flex flex-col gap-1 text-sm">
        {o.satisfies.length > 0 && (
          <div className="flex gap-2">
            <dt className="shrink-0 text-saved">Gets their wish:</dt>
            <dd className="text-ink">{o.satisfies.join(", ")}</dd>
          </div>
        )}
        {o.compromises.length > 0 && (
          <div className="flex gap-2">
            <dt className="shrink-0 text-conflict">Gives a little:</dt>
            <dd className="text-ink">{o.compromises.join(", ")}</dd>
          </div>
        )}
      </dl>
      {o.conflictsAfter.length > 0 && (
        <ul className="list-disc pl-5 text-xs text-muted">
          {o.conflictsAfter.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      )}
      <div>
        {chosen ? (
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-saved">
            <Check className="size-4" aria-hidden /> The family chose this
          </span>
        ) : (
          <button
            type="button"
            disabled={disabled}
            onClick={onChoose}
            aria-label={`Choose: ${o.title}`}
            className="rounded-full bg-maroon px-5 py-2 text-sm font-medium text-cream hover:bg-maroon-dark disabled:opacity-50"
          >
            Choose this
          </button>
        )}
      </div>
    </article>
  );
}
