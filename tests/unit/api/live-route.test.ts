import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as createDemo } from "@/app/api/demo/route";
import { POST as live } from "@/app/api/events/[id]/live/route";
import { GET as getEvent } from "@/app/api/events/[id]/route";
import { finalizeReshuffle, incidentSlug } from "@/lib/ai/agents/dayof";
import { AIValidationError } from "@/lib/ai/errors";
import { createDemoEvent } from "@/lib/plan/demo-event";
import { MemoryEventRepository } from "@/lib/plan/event-repo";
import { liveDate, liveGroups } from "@/lib/plan/live-view";
import type { StoredEvent } from "@/lib/plan/types";
import { buildRunOfShow } from "@/lib/rules/run-of-show";
import type { LiveProposal, LiveState, ReshuffleDraft } from "@/lib/schemas/dayof";

const params = (id: string) => ({ params: Promise.resolve({ id }) });
const post = (id: string, body: unknown) => live(new Request("http://test", { method: "POST", body: JSON.stringify(body) }), params(id));
const newEvent = async () => ((await (await createDemo()).json()) as { event: StoredEvent }).event;
const read = async (id: string) => ((await (await getEvent(new Request("http://test"), params(id))).json()) as { event: StoredEvent }).event;
const propose = async (id: string, incident: string) => ((await (await post(id, { incident })).json()) as { proposal: LiveProposal }).proposal;

beforeEach(() => {
  vi.stubEnv("DEMO_MODE", "true");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/events/:id/live", () => {
  it("proposes without moving anything or sending anything", async () => {
    const event = await newEvent();
    const proposal = await propose(event.id, "Photographer 30 min late");
    expect(proposal.moves[0]).toMatchObject({ slotId: "bor_boron", from: "6:30 PM", to: "7:00 PM", deltaMinutes: 30 });
    expect(proposal.moves).toHaveLength(6); // the rest of the Biye
    expect(proposal.moves.some((m) => m.functionName === "Bashor Raat")).toBe(false); // spare time absorbs it
    expect((await read(event.id)).live).toMatchObject({ shifts: {}, notifications: [] });
  });

  it("fills the code's times into the messages and warns about the muhurat", async () => {
    const event = await newEvent();
    const proposal = await propose(event.id, "Photographer 30 min late");
    expect(proposal.messages[0]).toMatchObject({ to: "Photographer" });
    expect(proposal.messages[0]?.body).toContain("will now begin at 7:00 PM");
    expect(proposal.messages.every((m) => !m.body.includes("{"))).toBe(true);
    expect(proposal.warnings.join(" ")).toContain("muhurat");
  });

  it("applies on confirm, records the messages, and a second delay adds to the first", async () => {
    const event = await newEvent();
    const first = await propose(event.id, "Photographer 30 min late");
    const res = await post(event.id, { confirm: first.id });
    expect(res.status).toBe(200);
    const { live: state } = (await res.json()) as { live: LiveState };
    expect(state.proposal).toBeNull();
    expect(state.notifications).toHaveLength(first.messages.length);
    expect(state.notifications[0]).toMatchObject({ channel: "whatsapp", status: "logged" });
    expect(state.incidents[0]?.incident).toBe("Photographer 30 min late");

    const second = await propose(event.id, "Priest 20 min late");
    expect(second.moves[0]).toMatchObject({ slotId: "sampradan", from: "8:00 PM", to: "8:20 PM" });
    await post(event.id, { confirm: second.id });
    expect((await read(event.id)).live.shifts).toMatchObject({ bor_boron: 30, sampradan: 50 });
  });

  it("leaves the agreed plan and budget alone", async () => {
    const event = await newEvent();
    await post(event.id, { confirm: (await propose(event.id, "Photographer 30 min late")).id });
    const after = await read(event.id);
    expect(after.plan).toEqual(event.plan);
    expect(after.version).toBe(event.version);
  });

  it("refuses to confirm twice, or a proposal that was replaced", async () => {
    const event = await newEvent();
    const old = await propose(event.id, "Photographer 30 min late");
    const current = await propose(event.id, "Priest 20 min late");
    expect((await post(event.id, { confirm: old.id })).status).toBe(409);
    expect((await post(event.id, { confirm: current.id })).status).toBe(200);
    expect((await post(event.id, { confirm: current.id })).status).toBe(409);
  });

  it("explains itself in demo mode for an unknown incident, and rejects bad input", async () => {
    const event = await newEvent();
    const res = await post(event.id, { incident: "Rain at the venue" });
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ error: { code: "DEMO_FIXTURE_MISSING" } });
    expect((await post(event.id, { incident: "x" })).status).toBe(400);
    expect((await post("00000000-0000-0000-0000-000000000000", { incident: "Priest 20 min late" })).status).toBe(404);
  });
});

describe("finalizeReshuffle", () => {
  const setup = async () => {
    const event = await createDemoEvent(new MemoryEventRepository(), { today: "2026-10-30" });
    return { event, slots: buildRunOfShow(event.plan.functions, event.rituals.rituals, "2027-02-14") };
  };
  const draft = (over: Partial<ReshuffleDraft> = {}): ReshuffleDraft => ({
    summary: "Running late.",
    fromSlotId: "bor_boron",
    delayMinutes: 30,
    notify: [{ category: "priest", reason: "Timing", message: "{slot} starts at {new_time}." }],
    ...over,
  });

  it("replaces a message that states its own clock time", async () => {
    const { event, slots } = await setup();
    const p = finalizeReshuffle(draft({ notify: [{ category: "catering", reason: "r", message: "Dinner is now at 9:15 PM." }] }), event, slots, "Late", "id");
    expect(p.messages[0]?.body).toBe("Namaste, an update for today: Running late. Bor Boron now starts at 7:00 PM. Thank you.");
  });

  it("drops a summary that states a clock time", async () => {
    const { event, slots } = await setup();
    expect(finalizeReshuffle(draft({ summary: "Starting at 7pm." }), event, slots, "Priest late", "id").summary).toBe("Reported: Priest late");
  });

  it("moves nothing when no delay is needed, and never leaves a placeholder", async () => {
    const { event, slots } = await setup();
    const p = finalizeReshuffle(draft({ fromSlotId: null, delayMinutes: 0 }), event, slots, "Flowers short", "id");
    expect(p).toMatchObject({ moves: [], warnings: [], deltas: {} });
    expect(p.messages[0]?.body).not.toContain("{");
  });

  it("rejects a slot the model made up", async () => {
    const { event, slots } = await setup();
    expect(() => finalizeReshuffle(draft({ fromSlotId: "made_up" }), event, slots, "Late", "id")).toThrow(AIValidationError);
  });

  it("warns when a long delay runs past the planned finish and into the next function", async () => {
    const { event, slots } = await setup();
    const p = finalizeReshuffle(draft({ delayMinutes: 180 }), event, slots, "Late", "id");
    expect(p.moves.at(-1)).toMatchObject({ functionName: "Bashor Raat", deltaMinutes: 45 });
    expect(p.warnings.join(" ")).toContain("Biye (wedding ceremony) now runs until 12:15 AM (next day), past its planned finish of 11:30 PM.");
  });
});

describe("live view", () => {
  it("uses today when something is on, otherwise the main day", async () => {
    const event = await createDemoEvent(new MemoryEventRepository(), { today: "2026-10-30" });
    expect(liveDate(event, "2027-02-15")).toBe("2027-02-15");
    expect(liveDate(event, "2026-11-01")).toBe("2027-02-14");
  });

  it("groups slots by function and shows how far behind they are", async () => {
    const event = await createDemoEvent(new MemoryEventRepository(), { today: "2026-10-30" });
    const groups = liveGroups({ ...event, live: { ...event.live, shifts: { bor_boron: 30 } } }, "2027-02-14");
    expect(groups.map((g) => g.functionName)).toEqual(["Gaye Holud", "Biye (wedding ceremony)", "Bashor Raat"]);
    expect(groups[1]?.slots[0]).toMatchObject({ time: "7:00 PM – 7:30 PM", delayMinutes: 30 });
  });

  it("slugs an incident into a fixture name", () => {
    expect(incidentSlug("Photographer 30 min late!")).toBe("photographer-30-min-late");
  });
});
