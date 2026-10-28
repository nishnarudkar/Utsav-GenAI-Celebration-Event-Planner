import { describe, expect, it } from "vitest";
import { chunkKbDoc, estimateTokens, parseKbDoc, parseRitualSection, splitList, splitSections } from "@/lib/kb/parse";

const DOC = `---
doc_type: ritual
culture: bengali_hindu
event_type: wedding
title: Test wedding
---

# Test wedding

Intro paragraph.

## Gaye Holud

- **Key:** gaye_holud
- **When:** Morning of the wedding day
- **Typical duration:** 90 minutes
- **Participants:** Bride, groom, married women
- **Items:** Turmeric paste, fish (traditionally rohu, sometimes hilsa), sweets
- **Significance:** Turmeric links the two families.

## Mala Badal

- **Key:** mala_badal
- **When:** After Shubho Drishti
- **Typical duration:** 10 minutes
- **Participants:** Bride, groom
- **Items:** Two garlands
- **Significance:** Garland exchange.
`;

describe("parseKbDoc", () => {
  it("parses and validates frontmatter", () => {
    const doc = parseKbDoc(DOC, "test.md");
    expect(doc.frontmatter).toEqual({
      doc_type: "ritual",
      culture: "bengali_hindu",
      event_type: "wedding",
      title: "Test wedding",
    });
    expect(doc.body.startsWith("\n# Test wedding")).toBe(true);
  });

  it("handles CRLF line endings", () => {
    expect(parseKbDoc(DOC.replace(/\n/g, "\r\n")).frontmatter.culture).toBe("bengali_hindu");
  });

  it("rejects missing or invalid frontmatter with the source name", () => {
    expect(() => parseKbDoc("# No frontmatter", "x.md")).toThrow(/x\.md: missing frontmatter/);
    expect(() => parseKbDoc(DOC.replace("bengali_hindu", "klingon"), "y.md")).toThrow(/y\.md: invalid frontmatter.*culture/);
    expect(() => parseKbDoc(DOC.replace("doc_type: ritual", "doc_type: poem"))).toThrow(/doc_type/);
  });
});

describe("splitSections / parseRitualSection", () => {
  const { title, intro, sections } = splitSections(parseKbDoc(DOC).body);

  it("splits title, intro and sections", () => {
    expect(title).toBe("Test wedding");
    expect(intro).toBe("Intro paragraph.");
    expect(sections.map((s) => s.heading)).toEqual(["Gaye Holud", "Mala Badal"]);
  });

  it("parses ritual fields, keeping commas inside parentheses", () => {
    const ritual = parseRitualSection(sections[0]!);
    expect(ritual).toEqual({
      name: "Gaye Holud",
      key: "gaye_holud",
      when: "Morning of the wedding day",
      durationMinutes: 90,
      participants: ["Bride", "groom", "married women"],
      items: ["Turmeric paste", "fish (traditionally rohu, sometimes hilsa)", "sweets"],
      significance: "Turmeric links the two families.",
    });
  });

  it("names the section when a field is missing or invalid", () => {
    const broken = { heading: "Broken", content: "- **Key:** Not Snake\n- **Typical duration:** a while" };
    expect(() => parseRitualSection(broken)).toThrow(/Ritual "Broken".*key/);
  });
});

describe("splitList", () => {
  it("splits on top-level commas only", () => {
    expect(splitList("a, b (c, d), e")).toEqual(["a", "b (c, d)", "e"]);
    expect(splitList("")).toEqual([]);
  });
});

describe("chunkKbDoc", () => {
  it("makes one self-contained chunk per section plus the intro", () => {
    const chunks = chunkKbDoc(parseKbDoc(DOC));
    expect(chunks.map((c) => c.heading)).toEqual(["Test wedding", "Test wedding › Gaye Holud", "Test wedding › Mala Badal"]);
    expect(chunks.map((c) => c.chunkIndex)).toEqual([0, 1, 2]);
    for (const c of chunks) expect(c.content.startsWith("# Test wedding\n")).toBe(true);
    expect(chunks[1]?.content).toContain("## Gaye Holud");
  });

  it("splits oversized sections within the token budget, with overlap", () => {
    const lines = Array.from({ length: 60 }, (_, i) => `- line ${i} ${"x".repeat(60)}`).join("\n");
    const big = `---\ndoc_type: checklist\ntitle: Big\n---\n# Big\n\n## Long section\n${lines}\n`;
    const chunks = chunkKbDoc(parseKbDoc(big), { maxTokens: 200, overlapTokens: 30 });

    expect(chunks.length).toBeGreaterThan(3);
    for (const c of chunks) expect(estimateTokens(c.content)).toBeLessThanOrEqual(200);
    // consecutive chunks share at least one line (overlap)
    const lastLineOf = (s: string) => s.split("\n").at(-1) ?? "";
    expect(chunks[1]?.content).toContain(lastLineOf(chunks[0]!.content));
    // every original line survives
    for (let i = 0; i < 60; i++) expect(chunks.some((c) => c.content.includes(`- line ${i} `))).toBe(true);
  });
});
