import "server-only";
import type { z } from "zod";
import { AIError, AIFixtureMissingError, AIProviderError } from "@/lib/ai/errors";

/**
 * API error responses: `{ error: { code, message } }` with the right status (CLAUDE.md §10).
 * Messages are friendly and actionable; details go to the server log, never to the client.
 */

export type ApiErrorCode =
  | "INVALID_INPUT"
  | "NOT_FOUND"
  | "VERSION_CONFLICT"
  | "NOTHING_TO_UNDO"
  | "AI_FAILED"
  | "DEMO_FIXTURE_MISSING"
  | "INTERNAL";

export interface ApiErrorBody {
  error: { code: ApiErrorCode; message: string; fields?: Record<string, string> };
}

export function apiError(
  status: number,
  code: ApiErrorCode,
  message: string,
  fields?: Record<string, string>,
): Response {
  const body: ApiErrorBody = { error: { code, message, ...(fields ? { fields } : {}) } };
  return Response.json(body, { status });
}

/** 400 with one message per invalid field, e.g. { guestCount: "Too small: expected number to be >=1" }. */
export function invalidInput(error: z.ZodError): Response {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "(body)";
    fields[key] ??= issue.message;
  }
  return apiError(400, "INVALID_INPUT", "Some answers need another look.", fields);
}

/** Map anything thrown while generating a plan to a safe response. */
export function errorResponse(err: unknown, context: string): Response {
  if (err instanceof AIFixtureMissingError) {
    return apiError(
      422,
      "DEMO_FIXTURE_MISSING",
      "Demo mode has a saved plan only for the demo traditions. Try a Bengali wedding or a birthday, or turn demo mode off.",
    );
  }
  if (err instanceof AIError) {
    console.error(`[${context}] ${err.code}: ${err.message}`);
    if (err instanceof AIProviderError && err.dailyLimit)
      return apiError(429, "AI_FAILED", "Utsav has used up today's AI allowance. Please try again tomorrow.");
    if (err instanceof AIProviderError && err.status === 429)
      return apiError(429, "AI_FAILED", "Utsav's AI is busy right now — wait a minute and try again.");
    return apiError(502, "AI_FAILED", "Couldn't generate that — try again.");
  }
  console.error(`[${context}] unexpected error`, err);
  return apiError(500, "INTERNAL", "Something went wrong on our side — try again.");
}

/** Read a JSON body and validate it, giving a ready-made 400 response if either step fails. */
export async function parseBody<T extends z.ZodType>(
  req: Request,
  schema: T,
): Promise<{ ok: true; data: z.infer<T> } | { ok: false; response: Response }> {
  const body = await readJson(req);
  if (!body.ok) return body;
  const parsed = schema.safeParse(body.value);
  return parsed.success ? { ok: true, data: parsed.data } : { ok: false, response: invalidInput(parsed.error) };
}

/** Parse a JSON body without throwing on malformed input. */
async function readJson(req: Request): Promise<{ ok: true; value: unknown } | { ok: false; response: Response }> {
  try {
    return { ok: true, value: await req.json() };
  } catch {
    return { ok: false, response: apiError(400, "INVALID_INPUT", "The request body must be valid JSON.") };
  }
}
