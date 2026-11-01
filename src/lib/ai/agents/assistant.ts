import "server-only";
import { ASSISTANT_PROMPT_V2 } from "@/lib/ai/prompts/assistant";
import { callStructured, type CallStructuredOptions } from "@/lib/ai/structured";
import { assistantContext, finalizeAssistant, type AssistantResponse } from "@/lib/plan/assistant-view";
import type { EventPlan } from "@/lib/plan/types";
import type { ISODate } from "@/lib/rules/dates";
import { AssistantDraft, type AssistantRequest } from "@/lib/schemas/assistant";

/** Event assistant (fast): understands a free-text message. Saved answers cover the suggested questions. */

export interface AssistantDeps {
  structured: (opts: CallStructuredOptions<typeof AssistantDraft>) => Promise<AssistantDraft>;
}

const defaultDeps: AssistantDeps = { structured: (opts) => callStructured(opts) };

export const messageSlug = (message: string) =>
  message.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

export async function askAssistant(state: EventPlan, request: AssistantRequest, ctx: { eventId: string; today: ISODate }, deps: AssistantDeps = defaultDeps): Promise<AssistantResponse> {
  const conversation = request.history.map((turn) => `${turn.role === "user" ? "Family" : "Utsav"}: ${turn.text}`).join("\n");
  const draft = await deps.structured({
    schema: AssistantDraft,
    name: "emit_assistant",
    fixtureKey: `emit_assistant.${messageSlug(request.message)}`,
    model: "fast",
    maxTokens: 2000,
    timeoutMs: 45_000,
    system: ASSISTANT_PROMPT_V2,
    messages: [
      {
        role: "user",
        content: [`Plan facts:\n${assistantContext(state, ctx.today)}`, conversation ? `Recent conversation:\n${conversation}` : null, `Latest message: ${request.message}`].filter(Boolean).join("\n\n"),
      },
    ],
  });
  return finalizeAssistant(draft, state, ctx.eventId, ctx.today);
}
