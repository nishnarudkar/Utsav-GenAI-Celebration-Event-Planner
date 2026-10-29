import "server-only";
import type { z } from "zod";
import { AIError, AIFixtureMissingError } from "@/lib/ai/errors";

/**
 * API error responses: `{ error: { code, message } }` with the right status (CLAUDE.md §10).
 * Messages are friendly and actionable; details go to the server log, never to the client.
 */

export type ApiErrorCode = "INVALID_INPUT" | "NOT_FOUND" | "AI_FAILED" | "DEMO_FIXTURE_MISSING" | "INTERNAL";

export interface ApiErrorBody {
  error: { code: ApiErrorCode; message: string; fields?: Record<string, string> };
}

export function apiError(status: number, code: ApiErrorCode, message: string, fields?: Record<string, string>): Response {
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
    return apiError(422, "DEMO_FIXTURE_MISSING", "Demo mode has a saved plan only for the demo traditions. Try a Bengali wedding or a birthday, or turn demo mode off.");
  }
  if (err instanceof AIError) {
    console.error(`[${context}] ${err.code}: ${err.message}`);
    return apiError(502, "AI_FAILED", "Couldn't generate that — try again.");
  }
  console.error(`[${context}] unexpected error`, err);
  return apiError(500, "INTERNAL", "Something went wrong on our side — try again.");
}

/** Parse a JSON body without throwing on malformed input. */
export async function readJson(req: Request): Promise<{ ok: true; value: unknown } | { ok: false; response: Response }> {
  try {
    return { ok: true, value: await req.json() };
  } catch {
    return { ok: false, response: apiError(400, "INVALID_INPUT", "The request body must be valid JSON.") };
  }
}
