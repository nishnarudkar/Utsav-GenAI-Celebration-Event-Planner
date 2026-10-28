import { z } from "zod";
import { Culture, EventType, KbDocType } from "@/lib/schemas/enums";

/**
 * Parsing for knowledge-base markdown in kb/ (CLAUDE.md §7.5). Pure functions: no file I/O.
 *
 * Doc shape: YAML-style frontmatter (flat `key: value` lines), a `# Title`, an intro, then
 * `## Section` blocks. Ritual sections carry bullet fields: Key, When, Typical duration,
 * Participants, Items, Significance.
 */

export const KbFrontmatter = z.object({
  doc_type: KbDocType,
  culture: Culture.optional(),
  event_type: EventType.optional(),
  title: z.string().min(1),
});
export type KbFrontmatter = z.infer<typeof KbFrontmatter>;

export interface KbDoc {
  frontmatter: KbFrontmatter;
  body: string;
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/** Split and validate frontmatter. Throws a readable error naming `source` on bad input. */
export function parseKbDoc(markdown: string, source = "<doc>"): KbDoc {
  const m = FRONTMATTER_RE.exec(markdown);
  if (!m) throw new Error(`${source}: missing frontmatter block`);
  const data: Record<string, string> = {};
  for (const line of (m[1] ?? "").split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const idx = line.indexOf(":");
    if (idx < 0) throw new Error(`${source}: bad frontmatter line "${line}"`);
    data[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  const parsed = KbFrontmatter.safeParse(data);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`${source}: invalid frontmatter (${issues})`);
  }
  return { frontmatter: parsed.data, body: markdown.slice(m[0].length) };
}

export interface KbSection {
  heading: string;
  /** Section text without the `## heading` line. */
  content: string;
}

/** Splits the body into an intro (text before the first `## `) and `## ` sections. */
export function splitSections(body: string): { title: string | null; intro: string; sections: KbSection[] } {
  const lines = body.split(/\r?\n/);
  let title: string | null = null;
  const intro: string[] = [];
  const sections: KbSection[] = [];
  let current: { heading: string; lines: string[] } | null = null;

  for (const line of lines) {
    const h2 = /^##\s+(.+?)\s*$/.exec(line);
    const h1 = /^#\s+(.+?)\s*$/.exec(line);
    if (h2?.[1]) {
      if (current) sections.push({ heading: current.heading, content: current.lines.join("\n").trim() });
      current = { heading: h2[1], lines: [] };
    } else if (h1?.[1] && !current && title === null) {
      title = h1[1];
    } else if (current) {
      current.lines.push(line);
    } else {
      intro.push(line);
    }
  }
  if (current) sections.push({ heading: current.heading, content: current.lines.join("\n").trim() });
  return { title, intro: intro.join("\n").trim(), sections };
}

export const RitualSection = z.object({
  name: z.string().min(1),
  key: z.string().regex(/^[a-z][a-z0-9_]*$/, "key must be snake_case"),
  when: z.string().min(1),
  durationMinutes: z.number().int().min(5).max(600),
  participants: z.array(z.string().min(1)).min(1),
  items: z.array(z.string().min(1)).min(1),
  /** Matches RitualPlan.significance (CLAUDE.md §8). */
  significance: z.string().min(1).max(160),
});
export type RitualSection = z.infer<typeof RitualSection>;

/** Split a comma list, keeping commas inside parentheses: "Paddy (dhaan), durba grass" → 2 items. */
export function splitList(value: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of value) {
    if (ch === "(") depth++;
    if (ch === ")") depth = Math.max(0, depth - 1);
    if (ch === "," && depth === 0) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim()).filter(Boolean);
}

const FIELD_RE = /^-\s+\*\*(.+?):\*\*\s*(.*)$/;

/** Parse one ritual section's bullet fields. Throws naming the section on missing/invalid fields. */
export function parseRitualSection(section: KbSection): RitualSection {
  const fields = new Map<string, string>();
  for (const line of section.content.split(/\r?\n/)) {
    const m = FIELD_RE.exec(line.trim());
    if (m?.[1] && m[2] !== undefined) fields.set(m[1].toLowerCase(), m[2].trim());
  }
  const duration = /^(\d+)\s*minutes?$/i.exec(fields.get("typical duration") ?? "");
  const parsed = RitualSection.safeParse({
    name: section.heading,
    key: fields.get("key"),
    when: fields.get("when"),
    durationMinutes: duration?.[1] ? Number(duration[1]) : undefined,
    participants: splitList(fields.get("participants") ?? ""),
    items: splitList(fields.get("items") ?? ""),
    significance: fields.get("significance"),
  });
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Ritual "${section.heading}": ${issues}`);
  }
  return parsed.data;
}

export interface KbChunk {
  chunkIndex: number;
  /** Nearest heading, used in citations ("Bengali Hindu wedding › Gaye Holud"). */
  heading: string;
  content: string;
}

/** Rough token estimate (≈4 chars per token for English text). Good enough for chunk sizing. */
export const estimateTokens = (text: string): number => Math.ceil(text.length / 4);

/**
 * Chunk a doc for embedding: one chunk for the intro, one per `## ` section, each prefixed
 * with the doc title so it stands alone in retrieval. Sections over `maxTokens` are split
 * on paragraph/line boundaries with ~`overlapTokens` of overlap (CLAUDE.md: ~500 / 50).
 */
export function chunkKbDoc(doc: KbDoc, opts: { maxTokens?: number; overlapTokens?: number } = {}): KbChunk[] {
  const maxTokens = opts.maxTokens ?? 500;
  const overlapTokens = opts.overlapTokens ?? 50;
  const { title: h1, intro, sections } = splitSections(doc.body);
  const title = h1 ?? doc.frontmatter.title;

  const units: Array<{ heading: string; text: string }> = [];
  if (intro) units.push({ heading: title, text: intro });
  for (const s of sections) units.push({ heading: `${title} › ${s.heading}`, text: `## ${s.heading}\n${s.content}` });

  const chunks: KbChunk[] = [];
  for (const unit of units) {
    const prefix = `# ${title}\n`;
    const budget = maxTokens - estimateTokens(prefix);
    for (const piece of splitToBudget(unit.text, budget, overlapTokens)) {
      chunks.push({ chunkIndex: chunks.length, heading: unit.heading, content: prefix + piece });
    }
  }
  return chunks;
}

function splitToBudget(text: string, budgetTokens: number, overlapTokens: number): string[] {
  if (estimateTokens(text) <= budgetTokens) return [text];
  const lines = text.split(/\r?\n/);
  const pieces: string[] = [];
  let cur: string[] = [];
  const size = (ls: string[]) => estimateTokens(ls.join("\n"));

  for (const line of lines) {
    if (cur.length && size([...cur, line]) > budgetTokens) {
      pieces.push(cur.join("\n"));
      // carry trailing lines as overlap
      const overlap: string[] = [];
      for (let i = cur.length - 1; i >= 0 && size([cur[i] ?? "", ...overlap]) <= overlapTokens; i--) overlap.unshift(cur[i] ?? "");
      cur = overlap;
    }
    cur.push(line);
  }
  if (cur.length) pieces.push(cur.join("\n"));
  return pieces;
}
