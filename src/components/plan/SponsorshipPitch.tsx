"use client";

import { HandCoins, Loader2 } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { CopyButton } from "@/components/plan/CopyButton";
import { formatINR, parseINR } from "@/lib/format";
import type { PitchView } from "@/lib/rules/sponsorship";
import { SponsorshipInput } from "@/lib/schemas/community";

const CONTROL =
  "w-full rounded-xl border border-line bg-white px-3 py-2.5 text-ink focus:border-maroon focus:outline-none";

interface SponsorshipPitchProps {
  eventId: string;
  saved: SponsorshipInput | null;
  pitch: PitchView | null;
  demoMode: boolean;
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>
      <input
        id={id}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={`${CONTROL} placeholder:text-muted/70`}
      />
    </div>
  );
}

/** Asks local businesses for support: the tiers come from code, the wording from the Sponsorship agent. */
export function SponsorshipPitch({ eventId, saved, pitch: initial, demoMode }: SponsorshipPitchProps) {
  const [pitch, setPitch] = useState(initial);
  const [organiser, setOrganiser] = useState(saved?.organiser ?? "");
  const [contact, setContact] = useState(saved?.contact ?? "");
  const [target, setTarget] = useState(saved ? formatINR(saved.targetPaise) : "");
  const [cause, setCause] = useState(saved?.cause ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const causeId = useId();

  async function write(e: FormEvent) {
    e.preventDefault();
    const parsed = SponsorshipInput.safeParse({ organiser, contact, cause, targetPaise: parseINR(target) });
    if (!parsed.success) return setError("Fill in every box. The amount needs to be at least ₹1,000.");

    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/events/${eventId}/sponsorship`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const body = (await res.json().catch(() => null)) as { pitch?: PitchView; error?: { message?: string } } | null;
      if (res.ok && body?.pitch) setPitch(body.pitch);
      else setError(body?.error?.message ?? "Couldn't generate that — try again.");
    } catch {
      setError("Couldn't reach Utsav — check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-labelledby="sponsors-title"
      className="flex flex-col gap-4 rounded-2xl border border-line bg-white p-5"
    >
      <div>
        <h2 id="sponsors-title" className="font-display text-xl text-maroon">
          Sponsors
        </h2>
        <p className="mt-1 text-sm text-muted">Tell us what you need, and get a message to send local businesses.</p>
        {demoMode && (
          <p className="mt-2 text-sm text-muted">
            Demo mode uses saved sample wording. The amounts and event details are still your own.
          </p>
        )}
      </div>

      <form onSubmit={(e) => void write(e)} className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Organised by"
            value={organiser}
            onChange={setOrganiser}
            placeholder="e.g. Green Park Residents' Association"
          />
          <Field
            label="How sponsors reach you"
            value={contact}
            onChange={setContact}
            placeholder="Name and phone number"
          />
          <Field label="Amount to raise" value={target} onChange={setTarget} placeholder="e.g. ₹2L" />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={causeId} className="text-sm font-medium text-ink">
            What the money pays for
          </label>
          <textarea
            id={causeId}
            rows={2}
            maxLength={300}
            value={cause}
            onChange={(e) => setCause(e.target.value)}
            placeholder="e.g. The stage, sound system and a free community meal"
            className={`${CONTROL} placeholder:text-muted/70`}
          />
        </div>
        <div>
          <button
            type="submit"
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-full bg-maroon px-5 py-2.5 font-medium text-cream hover:bg-maroon-dark disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <HandCoins className="size-4" aria-hidden />
            )}
            {busy ? "Writing…" : pitch ? "Write it again" : "Write the pitch"}
          </button>
        </div>
        {error && (
          <p role="alert" className="text-sm text-increased">
            {error}
          </p>
        )}
      </form>

      {pitch && (
        <div className="flex flex-col gap-3 border-t border-line pt-4">
          <ul aria-label="Sponsorship tiers" className="flex flex-col">
            {pitch.tiers.map((t) => (
              <li key={t.key} className="flex justify-between gap-3 border-b border-line py-1.5 text-sm last:border-0">
                <span className="text-ink">
                  {t.name} × {t.slots}
                </span>
                <span className="font-medium text-ink tabular-nums">{formatINR(t.amountPaise)}</span>
              </li>
            ))}
          </ul>
          <p className="text-sm text-muted">
            Raises {formatINR(pitch.totalPaise)} if every place is taken. The amounts are a suggested split, so change
            them if you know your sponsors.
          </p>
          <p className="whitespace-pre-wrap rounded-xl bg-cream p-4 text-sm text-ink">{pitch.message}</p>
          <details className="text-sm">
            <summary className="cursor-pointer font-medium text-marigold-ink">Why?</summary>
            <p className="mt-1 text-muted">{pitch.rationale}</p>
          </details>
          <p className="text-sm text-muted">Before sending, check you can deliver every perk listed.</p>
          <CopyButton text={pitch.message} label="Copy message" />
        </div>
      )}
    </section>
  );
}
