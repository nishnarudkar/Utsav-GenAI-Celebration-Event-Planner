import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as listQuotes, POST as uploadQuote } from "@/app/api/events/[id]/quotes/route";
import { GET as getEvent, PATCH as patchEvent } from "@/app/api/events/[id]/route";
import { POST as undo } from "@/app/api/events/[id]/undo/route";
import { POST as createEvent } from "@/app/api/events/route";
import type { StoredEvent, StoredQuote } from "@/lib/plan/types";
import { MAX_QUOTE_BYTES, sniffMediaType } from "@/lib/rules/quote-file";

const SAMPLE = readFileSync(path.join(process.cwd(), "public/samples/sample-caterer-quote.pdf"));
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const MISSING = "00000000-0000-0000-0000-000000000000";

async function newEvent(): Promise<StoredEvent> {
  const body = { eventType: "wedding", culture: "bengali_hindu", city: "Kolkata", startDate: "2027-02-14", guestCount: 250, budgetTotalPaise: 150000000 };
  const res = await createEvent(new Request("http://test/api/events", { method: "POST", body: JSON.stringify(body) }));
  return ((await res.json()) as { event: StoredEvent }).event;
}

function upload(id: string, bytes: Uint8Array | null, category: string | null = "catering", name = "quote.pdf") {
  const form = new FormData();
  if (bytes) form.set("file", new File([Buffer.from(bytes)], name));
  if (category) form.set("category", category);
  return uploadQuote(new Request(`http://test/api/events/${id}/quotes`, { method: "POST", body: form }), params(id));
}

beforeEach(() => {
  vi.stubEnv("DEMO_MODE", "true");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("sniffMediaType", () => {
  it("recognises supported formats from their first bytes", () => {
    expect(sniffMediaType(SAMPLE)).toBe("application/pdf");
    expect(sniffMediaType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffMediaType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(sniffMediaType(new TextEncoder().encode("RIFF1234WEBPVP8 "))).toBe("image/webp");
  });

  it("rejects anything else", () => {
    expect(sniffMediaType(new TextEncoder().encode("<html>"))).toBeNull();
    expect(sniffMediaType(new Uint8Array())).toBeNull();
  });
});

describe("POST /api/events/:id/quotes", () => {
  it("checks the sample quote and stores the result", async () => {
    const event = await newEvent();
    const res = await upload(event.id, SAMPLE, "catering", "sample.pdf");
    expect(res.status).toBe(201);
    const { quote } = (await res.json()) as { quote: StoredQuote };
    expect(quote).toMatchObject({ fileName: "sample.pdf", analysis: { vendorName: "Shubho Bhoj Caterers", category: "catering" } });
    expect(quote.analysis.flags.map((f) => f.title)).toContain("Above typical prices");
    expect(quote.negotiationMessage).toContain("₹1,770");

    const list = (await (await listQuotes(new Request("http://test"), params(event.id))).json()) as { quotes: StoredQuote[] };
    expect(list.quotes.map((q) => q.id)).toEqual([quote.id]);
  });

  it("keeps checked quotes across a change and its undo", async () => {
    const event = await newEvent();
    await upload(event.id, SAMPLE);
    await patchEvent(new Request("http://test", { method: "PATCH", body: JSON.stringify({ field: "guest_count", value: 300 }) }), params(event.id));
    await undo(new Request("http://test", { method: "POST" }), params(event.id));
    const stored = ((await (await getEvent(new Request("http://test"), params(event.id))).json()) as { event: StoredEvent }).event;
    expect(stored.quotes).toHaveLength(1);
  });

  it("goes by the file's real type, not its name", async () => {
    const event = await newEvent();
    const res = await upload(event.id, new TextEncoder().encode("<html>not a quote</html>"), "catering", "quote.pdf");
    expect(res.status).toBe(415);
  });

  it("rejects missing, empty and oversized files, and bad categories", async () => {
    const event = await newEvent();
    expect((await upload(event.id, null)).status).toBe(400);
    expect((await upload(event.id, new Uint8Array())).status).toBe(400);
    expect((await upload(event.id, SAMPLE, "fireworks")).status).toBe(400);
    expect((await upload(event.id, new Uint8Array(MAX_QUOTE_BYTES + 1))).status).toBe(413);
  });

  it("returns 404 for an unknown event", async () => {
    expect((await upload(MISSING, SAMPLE)).status).toBe(404);
    expect((await listQuotes(new Request("http://test"), params(MISSING))).status).toBe(404);
  });

  it("explains demo mode's limit for other vendor types", async () => {
    const event = await newEvent();
    const res = await upload(event.id, SAMPLE, "decor");
    expect(res.status).toBe(422);
    expect(((await res.json()) as { error: { message: string } }).error.message).toContain("catering");
  });
});
