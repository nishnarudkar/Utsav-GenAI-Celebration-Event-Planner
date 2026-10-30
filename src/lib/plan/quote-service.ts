import "server-only";
import { draftNegotiation, extractQuote, type QuoteDeps, type QuoteFile } from "@/lib/ai/agents/quote";
import { getPricing } from "@/lib/kb/pricing";
import type { EventRepository } from "@/lib/plan/event-repo";
import type { StoredQuote } from "@/lib/plan/types";
import { analyzeQuote } from "@/lib/rules/quote-analysis";
import type { BudgetCategory } from "@/lib/schemas/enums";

/** Quote X-Ray pipeline: extract (AI) → analyse (code) → draft a message (AI) → store. */
export async function checkQuote(
  repo: EventRepository,
  id: string,
  input: { file: QuoteFile; fileName: string; category: BudgetCategory },
  deps?: QuoteDeps,
): Promise<StoredQuote | null> {
  const event = await repo.get(id);
  if (!event) return null;

  const extraction = await extractQuote(input.file, { category: input.category }, deps);
  const analysis = analyzeQuote(extraction, { category: input.category, cityTier: event.cityTier, benchmarkRows: getPricing().rows });
  const negotiationMessage = await draftNegotiation(analysis, { guestCount: event.answers.guestCount, eventLabel: event.title }, deps);
  return repo.addQuote(id, { fileName: input.fileName, analysis, negotiationMessage });
}
