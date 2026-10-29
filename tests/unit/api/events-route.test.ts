import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as getEvent } from "@/app/api/events/[id]/route";
import { GET as listEvents, POST as createEvent } from "@/app/api/events/route";

/** Calls the real route handlers in demo mode: no API key, no database. */

const DEMO_BODY = {
  eventType: "wedding",
  culture: "bengali_hindu",
  city: "Kolkata",
  startDate: "2027-02-14",
  guestCount: 250,
  budgetTotalPaise: 150000000,
};

const post = (body: unknown) =>
  createEvent(new Request("http://test/api/events", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) }));
const get = (id: string) => getEvent(new Request(`http://test/api/events/${id}`), { params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.stubEnv("DEMO_MODE", "true");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/events", () => {
  it("builds and stores the demo wedding plan", async () => {
    const res = await post(DEMO_BODY);
    expect(res.status).toBe(201);
    const { event } = (await res.json()) as { event: Record<string, unknown> & { id: string } };
    expect(event).toMatchObject({ title: "Bengali Hindu wedding in Kolkata", status: "planning", version: 1, cityTier: 1 });
    expect(event).toHaveProperty("rituals.rituals");
    expect(event).toHaveProperty("budget.totalEstimatePaise", 144000000);
    expect((event as unknown as { timeline: { tasks: unknown[] } }).timeline.tasks.length).toBeGreaterThanOrEqual(20);

    const fetched = await get(event.id);
    expect(fetched.status).toBe(200);
    expect(((await fetched.json()) as { event: { id: string } }).event.id).toBe(event.id);

    const list = (await (await listEvents()).json()) as { events: Array<{ id: string }> };
    expect(list.events.some((e) => e.id === event.id)).toBe(true);
  });

  it("rejects invalid answers with per-field messages", async () => {
    const res = await post({ ...DEMO_BODY, guestCount: 0, startDate: "14/02/2027" });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string; message: string; fields: Record<string, string> } };
    expect(body.error.code).toBe("INVALID_INPUT");
    expect(Object.keys(body.error.fields).sort()).toEqual(["guestCount", "startDate"]);
  });

  it("rejects malformed JSON", async () => {
    const res = await post("{not json");
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("INVALID_INPUT");
  });

  it("explains when demo mode has no saved plan for a tradition", async () => {
    const res = await post({ ...DEMO_BODY, culture: "tamil_brahmin", city: "Chennai" });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("DEMO_FIXTURE_MISSING");
    expect(body.error.message).not.toMatch(/fixtures|\.json|stack/i);
  });
});

describe("GET /api/events/:id", () => {
  it("returns 404 for an unknown event", async () => {
    const res = await get("00000000-0000-0000-0000-000000000000");
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("NOT_FOUND");
  });
});
