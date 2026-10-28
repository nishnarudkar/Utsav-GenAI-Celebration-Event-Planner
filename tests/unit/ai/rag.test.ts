import path from "node:path";
import { describe, expect, it } from "vitest";
import { createLocalRetriever, tokenize } from "@/lib/ai/rag";

const retrieve = createLocalRetriever(path.join(process.cwd(), "kb"));

describe("tokenize", () => {
  it("lowercases, splits and drops stopwords and short tokens", () => {
    expect(tokenize("The Gaye-Holud ritual, at dawn!")).toEqual(["gaye", "holud", "ritual", "dawn"]);
  });
});

describe("createLocalRetriever", () => {
  it("filters by culture, event type and doc type", async () => {
    const chunks = await retrieve("rituals", { culture: "bengali_hindu", eventType: "wedding", docType: "ritual" }, 50);
    expect(chunks.length).toBeGreaterThan(10);
    for (const c of chunks) expect(c.sourcePath).toBe("kb/rituals/bengali-hindu-wedding.md");
  });

  it("returns nothing for a tradition with no docs", async () => {
    expect(await retrieve("rituals", { culture: "christian", eventType: "wedding" })).toEqual([]);
  });

  it("uses stable '<path>#<index>' citation ids", async () => {
    const [first] = await retrieve("intro", { culture: "tamil_brahmin", docType: "ritual" }, 1);
    expect(first?.id).toMatch(/^kb\/rituals\/tamil-brahmin-wedding\.md#\d+$/);
  });

  it("ranks chunks by keyword overlap", async () => {
    const [top] = await retrieve("turmeric paste fish", { culture: "bengali_hindu" }, 1);
    expect(top?.heading).toContain("Gaye Holud");
    expect(top?.score).toBeGreaterThan(0);
  });

  it("respects k and returns results in document order", async () => {
    const chunks = await retrieve("garland swing", { culture: "tamil_brahmin" }, 3);
    expect(chunks).toHaveLength(3);
    const indexes = chunks.map((c) => Number(c.id.split("#")[1]));
    expect(indexes).toEqual([...indexes].sort((a, b) => a - b));
  });
});
