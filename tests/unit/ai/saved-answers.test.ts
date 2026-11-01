import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AIProviderError, AIValidationError } from "@/lib/ai/errors";
import { callStructured, defaultStructuredDeps, withSavedAnswers, type StructuredDeps } from "@/lib/ai/structured";

const Idea = z.object({ title: z.string() });
const opts = {
  schema: Idea,
  name: "emit_idea",
  system: "Plan well.",
  messages: [{ role: "user" as const, content: "Hello" }],
};

async function makeDeps(
  gemini: NonNullable<StructuredDeps["gemini"]>,
  over: Partial<StructuredDeps> = {},
): Promise<StructuredDeps> {
  const fixturesDir = await mkdtemp(path.join(tmpdir(), "utsav-"));
  await writeFile(path.join(fixturesDir, "emit_idea.json"), JSON.stringify({ title: "Saved" }));
  return { createMessage: vi.fn(), resolveModel: () => "test", demoMode: false, fixturesDir, gemini, ...over };
}

const live = async () => ({ text: JSON.stringify({ title: "Live" }), cutOff: false });
const outOfQuota = async () => {
  throw new AIProviderError("emit_idea", 429, "20 requests per day", { dailyLimit: true });
};

describe("withSavedAnswers", () => {
  it("serves the fixture without calling the model, only inside its scope", async () => {
    const gemini = vi.fn(live);
    const deps = await makeDeps(gemini);
    await expect(withSavedAnswers(() => callStructured(opts, deps))).resolves.toEqual({ title: "Saved" });
    expect(gemini).not.toHaveBeenCalled();
    await expect(callStructured(opts, deps)).resolves.toEqual({ title: "Live" });
  });
});

describe("AI_FALLBACK=saved", () => {
  it("is off by default, and turned on by the setting", () => {
    expect(defaultStructuredDeps({}).savedFallback).toBe(false);
    expect(defaultStructuredDeps({ AI_FALLBACK: "saved" }).savedFallback).toBe(true);
  });

  it("uses a saved answer when the provider is out of quota", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await expect(callStructured(opts, await makeDeps(outOfQuota, { savedFallback: true }))).resolves.toEqual({
      title: "Saved",
    });
    warn.mockRestore();
  });

  it("keeps the provider's error when nothing is saved", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const failure = await callStructured(
      { ...opts, fixtureKey: "emit_idea.none" },
      await makeDeps(outOfQuota, { savedFallback: true }),
    ).catch((err: unknown) => err);
    expect(failure).toMatchObject({ dailyLimit: true });
    warn.mockRestore();
  });

  it("stays off unless asked for", async () => {
    await expect(callStructured(opts, await makeDeps(outOfQuota))).rejects.toBeInstanceOf(AIProviderError);
  });

  it("doesn't hide a reply that failed validation", async () => {
    const bad = async () => ({ text: "nope", cutOff: false });
    await expect(callStructured(opts, await makeDeps(bad, { savedFallback: true }))).rejects.toBeInstanceOf(
      AIValidationError,
    );
  });
});
