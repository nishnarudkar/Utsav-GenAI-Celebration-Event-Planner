import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { enforceGrounding, generateRitualPlan, type CultureDeps } from "@/lib/ai/agents/culture";
import { createLocalRetriever, loadKbChunks, type RetrievedChunk } from "@/lib/ai/rag";
import { callStructured, defaultStructuredDeps, type CallStructuredOptions } from "@/lib/ai/structured";
import { RitualPlan, type RitualPlan as RitualPlanT } from "@/lib/schemas/ritual";

const KB_DIR = path.join(process.cwd(), "kb");
const FIXTURES_DIR = path.join(process.cwd(), "tests", "fixtures", "llm");

const chunk = (id: string): RetrievedChunk => ({ id, sourcePath: id.split("#")[0]!, heading: id, content: `content of ${id}`, score: 1 });

const ritual = (key: string, order: number) => ({
  key,
  name: key,
  order,
  durationMinutes: 30,
  participants: ["Bride"],
  items: [{ item: "Flowers" }],
  significance: "Meaningful.",
});

function fakeDeps(chunks: RetrievedChunk[], plan: RitualPlanT) {
  const structured = vi.fn(async (_opts: CallStructuredOptions<typeof RitualPlan>) => plan);
  const retrieve = vi.fn(async () => chunks);
  const deps: CultureDeps = { retrieve, structured };
  return { deps, structured, retrieve };
}

describe("generateRitualPlan", () => {
  const chunks = [chunk("kb/rituals/x.md#0"), chunk("kb/rituals/x.md#1")];
  const plan: RitualPlanT = { rituals: [ritual("a", 1)], sources: ["kb/rituals/x.md#1"], confidence: "high" };

  it("retrieves ritual docs for the tradition and event type", async () => {
    const { deps, retrieve } = fakeDeps(chunks, plan);
    await generateRitualPlan({ culture: "bengali_hindu", eventType: "wedding" }, deps);
    expect(retrieve).toHaveBeenCalledWith(expect.stringContaining("bengali hindu wedding"), {
      culture: "bengali_hindu",
      eventType: "wedding",
      docType: "ritual",
    }, 24);
  });

  it("sends the versioned prompt and the excerpts as cached system blocks", async () => {
    const { deps, structured } = fakeDeps(chunks, plan);
    await generateRitualPlan({ culture: "bengali_hindu", eventType: "wedding", notes: "Skip Bashor Raat" }, deps);

    const opts = structured.mock.calls[0]?.[0];
    expect(opts).toMatchObject({ name: "emit_ritual_plan", fixtureKey: "emit_ritual_plan.bengali_hindu.wedding", model: "smart" });
    expect(Array.isArray(opts?.system) && opts.system).toHaveLength(2);
    const [prompt, excerpts] = opts!.system as Array<{ text: string; cache_control?: unknown }>;
    expect(prompt?.text).toContain("Cultural Ritual Engine");
    expect(prompt?.cache_control).toEqual({ type: "ephemeral" });
    expect(excerpts?.text).toContain('<excerpt id="kb/rituals/x.md#0">');
    expect(String(opts?.messages[0]?.content)).toContain("Family notes: Skip Bashor Raat");
  });

  it("tells the model when nothing was found, and the result is low confidence", async () => {
    const { deps, structured } = fakeDeps([], { ...plan, sources: ["kb/rituals/made-up.md#0"] });
    const result = await generateRitualPlan({ culture: "christian", eventType: "wedding" }, deps);
    const excerpts = (structured.mock.calls[0]?.[0].system as Array<{ text: string }>)[1]?.text;
    expect(excerpts).toContain("none found");
    expect(result.confidence).toBe("low");
    expect(result.sources).toEqual([]);
  });
});

describe("enforceGrounding", () => {
  const supplied = [chunk("kb/a.md#0"), chunk("kb/a.md#1")];

  it("drops sources that weren't supplied and de-duplicates", () => {
    const out = enforceGrounding(
      { rituals: [ritual("a", 1)], sources: ["kb/a.md#1", "kb/invented.md#9", "kb/a.md#1"], confidence: "high" },
      supplied,
    );
    expect(out.sources).toEqual(["kb/a.md#1"]);
    expect(out.confidence).toBe("high");
  });

  it("downgrades to low confidence when no valid source remains", () => {
    const out = enforceGrounding({ rituals: [ritual("a", 1)], sources: ["kb/invented.md#0"], confidence: "high" }, supplied);
    expect(out.confidence).toBe("low");
  });

  it("sorts rituals and renumbers order from 1", () => {
    const out = enforceGrounding(
      { rituals: [ritual("c", 7), ritual("a", 2), ritual("b", 5)], sources: ["kb/a.md#0"], confidence: "medium" },
      supplied,
    );
    expect(out.rituals.map((r) => [r.key, r.order])).toEqual([["a", 1], ["b", 2], ["c", 3]]);
  });
});

describe("ritual demo fixtures", () => {
  const files = readdirSync(FIXTURES_DIR).filter((f) => f.startsWith("emit_ritual_plan."));

  it("exist for every ritual doc", () => {
    expect(files.sort()).toEqual([
      "emit_ritual_plan.bengali_hindu.wedding.json",
      "emit_ritual_plan.generic.birthday.json",
      "emit_ritual_plan.punjabi_sikh.wedding.json",
      "emit_ritual_plan.tamil_brahmin.wedding.json",
    ]);
  });

  it.each(files)("%s is valid and cites real KB chunks", async (file) => {
    const plan = RitualPlan.parse(JSON.parse(readFileSync(path.join(FIXTURES_DIR, file), "utf8")));
    const ids = new Set((await loadKbChunks(KB_DIR)).map((c) => c.id));
    expect(plan.sources.length).toBeGreaterThan(0);
    for (const s of plan.sources) expect(ids.has(s), s).toBe(true);
  });
});

describe("demo mode end to end (no API key)", () => {
  it("produces the Bengali wedding sequence from KB-grounded fixtures", async () => {
    const structuredDeps = defaultStructuredDeps({ DEMO_MODE: "true", DEMO_FIXTURES_DIR: FIXTURES_DIR });
    structuredDeps.createMessage = async () => {
      throw new Error("must not call the API in demo mode");
    };
    const plan = await generateRitualPlan(
      { culture: "bengali_hindu", eventType: "wedding" },
      { retrieve: createLocalRetriever(KB_DIR), structured: (opts) => callStructured(opts, structuredDeps) },
    );

    expect(plan.confidence).toBe("high");
    const keys = plan.rituals.map((r) => r.key);
    // The sequence the demo script walks through (CLAUDE.md §12)
    const demo = ["aashirbaad", "gaye_holud", "bashor_raat", "bou_bhaat"].map((k) => keys.indexOf(k));
    expect(demo.every((i) => i >= 0)).toBe(true);
    expect(demo).toEqual([...demo].sort((a, b) => a - b));
  });
});
