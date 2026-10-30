"use client";

import { FileSearch, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, type FormEvent } from "react";
import { CATEGORY_LABELS } from "@/lib/labels";
import { MAX_QUOTE_BYTES } from "@/lib/rules/quote-file";
import { BUDGET_CATEGORIES, type BudgetCategory } from "@/lib/schemas/enums";

const SAMPLE_URL = "/samples/sample-caterer-quote.pdf";

/** Upload a quote photo or PDF, or try the sample. */
export function QuoteUploader({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [category, setCategory] = useState<BudgetCategory>("catering");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const categoryId = useId();
  const fileId = useId();

  async function send(file: File, cat: BudgetCategory) {
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("category", cat);
      const res = await fetch(`/api/events/${eventId}/quotes`, { method: "POST", body: form });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        setError(body?.error?.message ?? "Couldn't check that quote — try again.");
        return;
      }
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    } catch {
      setError("Couldn't reach Utsav — check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return setError("Choose a photo or PDF of the quote first.");
    if (file.size > MAX_QUOTE_BYTES) return setError("That file is too big. Quotes can be up to 10 MB.");
    void send(file, category);
  }

  async function trySample() {
    setBusy(true);
    setError(null);
    try {
      const blob = await (await fetch(SAMPLE_URL)).blob();
      await send(new File([blob], "sample-caterer-quote.pdf", { type: "application/pdf" }), "catering");
    } catch {
      setBusy(false);
      setError("Couldn't load the sample quote — try again.");
    }
  }

  return (
    <section aria-label="Check a quote" className="rounded-2xl border border-line bg-white p-5">
      <h2 className="font-display text-xl text-maroon">Quote X-Ray</h2>
      <p className="mt-1 text-sm text-muted">Upload a vendor&apos;s quote. Utsav checks the sums, spots hidden costs and drafts a polite reply.</p>
      <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={categoryId} className="text-sm font-medium text-ink">
            Vendor type
          </label>
          <select
            id={categoryId}
            value={category}
            onChange={(e) => setCategory(e.target.value as BudgetCategory)}
            className="rounded-xl border border-line bg-white px-3 py-2.5 text-ink focus:border-maroon focus:outline-none"
          >
            {BUDGET_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={fileId} className="text-sm font-medium text-ink">
            Photo or PDF (up to 10 MB)
          </label>
          <input
            ref={fileRef}
            id={fileId}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            className="w-full text-sm text-muted file:mr-3 file:rounded-full file:border file:border-maroon file:bg-white file:px-4 file:py-2 file:text-sm file:font-medium file:text-maroon"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-full bg-maroon px-5 py-2.5 font-medium text-cream hover:bg-maroon-dark disabled:opacity-50"
          >
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <FileSearch className="size-4" aria-hidden />}
            {busy ? "Checking…" : "Check this quote"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void trySample()}
            className="rounded-full border border-maroon px-5 py-2.5 font-medium text-maroon hover:bg-maroon/5 disabled:opacity-50"
          >
            Try the sample quote
          </button>
        </div>
        {error && (
          <p role="alert" className="text-sm text-increased">
            {error}
          </p>
        )}
      </form>
    </section>
  );
}
