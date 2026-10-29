import { z } from "zod";
import { BUDGET_UNITS } from "@/lib/schemas/enums";

/**
 * Vendor Quote X-Ray (CLAUDE.md F4). The model *transcribes* what's printed on the quote
 * (amounts in rupees, as written); code does every check and comparison.
 */

export const QuoteUnit = z.enum([...BUDGET_UNITS, "other"]);
export type QuoteUnit = z.infer<typeof QuoteUnit>;

export const QuoteLineItem = z.object({
  description: z.string().min(1).max(200),
  quantity: z.number().nonnegative().nullable(),
  /** How the item is charged, mapped to Utsav's units where possible ("other" otherwise). */
  unit: QuoteUnit,
  /** As printed, in rupees; null when the quote gives none ("as per actuals"). */
  unitPriceRupees: z.number().nonnegative().nullable(),
  amountRupees: z.number().nonnegative().nullable(),
  notes: z.string().max(200).optional(),
});
export type QuoteLineItem = z.infer<typeof QuoteLineItem>;

export const QuoteExtraction = z.object({
  vendorName: z.string().max(120).nullable(),
  lineItems: z.array(QuoteLineItem).min(1).max(60),
  statedSubtotalRupees: z.number().nonnegative().nullable(),
  statedTotalRupees: z.number().nonnegative().nullable(),
  gst: z.object({
    status: z.enum(["included", "extra", "not_mentioned"]),
    percent: z.number().min(0).max(28).nullable(),
  }),
  /** Wording that hides or defers cost, quoted from the document. */
  hiddenCosts: z.array(z.object({ quote: z.string().min(1).max(160), concern: z.string().min(1).max(200) })).max(10),
  /** Things usually included for this kind of vendor that the quote doesn't mention. */
  missingItems: z.array(z.object({ item: z.string().min(1).max(80), why: z.string().min(1).max(160) })).max(8),
  /** Payment, cancellation and overtime terms as written. */
  terms: z.array(z.string().min(1).max(200)).max(8),
});
export type QuoteExtraction = z.infer<typeof QuoteExtraction>;

export const NegotiationDraft = z.object({ message: z.string().min(1).max(1200) });
export type NegotiationDraft = z.infer<typeof NegotiationDraft>;
