import "server-only";
import { z } from "zod";
import { AIError } from "@/lib/ai/errors";
import { EXPLAINER_PROMPT_V1 } from "@/lib/ai/prompts/explainer";
import { callStructured, type CallStructuredOptions } from "@/lib/ai/structured";
import { formatINRCompact, formatINRDelta } from "@/lib/format";
import type { PlanChange } from "@/lib/graph/types";
import type { PlanDiff } from "@/lib/schemas/diff";

/**
 * Explainer (fast model): turns a cascade's facts into a friendly 2–4 sentence summary.
 * Falls back to the deterministic `diff.explanation` if the model fails, or if it mentions any
 * rupee amount that wasn't in the facts (rule 1: the LLM never does maths).
 */

export const Explanation = z.object({ explanation: z.string().min(1).max(700) });
export type Explanation = z.infer<typeof Explanation>;

export interface ExplainerDeps {
  structured: (opts: CallStructuredOptions<typeof Explanation>) => Promise<Explanation>;
}

const defaultDeps: ExplainerDeps = { structured: (opts) => callStructured(opts) };

export interface ExplainInput {
  trigger: PlanChange;
  diff: PlanDiff;
  totalEstimatePaise: number;
  budgetTotalPaise: number;
  overBudgetPaise: number;
}

/** The facts the model sees, with every amount already formatted. */
export function explainerFacts(input: ExplainInput): string {
  const { trigger, diff } = input;
  const lines = diff.changed.filter((c) => c.nodeId.startsWith("line:"));
  const facts = [
    `Change: ${trigger.field.replace(/_/g, " ")} from ${String(trigger.from)} to ${String(trigger.value)}.`,
    `Deterministic summary: ${diff.explanation}`,
    `Cost change: ${formatINRDelta(diff.budgetDeltaPaise)}. New estimate: ${formatINRCompact(input.totalEstimatePaise)}. Budget: ${formatINRCompact(input.budgetTotalPaise)}.`,
    input.overBudgetPaise > 0 ? `Over budget by ${formatINRCompact(input.overBudgetPaise)}.` : "Within budget.",
    lines.length ? `Items recalculated: ${lines.map((l) => `${l.label} (${l.reason})`).join("; ")}.` : "No budget items recalculated.",
    diff.conflicts.length ? `Problems: ${diff.conflicts.map((c) => c.message).join(" ")}` : "No problems.",
    diff.recoveryOptions.length
      ? `Recovery options: ${diff.recoveryOptions.map((o) => `"${o.title}" — ${o.impact}`).join(" ")}`
      : "No recovery options.",
  ];
  return facts.join("\n");
}

const AMOUNT = /[+−-]?₹[\d,.]+(?:K|L|Cr)?/g;
const normalise = (s: string) => s.replace(/^[+−-]/, "");

/** True if every rupee amount in `text` appears in `facts`. */
export function amountsAreGrounded(text: string, facts: string): boolean {
  const allowed = new Set((facts.match(AMOUNT) ?? []).map(normalise));
  return (text.match(AMOUNT) ?? []).every((a) => allowed.has(normalise(a)));
}

export async function explainChange(input: ExplainInput, deps: ExplainerDeps = defaultDeps): Promise<string> {
  const facts = explainerFacts(input);
  try {
    const { explanation } = await deps.structured({
      schema: Explanation,
      name: "emit_explanation",
      fixtureKey: `emit_explanation.${input.trigger.field}`,
      model: "fast",
      maxTokens: 2000,
      system: EXPLAINER_PROMPT_V1,
      messages: [{ role: "user", content: facts }],
    });
    return amountsAreGrounded(explanation, facts) ? explanation.trim() : input.diff.explanation;
  } catch (err) {
    if (err instanceof AIError) return input.diff.explanation;
    throw err;
  }
}
