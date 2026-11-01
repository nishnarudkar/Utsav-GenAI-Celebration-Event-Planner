import "server-only";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/lib/db";
import { events, planChanges } from "@/lib/db/schema";
import { summaryOf, type EventRepository, type MemoryStore } from "@/lib/plan/event-repo";
import type { ChangeRecord, EventPlan, EventSummary, StoredEvent } from "@/lib/plan/types";

/**
 * Postgres persistence. Each event is one row whose `state_json` holds the whole StoredEvent, and
 * every operation runs the in-memory repository's logic on that row inside a locking transaction,
 * so the two can't drift apart. See docs/DECISIONS.md.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** JSONB is checked on the way out, at the depth the rest of the app relies on. */
const StoredShape = z.looseObject({
  id: z.string(),
  version: z.number().int(),
  plan: z.looseObject({}),
  budget: z.looseObject({}),
  answers: z.looseObject({}),
});

const parseEvent = (value: unknown) => StoredShape.parse(value) as unknown as StoredEvent;

function eventColumns(e: StoredEvent) {
  return {
    title: e.title,
    eventType: e.answers.eventType,
    culture: e.answers.culture,
    city: e.answers.city,
    cityTier: e.cityTier,
    startDate: e.plan.startDate,
    endDate: e.plan.endDate,
    guestCount: e.answers.guestCount,
    budgetTotalPaise: e.budget.budgetTotalPaise,
    vibeJson: e.vibe,
    status: e.status,
    version: e.version,
    stateJson: e,
    updatedAt: new Date(e.updatedAt),
  };
}

type ChangeRow = typeof planChanges.$inferSelect;
type EventMethod = Exclude<keyof EventRepository, "create" | "get" | "list">;

const changeRecord = (row: ChangeRow): ChangeRecord => ({
  id: row.id,
  eventId: row.eventId,
  version: row.version,
  trigger: row.triggerJson as ChangeRecord["trigger"],
  diff: row.diffJson as ChangeRecord["diff"],
  before: row.beforeJson as ChangeRecord["before"],
  undone: row.undone,
  createdAt: row.createdAt.toISOString(),
});

export class PostgresEventRepository implements EventRepository {
  constructor(
    private readonly db: Db,
    /** The in-memory repository, passed in so this file needs no value import of it. */
    private readonly over: (store: MemoryStore) => EventRepository,
  ) {}

  /**
   * Lock one event, run an operation on it, and save what changed. A missing event gives the
   * operation an empty store, so it returns its usual "not found" result.
   */
  private async withEvent<T>(
    id: string,
    op: (repo: EventRepository) => Promise<T>,
    opts: { changes?: boolean } = {},
  ): Promise<T> {
    const empty: MemoryStore = { events: new Map(), changes: new Map() };
    if (!UUID.test(id)) return op(this.over(empty));

    return this.db.transaction(async (tx) => {
      const [row] = await tx.select({ state: events.stateJson }).from(events).where(eq(events.id, id)).for("update");
      if (!row) return op(this.over(empty));

      const before = parseEvent(row.state);
      const loaded = opts.changes
        ? (await tx.select().from(planChanges).where(eq(planChanges.eventId, id)).orderBy(planChanges.version)).map(
            changeRecord,
          )
        : [];
      const undoneBefore = new Set(loaded.filter((c) => c.undone).map((c) => c.id));
      const knownIds = new Set(loaded.map((c) => c.id));
      const store: MemoryStore = { events: new Map([[id, structuredClone(before)]]), changes: new Map([[id, loaded]]) };

      const result = await op(this.over(store));

      const after = store.events.get(id);
      if (after && JSON.stringify(after) !== JSON.stringify(before))
        await tx.update(events).set(eventColumns(after)).where(eq(events.id, id));
      for (const change of store.changes.get(id) ?? []) {
        if (!knownIds.has(change.id)) {
          await tx.insert(planChanges).values({
            id: change.id,
            eventId: id,
            version: change.version,
            triggerJson: change.trigger,
            diffJson: change.diff,
            explanation: change.diff.explanation,
            beforeJson: change.before,
            undone: change.undone,
            createdAt: new Date(change.createdAt),
          });
        } else if (change.undone && !undoneBefore.has(change.id)) {
          await tx.update(planChanges).set({ undone: true }).where(eq(planChanges.id, change.id));
        }
      }
      return result;
    });
  }

  async create(plan: EventPlan): Promise<StoredEvent> {
    const store: MemoryStore = { events: new Map(), changes: new Map() };
    const event = await this.over(store).create(plan);
    await this.db.insert(events).values({ id: event.id, ...eventColumns(event), createdAt: new Date(event.createdAt) });
    return event;
  }

  async get(id: string): Promise<StoredEvent | null> {
    if (!UUID.test(id)) return null;
    const [row] = await this.db.select({ state: events.stateJson }).from(events).where(eq(events.id, id));
    return row ? parseEvent(row.state) : null;
  }

  async list(): Promise<EventSummary[]> {
    const rows = await this.db.select({ state: events.stateJson }).from(events).orderBy(desc(events.createdAt));
    return rows.map((r) => summaryOf(parseEvent(r.state)));
  }

  /** A method that runs on one locked event. Its first argument is always the event id. */
  private onEvent<K extends EventMethod>(method: K, opts: { changes?: boolean } = {}): EventRepository[K] {
    const run = (...args: unknown[]) =>
      this.withEvent(
        String(args[0]),
        (repo) => (repo[method] as (...a: unknown[]) => Promise<unknown>).apply(repo, args),
        opts,
      );
    return run as unknown as EventRepository[K];
  }

  readonly listChanges = this.onEvent("listChanges", { changes: true });
  readonly applyChange = this.onEvent("applyChange", { changes: true });
  readonly undoLatest = this.onEvent("undoLatest", { changes: true });
  readonly setItemProcured = this.onEvent("setItemProcured");
  readonly addQuote = this.onEvent("addQuote");
  readonly addStakeholder = this.onEvent("addStakeholder");
  readonly removeStakeholder = this.onEvent("removeStakeholder");
  readonly setCouncil = this.onEvent("setCouncil");
  readonly setChosenOption = this.onEvent("setChosenOption");
  readonly setLiveProposal = this.onEvent("setLiveProposal");
  readonly applyLive = this.onEvent("applyLive");
  readonly setPermitDone = this.onEvent("setPermitDone");
  readonly addVolunteer = this.onEvent("addVolunteer");
  readonly removeVolunteer = this.onEvent("removeVolunteer");
  readonly setSponsorship = this.onEvent("setSponsorship");
  readonly setVibe = this.onEvent("setVibe");
}
