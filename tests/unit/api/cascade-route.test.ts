import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as listChanges } from "@/app/api/events/[id]/changes/route";
import { PUT as putItem } from "@/app/api/events/[id]/ritual-items/route";
import { GET as getEvent, PATCH as patchEvent } from "@/app/api/events/[id]/route";
import { POST as recover } from "@/app/api/events/[id]/recovery/route";
import { POST as undo } from "@/app/api/events/[id]/undo/route";
import { POST as createEvent } from "@/app/api/events/route";
import { MemoryEventRepository } from "@/lib/plan/event-repo";
import type { StoredEvent } from "@/lib/plan/types";
import type { PlanDiff } from "@/lib/schemas/diff";

/** The cascade API end to end, in demo mode (no API key, no database). */

const DEMO_BODY = {
  eventType: "wedding",
  culture: "bengali_hindu",
  city: "Kolkata",
  startDate: "2027-02-14",
  guestCount: 250,
  budgetTotalPaise: 150000000,
};

const params = (id: string) => ({ params: Promise.resolve({ id }) });
const json = async <T>(res: Response) => (await res.json()) as T;

async function newEvent(): Promise<StoredEvent> {
  const res = await createEvent(new Request("http://test/api/events", { method: "POST", body: JSON.stringify(DEMO_BODY) }));
  return (await json<{ event: StoredEvent }>(res)).event;
}
const patch = (id: string, body: unknown, query = "") =>
  patchEvent(new Request(`http://test/api/events/${id}${query}`, { method: "PATCH", body: JSON.stringify(body) }), params(id));
const read = async (id: string) => (await json<{ event: StoredEvent }>(await getEvent(new Request("http://test"), params(id)))).event;
const doUndo = (id: string) => undo(new Request("http://test", { method: "POST" }), params(id));

beforeEach(() => {
  vi.stubEnv("DEMO_MODE", "true");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("PATCH /api/events/:id", () => {
  it("runs the cascade, saves the new plan and returns the diff", async () => {
    const event = await newEvent();
    const res = await patch(event.id, { field: "guest_count", value: 350 });
    expect(res.status).toBe(200);
    const { event: updated, diff } = await json<{ event: StoredEvent; diff: PlanDiff }>(res);

    expect(updated).toMatchObject({ version: 2, answers: { guestCount: 350 }, budget: { totalEstimatePaise: 164720000 } });
    expect(diff).toMatchObject({ version: 2, budgetDeltaPaise: 20720000 });
    expect(diff.conflicts.map((c) => c.type)).toEqual(["over_budget"]); // no venue capacity set on API-created events
    expect((await read(event.id)).answers.guestCount).toBe(350);
  });

  it("attaches recovery options and keeps the explanation's amounts grounded", async () => {
    const event = await newEvent();
    const { diff } = await json<{ diff: PlanDiff }>(await patch(event.id, { field: "guest_count", value: 350 }));
    expect(diff.recoveryOptions.map((o) => [o.title, o.savesPaise])).toEqual([
      ["Choose budget-friendly attire", 9300000],
      ["Choose budget-friendly gifts", 2500000],
      ["Switch to digital invitations", 2220000],
    ]);
    // The demo explanation mentions the ₹1L "keep 300 guests" option, which doesn't exist without a
    // venue capacity — so the guard rejects it and the deterministic summary is used.
    expect(diff.explanation).toBe("Guest count changed from 250 to 350. 4 budget items were recalculated (+₹2.1L). 1 conflict needs attention: over budget.");
  });

  it("previews with ?dryRun=true without saving anything", async () => {
    const event = await newEvent();
    const res = await patch(event.id, { field: "budget_total", value: 120000000 }, "?dryRun=true");
    const body = await json<{ event: StoredEvent; diff: PlanDiff; dryRun: boolean }>(res);
    expect(body.dryRun).toBe(true);
    expect(body.event.budget.budgetTotalPaise).toBe(120000000);
    expect(body.diff.conflicts[0]?.type).toBe("over_budget");

    const stored = await read(event.id);
    expect(stored).toMatchObject({ version: 1, budget: { budgetTotalPaise: 150000000 } });
    const { changes } = await json<{ changes: unknown[] }>(await listChanges(new Request("http://test"), params(event.id)));
    expect(changes).toEqual([]);
  });

  it("reports a no-op without bumping the version", async () => {
    const event = await newEvent();
    const body = await json<{ noop: boolean; event: StoredEvent }>(await patch(event.id, { field: "city", value: "Kolkata" }));
    expect(body.noop).toBe(true);
    expect((await read(event.id)).version).toBe(1);
  });

  it("validates the change and the event", async () => {
    const event = await newEvent();
    expect((await patch(event.id, { field: "guest_count", value: -5 })).status).toBe(400);
    expect((await patch(event.id, { field: "venue", value: "Lawn" })).status).toBe(400);
    expect((await patch("00000000-0000-0000-0000-000000000000", { field: "guest_count", value: 300 })).status).toBe(404);
  });
});

describe("change log and undo", () => {
  it("logs changes and undoes them newest first, restoring the exact plan", async () => {
    const original = await newEvent();
    await patch(original.id, { field: "guest_count", value: 350 });
    await patch(original.id, { field: "start_date", value: "2027-02-21" });

    const { changes } = await json<{ changes: Array<{ version: number; field: string; from: unknown; to: unknown; undone: boolean }> }>(
      await listChanges(new Request("http://test"), params(original.id)),
    );
    expect(changes.map((c) => [c.version, c.field, c.from, c.to, c.undone])).toEqual([
      [3, "start_date", "2027-02-14", "2027-02-21", false],
      [2, "guest_count", 250, 350, false],
    ]);
    expect(changes[0]).not.toHaveProperty("before"); // snapshots stay on the server

    // Undo the date move.
    const first = await json<{ event: StoredEvent; undone: { field: string } }>(await doUndo(original.id));
    expect(first.undone.field).toBe("start_date");
    expect(first.event).toMatchObject({ version: 4, answers: { startDate: "2027-02-14", guestCount: 350 } });

    // Undo the guest change: back to the original plan, version still increasing.
    const second = await json<{ event: StoredEvent }>(await doUndo(original.id));
    expect(second.event.version).toBe(5);
    expect(second.event.budget).toEqual(original.budget);
    expect(second.event.plan).toEqual(original.plan);
    expect(second.event.timeline).toEqual(original.timeline);

    const nothing = await doUndo(original.id);
    expect(nothing.status).toBe(409);
    expect((await json<{ error: { code: string } }>(nothing)).error.code).toBe("NOTHING_TO_UNDO");
  });

  it("keeps ritual checklist ticks across changes and undo", async () => {
    const event = await newEvent();
    await putItem(new Request("http://test", { method: "PUT", body: JSON.stringify({ itemId: "gaye_holud#0", procured: true }) }), params(event.id));
    await patch(event.id, { field: "guest_count", value: 300 });
    await doUndo(event.id);
    expect((await read(event.id)).procuredItems).toEqual(["gaye_holud#0"]);
  });

  it("returns 404 for unknown events", async () => {
    expect((await doUndo("00000000-0000-0000-0000-000000000000")).status).toBe(404);
    expect((await listChanges(new Request("http://test"), params("00000000-0000-0000-0000-000000000000"))).status).toBe(404);
  });
});

describe("POST /api/events/:id/recovery", () => {
  const applyOption = (id: string, optionId: string) =>
    recover(new Request("http://test", { method: "POST", body: JSON.stringify({ optionId }) }), params(id));

  it("applies an offered option, logs it, and can be undone", async () => {
    const event = await newEvent();
    await patch(event.id, { field: "guest_count", value: 350 });
    const before = await read(event.id);

    const res = await applyOption(event.id, "tier:attire");
    expect(res.status).toBe(200);
    const { event: updated, diff } = await json<{ event: StoredEvent; diff: PlanDiff }>(res);
    expect(updated.version).toBe(3);
    expect(updated.budget.totalEstimatePaise).toBe(before.budget.totalEstimatePaise - 9300000);
    expect(diff.explanation).toMatch(/^Applied “Choose budget-friendly attire”\./);
    // Still over budget, so fresh options are offered — without the one just applied.
    expect(diff.recoveryOptions.map((o) => o.id)).not.toContain("tier:attire");

    const { changes } = await json<{ changes: Array<{ field: string; to: unknown; from: unknown }> }>(
      await listChanges(new Request("http://test"), params(event.id)),
    );
    expect(changes[0]).toMatchObject({ field: "recovery", to: "Choose budget-friendly attire", from: null });

    await doUndo(event.id);
    expect((await read(event.id)).budget).toEqual(before.budget);
  });

  it("rejects options that weren't offered by the latest change", async () => {
    const event = await newEvent();
    await patch(event.id, { field: "guest_count", value: 350 });
    expect((await applyOption(event.id, "tier:priest")).status).toBe(409);
    expect((await applyOption(event.id, "")).status).toBe(400);
    expect((await applyOption("00000000-0000-0000-0000-000000000000", "tier:attire")).status).toBe(404);
  });
});

describe("MemoryEventRepository.applyChange", () => {
  it("rejects a stale version so concurrent edits can't overwrite each other", async () => {
    const repo = new MemoryEventRepository();
    const created = await newEvent();
    const { id: _i, status: _s, version: _v, procuredItems: _p, createdAt: _c, updatedAt: _u, ...plan } = created;
    const event = await repo.create(plan);
    const trigger = { field: "guest_count" as const, value: 300, from: 250 };
    const diff = { version: 2, budgetDeltaPaise: 0, changed: [], added: [], removed: [], conflicts: [], recoveryOptions: [], explanation: "" };
    expect((await repo.applyChange(event.id, 1, plan, { trigger, diff })).ok).toBe(true);
    expect(await repo.applyChange(event.id, 1, plan, { trigger, diff })).toEqual({ ok: false, error: "version_conflict" });
    expect(await repo.applyChange("missing", 1, plan, { trigger, diff })).toEqual({ ok: false, error: "not_found" });
  });
});
