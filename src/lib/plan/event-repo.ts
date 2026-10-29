import "server-only";
import type { EventPlan, EventSummary, StoredEvent } from "@/lib/plan/types";

/**
 * Persistence for generated plans. `MemoryEventRepository` keeps events in process memory
 * (lost on restart) so the app runs without a database; a Drizzle/Supabase implementation of
 * the same interface replaces it once DATABASE_URL is configured.
 */
export interface EventRepository {
  create(plan: EventPlan): Promise<StoredEvent>;
  get(id: string): Promise<StoredEvent | null>;
  list(): Promise<EventSummary[]>;
}

export class MemoryEventRepository implements EventRepository {
  constructor(
    private readonly store = new Map<string, StoredEvent>(),
    private readonly now: () => Date = () => new Date(),
  ) {}

  async create(plan: EventPlan): Promise<StoredEvent> {
    const ts = this.now().toISOString();
    const event: StoredEvent = { ...structuredClone(plan), id: crypto.randomUUID(), status: "planning", version: 1, createdAt: ts, updatedAt: ts };
    this.store.set(event.id, event);
    return structuredClone(event);
  }

  async get(id: string): Promise<StoredEvent | null> {
    const event = this.store.get(id);
    return event ? structuredClone(event) : null;
  }

  async list(): Promise<EventSummary[]> {
    return [...this.store.values()]
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
const globalStore = globalThis as typeof globalThis & { __utsavEventStore?: Map<string, StoredEvent> };

export function getEventRepository(): EventRepository {
  globalStore.__utsavEventStore ??= new Map();
  return new MemoryEventRepository(globalStore.__utsavEventStore);
}
