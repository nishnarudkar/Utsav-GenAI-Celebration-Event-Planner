"use client";

import { ArrowRight, Check, ChevronDown, ChevronRight, ChevronUp, Lightbulb, Undo2 } from "lucide-react";
import { IssueList } from "@/components/plan/IssueList";
import { formatINRDelta } from "@/lib/format";
import { conflictIssues, diffRows, type Direction } from "@/lib/plan/diff-view";
import type { PlanDiff } from "@/lib/schemas/diff";

/** ▲ costs more, ▼ saves, ▸ moved — icon + words, never colour alone (CLAUDE.md §9). */
const DIRECTION: Record<Direction, { icon: typeof ChevronUp; className: string; label: string }> = {
  up: { icon: ChevronUp, className: "text-increased", label: "increased" },
  down: { icon: ChevronDown, className: "text-saved", label: "decreased" },
  neutral: { icon: ChevronRight, className: "text-muted", label: "changed" },
};

/** Stop lines breaking between a sign and its amount ("+" / "₹2.1L"): insert a word joiner. */
const WORD_JOINER = String.fromCharCode(0x2060);
const keepSignWithAmount = (text: string) => text.replace(/([+−-])₹/g, (_m, sign: string) => `${sign}${WORD_JOINER}₹`);

interface DiffPanelProps {
  diff: PlanDiff;
  busy: boolean;
  onAccept: () => void;
  onUndo: () => void;
  onApply: (optionId: string) => void;
}

export function DiffPanel({ diff, busy, onAccept, onUndo, onApply }: DiffPanelProps) {
  const rows = diffRows(diff);
  const delta = diff.budgetDeltaPaise;
  const deltaDir: Direction = delta > 0 ? "up" : delta < 0 ? "down" : "neutral";
  const DeltaIcon = DIRECTION[deltaDir].icon;

  return (
    <section aria-labelledby="diff-title" className="flex flex-col gap-4 rounded-2xl border-2 border-marigold bg-white p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="diff-title" className="font-display text-xl text-maroon">
          What changed
        </h2>
        {delta !== 0 && (
          <span className={`inline-flex items-center gap-1 text-sm font-medium tabular-nums ${DIRECTION[deltaDir].className}`}>
            <DeltaIcon className="size-4" aria-hidden />
            {formatINRDelta(delta)} <span className="font-normal text-muted">{delta > 0 ? "more" : "less"} in total</span>
          </span>
        )}
      </div>

      <p className="text-ink">{keepSignWithAmount(diff.explanation)}</p>

      {rows.length > 0 && (
        <ul className="flex flex-col divide-y divide-line text-sm">
          {rows.map((r) => {
            const d = DIRECTION[r.direction];
            const Icon = d.icon;
            return (
              <li key={r.key} className="flex items-start gap-2.5 py-2.5 first:pt-0 last:pb-0">
                <Icon className={`mt-0.5 size-4 shrink-0 ${d.className}`} aria-label={d.label} />
                <div className="flex flex-1 flex-col gap-0.5">
                  <span className="flex flex-wrap items-baseline justify-between gap-x-2">
                    <span className="font-medium text-ink">{r.label}</span>
                    {r.delta && <span className={`tabular-nums ${d.className}`}>{r.delta}</span>}
                  </span>
                  <span className="flex flex-wrap items-center gap-1 text-muted tabular-nums">
                    {r.from} <ArrowRight className="size-3" aria-label="to" /> <span className="text-ink">{r.to}</span>
                  </span>
                  <span className="text-xs text-muted">{r.reason}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <IssueList issues={conflictIssues(diff.conflicts)} />

      {diff.recoveryOptions.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="flex items-center gap-1.5 text-sm font-medium text-ink">
            <Lightbulb className="size-4 text-marigold-ink" aria-hidden /> Ways to get back on budget
          </h3>
          <ul className="flex flex-col gap-2">
            {diff.recoveryOptions.map((o) => (
              <li key={o.id} className="flex items-center gap-3 rounded-xl border border-line p-3">
                <div className="flex-1 text-sm">
                  <p className="font-medium text-ink">{o.title}</p>
                  <p className="text-muted">{o.impact}</p>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onApply(o.id)}
                  aria-label={`Apply: ${o.title}`}
                  className="shrink-0 rounded-full border border-maroon px-4 py-2 text-sm font-medium text-maroon hover:bg-maroon/5 disabled:opacity-50"
                >
                  Apply
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={onAccept}
          className="inline-flex items-center gap-1.5 rounded-full bg-maroon px-5 py-2.5 font-medium text-cream hover:bg-maroon-dark disabled:opacity-50"
        >
          <Check className="size-4" aria-hidden /> Accept
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onUndo}
          className="inline-flex items-center gap-1.5 rounded-full border border-maroon px-5 py-2.5 font-medium text-maroon hover:bg-maroon/5 disabled:opacity-50"
        >
          <Undo2 className="size-4" aria-hidden /> Undo
        </button>
      </div>
    </section>
  );
}
