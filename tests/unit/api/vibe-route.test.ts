import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as createDemo } from "@/app/api/demo/route";
import { GET as getEvent } from "@/app/api/events/[id]/route";
import { POST as vibeRoute } from "@/app/api/events/[id]/vibe/route";
import { POST as createEvent } from "@/app/api/events/route";
import { generateVibe, type VibeDeps } from "@/lib/ai/agents/vibe";
import type { StoredEvent } from "@/lib/plan/types";
import { MAX_VIBE_IMAGE_BYTES, readableTextOn } from "@/lib/rules/vibe-file";
import { VibeProfile } from "@/lib/schemas/vibe";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const PDF = new TextEncoder().encode("%PDF-1.7");
const MISSING = "00000000-0000-0000-0000-000000000000";

const newEvent = async () => ((await (await createDemo()).json()) as { event: StoredEvent }).event;
const read = async (id: string) => ((await (await getEvent(new Request("http://test"), { params: Promise.resolve({ id }) })).json()) as { event: StoredEvent }).event;

function post(id: string, notes: string | null, images: Uint8Array[] = []) {
  const form = new FormData();
  if (notes !== null) form.set("notes", notes);
  images.forEach((bytes, i) => form.append("images", new File([Buffer.from(bytes)], `${i}.png`)));
  return vibeRoute(new Request("http://test", { method: "POST", body: form }), { params: Promise.resolve({ id }) });
}

beforeEach(() => {
  vi.stubEnv("DEMO_MODE", "true");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/events/:id/vibe", () => {
  it("stores the look, from notes alone or from photos", async () => {
    const event = await newEvent();
    expect(event.vibe).toBeNull();

    const res = await post(event.id, "Deep red and ivory");
    expect(res.status).toBe(200);
    const { vibe } = (await res.json()) as { vibe: VibeProfile };
    expect(vibe.theme).toBe("Lal Paar Heritage");
    expect((await read(event.id)).vibe).toEqual(vibe);

    expect((await post(event.id, null, [PNG])).status).toBe(200);
  });

  it("leaves the plan and version alone", async () => {
    const event = await newEvent();
    await post(event.id, "Deep red");
    const after = await read(event.id);
    expect(after.version).toBe(event.version);
    expect(after.plan).toEqual(event.plan);
  });

  it("rejects empty, oversized or wrong uploads", async () => {
    const event = await newEvent();
    expect((await post(event.id, "  ")).status).toBe(400);
    expect((await post(event.id, "x".repeat(301))).status).toBe(400);
    expect((await post(event.id, null, [PNG, PNG, PNG, PNG, PNG, PNG])).status).toBe(400);
    expect((await post(event.id, null, [PDF])).status).toBe(415);
    const huge = new Uint8Array(MAX_VIBE_IMAGE_BYTES + 1);
    huge.set(PNG);
    expect((await post(event.id, null, [huge])).status).toBe(413);
    expect((await post(MISSING, "Deep red")).status).toBe(404);
  });

  it("explains itself when demo mode has no saved look", async () => {
    const body = { eventType: "birthday", culture: "generic", city: "Pune", startDate: "2027-02-14", guestCount: 50, budgetTotalPaise: 10000000 };
    const created = await createEvent(new Request("http://test", { method: "POST", body: JSON.stringify(body) }));
    const { event } = (await created.json()) as { event: StoredEvent };
    const res = await post(event.id, "Pastels");
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ error: { code: "DEMO_FIXTURE_MISSING" } });
  });
});

describe("generateVibe", () => {
  it("sends the photos first, then the event and notes, on the smart model", async () => {
    const event = await newEvent();
    const structured = vi.fn<VibeDeps["structured"]>().mockResolvedValue({} as VibeProfile);
    await generateVibe(event, { images: [{ mediaType: "image/png", base64: "abc" }], notes: "Pastels" }, { structured });

    const opts = structured.mock.calls[0]![0];
    expect(opts.model).toBe("smart");
    const content = opts.messages[0]!.content as Array<{ type: string; text?: string }>;
    expect(content.map((b) => b.type)).toEqual(["image", "text"]);
    expect(content[1]?.text).toContain("Kolkata");
    expect(content[1]?.text).toContain("The family's notes: Pastels");
  });
});

describe("VibeProfile", () => {
  it("rejects a colour that isn't a hex code", () => {
    const palette = [{ name: "Red", hex: "red" }];
    expect(VibeProfile.shape.palette.safeParse(palette).success).toBe(false);
  });
});

describe("readableTextOn", () => {
  it("picks whichever of black or white has better contrast", () => {
    expect(readableTextOn("#7F1D1D")).toBe("#FFFFFF");
    expect(readableTextOn("#FFFBF0")).toBe("#000000");
    expect(readableTextOn("#F59E0B")).toBe("#000000");
  });
});
