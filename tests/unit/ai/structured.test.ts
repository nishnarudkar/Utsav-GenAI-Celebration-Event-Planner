import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { resolveModel } from "@/lib/ai/client";
import { AIFixtureMissingError, AIRefusalError, AIValidationError } from "@/lib/ai/errors";
import { callStructured, type StructuredDeps } from "@/lib/ai/structured";

type Message = Anthropic.Beta.BetaMessage;
type CreateParams = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;

const IdeaSchema = z.object({
  title: z.string(),
  rationale: z.string().max(20), // not enforceable by the API's JSON schema; must be enforced locally
  guests: z.number().int().positive(),
});

const VALID = { title: "Marigold mandap", rationale: "Warm and festive", guests: 250 };

/** Minimal BetaMessage for tests; only the fields callStructured reads are meaningful. */
function fakeMessage(content: Array<Record<string, unknown>>, stop_reason = "end_turn", stop_details: unknown = null): Message {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "test-model",
    content,
    stop_reason,
    stop_details,
    stop_sequence: null,
    usage: { input_tokens: 1, output_tokens: 1 },
  } as unknown as Message;
}

const text = (t: string) => ({ type: "text", text: t });
const json = (v: unknown) => fakeMessage([text(JSON.stringify(v))]);

function makeDeps(responses: Message[], overrides: Partial<StructuredDeps> = {}) {
  const queue = [...responses];
  const createMessage = vi.fn(async (_params: CreateParams) => {
    const next = queue.shift();
    if (!next) throw new Error("unexpected extra API call");
    return next;
  });
  const deps: StructuredDeps = {
    createMessage,
    resolveModel: (tier) => (tier === "smart" ? "smart-model" : "fast-model"),
    demoMode: false,
    fixturesDir: "/nonexistent",
    ...overrides,
  };
  return { deps, createMessage };
}

const baseOpts = {
  schema: IdeaSchema,
  name: "emit_idea",
  system: "You plan Indian celebrations.",
  messages: [{ role: "user" as const, content: "One décor idea for 250 guests" }],
};

function paramsOf(mock: ReturnType<typeof makeDeps>["createMessage"], call = 0): CreateParams {
  const params = mock.mock.calls[call]?.[0];
  if (!params) throw new Error(`no call #${call}`);
  return params;
}

describe("callStructured — request shape", () => {
  it("returns validated data and sends a structured-output request", async () => {
    const { deps, createMessage } = makeDeps([json(VALID)]);
    await expect(callStructured(baseOpts, deps)).resolves.toEqual(VALID);

    const params = paramsOf(createMessage);
    expect(params.model).toBe("smart-model");
    expect(params.max_tokens).toBe(16_000);
    expect(params.output_config?.format?.type).toBe("json_schema");
    expect(params.output_config?.format?.schema).toMatchObject({ type: "object" });
    expect(params).not.toHaveProperty("temperature");
    expect(params).not.toHaveProperty("tool_choice");
  });

  it("caches a string system prompt as one ephemeral block", async () => {
    const { deps, createMessage } = makeDeps([json(VALID)]);
    await callStructured(baseOpts, deps);
    expect(paramsOf(createMessage).system).toEqual([
      { type: "text", text: "You plan Indian celebrations.", cache_control: { type: "ephemeral" } },
    ]);
  });

  it("passes system blocks through unchanged", async () => {
    const blocks = [
      { type: "text" as const, text: "static KB", cache_control: { type: "ephemeral" as const } },
      { type: "text" as const, text: "event snapshot" },
    ];
    const { deps, createMessage } = makeDeps([json(VALID)]);
    await callStructured({ ...baseOpts, system: blocks }, deps);
    expect(paramsOf(createMessage).system).toEqual(blocks);
  });

  it("enables the server-side refusal fallback on the smart tier only", async () => {
    const smart = makeDeps([json(VALID)]);
    await callStructured(baseOpts, smart.deps);
    expect(paramsOf(smart.createMessage)).toMatchObject({
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });

    const fast = makeDeps([json(VALID)]);
    await callStructured({ ...baseOpts, model: "fast" }, fast.deps);
    const fastParams = paramsOf(fast.createMessage);
    expect(fastParams.model).toBe("fast-model");
    expect(fastParams).not.toHaveProperty("betas");
    expect(fastParams).not.toHaveProperty("fallbacks");
  });

  it("forwards maxTokens and effort", async () => {
    const { deps, createMessage } = makeDeps([json(VALID)]);
    await callStructured({ ...baseOpts, maxTokens: 2048, effort: "low" }, deps);
    const params = paramsOf(createMessage);
    expect(params.max_tokens).toBe(2048);
    expect(params.output_config?.effort).toBe("low");
  });
});

describe("callStructured — validation and retry", () => {
  it("retries once with the Zod issues appended, then succeeds", async () => {
    const tooLong = { ...VALID, rationale: "This rationale is far too long" };
    const { deps, createMessage } = makeDeps([json(tooLong), json(VALID)]);

    await expect(callStructured(baseOpts, deps)).resolves.toEqual(VALID);
    expect(createMessage).toHaveBeenCalledTimes(2);

    const retry = paramsOf(createMessage, 1);
    expect(retry.messages).toHaveLength(2);
    expect(retry.messages[0]).toEqual(baseOpts.messages[0]);
    const correction = retry.messages[1];
    expect(correction?.role).toBe("user");
    expect(String(correction?.content)).toContain("rationale");
  });

  it("does not mutate the caller's messages array", async () => {
    const messages = [...baseOpts.messages];
    const { deps } = makeDeps([json({}), json(VALID)]);
    await callStructured({ ...baseOpts, messages }, deps);
    expect(messages).toHaveLength(1);
  });

  it("throws AIValidationError after two invalid attempts", async () => {
    const { deps, createMessage } = makeDeps([json({ title: 1 }), json({ guests: -5 })]);
    const err = await callStructured(baseOpts, deps).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AIValidationError);
    expect((err as AIValidationError).issues).toContain("guests");
    expect(createMessage).toHaveBeenCalledTimes(2);
  });

  it("treats non-JSON output as a validation failure", async () => {
    const { deps, createMessage } = makeDeps([fakeMessage([text("Sure! Here's an idea:")]), json(VALID)]);
    await expect(callStructured(baseOpts, deps)).resolves.toEqual(VALID);
    expect(String(paramsOf(createMessage, 1).messages[1]?.content)).toContain("not valid JSON");
  });

  it("asks for a more concise answer when cut off at max_tokens", async () => {
    const truncated = fakeMessage([text('{"title": "Mari')], "max_tokens");
    const { deps, createMessage } = makeDeps([truncated, json(VALID)]);
    await expect(callStructured(baseOpts, deps)).resolves.toEqual(VALID);
    expect(String(paramsOf(createMessage, 1).messages[1]?.content)).toContain("max_tokens");
  });

  it("ignores thinking blocks and joins text blocks", async () => {
    const [a, b] = [JSON.stringify(VALID).slice(0, 10), JSON.stringify(VALID).slice(10)];
    const { deps } = makeDeps([fakeMessage([{ type: "thinking", thinking: "", signature: "x" }, text(a), text(b)])]);
    await expect(callStructured(baseOpts, deps)).resolves.toEqual(VALID);
  });

  it("uses only the text after the last fallback switch point", async () => {
    const response = fakeMessage([
      text('{"partial": '),
      { type: "fallback", from: { model: "a" }, to: { model: "b" } },
      text(JSON.stringify(VALID)),
    ]);
    const { deps } = makeDeps([response]);
    await expect(callStructured(baseOpts, deps)).resolves.toEqual(VALID);
  });
});

describe("callStructured — refusals", () => {
  it("throws AIRefusalError without retrying", async () => {
    const refusal = fakeMessage([], "refusal", { type: "refusal", category: "general_harms", explanation: null });
    const { deps, createMessage } = makeDeps([refusal]);
    const err = await callStructured(baseOpts, deps).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AIRefusalError);
    expect((err as AIRefusalError).category).toBe("general_harms");
    expect(createMessage).toHaveBeenCalledTimes(1);
  });
});

describe("callStructured — demo mode", () => {
  async function fixturesWith(files: Record<string, string>) {
    const dir = await mkdtemp(path.join(tmpdir(), "utsav-fixtures-"));
    for (const [name, body] of Object.entries(files)) await writeFile(path.join(dir, name), body);
    return dir;
  }

  it("serves the cached fixture without calling the API", async () => {
    const fixturesDir = await fixturesWith({ "emit_idea.json": JSON.stringify(VALID) });
    const { deps, createMessage } = makeDeps([], { demoMode: true, fixturesDir });
    await expect(callStructured(baseOpts, deps)).resolves.toEqual(VALID);
    expect(createMessage).not.toHaveBeenCalled();
  });

  it("supports variant fixtures via fixtureKey", async () => {
    const variant = { ...VALID, guests: 350 };
    const fixturesDir = await fixturesWith({ "emit_idea.350.json": JSON.stringify(variant) });
    const { deps } = makeDeps([], { demoMode: true, fixturesDir });
    await expect(callStructured({ ...baseOpts, fixtureKey: "emit_idea.350" }, deps)).resolves.toEqual(variant);
  });

  it("throws AIFixtureMissingError when no fixture exists", async () => {
    const fixturesDir = await fixturesWith({});
    const { deps } = makeDeps([], { demoMode: true, fixturesDir });
    await expect(callStructured(baseOpts, deps)).rejects.toBeInstanceOf(AIFixtureMissingError);
  });

  it("validates fixtures against the schema", async () => {
    const fixturesDir = await fixturesWith({ "emit_idea.json": JSON.stringify({ title: "x" }) });
    const { deps } = makeDeps([], { demoMode: true, fixturesDir });
    await expect(callStructured(baseOpts, deps)).rejects.toBeInstanceOf(AIValidationError);
  });

  it("rejects names that could escape the fixtures directory", async () => {
    const { deps } = makeDeps([], { demoMode: true });
    await expect(callStructured({ ...baseOpts, fixtureKey: "../../secrets" }, deps)).rejects.toBeInstanceOf(RangeError);
  });
});

describe("resolveModel", () => {
  it("defaults to the configured Claude models", () => {
    expect(resolveModel("smart", {})).toBe("claude-sonnet-5-5");
    expect(resolveModel("fast", {})).toBe("claude-haiku-5-5");
  });

  it("reads overrides from env", () => {
    expect(resolveModel("smart", { CLAUDE_MODEL_SMART: "claude-opus-5-5" })).toBe("claude-opus-5-5");
    expect(resolveModel("fast", { CLAUDE_MODEL_FAST: "  " })).toBe("claude-haiku-5-5");
  });
});
