"use client";

import { Loader2, Trash2, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CompromiseOption } from "@/components/council/CompromiseOption";
import { ConflictMatrix } from "@/components/council/ConflictMatrix";
import { StakeholderForm } from "@/components/council/StakeholderForm";
import { DiffPanel } from "@/components/plan/DiffPanel";
import { apiCall } from "@/lib/plan/client-api";
import { preferenceSummary, ROLE_LABELS } from "@/lib/plan/council-form";
import type { CouncilResolution, Stakeholder, StakeholderInput } from "@/lib/schemas/council";
import type { PlanDiff } from "@/lib/schemas/diff";

interface CouncilPanelProps {
  eventId: string;
  version: number;
  stakeholders: Stakeholder[];
  council: CouncilResolution | null;
}

const MIN_PEOPLE = 2;

export function CouncilPanel({ eventId, version, stakeholders, council }: CouncilPanelProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [diff, setDiff] = useState<PlanDiff | null>(null);
  const base = `/api/events/${eventId}`;
  const stale = council !== null && council.planVersion !== version;

  /** Run a call, surface its error, refresh the page's data. Returns its data on success. */
  async function run<T>(url: string, init: RequestInit): Promise<T | null> {
    setBusy(true);
    setError(null);
    const result = await apiCall<T>(url, init);
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return null;
    }
    router.refresh();
    return result.data;
  }

  const add = async (input: StakeholderInput) => (await run(`${base}/stakeholders`, { method: "POST", body: JSON.stringify(input) })) !== null;
  const remove = (id: string) => run(`${base}/stakeholders/${id}`, { method: "DELETE" });
  const hold = () => run(`${base}/council`, { method: "POST" });

  async function choose(optionId: string) {
    const data = await run<{ diff: PlanDiff }>(`${base}/council/apply`, { method: "POST", body: JSON.stringify({ optionId }) });
    if (data) setDiff(data.diff);
  }
  async function undo() {
    if (await run(`${base}/undo`, { method: "POST" })) setDiff(null);
  }
  async function applyRecovery(optionId: string) {
    const data = await run<{ diff: PlanDiff }>(`${base}/recovery`, { method: "POST", body: JSON.stringify({ optionId }) });
    if (data) setDiff(data.diff);
  }

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-4 rounded-2xl border border-line bg-white p-5">
        <div>
          <h2 className="font-display text-xl text-maroon">Family Council</h2>
          <p className="mt-1 text-sm text-muted">Add what each person hopes for. Utsav finds where they differ and suggests fair compromises.</p>
        </div>

        {stakeholders.length > 0 && (
          <ul className="flex flex-col gap-2">
            {stakeholders.map((s) => (
              <li key={s.id} className="flex items-start gap-3 rounded-xl border border-line p-3">
                <div className="flex-1 text-sm">
                  <p className="font-medium text-ink">
                    {s.name} <span className="font-normal text-muted">· {ROLE_LABELS[s.role]}</span>
                  </p>
                  <p className="text-muted">{preferenceSummary(s.preferences).join(" · ") || "No preferences added"}</p>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void remove(s.id)}
                  aria-label={`Remove ${s.name}`}
                  className="rounded-full p-1.5 text-muted hover:bg-line/60 hover:text-maroon disabled:opacity-50"
                >
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}

        <StakeholderForm busy={busy} onAdd={add} />

        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
          <button
            type="button"
            disabled={busy || stakeholders.length < MIN_PEOPLE}
            onClick={() => void hold()}
            className="inline-flex items-center gap-1.5 rounded-full bg-maroon px-5 py-2.5 font-medium text-cream hover:bg-maroon-dark disabled:opacity-50"
          >
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Users className="size-4" aria-hidden />}
            {council ? "Hold the council again" : "Hold the council"}
          </button>
          {stakeholders.length < MIN_PEOPLE && <span className="text-sm text-muted">Add at least {MIN_PEOPLE} people first.</span>}
        </div>
        <div aria-live="polite">
          {error && (
            <p role="alert" className="text-sm text-increased">
              {error}
            </p>
          )}
        </div>
      </section>

      {diff && <DiffPanel diff={diff} busy={busy} onAccept={() => setDiff(null)} onUndo={() => void undo()} onApply={(id) => void applyRecovery(id)} />}

      {council && (
        <>
          <section className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-5">
            <h3 className="font-display text-xl text-maroon">Where the family differs</h3>
            <ConflictMatrix conflicts={council.conflicts} />
          </section>

          <section className="flex flex-col gap-3">
            <h3 className="font-display text-xl text-maroon">Possible compromises</h3>
            {stale && !diff && (
              <p role="status" className="rounded-xl border border-conflict/40 bg-white p-3 text-sm text-ink">
                The plan has changed since this council, so these costs may be out of date. Hold the council again to choose.
              </p>
            )}
            {council.options.map((o) => (
              <CompromiseOption
                key={o.id}
                option={o}
                chosen={council.chosenOptionId === o.id}
                disabled={busy || stale}
                onChoose={() => void choose(o.id)}
              />
            ))}
          </section>
        </>
      )}
    </div>
  );
}
