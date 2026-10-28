import "server-only";
import { createLocalRetriever, type RetrievedChunk, type Retriever } from "@/lib/ai/rag";
import { CULTURE_PROMPT_V1, renderKbExcerpts } from "@/lib/ai/prompts/culture";
import { callStructured, type CallStructuredOptions } from "@/lib/ai/structured";
import type { Culture, EventType } from "@/lib/schemas/enums";
import { RitualPlan } from "@/lib/schemas/ritual";

/**
 * Culture agent: retrieves KB excerpts for the tradition and asks the model for an ordered
 * RitualPlan. Grounding is enforced in code as well as in the prompt:
 * cited sources must be excerpts we actually supplied, and with none, confidence is "low".
 */

export interface CultureInput {
  culture: Culture;
  eventType: EventType;
  /** Free-text family notes, e.g. "skip Bashor Raat, combine Aashirbaad for both sides". */
  notes?: string;
}

export interface CultureDeps {
  retrieve: Retriever;
  structured: (opts: CallStructuredOptions<typeof RitualPlan>) => Promise<RitualPlan>;
}

/** Enough to cover a full wedding sequence (the largest KB doc has 16 chunks). */
const RITUAL_K = 24;

let defaultDeps: CultureDeps | undefined;
function getDefaultDeps(): CultureDeps {
  defaultDeps ??= { retrieve: createLocalRetriever(), structured: (opts) => callStructured(opts) };
  return defaultDeps;
}

export async function generateRitualPlan(input: CultureInput, deps: CultureDeps = getDefaultDeps()): Promise<RitualPlan> {
  const chunks = await deps.retrieve(
    `${input.culture.replace(/_/g, " ")} ${input.eventType} rituals sequence ${input.notes ?? ""}`,
    { culture: input.culture, eventType: input.eventType, docType: "ritual" },
    RITUAL_K,
  );

  const plan = await deps.structured({
    schema: RitualPlan,
    name: "emit_ritual_plan",
    fixtureKey: `emit_ritual_plan.${input.culture}.${input.eventType}`,
    model: "smart",
    system: [
      { type: "text", text: CULTURE_PROMPT_V1, cache_control: { type: "ephemeral" } },
      // Excerpts are fixed per (culture, event type), so they cache well too.
      { type: "text", text: renderKbExcerpts(chunks), cache_control: { type: "ephemeral" } },
    ],
    messages: [{ role: "user", content: userMessage(input) }],
  });

  return enforceGrounding(plan, chunks);
}

function userMessage(input: CultureInput): string {
  const lines = [
    `Tradition: ${input.culture.replace(/_/g, " ")}`,
    `Event type: ${input.eventType}`,
    input.notes?.trim() ? `Family notes: ${input.notes.trim()}` : "Family notes: none",
    "Produce the ritual plan.",
  ];
  return lines.join("\n");
}

/**
 * Keep only citations of excerpts we supplied, renumber order 1..n, and downgrade confidence
 * to "low" when nothing valid is cited (CLAUDE.md §7.1 rule 3).
 */
export function enforceGrounding(plan: RitualPlan, chunks: readonly RetrievedChunk[]): RitualPlan {
  const supplied = new Set(chunks.map((c) => c.id));
  const sources = [...new Set(plan.sources.filter((s) => supplied.has(s)))];
  const rituals = [...plan.rituals].sort((a, b) => a.order - b.order).map((r, i) => ({ ...r, order: i + 1 }));
  const confidence = sources.length === 0 ? "low" : plan.confidence;
  return { rituals, sources, confidence };
}
