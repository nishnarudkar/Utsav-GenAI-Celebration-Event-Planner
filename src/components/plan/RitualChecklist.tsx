"use client";

import { useState } from "react";
import type { ChecklistItem } from "@/lib/plan/timeline-view";

/** Tickable ritual items. Optimistic: ticks show at once, and roll back if saving fails. */
export function RitualChecklist({ eventId, items }: { eventId: string; items: ChecklistItem[] }) {
  const [state, setState] = useState(() => new Map(items.map((i) => [i.id, i.procured])));
  const [error, setError] = useState<string | null>(null);
  const done = [...state.values()].filter(Boolean).length;

  async function toggle(id: string, procured: boolean) {
    setError(null);
    setState((s) => new Map(s).set(id, procured));
    try {
      const res = await fetch(`/api/events/${eventId}/ritual-items`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: id, procured }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setState((s) => new Map(s).set(id, !procured));
      setError("Couldn't save that tick — try again.");
    }
  }

  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1 text-xs font-medium text-muted">
        Items · {done} of {items.length} ready
      </legend>
      {items.map((item) => {
        const checked = state.get(item.id) ?? false;
        return (
          <label key={item.id} className="flex cursor-pointer items-start gap-2.5 text-sm">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => void toggle(item.id, e.target.checked)}
              className="mt-0.5 size-4 shrink-0 accent-maroon"
            />
            <span className={checked ? "text-muted line-through" : "text-ink"}>
              {item.item}
              {item.quantity && <span className="text-muted"> · {item.quantity}</span>}
            </span>
          </label>
        );
      })}
      {error && (
        <p role="alert" className="text-xs text-increased">
          {error}
        </p>
      )}
    </fieldset>
  );
}
