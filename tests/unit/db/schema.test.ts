import { is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import * as schema from "@/lib/db/schema";
import { BUDGET_CATEGORIES, CULTURES } from "@/lib/schemas/enums";

/** Guards the data-model rules in CLAUDE.md §6 against future schema edits. */

const tables = (Object.values(schema) as unknown[])
  .filter((v): v is PgTable => is(v, PgTable))
  .map((t) => getTableConfig(t));

describe("db schema", () => {
  it("defines all 12 tables from the data model", () => {
    expect(tables.map((t) => t.name).sort()).toEqual(
      [
        "budget_items",
        "council_resolutions",
        "events",
        "functions",
        "kb_chunks",
        "notifications",
        "plan_changes",
        "quotes",
        "ritual_items",
        "stakeholders",
        "tasks",
        "vendors",
      ].sort(),
    );
  });

  it.each(tables.map((t) => [t.name, t] as const))("%s has a UUID primary key and timestamps", (_name, t) => {
    const byName = new Map(t.columns.map((c) => [c.name, c]));
    const idCol = byName.get("id");
    expect(idCol?.primary).toBe(true);
    expect(idCol?.getSQLType()).toBe("uuid");
    expect(idCol?.hasDefault).toBe(true);
    for (const ts of ["created_at", "updated_at"]) {
      expect(byName.get(ts)?.getSQLType()).toBe("timestamp with time zone");
      expect(byName.get(ts)?.notNull).toBe(true);
    }
  });

  it("stores every money column as integer paise (bigint), never float", () => {
    const moneyCols = tables.flatMap((t) => t.columns.filter((c) => c.name.endsWith("_paise")).map((c) => [t.name, c] as const));
    expect(moneyCols.length).toBeGreaterThanOrEqual(5);
    for (const [, col] of moneyCols) expect(col.getSQLType()).toBe("bigint");
  });

  it("deletes child rows when an event is deleted", () => {
    for (const t of tables) {
      for (const fk of t.foreignKeys) {
        const ref = fk.reference();
        if (getTableConfig(ref.foreignTable).name === "events") expect(fk.onDelete, `${t.name}.event_id`).toBe("cascade");
      }
    }
  });

  it("has the locked flag on budget items, defaulting to unlocked", () => {
    const locked = getTableConfig(schema.budgetItems).columns.find((c) => c.name === "locked");
    expect(locked?.getSQLType()).toBe("boolean");
    expect(locked?.default).toBe(false);
  });

  it("uses 1024-dimension embeddings with a cosine HNSW index", () => {
    const kb = getTableConfig(schema.kbChunks);
    expect(kb.columns.find((c) => c.name === "embedding")?.getSQLType()).toBe(`vector(${schema.EMBEDDING_DIMENSIONS})`);
    const idx = kb.indexes.find((i) => i.config.name === "kb_chunks_embedding_idx");
    expect(idx?.config.method).toBe("hnsw");
  });

  it("builds DB enums from the shared enum lists", () => {
    expect(schema.budgetCategoryEnum.enumValues).toEqual([...BUDGET_CATEGORIES]);
    expect(schema.cultureEnum.enumValues).toEqual([...CULTURES]);
  });
});
