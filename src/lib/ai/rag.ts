import "server-only";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { chunkKbDoc, parseKbDoc, type KbFrontmatter } from "@/lib/kb/parse";
import type { Culture, EventType, KbDocType } from "@/lib/schemas/enums";

/**
 * Knowledge-base retrieval (CLAUDE.md §7.5).
 *
 * `localRetriever` reads kb/ from disk and ranks chunks by metadata filter + keyword overlap.
 * It needs no database or embedding key, which is enough for a KB this size. A pgvector
 * retriever with the same `Retriever` signature can replace it once Supabase is set up.
 */

export interface RetrievalFilters {
  culture?: Culture;
  eventType?: EventType;
  docType?: KbDocType;
}

export interface RetrievedChunk {
  /** Stable citation id: "<source path>#<chunk index>", e.g. "kb/rituals/bengali-hindu-wedding.md#3". */
  id: string;
  sourcePath: string;
  heading: string;
  content: string;
  score: number;
}

export type Retriever = (query: string, filters: RetrievalFilters, k?: number) => Promise<RetrievedChunk[]>;

interface IndexedChunk extends Omit<RetrievedChunk, "score"> {
  chunkIndex: number;
  frontmatter: KbFrontmatter;
  tokens: Set<string>;
}

const STOPWORDS = new Set(["the", "and", "for", "with", "from", "this", "that", "are", "was", "but", "not", "you", "your", "of", "to", "in", "on", "a", "an", "is", "or", "at", "by"]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

/** Load and chunk every markdown doc under `kbDir`. Source paths are relative and POSIX-style. */
export async function loadKbChunks(kbDir: string): Promise<IndexedChunk[]> {
  const out: IndexedChunk[] = [];
  for (const sub of ["rituals", "checklists"]) {
    const dir = path.join(kbDir, sub);
    const files = await readdir(dir).catch(() => [] as string[]);
    for (const file of files.filter((f) => f.endsWith(".md")).sort()) {
      const sourcePath = `kb/${sub}/${file}`;
      const doc = parseKbDoc(await readFile(path.join(dir, file), "utf8"), sourcePath);
      for (const c of chunkKbDoc(doc)) {
        out.push({
          id: `${sourcePath}#${c.chunkIndex}`,
          sourcePath,
          chunkIndex: c.chunkIndex,
          heading: c.heading,
          content: c.content,
          frontmatter: doc.frontmatter,
          tokens: new Set(tokenize(c.content)),
        });
      }
    }
  }
  return out;
}

function matches(chunk: IndexedChunk, f: RetrievalFilters): boolean {
  const fm = chunk.frontmatter;
  return (
    (!f.docType || fm.doc_type === f.docType) &&
    (!f.culture || fm.culture === f.culture) &&
    (!f.eventType || fm.event_type === f.eventType)
  );
}

/**
 * Retriever over local files. Filters by metadata, scores by the share of query terms found
 * in the chunk, and keeps document order for ties so ritual sequences stay in sequence.
 */
export function createLocalRetriever(kbDir = path.join(process.cwd(), "kb")): Retriever {
  let chunks: Promise<IndexedChunk[]> | undefined;
  return async (query, filters, k = 6) => {
    chunks ??= loadKbChunks(kbDir);
    const terms = [...new Set(tokenize(query))];
    const scored = (await chunks)
      .filter((c) => matches(c, filters))
      .map((c, i) => ({
        c,
        i,
        score: terms.length ? terms.filter((t) => c.tokens.has(t)).length / terms.length : 0,
      }));
    return scored
      .sort((a, b) => b.score - a.score || a.i - b.i)
      .slice(0, k)
      .sort((a, b) => a.i - b.i) // present in document order
      .map(({ c, score }) => ({ id: c.id, sourcePath: c.sourcePath, heading: c.heading, content: c.content, score }));
  };
}
