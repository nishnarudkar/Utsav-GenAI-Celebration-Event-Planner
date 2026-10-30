import { CopyButton } from "@/components/plan/CopyButton";
import { IssueList } from "@/components/plan/IssueList";
import { formatINR } from "@/lib/format";
import { CATEGORY_LABELS } from "@/lib/labels";
import type { StoredQuote } from "@/lib/plan/types";

const GST_NOTE = { included: "GST included", extra: "plus GST", not_mentioned: "GST not mentioned" } as const;

/** One checked quote: total, flags, the line-by-line check, terms and the negotiation draft. */
export function QuoteCard({ quote }: { quote: StoredQuote }) {
  const { analysis: a } = quote;
  const total = a.totalWithGstPaise;

  return (
    <article className="flex flex-col gap-4 rounded-2xl border border-line bg-white p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-lg text-maroon">{a.vendorName ?? "Quote"}</h3>
          <p className="text-xs text-muted">
            {CATEGORY_LABELS[a.category]} · {quote.fileName}
          </p>
        </div>
        <p className="text-right">
          <span className="block font-medium tabular-nums text-ink">{formatINR(total)}</span>
          <span className="text-xs text-muted">{a.gst.amountPaise !== null ? "including GST" : GST_NOTE[a.gst.status]}</span>
        </p>
      </header>

      <IssueList issues={a.flags} />

      <details className="text-sm">
        <summary className="cursor-pointer font-medium text-ink">Line-by-line check ({a.lines.length})</summary>
        <ul className="mt-2 flex flex-col divide-y divide-line">
          {a.lines.map((l, i) => (
            <li key={`${l.description}-${i}`} className="flex items-start justify-between gap-3 py-2">
              <span>
                <span className="text-ink">{l.description}</span>
                {l.benchmark && (
                  <span className="block text-xs text-muted">
                    {l.benchmark.diffPercent === 0
                      ? "At the typical rate"
                      : `${Math.abs(l.benchmark.diffPercent)}% ${l.benchmark.diffPercent > 0 ? "above" : "below"} the typical ${formatINR(l.benchmark.midPaise)}`}
                  </span>
                )}
                {l.arithmeticOk === false && <span className="block text-xs text-increased">Doesn&apos;t add up</span>}
              </span>
              <span className="shrink-0 tabular-nums text-ink">
                {l.amountPaise === null ? "No price" : l.amountPaise === 0 ? (l.notes ?? "Included") : formatINR(l.amountPaise)}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-1 text-xs text-muted">Typical rates are indicative estimates.</p>
      </details>

      {a.terms.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer font-medium text-ink">Terms ({a.terms.length})</summary>
          <ul className="mt-2 list-disc pl-5 text-muted">
            {a.terms.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </details>
      )}

      <div className="flex flex-col gap-2">
        <h4 className="text-sm font-medium text-ink">Draft message to the vendor</h4>
        <p className="whitespace-pre-wrap rounded-xl bg-cream p-3 text-sm text-ink">{quote.negotiationMessage}</p>
        <div>
          <CopyButton text={quote.negotiationMessage} label="Copy message" />
        </div>
      </div>
    </article>
  );
}
