"use client";

import { useId, useState, type FormEvent } from "react";
import { EMPTY_FORM, FUNCTION_OPTIONS, MENU_OPTIONS, parseStakeholderForm, ROLE_LABELS, VENUE_OPTIONS, type StakeholderFormValues } from "@/lib/plan/council-form";
import { STAKEHOLDER_ROLES, type StakeholderRole } from "@/lib/schemas/enums";
import type { StakeholderInput } from "@/lib/schemas/council";

const field = "w-full rounded-xl border border-line bg-white px-3 py-2.5 text-ink focus:border-maroon focus:outline-none";

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: Array<{ value: string; label: string }> }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={field}>
        <option value="">No preference</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/** One person's preferences. Every preference is optional. */
export function StakeholderForm({ busy, onAdd }: { busy: boolean; onAdd: (input: StakeholderInput) => Promise<boolean> }) {
  const [f, setF] = useState<StakeholderFormValues>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const nameId = useId();
  const roleId = useId();
  const guestsId = useId();
  const budgetId = useId();
  const notesId = useId();
  const set = <K extends keyof StakeholderFormValues>(key: K, value: StakeholderFormValues[K]) => setF((prev) => ({ ...prev, [key]: value }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const parsed = parseStakeholderForm(f);
    if (!parsed.ok) return setError(parsed.message);
    setError(null);
    if (await onAdd(parsed.value)) setF(EMPTY_FORM);
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={nameId} className="text-sm font-medium text-ink">
            Name
          </label>
          <input id={nameId} value={f.name} onChange={(e) => set("name", e.target.value)} maxLength={80} placeholder="e.g. Bride's parents" className={field} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={roleId} className="text-sm font-medium text-ink">
            Role
          </label>
          <select id={roleId} value={f.role} onChange={(e) => set("role", e.target.value as StakeholderRole)} className={field}>
            {STAKEHOLDER_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={guestsId} className="text-sm font-medium text-ink">
            Guests they&apos;d like
          </label>
          <input id={guestsId} inputMode="numeric" value={f.guestCount} onChange={(e) => set("guestCount", e.target.value)} placeholder="e.g. 350" className={field} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={budgetId} className="text-sm font-medium text-ink">
            Budget limit
          </label>
          <input id={budgetId} value={f.budgetMax} onChange={(e) => set("budgetMax", e.target.value)} placeholder="e.g. 12 lakh" className={field} />
        </div>
        <Select label="Venue" value={f.venueStyle} onChange={(v) => set("venueStyle", v)} options={VENUE_OPTIONS} />
        <Select label="Number of functions" value={f.functions} onChange={(v) => set("functions", v)} options={FUNCTION_OPTIONS} />
        <Select label="Menu" value={f.menu} onChange={(v) => set("menu", v)} options={MENU_OPTIONS} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={notesId} className="text-sm font-medium text-ink">
          Anything else
        </label>
        <textarea id={notesId} value={f.notes} onChange={(e) => set("notes", e.target.value)} maxLength={300} rows={2} className={field} />
      </div>
      <div>
        <button type="submit" disabled={busy} className="rounded-full border border-maroon px-5 py-2.5 font-medium text-maroon hover:bg-maroon/5 disabled:opacity-50">
          Add this person
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-increased">
          {error}
        </p>
      )}
    </form>
  );
}
