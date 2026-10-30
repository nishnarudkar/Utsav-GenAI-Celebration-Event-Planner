import "server-only";
import type { ChangeRecord, ChangeTrigger, EventPlan, EventSummary, StoredEvent, StoredQuote } from "@/lib/plan/types";
import type { PlanDiff } from "@/lib/schemas/diff";

/**
 * Persistence for generated plans and their change log. `MemoryEventRepository` keeps both in
 * process memory (lost on restart) so the app runs without a database; a Drizzle/Supabase
 * implementation of the same interface replaces it once DATABASE_URL is configured.
 */

export type ApplyResult =
  | { ok: true; event: StoredEvent; change: ChangeRecord }
  | { ok: false; error: "not_found" | "version_conflict" };

export type UndoResult = { ok: true; event: StoredEvent; undone: ChangeRecord } | { ok: false; error: "not_found" | "nothing_to_undo" };

export interface EventRepository {
  create(plan: EventPlan): Promise<StoredEvent>;
  get(id: string): Promise<StoredEvent | null>;
  list(): Promise<EventSummary[]>;
  /** Tick or untick a ritual item. Returns the updated ticked list, or null if the event doesn't exist. */
  setItemProcured(id: string, itemId: string, procured: boolean): Promise<string[] | null>;
  /**
   * Store a cascade's result: replace the plan, bump the version, log the change with the
   * previous plan. Fails with "version_conflict" if the event changed since `expectedVersion`.
   */
  applyChange(id: string, expectedVersion: number, next: EventPlan, log: { trigger: ChangeTrigger; diff: PlanDiff }): Promise<ApplyResult>;
  /** Store a checked quote. Returns it with its id, or null if the event doesn't exist. */
  addQuote(id: string, quote: Omit<StoredQuote, "id" | "createdAt">): Promise<StoredQuote | null>;
  /** Change log, newest first. */
  listChanges(id: string): Promise<ChangeRecord[] | null>;
  /** Restore the plan from before the most recent change that hasn't been undone. */
  undoLatest(id: string): Promise<UndoResult>;
}

/** Fields of a stored event that belong to the plan itself (what a cascade replaces and Undo restores). */
function planOf(e: StoredEvent): EventPlan {
  const { title, answers, cityTier, cityTierKnown, rituals, plan, budget, timeline } = e;
  return { title, answers, cityTier, cityTierKnown, rituals, plan, budget, timeline };
}

interface Store {
  events: Map<string, StoredEvent>;
  changes: Map<string, ChangeRecord[]>;
}

export class MemoryEventRepository implements EventRepository {
  constructor(
    private readonly store: Store = { events: new Map(), changes: new Map() },
    private readonly now: () => Date = () => new Date(),
  ) {}

  async create(plan: EventPlan): Promise<StoredEvent> {
    const ts = this.now().toISOString();
    const event: StoredEvent = {
      ...structuredClone(plan),
      id: crypto.randomUUID(),
      status: "planning",
      version: 1,
      procuredItems: [],
      quotes: [],
      createdAt: ts,
      updatedAt: ts,
    };
    this.store.events.set(event.id, event);
    this.store.changes.set(event.id, []);
    return structuredClone(event);
  }

  async get(id: string): Promise<StoredEvent | null> {
    const event = this.store.events.get(id);
    return event ? structuredClone(event) : null;
  }

  async setItemProcured(id: string, itemId: string, procured: boolean): Promise<string[] | null> {
    const event = this.store.events.get(id);
    if (!event) return null;
    const items = new Set(event.procuredItems);
    if (procured) items.add(itemId);
    else items.delete(itemId);
    event.procuredItems = [...items].sort();
    event.updatedAt = this.now().toISOString();
    return [...event.procuredItems];
  }

  async applyChange(id: string, expectedVersion: number, next: EventPlan, log: { trigger: ChangeTrigger; diff: PlanDiff }): Promise<ApplyResult> {
    const event = this.store.events.get(id);
    if (!event) return { ok: false, error: "not_found" };
    if (event.version !== expectedVersion) return { ok: false, error: "version_conflict" };

    const ts = this.now().toISOString();
    const record: ChangeRecord = {
      id: crypto.randomUUID(),
      eventId: id,
      version: expectedVersion + 1,
      trigger: structuredClone(log.trigger),
      diff: structuredClone(log.diff),
      before: structuredClone(planOf(event)),
      undone: false,
      createdAt: ts,
    };
    const updated: StoredEvent = { ...event, ...structuredClone(next), version: record.version, updatedAt: ts };
    this.store.events.set(id, updated);
    this.store.changes.set(id, [...(this.store.changes.get(id) ?? []), record]);
    return { ok: true, event: structuredClone(updated), change: structuredClone(record) };
  }

  async addQuote(id: string, quote: Omit<StoredQuote, "id" | "createdAt">): Promise<StoredQuote | null> {
    const event = this.store.events.get(id);
    if (!event) return null;
    const ts = this.now().toISOString();
    const stored: StoredQuote = { ...structuredClone(quote), id: crypto.randomUUID(), createdAt: ts };
    event.quotes = [stored, ...event.quotes];
    event.updatedAt = ts;
    return structuredClone(stored);
  }

  async listChanges(id: string): Promise<ChangeRecord[] | null> {
    const changes = this.store.changes.get(id);
    return changes ? structuredClone([...changes].reverse()) : null;
  }

  async undoLatest(id: string): Promise<UndoResult> {
    const event = this.store.events.get(id);
    if (!event) return { ok: false, error: "not_found" };
    const latest = [...(this.store.changes.get(id) ?? [])].reverse().find((c) => !c.undone);
    if (!latest) return { ok: false, error: "nothing_to_undo" };

    latest.undone = true;
    // Undo is itself a new version, so versions only ever increase.
    const restored: StoredEvent = { ...event, ...structuredClone(latest.before), version: event.version + 1, updatedAt: this.now().toISOString() };
    this.store.events.set(id, restored);
    return { ok: true, event: structuredClone(restored), undone: structuredClone(latest) };
  }

  async list(): Promise<EventSummary[]> {
    return [...this.store.events.values()]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((e) => ({
        id: e.id,
        title: e.title,
        eventType: e.answers.eventType,
        city: e.answers.city,
        startDate: e.answers.startDate,
        guestCount: e.answers.guestCount,
        budgetTotalPaise: e.budget.budgetTotalPaise,
        status: e.status,
      }));
  }
}

// One store per server process, kept on globalThis so Next's dev hot-reload doesn't wipe it.
const globalStore = globalThis as typeof globalThis & { __utsavStore?: Store };

export function getEventRepository(): EventRepository {
  globalStore.__utsavStore ??= { events: new Map(), changes: new Map() };
  return new MemoryEventRepository(globalStore.__utsavStore);
}
