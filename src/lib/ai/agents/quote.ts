import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { amountsAreGrounded } from "@/lib/ai/agents/explainer";
import { AIError } from "@/lib/ai/errors";
import { NEGOTIATION_PROMPT_V1, QUOTE_EXTRACTION_PROMPT_V1 } from "@/lib/ai/prompts/quote";
import { callStructured, type CallStructuredOptions } from "@/lib/ai/structured";
import { CATEGORY_LABELS } from "@/lib/labels";
import { negotiationFacts, type QuoteAnalysis } from "@/lib/rules/quote-analysis";
import type { BudgetCategory } from "@/lib/schemas/enums";
import { NegotiationDraft, QuoteExtraction } from "@/lib/schemas/quote";

/**
 * Quote X-Ray agents: vision extraction (smart) and the negotiation message (fast).
 * PDFs are sent as native document blocks and images as image blocks, so scanned quotes work
 * and no PDF-parsing dependency is needed.
 */

export const QUOTE_MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
export type QuoteMediaType = (typeof QUOTE_MEDIA_TYPES)[number];

export interface QuoteFile {
  mediaType: QuoteMediaType;
  /** Base64 file contents, without a data: prefix. */
  base64: string;
}

export interface QuoteDeps {
  extract: (opts: CallStructuredOptions<typeof QuoteExtraction>) => Promise<QuoteExtraction>;
  negotiate: (opts: CallStructuredOptions<typeof NegotiationDraft>) => Promise<NegotiationDraft>;
}

const defaultDeps: QuoteDeps = { extract: (o) => callStructured(o), negotiate: (o) => callStructured(o) };

function fileBlock(file: QuoteFile): Anthropic.Beta.BetaContentBlockParam {
  return file.mediaType === "application/pdf"
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: file.base64 } }
    : { type: "image", source: { type: "base64", media_type: file.mediaType, data: file.base64 } };
}

export async function extractQuote(
  file: QuoteFile,
  ctx: { category: BudgetCategory; fixtureKey?: string },
  deps: QuoteDeps = defaultDeps,
): Promise<QuoteExtraction> {
  return deps.extract({
    schema: QuoteExtraction,
    name: "emit_quote_extraction",
    fixtureKey: ctx.fixtureKey ?? `emit_quote_extraction.${ctx.category}`,
    model: "smart",
    system: QUOTE_EXTRACTION_PROMPT_V1,
    messages: [
      {
        role: "user",
        content: [fileBlock(file), { type: "text", text: `This is a quote for ${CATEGORY_LABELS[ctx.category].toLowerCase()}. Transcribe it.` }],
      },
    ],
  });
}

/** Deterministic fallback when the model fails or writes an amount that isn't in the facts. */
export function fallbackNegotiation(a: QuoteAnalysis): string {
  const asks = a.flags.filter((f) => f.severity !== "info").slice(0, 4).map((f) => `- ${f.detail}`);
  return [
    `Namaste${a.vendorName ? ` ${a.vendorName} ji` : " Ji"},`,
    "Thank you for the quotation. Before we confirm, could you please help with a few points:",
    ...asks,
    "Could you also share your best possible rate?",
    "Looking forward to your revised quote. Thank you!",
  ].join("\n");
}

export async function draftNegotiation(
  analysis: QuoteAnalysis,
  ctx: { guestCount: number; eventLabel: string },
  deps: QuoteDeps = defaultDeps,
): Promise<string> {
  const facts = negotiationFacts(analysis, ctx);
  try {
    const { message } = await deps.negotiate({
      schema: NegotiationDraft,
      name: "emit_negotiation",
      fixtureKey: `emit_negotiation.${analysis.category}`,
      model: "fast",
      maxTokens: 2000,
      system: NEGOTIATION_PROMPT_V1,
      messages: [{ role: "user", content: facts }],
    });
    return amountsAreGrounded(message, facts) ? message.trim() : fallbackNegotiation(analysis);
  } catch (err) {
    if (err instanceof AIError) return fallbackNegotiation(analysis);
    throw err;
  }
}
