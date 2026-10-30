import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { GET as exportPlan } from "@/app/api/events/[id]/export/route";
import { POST as createEvent } from "@/app/api/events/route";
import { createDemoEvent } from "@/lib/plan/demo-event";
import { MemoryEventRepository } from "@/lib/plan/event-repo";
import { eventToICS, exportFileName } from "@/lib/plan/export-ics";
import { eventToPDF } from "@/lib/plan/export-pdf";
import type { StoredEvent } from "@/lib/plan/types";

let demo: StoredEvent;

beforeAll(async () => {
  vi.stubEnv("DEMO_MODE", "true");
  demo = await createDemoEvent(new MemoryEventRepository(), { today: "2026-10-30" });
});
afterAll(() => {
  vi.unstubAllEnvs();
});

/** Undo line folding, then split into VEVENT blocks. */
function parse(ics: string) {
  const lines = ics.replace(/\r\n /g, "").split("\r\n");
  const events: Array<Record<string, string>> = [];
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") events.push({});
    const at = line.indexOf(":");
    const event = events.at(-1);
    if (event && at > 0) event[line.slice(0, at)] = line.slice(at + 1);
  }
  return { lines, events };
}

describe("eventToICS", () => {
  it("has one event per function and task, each with a unique id", () => {
    const { lines, events } = parse(eventToICS(demo));
    expect(lines[0]).toBe("BEGIN:VCALENDAR");
    expect(lines.at(-2)).toBe("END:VCALENDAR");
    expect(events).toHaveLength(demo.plan.functions.length + demo.timeline.tasks.length);
    expect(new Set(events.map((e) => e.UID)).size).toBe(events.length);
  });

  it("converts IST to UTC and carries overnight functions into the next day", () => {
    const fn = { ...demo.plan.functions[0]!, name: "Bashor Raat", date: "2027-02-14", startTime: "23:30", endTime: "04:00", ritualKeys: [] };
    const { events } = parse(eventToICS({ ...demo, plan: { ...demo.plan, functions: [fn] } }));
    expect(events[0]).toMatchObject({ DTSTART: "20270214T180000Z", DTEND: "20270214T223000Z", SUMMARY: "Bashor Raat" });
  });

  it("makes tasks all-day, ending the next day, and not busy", () => {
    const task = { ...demo.timeline.tasks[0]!, title: "Pay, then confirm; soon", dueDate: "2027-01-31" };
    const { events } = parse(eventToICS({ ...demo, plan: { ...demo.plan, functions: [] }, timeline: { ...demo.timeline, tasks: [task] } }));
    expect(events[0]).toMatchObject({
      "DTSTART;VALUE=DATE": "20270131",
      "DTEND;VALUE=DATE": "20270201",
      SUMMARY: "To do: Pay\\, then confirm\\; soon",
      TRANSP: "TRANSPARENT",
    });
  });

  it("uses CRLF and folds lines at 75 bytes, even within multi-byte text", () => {
    const longName = "রিসেপশন ".repeat(20);
    const ics = eventToICS({ ...demo, title: longName });
    for (const line of ics.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(ics.replace(/\r\n /g, "")).toContain(`X-WR-CALNAME:${longName}`);
  });
});

describe("exportFileName", () => {
  it("makes a safe name and falls back when nothing is left", () => {
    expect(exportFileName("Ananya & Rohan’s wedding", "pdf")).toBe("utsav-ananya-rohan-s-wedding.pdf");
    expect(exportFileName("বিয়ে", "ics")).toBe("utsav-plan.ics");
  });
});

describe("eventToPDF", () => {
  it("renders a multi-page PDF", async () => {
    const pdf = await eventToPDF(demo);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.toString("latin1").match(/\/Type \/Page\b/g)?.length).toBeGreaterThan(1);
  }, 30_000);
});

describe("GET /api/events/:id/export", () => {
  const params = (id: string) => ({ params: Promise.resolve({ id }) });
  const get = (id: string, format: string) => exportPlan(new Request(`http://test/api/events/${id}/export?format=${format}`), params(id));
  const BODY = { eventType: "wedding", culture: "bengali_hindu", city: "Kolkata", startDate: "2027-02-14", guestCount: 250, budgetTotalPaise: 150000000 };

  it("downloads the calendar file, and rejects bad requests", async () => {
    const res = await createEvent(new Request("http://test/api/events", { method: "POST", body: JSON.stringify(BODY) }));
    const { event } = (await res.json()) as { event: StoredEvent };

    const ics = await get(event.id, "ics");
    expect(ics.status).toBe(200);
    expect(ics.headers.get("Content-Type")).toContain("text/calendar");
    expect(ics.headers.get("Content-Disposition")).toBe('attachment; filename="utsav-bengali-hindu-wedding-in-kolkata.ics"');
    expect(await ics.text()).toContain("BEGIN:VCALENDAR");

    expect((await get(event.id, "docx")).status).toBe(400);
    expect((await get("00000000-0000-0000-0000-000000000000", "pdf")).status).toBe(404);
  });
});
