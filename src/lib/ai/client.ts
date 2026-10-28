import "server-only";
import Anthropic from "@anthropic-ai/sdk";

/**
 * Anthropic client singleton + model resolution.
 * Retry/backoff is the SDK's built-in exponential backoff (429, 408, 409, 5xx, connection errors).
 */

export type ModelTier = "smart" | "fast";
/** The env keys these helpers read; narrower than ProcessEnv so tests can pass plain objects. */
export type Env = Readonly<Record<string, string | undefined>>;

const DEFAULT_MODELS: Record<ModelTier, string> = {
  smart: "claude-sonnet-5-5",
  fast: "claude-haiku-5-5",
};

/** Models are configured via env, never hard-coded in feature code (CLAUDE.md §2). */
export function resolveModel(tier: ModelTier, env: Env = process.env): string {
  const fromEnv = tier === "smart" ? env.CLAUDE_MODEL_SMART : env.CLAUDE_MODEL_FAST;
  return fromEnv?.trim() || DEFAULT_MODELS[tier];
}

let client: Anthropic | undefined;

/** Lazily created so importing this module never throws when no key is configured (tests, demo mode). */
export function getAnthropic(): Anthropic {
  client ??= new Anthropic({
    maxRetries: 3,
    timeout: 120_000, // ms; plan generation with thinking can take a while
  });
  return client;
}
