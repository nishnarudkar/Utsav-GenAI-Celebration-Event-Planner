import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { chunkKbDoc, estimateTokens, parseKbDoc, parseRitualSection, splitSections } from "@/lib/kb/parse";

/** Lints the real knowledge-base docs so a malformed edit fails CI, not the demo. */

const KB_DIR = path.join(process.cwd(), "kb");
const ritualFiles = readdirSync(path.join(KB_DIR, "rituals"))
  .filter((f) => f.endsWith(".md"))
  .map((f) => [f, readFileSync(path.join(KB_DIR, "rituals", f), "utf8")] as const);

describe("kb/rituals", () => {
  it("has at least the four launch docs", () => {
    expect(ritualFiles.map(([f]) => f)).toEqual(
      expect.arrayContaining([
        "bengali-hindu-wedding.md",
        "tamil-brahmin-wedding.md",
        "punjabi-sikh-anand-karaj.md",
        "generic-birthday.md",
      ]),
    );
  });

  describe.each(ritualFiles)("%s", (file, markdown) => {
    const doc = parseKbDoc(markdown, file);
    const { sections } = splitSections(doc.body);

    it("is a ritual doc with culture and event type", () => {
      expect(doc.frontmatter.doc_type).toBe("ritual");
      expect(doc.frontmatter.culture).toBeDefined();
      expect(doc.frontmatter.event_type).toBeDefined();
    });

    it("has well-formed ritual sections with unique keys", () => {
      expect(sections.length).toBeGreaterThanOrEqual(5);
      const rituals = sections.map(parseRitualSection); // throws with the section name if malformed
      const keys = rituals.map((r) => r.key);
      expect(new Set(keys).size).toBe(keys.length);
    });

    it("chunks within the embedding budget", () => {
      for (const c of chunkKbDoc(doc)) expect(estimateTokens(c.content)).toBeLessThanOrEqual(500);
    });

    it("contains nothing Utsav must never plan for (CLAUDE.md §7.1 rule 6)", () => {
      expect(markdown.toLowerCase()).not.toMatch(/\bdowry\b|\bdahej\b|\bcaste\b/);
    });
  });
});
