/**
 * Builds demo-mode fixtures for the Culture agent directly from kb/rituals/*.md, so DEMO_MODE
 * output always matches the knowledge base. Re-run after editing a ritual doc:
 *   pnpm fixtures:rituals
 * Writes tests/fixtures/llm/emit_ritual_plan.<culture>.<event_type>.json
 */
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chunkKbDoc, parseKbDoc, parseRitualSection, splitSections } from "../src/lib/kb/parse";
import { RitualPlan } from "../src/lib/schemas/ritual";

const root = process.cwd();
const ritualsDir = path.join(root, "kb", "rituals");
const outDir = path.join(root, "tests", "fixtures", "llm");

async function main(): Promise<void> {
  await mkdir(outDir, { recursive: true });
  const files = (await readdir(ritualsDir)).filter((f) => f.endsWith(".md")).sort();
  for (const file of files) {
    const sourcePath = `kb/rituals/${file}`;
    const doc = parseKbDoc(await readFile(path.join(ritualsDir, file), "utf8"), sourcePath);
    const { culture, event_type: eventType } = doc.frontmatter;
    if (!culture || !eventType) throw new Error(`${sourcePath}: culture and event_type are required`);

    const plan = RitualPlan.parse({
      rituals: splitSections(doc.body).sections.map((s, i) => {
        const r = parseRitualSection(s);
        return {
          key: r.key,
          name: r.name,
          order: i + 1,
          durationMinutes: r.durationMinutes,
          participants: r.participants,
          items: r.items.map((item) => ({ item })),
          significance: r.significance,
        };
      }),
      sources: chunkKbDoc(doc).map((c) => `${sourcePath}#${c.chunkIndex}`),
      confidence: "high",
    });

    const out = path.join(outDir, `emit_ritual_plan.${culture}.${eventType}.json`);
    await writeFile(out, JSON.stringify(plan, null, 2) + "\n");
    console.log(`wrote ${path.relative(root, out)} (${plan.rituals.length} rituals)`);
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
