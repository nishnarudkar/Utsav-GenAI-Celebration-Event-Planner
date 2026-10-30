"use client";

import { ArrowRight, Loader2, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { DiffPanel } from "@/components/plan/DiffPanel";
import { IssueList } from "@/components/plan/IssueList";
import { formatINR, formatINRCompact, formatINRDelta } from "@/lib/format";
import { apiCall } from "@/lib/plan/client-api";
import { conflictIssues } from "@/lib/plan/diff-view";
import type { PlanDiff } from "@/lib/schemas/diff";
import { PRICE_TIERS, type PriceTier } from "@/lib/schemas/enums";
import type { WhatIfProjection, WhatIfScenario } from "@/lib/schemas/whatif";

type TierCategory = "venue" | "catering" | "decor";

const TIER_CONTROLS: Array<{ key: TierCategory; label: string }> = [
  { key: "venue", label: "Venue" },
  { key: "catering", label: "Catering" },
  { key: "decor", label: "Décor" },
];
const TIER_LABELS: Record<PriceTier, string> = { low: "Budget-friendly", mid: "Mid-range", high: "Premium" };
const DEBOUNCE_MS = 250;

interface WhatIfSimulatorProps {
  eventId: string;
  guestCount: number;
  /** The most common price tier per category today, where the sliders start. */
  currentTiers: Partial<Record<TierCategory, PriceTier>>;
  functions: Array<{ name: string; guests: number }>;
}

/** Try changes with live projected numbers. Nothing is saved until Apply. */
export function WhatIfSimulator({ eventId, guestCount, currentTiers, functions }: WhatIfSimulatorProps) {
  const router = useRouter();
  const [guests, setGuests] = useState(guestCount);
  const [tiers, setTiers] = useState<Partial<Record<TierCategory, PriceTier>>>({});
  const [dropped, setDropped] = useState<string[]>([]);
  const [projection, setProjection] = useState<WhatIfProjection | null>(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [diff, setDiff] = useState<PlanDiff | null>(null);
  const guestsId = useId();

  const guestMax = Math.max(guestCount * 2, 100);
  const changed = guests !== guestCount || Object.keys(tiers).length > 0 || dropped.length > 0;
  const scenario: WhatIfScenario = { ...(guests !== guestCount ? { guestCount: guests } : {}), tiers, dropFunctions: dropped };
  const scenarioKey = JSON.stringify(scenario);

  useEffect(() => setGuests(guestCount), [guestCount]);

  // Project after a short pause; a newer scenario aborts the one in flight.
  useEffect(() => {
    if (!changed) {
      setProjection(null);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch(`/api/events/${eventId}/whatif`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: `{"scenario":${scenarioKey}}`,
            signal: controller.signal,
          });
          if (!res.ok) throw new Error();
          const body = (await res.json()) as { projection: WhatIfProjection };
          setProjection(body.projection);
          setError(null);
          setLoading(false);
        } catch (err) {
          if (err instanceof DOMException && err.name === "AbortError") return;
          setError("Couldn't work that out — try again.");
          setLoading(false);
        }
      })();
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [changed, eventId, scenarioKey]);

  function reset() {
    setGuests(guestCount);
    setTiers({});
    setDropped([]);
    setError(null);
  }

  async function run<T>(url: string, init: RequestInit): Promise<T | null> {
    setApplying(true);
    setError(null);
    const result = await apiCall<T>(url, init);
    setApplying(false);
    if (!result.ok) {
      setError(result.message);
      return null;
    }
    router.refresh();
    return result.data;
  }

  async function apply() {
    const data = await run<{ diff: PlanDiff }>(`/api/events/${eventId}/whatif`, { method: "POST", body: JSON.stringify({ scenario, apply: true }) });
    if (data) {
      setDiff(data.diff);
      setTiers({});
      setDropped([]);
    }
  }
  async function undo() {
    if (await run(`/api/events/${eventId}/undo`, { method: "POST" })) setDiff(null);
  }
  async function applyRecovery(optionId: string) {
    const data = await run<{ diff: PlanDiff }>(`/api/events/${eventId}/recovery`, { method: "POST", body: JSON.stringify({ optionId }) });
    if (data) setDiff(data.diff);
  }

  const over = projection && !projection.budgetIsEstimate && projection.overBudgetPaise > 0;

  return (
    <div className="flex flex-col gap-4">
      <section aria-labelledby="whatif-title" className="flex flex-col gap-4 rounded-2xl border border-line bg-white p-5">
        <div>
          <h2 id="whatif-title" className="font-display text-xl text-maroon">
            What if…?
          </h2>
          <p className="mt-1 text-sm text-muted">Try changes and see the numbers. Nothing is saved until you apply.</p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={guestsId} className="flex justify-between text-sm font-medium text-ink">
            <span>Guests</span>
            <span className="tabular-nums">{guests}</span>
          </label>
          <input
            id={guestsId}
            type="range"
            min={10}
            max={guestMax}
            step={10}
            value={guests}
            onChange={(e) => setGuests(Number(e.target.value))}
            className="w-full accent-maroon"
          />
        </div>

        {TIER_CONTROLS.filter((c) => currentTiers[c.key]).map((c) => (
          <TierSlider
            key={c.key}
            label={c.label}
            value={tiers[c.key] ?? currentTiers[c.key]!}
            onChange={(tier) =>
              setTiers((prev) => {
                const next = { ...prev };
                if (tier === currentTiers[c.key]) delete next[c.key];
                else next[c.key] = tier;
                return next;
              })
            }
          />
        ))}

        {functions.length > 1 && (
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1 text-sm font-medium text-ink">Functions to keep</legend>
            {functions.map((f) => {
              const keep = !dropped.includes(f.name);
              const lastOne = keep && dropped.length === functions.length - 1;
              return (
                <label key={f.name} className="flex items-center gap-2.5 text-sm text-ink">
                  <input
                    type="checkbox"
                    checked={keep}
                    disabled={lastOne}
                    onChange={(e) => setDropped((d) => (e.target.checked ? d.filter((n) => n !== f.name) : [...d, f.name]))}
                    className="size-4 accent-maroon"
                  />
                  <span>
                    {f.name} <span className="text-muted">· {f.guests} guests</span>
                  </span>
                </label>
              );
            })}
          </fieldset>
        )}

        <div aria-live="polite" className="flex flex-col gap-3 border-t border-line pt-4">
          {!changed && <p className="text-sm text-muted">Move a slider to see what changes.</p>}
          {changed && !projection && loading && (
            <p className="inline-flex items-center gap-1.5 text-sm text-muted">
              <Loader2 className="size-4 animate-spin" aria-hidden /> Working it out…
            </p>
          )}
          {changed && projection && (
            <>
              <dl className={`grid grid-cols-2 gap-3 transition-opacity ${loading ? "opacity-60" : ""}`}>
                <div>
                  <dt className="text-sm text-muted">Projected cost</dt>
                  <dd className="font-display text-2xl text-maroon lining-nums tabular-nums">{formatINRCompact(projection.totalEstimatePaise)}</dd>
                  <dd className="text-xs tabular-nums text-muted">{formatINRDelta(projection.deltaPaise)} vs your plan</dd>
                </div>
                {!projection.budgetIsEstimate && (
                  <div>
                    <dt className="text-sm text-muted">{over ? "Over budget" : "Left in budget"}</dt>
                    <dd className={`font-display text-2xl lining-nums tabular-nums ${over ? "text-increased" : "text-saved"}`}>
                      {formatINRCompact(over ? projection.overBudgetPaise : projection.remainingPaise)}
                    </dd>
                    <dd className="text-xs tabular-nums text-muted">of {formatINRCompact(projection.budgetTotalPaise)}</dd>
                  </div>
                )}
              </dl>

              {projection.categories.length > 0 && (
                <ul className="flex flex-col gap-1 text-sm">
                  {projection.categories.map((c) => (
                    <li key={c.category} className="flex flex-wrap items-center justify-between gap-x-3">
                      <span className="text-ink">{c.label}</span>
                      <span className="inline-flex items-center gap-1 tabular-nums text-muted">
                        {formatINR(c.beforePaise)} <ArrowRight className="size-3" aria-label="to" /> <span className="text-ink">{formatINR(c.afterPaise)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              <IssueList issues={conflictIssues(projection.conflicts)} />

              {projection.savings.length > 0 && (
                <div className="text-sm">
                  <h3 className="font-medium text-ink">More ways to save</h3>
                  <ol className="mt-1 flex flex-col gap-1">
                    {projection.savings.map((s) => (
                      <li key={s.id} className="flex justify-between gap-3">
                        <span className="text-ink">{s.title}</span>
                        <span className="shrink-0 tabular-nums text-saved">Save {formatINRCompact(s.savesPaise)}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={applying || loading}
                  onClick={() => void apply()}
                  className="rounded-full bg-maroon px-5 py-2.5 font-medium text-cream hover:bg-maroon-dark disabled:opacity-50"
                >
                  Apply to my plan
                </button>
                <button
                  type="button"
                  disabled={applying}
                  onClick={reset}
                  className="inline-flex items-center gap-1.5 rounded-full border border-maroon px-5 py-2.5 font-medium text-maroon hover:bg-maroon/5 disabled:opacity-50"
                >
                  <RotateCcw className="size-4" aria-hidden /> Reset
                </button>
              </div>
            </>
          )}
          {error && (
            <p role="alert" className="text-sm text-increased">
              {error}
            </p>
          )}
        </div>
      </section>

      {diff && <DiffPanel diff={diff} busy={applying} onAccept={() => setDiff(null)} onUndo={() => void undo()} onApply={(id) => void applyRecovery(id)} />}
    </div>
  );
}

function TierSlider({ label, value, onChange }: { label: string; value: PriceTier; onChange: (tier: PriceTier) => void }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="flex justify-between text-sm font-medium text-ink">
        <span>{label}</span>
        <span>{TIER_LABELS[value]}</span>
      </label>
      <input
        id={id}
        type="range"
        min={0}
        max={PRICE_TIERS.length - 1}
        step={1}
        value={PRICE_TIERS.indexOf(value)}
        aria-valuetext={TIER_LABELS[value]}
        onChange={(e) => onChange(PRICE_TIERS[Number(e.target.value)] ?? value)}
        className="w-full accent-maroon"
      />
    </div>
  );
}
