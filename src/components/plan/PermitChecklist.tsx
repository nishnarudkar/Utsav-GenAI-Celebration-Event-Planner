"use client";

import { useState } from "react";
import { formatDate } from "@/lib/format";
import type { PermitRow } from "@/lib/kb/permits";

interface PermitChecklistProps {
  eventId: string;
  rows: PermitRow[];
  disclaimer: string;
}

/** Permissions to arrange. Optimistic like the ritual checklist: ticks show at once, and roll back if saving fails. */
export function PermitChecklist({ eventId, rows, disclaimer }: PermitChecklistProps) {
  const [state, setState] = useState(() => new Map(rows.map((r) => [r.id, r.done])));
  const [error, setError] = useState<string | null>(null);
  const done = [...state.values()].filter(Boolean).length;

  async function toggle(permitId: string, value: boolean) {
    setError(null);
    setState((s) => new Map(s).set(permitId, value));
    try {
      const res = await fetch(`/api/events/${eventId}/permits`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permitId, done: value }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setState((s) => new Map(s).set(permitId, !value));
      setError("Couldn't save that tick — try again.");
    }
  }

  return (
    <section aria-labelledby="permits-title" className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-5">
      <div>
        <h2 id="permits-title" className="font-display text-xl text-maroon">
          Permissions
        </h2>
        <p className="mt-1 text-sm text-muted">
          {done} of {rows.length} sorted. {disclaimer}
        </p>
      </div>
      <ul className="flex flex-col">
        {rows.map((r) => {
          const checked = state.get(r.id) ?? false;
          return (
            <li key={r.id} className="border-b border-line py-2.5 last:border-0">
              <label className="flex cursor-pointer items-start gap-2.5 text-sm">
                <input type="checkbox" checked={checked} onChange={(e) => void toggle(r.id, e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-maroon" />
                <span className="flex flex-col gap-0.5">
                  <span className={`font-medium ${checked ? "text-muted line-through" : "text-ink"}`}>{r.title}</span>
                  <span className="text-muted">
                    {r.authority} · {r.appliesIf}
                  </span>
                  <span className="text-muted">{r.why}</span>
                  {!checked && <span className={r.late && !checked ? "font-medium text-increased" : "text-ink"}>{r.late ? "Late: apply now" : `Apply by ${formatDate(r.applyBy)}`}</span>}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-muted">Apply-by dates are our rough estimates, not legal deadlines.</p>
      {error && (
        <p role="alert" className="text-sm text-increased">
          {error}
        </p>
      )}
    </section>
  );
}
