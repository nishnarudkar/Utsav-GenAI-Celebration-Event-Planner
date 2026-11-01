import { eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { events } from "@/lib/db/schema";
import { createDemoEvent } from "@/lib/plan/demo-event";
import { getEventRepository, MemoryEventRepository, usesPostgres } from "@/lib/plan/event-repo";

/**
 * Proves saving works against the real database: builds a sample event from saved answers, runs
 * it through every kind of change, reads it back, then deletes it. Costs no AI quota.
 * Run it with `pnpm db:check`.
 */

function expectEqual(label: string, actual: unknown, expected: unknown): void {
  const [a, b] = [JSON.stringify(actual), JSON.stringify(expected)];
  if (a !== b) throw new Error(`${label}: expected ${b}, got ${a}`);
  console.log(`OK   ${label}`);
}

async function main(): Promise<void> {
  // Built in memory from fixtures, then copied in: this checks storage, not AI.
  process.env.DEMO_MODE = "true";
  const sample = await createDemoEvent(new MemoryEventRepository());
  process.env.DEMO_MODE = "false";
  if (!usesPostgres()) throw new Error("DATABASE_URL isn't set.");

  const { title, answers, cityTier, cityTierKnown, rituals, plan, budget, timeline } = sample;
  const samplePlan = { title, answers, cityTier, cityTierKnown, rituals, plan, budget, timeline };
  const repo = getEventRepository();
  const created = await repo.create(samplePlan);
  const { id } = created;
  try {
    expectEqual("create, then read back", (await repo.get(id))?.title, sample.title);
    expectEqual("listed", (await repo.list()).some((e) => e.id === id), true);
    expectEqual("unknown event", await repo.get("00000000-0000-0000-0000-000000000000"), null);
    expectEqual("malformed id", await repo.get("not-a-uuid"), null);

    expectEqual("tick a permission", await repo.setPermitDone(id, "fire_noc", true), ["fire_noc"]);
    const volunteer = await repo.addVolunteer(id, { name: "Sample", role: "general", functionName: sample.plan.functions[0]?.name ?? "" });
    expectEqual("add a volunteer", (await repo.get(id))?.volunteers.map((v) => v.id), [volunteer?.id]);
    expectEqual("remove a volunteer", await repo.removeVolunteer(id, volunteer?.id ?? ""), true);

    const applied = await repo.applyChange(id, 1, { ...samplePlan, title: "Changed title" }, { trigger: { field: "guest_count", value: 300, from: 250 }, diff: { version: 2, budgetDeltaPaise: 0, changed: [], added: [], removed: [], conflicts: [], recoveryOptions: [], explanation: "Sample" } });
    expectEqual("apply a change", applied.ok && applied.event.version, 2);
    expectEqual("stale version refused", await repo.applyChange(id, 1, samplePlan, { trigger: { field: "guest_count", value: 300, from: 250 }, diff: { version: 2, budgetDeltaPaise: 0, changed: [], added: [], removed: [], conflicts: [], recoveryOptions: [], explanation: "" } }), { ok: false, error: "version_conflict" });
    expectEqual("change log", (await repo.listChanges(id))?.map((c) => [c.version, c.undone]), [[2, false]]);

    const undone = await repo.undoLatest(id);
    expectEqual("undo restores the plan", undone.ok && undone.event.title, sample.title);
    expectEqual("undo keeps state outside the plan", (await repo.get(id))?.permitsDone, ["fire_noc"]);
    expectEqual("undo is logged", (await repo.listChanges(id))?.map((c) => c.undone), [true]);
    expectEqual("nothing more to undo", await repo.undoLatest(id), { ok: false, error: "nothing_to_undo" });

    // The anon key ships to browsers, so with a real row present it must still see nothing.
    const publicApi = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/events?select=id`, { headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "" } });
    expectEqual("public API can't read events", publicApi.ok ? await publicApi.json() : [], []);

    const open = await getDb().execute<{ tablename: string }>(sql`select tablename from pg_tables where schemaname = 'public' and not rowsecurity`);
    expectEqual("every table has row level security", open.map((t) => t.tablename), []);

    const racers = await Promise.all(["a", "b", "c"].map((p) => repo.setPermitDone(id, p, true)));
    expectEqual("concurrent writes all land", racers.length === 3 && (await repo.get(id))?.permitsDone.length, 4);
  } finally {
    await getDb().delete(events).where(eq(events.id, id));
  }
  expectEqual("sample removed", (await getDb().select({ id: events.id }).from(events).where(inArray(events.id, [id]))).length, 0);
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error(`FAIL ${err instanceof Error ? err.message.slice(0, 400) : "unknown error"}`);
    process.exit(1);
  });
