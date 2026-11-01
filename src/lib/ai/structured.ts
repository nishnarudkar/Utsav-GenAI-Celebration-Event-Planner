import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import { getAnthropic, resolveModel, type Env, type ModelTier } from "@/lib/ai/client";
import { AIFixtureMissingError, AIProviderError, AIRefusalError, AIValidationError } from "@/lib/ai/errors";
import { defaultGeminiDeps, generateGemini, resolveGeminiModel, type GeminiReply, type GeminiRequest } from "@/lib/ai/gemini";

/**
 * The single entry point for every LLM call (CLAUDE.md §7.1 rule 2).
 *
 * Uses structured outputs (`output_config.format`, JSON schema generated from the Zod schema)
 * rather than forced tool use: `tool_choice: {type: "tool"}` returns a 400 on Claude Sonnet 5.5.
 * The result is validated with the full Zod schema; on failure we retry once with the issues
 * appended, then throw AIValidationError. See docs/DECISIONS.md.
 *
 * With AI_PROVIDER=gemini the same flow runs through lib/ai/gemini.ts instead.
 */

export type SystemBlock = Anthropic.Beta.BetaTextBlockParam;
export type MessageParam = Anthropic.Beta.BetaMessageParam;
type CreateParams = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;
type Message = Anthropic.Beta.BetaMessage;

export interface CallStructuredOptions<T extends z.ZodType> {
  schema: T;
  /** Output name, e.g. "emit_event_plan". Also the demo fixture file name. */
  name: string;
  /** A string is sent as one cached block. Pass blocks to control cache breakpoints yourself. */
  system: string | SystemBlock[];
  messages: MessageParam[];
  model?: ModelTier; // default "smart"
  maxTokens?: number; // default 16000 (thinking tokens count against it)
  effort?: "low" | "medium" | "high";
  /** Pick a variant fixture in demo mode, e.g. "emit_event_plan.bengali". Defaults to `name`. */
  fixtureKey?: string;
}

export interface StructuredDeps {
  createMessage: (params: CreateParams) => Promise<Message>;
  resolveModel: (tier: ModelTier) => string;
  demoMode: boolean;
  fixturesDir: string;
  /** AI_FALLBACK=saved: answer from a saved fixture, if there is one, when the provider is down or out of quota. */
  savedFallback?: boolean;
  /** Set when AI_PROVIDER=gemini; calls then go here instead of `createMessage`. */
  gemini?: (request: GeminiRequest) => Promise<GeminiReply>;
}

export function defaultStructuredDeps(env: Env = process.env): StructuredDeps {
  const useGemini = env.AI_PROVIDER === "gemini";
  return {
    createMessage: (params) => getAnthropic().beta.messages.create(params),
    resolveModel: (tier) => (useGemini ? resolveGeminiModel(tier, env) : resolveModel(tier, env)),
    ...(useGemini ? { gemini: (request: GeminiRequest) => generateGemini(request, defaultGeminiDeps(env)) } : {}),
    demoMode: env.DEMO_MODE === "true",
    savedFallback: env.AI_FALLBACK === "saved",
    fixturesDir: env.DEMO_FIXTURES_DIR ?? path.join(process.cwd(), "tests", "fixtures", "llm"),
  };
}

const DEFAULT_MAX_TOKENS = 16_000;
const SAFE_NAME = /^[A-Za-z0-9_.-]+$/;
/** Server-side refusal fallback; only the "default" form is accepted for Claude Sonnet 5.5. */
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

const savedAnswers = new AsyncLocalStorage<true>();

/** Serve saved fixtures for everything inside `run`, so the demo wedding costs no AI quota. */
export const withSavedAnswers = <R>(run: () => Promise<R>): Promise<R> => savedAnswers.run(true, run);

export async function callStructured<T extends z.ZodType>(
  opts: CallStructuredOptions<T>,
  deps: StructuredDeps = defaultStructuredDeps(),
): Promise<z.infer<T>> {
  const fixtureKey = opts.fixtureKey ?? opts.name;
  if (!SAFE_NAME.test(opts.name) || !SAFE_NAME.test(fixtureKey)) {
    throw new RangeError(`Invalid structured output name: ${fixtureKey}`);
  }

  if (deps.demoMode || savedAnswers.getStore()) return loadFixture(opts.schema, opts.name, fixtureKey, deps.fixturesDir);

  try {
    return await callModel(opts, deps);
  } catch (err) {
    if (!deps.savedFallback || !(err instanceof AIProviderError)) throw err;
    console.warn(`[callStructured] ${err.message}; using saved answer for ${fixtureKey}`);
    return loadFixture(opts.schema, opts.name, fixtureKey, deps.fixturesDir).catch(() => {
      throw err; // keeps the "wait a minute" or "try tomorrow" message, not a demo-only one
    });
  }
}

async function callModel<T extends z.ZodType>(opts: CallStructuredOptions<T>, deps: StructuredDeps): Promise<z.infer<T>> {
  const send = deps.gemini ? geminiSender(opts, deps, deps.gemini) : anthropicSender(opts, deps);

  let issues = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const reply = await send(attempt === 0 ? opts.messages : [...opts.messages, correctionMessage(opts.name, issues)]);
    const result = validate(opts.schema, reply.text, reply.cutOff);
    if (result.success) return result.data;
    issues = result.issues;
  }
  throw new AIValidationError(opts.name, issues);
}

type Send = (messages: MessageParam[]) => Promise<GeminiReply>;

function geminiSender<T extends z.ZodType>(opts: CallStructuredOptions<T>, deps: StructuredDeps, gemini: NonNullable<StructuredDeps["gemini"]>): Send {
  return (messages) =>
    gemini({
      outputName: opts.name,
      model: deps.resolveModel(opts.model ?? "smart"),
      system: opts.system,
      messages,
      schema: opts.schema,
      maxOutputTokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
      ...(opts.effort ? { effort: opts.effort } : {}),
    });
}

function anthropicSender<T extends z.ZodType>(opts: CallStructuredOptions<T>, deps: StructuredDeps): Send {
  const tier = opts.model ?? "smart";
  // Send only the JSON-schema fields; the helper's client-side `parse` is replaced by our own validation.
  const { type, schema } = zodOutputFormat(opts.schema);
  const base: CreateParams = {
    model: deps.resolveModel(tier),
    max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
    system: toSystemBlocks(opts.system),
    messages: opts.messages,
    output_config: { format: { type, schema }, ...(opts.effort ? { effort: opts.effort } : {}) },
    // Haiku has no server-side fallback; the smart tier re-runs a declined request on a fallback model.
    ...(tier === "smart" ? { betas: [FALLBACK_BETA], fallbacks: "default" as const } : {}),
  };

  return async (messages) => {
    const response = await deps.createMessage({ ...base, messages });
    if (response.stop_reason === "refusal") {
      throw new AIRefusalError(opts.name, response.stop_details?.category ?? null);
    }
    return { text: finalText(response), cutOff: response.stop_reason === "max_tokens" };
  };
}

function toSystemBlocks(system: string | SystemBlock[]): SystemBlock[] {
  if (typeof system !== "string") return system;
  // Static system prompt → cache it (CLAUDE.md §7.1 rule 8). Prompts below the model's
  // minimum cacheable length simply aren't cached; nothing breaks.
  return [{ type: "text", text: system, cache_control: { type: "ephemeral" } }];
}

/** Text after the last fallback switch point (earlier text belongs to a model that declined). */
function finalText(response: Message): string {
  const lastFallback = response.content.findLastIndex((b) => b.type === "fallback");
  return response.content
    .slice(lastFallback + 1)
    .flatMap((b) => (b.type === "text" ? [b.text] : []))
    .join("");
}

type Validation<T> = { success: true; data: T } | { success: false; issues: string };

function validate<T extends z.ZodType>(schema: T, text: string, cutOff: boolean): Validation<z.infer<T>> {
  if (cutOff) {
    return { success: false, issues: "Output was cut off at max_tokens. Return a more concise JSON object." };
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { success: false, issues: "Output was not valid JSON." };
  }
  const parsed = schema.safeParse(json);
  if (parsed.success) return { success: true, data: parsed.data };
  return { success: false, issues: formatIssues(parsed.error) };
}

function formatIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 10)
    .map((i) => `- ${i.path.length ? i.path.join(".") : "(root)"}: ${i.message}`)
    .join("\n");
}

function correctionMessage(name: string, issues: string): MessageParam {
  return {
    role: "user",
    content:
      `Your previous response for "${name}" did not pass validation:\n${issues}\n\n` +
      "Return the complete corrected JSON object, following the schema exactly.",
  };
}

async function loadFixture<T extends z.ZodType>(
  schema: T,
  name: string,
  fixtureKey: string,
  fixturesDir: string,
): Promise<z.infer<T>> {
  const file = path.join(fixturesDir, `${fixtureKey}.json`);
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch {
    throw new AIFixtureMissingError(name, file);
  }
  const parsed = schema.safeParse(JSON.parse(raw));
  if (!parsed.success) throw new AIValidationError(name, `Demo fixture ${file} is invalid:\n${formatIssues(parsed.error)}`);
  return parsed.data;
}
