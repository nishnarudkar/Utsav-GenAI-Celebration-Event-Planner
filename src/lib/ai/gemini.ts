import "server-only";
import { z } from "zod";
import type { Env, ModelTier } from "@/lib/ai/client";
import { AIProviderError } from "@/lib/ai/errors";
import type { MessageParam, SystemBlock } from "@/lib/ai/structured";

/**
 * Gemini adapter for callStructured, over the REST Interactions API with plain fetch, so no extra
 * dependency. Agents keep writing Anthropic-shaped messages; this translates them. `store: false`
 * keeps Google from holding the conversation for later retrieval. See docs/DECISIONS.md.
 */

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";
const TIMEOUT_MS = 120_000;
const MAX_RETRIES = 3;
const MAX_RETRY_DELAY_MS = 30_000;
const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);
/** Google's 429 for a used-up daily allowance, which retrying can't help. */
const DAILY_LIMIT = /per day|daily/i;
const LIMIT_KEYWORDS = ["pattern", "minLength", "maxLength", "minItems", "maxItems", "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum"] as const;

const DEFAULT_MODELS: Record<ModelTier, string> = {
  smart: "gemini-3.6-flash",
  fast: "gemini-3.5-flash-lite",
};

export function resolveGeminiModel(tier: ModelTier, env: Env = process.env): string {
  const fromEnv = tier === "smart" ? env.GEMINI_MODEL_SMART : env.GEMINI_MODEL_FAST;
  return fromEnv?.trim() || DEFAULT_MODELS[tier];
}

type GeminiPart = { type: "text"; text: string } | { type: "image" | "document"; data: string; mime_type: string };

export function toGeminiParts(messages: readonly MessageParam[]): GeminiPart[] {
  return messages.flatMap((message) => {
    if (typeof message.content === "string") return [{ type: "text" as const, text: message.content }];
    return (message.content ?? []).map((block): GeminiPart => {
      if (block.type === "text") return { type: "text", text: block.text };
      if ((block.type === "image" || block.type === "document") && block.source.type === "base64") {
        return { type: block.type, data: block.source.data, mime_type: block.source.media_type };
      }
      throw new RangeError(`Gemini adapter can't send a "${block.type}" block`);
    });
  });
}

export function toGeminiSystem(system: string | readonly SystemBlock[]): string {
  return typeof system === "string" ? system : system.map((block) => block.text).join("\n\n");
}

/**
 * JSON schema for `response_format`: shape only. Definitions are inlined and limits dropped, because
 * Gemini rejects bounded schemas as having "too many states" (the budget's did). Zod still enforces
 * the full schema locally, and a reply outside the limits gets the usual corrective retry.
 */
export function toGeminiSchema(schema: z.ZodType): Record<string, unknown> {
  const { $schema: _dialect, ...json } = z.toJSONSchema(schema, {
    reused: "inline",
    override: ({ jsonSchema }) => {
      for (const limit of LIMIT_KEYWORDS) delete jsonSchema[limit];
    },
  });
  return json;
}

export interface GeminiRequest {
  outputName: string;
  model: string;
  system: string | readonly SystemBlock[];
  messages: readonly MessageParam[];
  schema: z.ZodType;
  maxOutputTokens: number;
  effort?: "low" | "medium" | "high";
}

export interface GeminiReply {
  text: string;
  cutOff: boolean;
}

export interface GeminiDeps {
  apiKey: string | undefined;
  fetch: typeof fetch;
  sleep: (ms: number) => Promise<void>;
}

interface Interaction {
  status?: string;
  steps?: { type?: string; content?: { type?: string; text?: string }[] }[];
}

function replyFrom(outputName: string, interaction: Interaction): GeminiReply {
  if (interaction.status !== "completed" && interaction.status !== "incomplete") {
    throw new AIProviderError(outputName, null, `interaction ended as ${interaction.status ?? "unknown"}`);
  }
  // Earlier steps may be thoughts or drafts; the answer is the last model output.
  const output = interaction.steps?.findLast((step) => step.type === "model_output");
  const text = (output?.content ?? []).flatMap((part) => (part.type === "text" && part.text ? [part.text] : [])).join("");
  return { text, cutOff: interaction.status === "incomplete" };
}

async function errorDetail(res: Response): Promise<string> {
  const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
  return body?.error?.message?.slice(0, 300) ?? res.statusText;
}

const retryAfterMs = (res: Response | null) => Number(res?.headers.get("retry-after") ?? 0) * 1000 || 0;

function retryDelay(attempt: number, res: Response | null): number {
  return retryAfterMs(res) || 1000 * 2 ** attempt;
}

export async function generateGemini(req: GeminiRequest, deps: GeminiDeps): Promise<GeminiReply> {
  if (!deps.apiKey) throw new AIProviderError(req.outputName, null, "GEMINI_API_KEY is not set");

  const body = JSON.stringify({
    model: req.model,
    system_instruction: toGeminiSystem(req.system),
    input: toGeminiParts(req.messages),
    response_format: { type: "text", mime_type: "application/json", schema: toGeminiSchema(req.schema) },
    generation_config: { max_output_tokens: req.maxOutputTokens, ...(req.effort ? { thinking_level: req.effort } : {}) },
    store: false,
  });

  for (let attempt = 0; ; attempt++) {
    let res: Response | null = null;
    let failure: AIProviderError;
    try {
      res = await deps.fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": deps.apiKey },
        body,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.ok) return replyFrom(req.outputName, (await res.json()) as Interaction);
      const detail = await errorDetail(res);
      failure = new AIProviderError(req.outputName, res.status, detail, { dailyLimit: DAILY_LIMIT.test(detail) });
      if (!RETRYABLE.has(res.status) || failure.dailyLimit || retryAfterMs(res) > MAX_RETRY_DELAY_MS) throw failure;
    } catch (err) {
      if (err instanceof AIProviderError) throw err;
      failure = new AIProviderError(req.outputName, null, err instanceof Error ? err.message : "request failed");
      // Someone is waiting on a spinner, so a timed-out call isn't worth repeating.
      if (err instanceof Error && err.name === "TimeoutError") throw failure;
    }
    if (attempt === MAX_RETRIES) throw failure;
    await deps.sleep(retryDelay(attempt, res));
  }
}

export function defaultGeminiDeps(env: Env = process.env): GeminiDeps {
  return {
    apiKey: env.GEMINI_API_KEY?.trim(),
    fetch: (input, init) => fetch(input, init),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  };
}
