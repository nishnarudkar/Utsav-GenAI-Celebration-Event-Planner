"use client";

import { Loader2, Palette } from "lucide-react";
import { useId, useRef, useState, type FormEvent } from "react";
import { CopyButton } from "@/components/plan/CopyButton";
import { MAX_VIBE_IMAGE_BYTES, MAX_VIBE_IMAGES, readableTextOn } from "@/lib/rules/vibe-file";
import type { VibeProfile } from "@/lib/schemas/vibe";

const SAMPLE_NOTES = "Classic and warm: deep red, ivory and marigold, with lots of fresh flowers.";

interface VibePanelProps {
  eventId: string;
  vibe: VibeProfile | null;
  demoMode: boolean;
}

/** Upload inspiration photos or describe a look, and see the look Utsav builds from them. */
export function VibePanel({ eventId, vibe: initial, demoMode }: VibePanelProps) {
  const [vibe, setVibe] = useState(initial);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const fileId = useId();
  const notesId = useId();

  async function send(text: string, images: File[]) {
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("notes", text);
      for (const image of images) form.append("images", image);
      const res = await fetch(`/api/events/${eventId}/vibe`, { method: "POST", body: form });
      const body = (await res.json().catch(() => null)) as { vibe?: VibeProfile; error?: { message?: string } } | null;
      if (res.ok && body?.vibe) setVibe(body.vibe);
      else setError(body?.error?.message ?? "Couldn't generate that — try again.");
    } catch {
      setError("Couldn't reach Utsav — check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const images = [...(fileRef.current?.files ?? [])];
    if (images.length === 0 && !notes.trim()) return setError("Add a photo, or describe the look you want.");
    if (images.length > MAX_VIBE_IMAGES) return setError(`Choose up to ${MAX_VIBE_IMAGES} photos.`);
    if (images.some((f) => f.size > MAX_VIBE_IMAGE_BYTES)) return setError("Each photo can be up to 5 MB.");
    void send(notes, images);
  }

  return (
    <div className="flex flex-col gap-5">
      <section aria-labelledby="vibe-title" className="rounded-2xl border border-line bg-white p-5">
        <h2 id="vibe-title" className="font-display text-xl text-maroon">
          Look &amp; feel
        </h2>
        <p className="mt-1 text-sm text-muted">Share photos you love, or describe them. Utsav turns them into colours, décor ideas and search terms.</p>
        {demoMode && <p className="mt-2 text-sm text-muted">Demo mode shows a saved sample look. It doesn&apos;t read your photos or notes.</p>}

        <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={fileId} className="text-sm font-medium text-ink">
              Photos (up to {MAX_VIBE_IMAGES}, 5 MB each)
            </label>
            <input
              ref={fileRef}
              id={fileId}
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp"
              className="w-full text-sm text-muted file:mr-3 file:rounded-full file:border file:border-maroon file:bg-white file:px-4 file:py-2 file:text-sm file:font-medium file:text-maroon"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={notesId} className="text-sm font-medium text-ink">
              Anything to add?
            </label>
            <textarea
              id={notesId}
              rows={2}
              maxLength={300}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Pastel colours, lots of fairy lights"
              className="w-full rounded-xl border border-line bg-white px-3 py-2.5 text-ink placeholder:text-muted/70 focus:border-maroon focus:outline-none"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-full bg-maroon px-5 py-2.5 font-medium text-cream hover:bg-maroon-dark disabled:opacity-50"
            >
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Palette className="size-4" aria-hidden />}
              {busy ? "Working on it…" : vibe ? "Make a new look" : "Find our look"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void send(SAMPLE_NOTES, [])}
              className="rounded-full border border-maroon px-5 py-2.5 font-medium text-maroon hover:bg-maroon/5 disabled:opacity-50"
            >
              Try a sample look
            </button>
          </div>
          {error && (
            <p role="alert" className="text-sm text-increased">
              {error}
            </p>
          )}
        </form>
      </section>

      {vibe ? (
        <VibeResult vibe={vibe} />
      ) : (
        <p className="rounded-2xl border border-dashed border-line p-5 text-sm text-muted">Your look will appear here, ready to share with your decorator.</p>
      )}
    </div>
  );
}

function VibeResult({ vibe }: { vibe: VibeProfile }) {
  return (
    <section aria-labelledby="vibe-theme" className="flex flex-col gap-4 rounded-2xl border border-line bg-white p-5">
      <div>
        <h2 id="vibe-theme" className="font-display text-2xl text-maroon">
          {vibe.theme}
        </h2>
        <p className="mt-1 text-sm text-muted">{vibe.keywords.join(" · ")}</p>
        <details className="mt-1 text-sm">
          <summary className="cursor-pointer font-medium text-marigold-ink">Why?</summary>
          <p className="mt-1 text-muted">{vibe.rationale}</p>
        </details>
      </div>

      <ul aria-label="Colour palette" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {vibe.palette.map((c) => (
          <li key={c.hex} style={{ backgroundColor: c.hex, color: readableTextOn(c.hex) }} className="rounded-xl border border-line p-3 text-sm">
            <span className="block font-medium">{c.name}</span>
            <span className="block text-xs uppercase">{c.hex}</span>
          </li>
        ))}
      </ul>

      <div>
        <h3 className="text-sm font-semibold text-ink">Décor ideas</h3>
        <ul className="mt-1 flex flex-col">
          {vibe.decor.map((d) => (
            <li key={d.item} className="flex flex-wrap justify-between gap-x-3 border-b border-line py-1.5 text-sm last:border-0">
              <span className="text-ink">{d.item}</span>
              <span className="text-muted">{d.where}</span>
            </li>
          ))}
        </ul>
      </div>

      {vibe.attire.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-ink">What to wear</h3>
          <ul className="mt-1 list-disc pl-5 text-sm text-ink">
            {vibe.attire.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-col items-start gap-2">
        <h3 className="text-sm font-semibold text-ink">Search for vendors with</h3>
        <ul className="flex flex-wrap gap-1.5">
          {vibe.vendorSearchTerms.map((t) => (
            <li key={t} className="rounded-full bg-cream px-3 py-1 text-sm text-ink">
              {t}
            </li>
          ))}
        </ul>
        <CopyButton text={vibe.vendorSearchTerms.join("\n")} label="Copy search terms" />
      </div>
    </section>
  );
}
