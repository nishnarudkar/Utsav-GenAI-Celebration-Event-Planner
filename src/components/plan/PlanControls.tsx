"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState, type FormEvent } from "react";
import { DiffPanel } from "@/components/plan/DiffPanel";
import { formatINR, parseINR } from "@/lib/format";
import type { PlanDiff } from "@/lib/schemas/diff";

interface PlanControlsProps {
  eventId: string;
  guestCount: number;
  budgetTotalPaise: number;
  budgetIsEstimate: boolean;
}

type ApiResult = { ok: true; diff: PlanDiff | null; noop?: boolean } | { ok: false; message: string };

async function call(url: string, init: RequestInit): Promise<ApiResult> {
  try {
    const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json" } });
    const body: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const message =
        typeof body === "object" && body !== null && "error" in body && typeof (body as { error: { message?: unknown } }).error.message === "string"
          ? (body as { error: { message: string } }).error.message
          : "Couldn't update the plan — try again.";
      return { ok: false, message };
    }
    const b = body as { diff?: PlanDiff; noop?: boolean } | null;
    return { ok: true, diff: b?.diff ?? null, noop: b?.noop };
  } catch {
    return { ok: false, message: "Couldn't reach Utsav — check your connection and try again." };
  }
}

/**
 * Edit guest count or budget; show the cascade's diff with Accept / Undo / Apply option
 * (CLAUDE.md §7.4). The page's server components refresh after every change.
 */
export function PlanControls({ eventId, guestCount, budgetTotalPaise, budgetIsEstimate }: PlanControlsProps) {
  const router = useRouter();
  const [guests, setGuests] = useState(String(guestCount));
  const [budget, setBudget] = useState(formatINR(budgetTotalPaise));
  const [diff, setDiff] = useState<PlanDiff | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "info"; text: string } | null>(null);
  const guestsId = useId();
  const budgetId = useId();

  // Keep the inputs in step with the plan after changes, undo and recovery.
  useEffect(() => setGuests(String(guestCount)), [guestCount]);
  useEffect(() => setBudget(formatINR(budgetTotalPaise)), [budgetTotalPaise]);

  async function run(url: string, init: RequestInit, after?: (r: Extract<ApiResult, { ok: true }>) => void) {
    setBusy(true);
    setMessage(null);
    const result = await call(url, init);
    setBusy(false);
    if (!result.ok) {
      setMessage({ tone: "error", text: result.message });
      return;
    }
    after?.(result);
    router.refresh();
  }

  function submitGuests(e: FormEvent) {
    e.preventDefault();
    const value = Number(guests.replace(/[,\s]/g, ""));
    if (!Number.isInteger(value) || value < 1 || value > 5000) {
      setMessage({ tone: "error", text: "Guest count should be a whole number between 1 and 5,000." });
      return;
    }
    void change("guest_count", value);
  }

  function submitBudget(e: FormEvent) {
    e.preventDefault();
    const value = parseINR(budget);
    if (value === null || value <= 0) {
      setMessage({ tone: "error", text: "Try a budget like 12L, 12 lakh or ₹12,00,000." });
      return;
    }
    void change("budget_total", value);
  }

  async function change(field: "guest_count" | "budget_total", value: number) {
    await run(`/api/events/${eventId}`, { method: "PATCH", body: JSON.stringify({ field, value }) }, (r) => {
      if (r.noop) setMessage({ tone: "info", text: "That's already the current value — nothing changed." });
      else setDiff(r.diff);
    });
  }

  const undo = () =>
    run(`/api/events/${eventId}/undo`, { method: "POST" }, () => {
      setDiff(null);
      setMessage({ tone: "info", text: "Change undone — your plan is back to how it was." });
    });

  const apply = (optionId: string) =>
    run(`/api/events/${eventId}/recovery`, { method: "POST", body: JSON.stringify({ optionId }) }, (r) => setDiff(r.diff));

  const input = "w-full rounded-xl border border-line bg-white px-3 py-2.5 text-ink focus:border-maroon focus:outline-none tabular-nums";
  const save = "shrink-0 rounded-xl bg-maroon px-4 py-2.5 text-sm font-medium text-cream hover:bg-maroon-dark disabled:opacity-50";

  return (
    <div className="flex flex-col gap-4">
      <section aria-label="Adjust plan" className="rounded-2xl border border-line bg-white p-5">
        <h2 className="font-display text-xl text-maroon">Adjust plan</h2>
        <p className="mt-1 text-sm text-muted">Change a number and see everything it affects.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <form onSubmit={submitGuests} className="flex flex-col gap-1.5">
            <label htmlFor={guestsId} className="text-sm font-medium text-ink">
              Guest count
            </label>
            <div className="flex gap-2">
              <input id={guestsId} inputMode="numeric" value={guests} onChange={(e) => setGuests(e.target.value)} className={input} />
              <button type="submit" disabled={busy} className={save}>
                Update
              </button>
            </div>
          </form>
          <form onSubmit={submitBudget} className="flex flex-col gap-1.5">
            <label htmlFor={budgetId} className="text-sm font-medium text-ink">
              {budgetIsEstimate ? "Set a budget" : "Budget"}
            </label>
            <div className="flex gap-2">
              <input id={budgetId} value={budget} onChange={(e) => setBudget(e.target.value)} className={input} />
              <button type="submit" disabled={busy} className={save}>
                Update
              </button>
            </div>
          </form>
        </div>
        <div aria-live="polite" className="mt-3 min-h-5 text-sm">
          {busy && (
            <span className="inline-flex items-center gap-1.5 text-muted">
              <Loader2 className="size-4 animate-spin" aria-hidden /> Working out what changes…
            </span>
          )}
          {!busy && message && <span className={message.tone === "error" ? "text-increased" : "text-muted"}>{message.text}</span>}
        </div>
      </section>

      {diff && <DiffPanel diff={diff} busy={busy} onAccept={() => setDiff(null)} onUndo={() => void undo()} onApply={(id) => void apply(id)} />}
    </div>
  );
}
