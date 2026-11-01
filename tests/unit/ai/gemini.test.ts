import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AIProviderError, AIValidationError } from "@/lib/ai/errors";
import { generateGemini, resolveGeminiModel, toGeminiParts, toGeminiSchema, toGeminiSystem, type GeminiDeps, type GeminiRequest } from "@/lib/ai/gemini";
import { callStructured, defaultStructuredDeps, type StructuredDeps } from "@/lib/ai/structured";
import { apiError, errorResponse } from "@/lib/api/errors";
import { VibeProfile } from "@/lib/schemas/vibe";

const Idea = z.object({ title: z.string(), guests: z.number().int().positive() });
const VALID = { title: "Marigold mandap", guests: 250 };

const interaction = (text: string, status = "completed") =>
  Response.json({ id: "v1_test", status, steps: [{ type: "thought" }, { type: "model_output", content: [{ type: "text", text }] }] });

const request: GeminiRequest = { outputName: "emit_idea", model: "test-model", system: "Plan well.", messages: [{ role: "user", content: "Hello" }], schema: Idea, maxOutputTokens: 500 };

function makeDeps(...responses: (Response | Error)[]) {
  const queue = [...responses];
  const fetchMock = vi.fn(async (_url: unknown, _init?: RequestInit) => {
    const next = queue.shift();
    if (!next) throw new Error("unexpected extra call");
    if (next instanceof Error) throw next;
    return next;
  });
  const sleep = vi.fn(async (_ms: number) => undefined);
  const deps: GeminiDeps = { apiKey: "test-key", fetch: fetchMock as unknown as typeof fetch, sleep };
  return { deps, fetchMock, sleep };
}

describe("translating requests", () => {
  it("passes text, images and PDFs in Gemini's shape", () => {
    const parts = toGeminiParts([
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: "image/png", data: "aW1n" } },
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: "cGRm" } },
          { type: "text", text: "Read this." },
        ],
      },
      { role: "user", content: "Correction" },
    ]);
    expect(parts).toEqual([
      { type: "image", data: "aW1n", mime_type: "image/png" },
      { type: "document", data: "cGRm", mime_type: "application/pdf" },
      { type: "text", text: "Read this." },
      { type: "text", text: "Correction" },
    ]);
  });

  it("joins cached system blocks into one instruction", () => {
    expect(toGeminiSystem([{ type: "text", text: "One", cache_control: { type: "ephemeral" } }, { type: "text", text: "Two" }])).toBe("One\n\nTwo");
  });

  it("keeps the schema's shape but drops limits, which Gemini can reject", () => {
    const schema = toGeminiSchema(VibeProfile);
    const text = JSON.stringify(schema);
    expect(schema).toMatchObject({ type: "object", required: expect.arrayContaining(["theme", "palette"]) });
    for (const keyword of ["pattern", "maxLength", "minItems", "maxItems", "$schema", "$ref"]) expect(text).not.toContain(`"${keyword}"`);
    expect(JSON.stringify(toGeminiSchema(z.object({ guests: z.number().int().positive() })))).not.toMatch(/imum/);
  });

  it("keeps a property that happens to be named like a limit", () => {
    expect(toGeminiSchema(z.object({ maximum: z.string() }))).toMatchObject({ properties: { maximum: { type: "string" } } });
  });

  it("sends the key in a header, and stores nothing", async () => {
    const { deps, fetchMock } = makeDeps(interaction(JSON.stringify(VALID)));
    await generateGemini({ ...request, effort: "low" }, deps);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).not.toContain("test-key");
    expect(init.headers).toMatchObject({ "x-goog-api-key": "test-key" });
    expect(JSON.parse(init.body as string)).toMatchObject({
      model: "test-model",
      system_instruction: "Plan well.",
      store: false,
      response_format: { type: "text", mime_type: "application/json" },
      generation_config: { max_output_tokens: 500, thinking_level: "low" },
    });
  });
});

describe("generateGemini", () => {
  it("returns the last model output and ignores thoughts", async () => {
    const { deps } = makeDeps(interaction('{"a":1}'));
    expect(await generateGemini(request, deps)).toEqual({ text: '{"a":1}', cutOff: false });
  });

  it("reports a reply that hit the token limit", async () => {
    const { deps } = makeDeps(interaction("{", "incomplete"));
    expect(await generateGemini(request, deps)).toEqual({ text: "{", cutOff: true });
  });

  it("retries rate limits and server errors, honouring Retry-After", async () => {
    const { deps, sleep, fetchMock } = makeDeps(new Response(null, { status: 429, headers: { "retry-after": "7" } }), new Response(null, { status: 503 }), interaction("{}"));
    await generateGemini(request, deps);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([7000, 2000]);
  });

  it("retries network failures, then gives up with a typed error", async () => {
    const { deps, fetchMock } = makeDeps(...Array.from({ length: 4 }, () => new Error("socket hang up")));
    await expect(generateGemini(request, deps)).rejects.toBeInstanceOf(AIProviderError);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("stops at once when the daily allowance is gone, and says so", async () => {
    const message = "Rate limit exceeded for model x (limit: 20 requests per day on Free Tier). Please retry in 16h32m14s";
    const { deps, fetchMock, sleep } = makeDeps(Response.json({ error: { message } }, { status: 429 }));
    const failure = await generateGemini(request, deps).catch((err: unknown) => err);
    expect(failure).toMatchObject({ dailyLimit: true, status: 429 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
    const res = errorResponse(failure, "test");
    expect(((await res.json()) as { error: { message: string } }).error.message).toMatch(/try again tomorrow/);
  });

  it("doesn't wait out a long Retry-After", async () => {
    const { deps, fetchMock } = makeDeps(new Response(null, { status: 429, headers: { "retry-after": "3600" } }));
    await expect(generateGemini(request, deps)).rejects.toBeInstanceOf(AIProviderError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("doesn't retry a timeout", async () => {
    const { deps, fetchMock } = makeDeps(new DOMException("timed out", "TimeoutError") as unknown as Error);
    fetchMock.mockImplementationOnce(async () => {
      throw Object.assign(new Error("timed out"), { name: "TimeoutError" });
    });
    await expect(generateGemini(request, deps)).rejects.toBeInstanceOf(AIProviderError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("doesn't retry a request Google rejected", async () => {
    const { deps, fetchMock } = makeDeps(Response.json({ error: { message: "API key not valid" } }, { status: 403 }));
    await expect(generateGemini(request, deps)).rejects.toThrow(/HTTP 403.*API key not valid/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("treats a failed interaction as a provider error", async () => {
    const { deps } = makeDeps(Response.json({ status: "failed", steps: [] }));
    await expect(generateGemini(request, deps)).rejects.toBeInstanceOf(AIProviderError);
  });

  it("explains a missing key without calling Google", async () => {
    const { deps, fetchMock } = makeDeps();
    await expect(generateGemini(request, { ...deps, apiKey: undefined })).rejects.toThrow(/GEMINI_API_KEY/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("callStructured with Gemini", () => {
  const opts = { schema: Idea, name: "emit_idea", system: "Plan well.", messages: [{ role: "user" as const, content: "Hello" }] };
  const base = (replies: { text: string; cutOff: boolean }[]) => {
    const gemini = vi.fn(async (_request: GeminiRequest) => replies.shift() ?? { text: "", cutOff: false });
    const createMessage = vi.fn();
    const deps: StructuredDeps = { createMessage, resolveModel: () => "gemini-test", demoMode: false, fixturesDir: "/nonexistent", gemini };
    return { deps, gemini, createMessage };
  };

  it("validates the reply and never touches Anthropic", async () => {
    const { deps, createMessage } = base([{ text: JSON.stringify(VALID), cutOff: false }]);
    await expect(callStructured(opts, deps)).resolves.toEqual(VALID);
    expect(createMessage).not.toHaveBeenCalled();
  });

  it("retries once with the validation errors", async () => {
    const { deps, gemini } = base([
      { text: '{"title":"x","guests":-1}', cutOff: false },
      { text: JSON.stringify(VALID), cutOff: false },
    ]);
    await expect(callStructured(opts, deps)).resolves.toEqual(VALID);
    const retry = gemini.mock.calls[1]?.[0].messages.at(-1);
    expect(JSON.stringify(retry)).toContain("did not pass validation");
  });

  it("gives up after two bad replies", async () => {
    const { deps } = base([
      { text: "nope", cutOff: false },
      { text: "{", cutOff: true },
    ]);
    await expect(callStructured(opts, deps)).rejects.toBeInstanceOf(AIValidationError);
  });
});

describe("choosing the provider", () => {
  it("uses Anthropic unless told otherwise", () => {
    expect(defaultStructuredDeps({}).gemini).toBeUndefined();
    expect(defaultStructuredDeps({}).resolveModel("smart")).toBe("claude-sonnet-5-5");
  });

  it("uses Gemini's models with AI_PROVIDER=gemini, and env overrides", () => {
    const deps = defaultStructuredDeps({ AI_PROVIDER: "gemini", GEMINI_MODEL_FAST: "custom-fast" });
    expect(deps.gemini).toBeDefined();
    expect(deps.resolveModel("fast")).toBe("custom-fast");
    expect(resolveGeminiModel("smart", {})).toBe("gemini-3.6-flash");
  });
});

describe("errorResponse", () => {
  it("tells people to wait when the provider is rate-limiting", async () => {
    const res = errorResponse(new AIProviderError("emit_idea", 429, "quota"), "test");
    expect(res.status).toBe(429);
    expect(((await res.json()) as { error: { message: string } }).error.message).toMatch(/wait a minute/);
    expect(errorResponse(new AIProviderError("emit_idea", 500, "boom"), "test").status).toBe(apiError(502, "AI_FAILED", "").status);
  });
});
