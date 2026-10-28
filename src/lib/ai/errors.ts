/**
 * Typed AI failures. Route handlers map these to `{ error: { code, message } }`
 * with a friendly message ("Couldn't generate that — try again"); never expose details to users.
 */

export type AIErrorCode = "AI_VALIDATION" | "AI_REFUSAL" | "AI_FIXTURE_MISSING";

export abstract class AIError extends Error {
  abstract readonly code: AIErrorCode;
  constructor(
    message: string,
    /** The structured-output name, e.g. "emit_event_plan". */
    readonly outputName: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** The model's output failed Zod validation twice (initial attempt + one corrective retry). */
export class AIValidationError extends AIError {
  readonly code = "AI_VALIDATION";
  constructor(
    outputName: string,
    /** Human-readable validation issues from the last attempt (for logs, not users). */
    readonly issues: string,
  ) {
    super(`Structured output "${outputName}" failed validation after retry:\n${issues}`, outputName);
  }
}

/** The model (and any server-side fallback) declined the request. */
export class AIRefusalError extends AIError {
  readonly code = "AI_REFUSAL";
  constructor(
    outputName: string,
    readonly category: string | null,
  ) {
    super(`Request for "${outputName}" was declined${category ? ` (${category})` : ""}`, outputName);
  }
}

/** DEMO_MODE is on but no cached response exists for this output. */
export class AIFixtureMissingError extends AIError {
  readonly code = "AI_FIXTURE_MISSING";
  constructor(
    outputName: string,
    readonly fixturePath: string,
  ) {
    super(`No demo fixture for "${outputName}" at ${fixturePath}`, outputName);
  }
}
