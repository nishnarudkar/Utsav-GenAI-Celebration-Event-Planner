import { readFile } from "node:fs/promises";
import path from "node:path";
import { deflateSync } from "node:zlib";
import { z } from "zod";
import { POST as council } from "@/app/api/events/[id]/council/route";
import { POST as live } from "@/app/api/events/[id]/live/route";
import { POST as quotes } from "@/app/api/events/[id]/quotes/route";
import { PATCH as patchEvent } from "@/app/api/events/[id]/route";
import { POST as sponsorship } from "@/app/api/events/[id]/sponsorship/route";
import { POST as vibe } from "@/app/api/events/[id]/vibe/route";
import { POST as createEvent } from "@/app/api/events/route";
import { callStructured, defaultStructuredDeps } from "@/lib/ai/structured";
import { createDemoEvent } from "@/lib/plan/demo-event";
import { getEventRepository } from "@/lib/plan/event-repo";
import type { StoredEvent, StoredQuote } from "@/lib/plan/types";

/**
 * Sends made-up requests to the configured AI provider to prove it works. Uses real quota, prints
 * no keys, and never sends real families' data.
 *   pnpm ai:check             both models, with a tiny request
 *   pnpm ai:check --plan      also builds a wedding through the real agents
 *   pnpm ai:check --features  also runs Quote X-Ray, Vibe, Council, Live, the change summary and
 *                             the sponsorship pitch on sample events
 */

process.env.DEMO_MODE = "false";

const deps = defaultStructuredDeps();
const Reply = z.object({ greeting: z.string().min(1), languages: z.array(z.string()).min(2).max(3) });
const WEDDING = { eventType: "wedding", culture: "bengali_hindu", city: "Kolkata", startDate: "2027-02-14", guestCount: 250, budgetTotalPaise: 15_00_000_00 };
const FESTIVAL = { eventType: "community", culture: "generic", city: "Pune", startDate: "2027-01-26", guestCount: 500, budgetTotalPaise: 5_00_000_00 };

const params = (id: string) => ({ params: Promise.resolve({ id }) });
const jsonRequest = (method: string, body?: unknown) => new Request("http://check", { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

// Show each provider call, so slow models and rate limits are visible.
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const started = Date.now();
  const res = await realFetch(input, init);
  const body = (await res.clone().json().catch(() => null)) as { model?: string; usage?: { total_output_tokens?: number; total_thought_tokens?: number } } | null;
  console.log(`     HTTP ${res.status} in ${((Date.now() - started) / 1000).toFixed(1)}s, ${body?.model ?? ""} output ${body?.usage?.total_output_tokens ?? "?"} + thinking ${body?.usage?.total_thought_tokens ?? "?"} tokens`);
  return res;
};

async function check(label: string, run: () => Promise<unknown>): Promise<boolean> {
  const started = Date.now();
  try {
    const result = await run();
    console.log(`OK   ${label} (${((Date.now() - started) / 1000).toFixed(1)}s)\n     ${JSON.stringify(result).slice(0, 1500)}`);
    return true;
  } catch (err) {
    console.error(`FAIL ${label}: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

async function bodyOf<T>(res: Response): Promise<T> {
  const body = (await res.json()) as T & { error?: { message: string } };
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${body.error?.message ?? "no details"}`);
  return body;
}

const ask = (model: "smart" | "fast") =>
  callStructured(
    { schema: Reply, name: "emit_check", model, maxTokens: 2000, system: "You test an app's connection.", messages: [{ role: "user", content: "Give a short festive greeting and name two Indian languages." }] },
    deps,
  );

async function buildPlan() {
  const { event } = await bodyOf<{ event: StoredEvent }>(await createEvent(jsonRequest("POST", WEDDING)));
  const { plan, rituals, budget } = event;
  return {
    functions: plan.functions.map((f) => f.name),
    rituals: rituals.rituals.length,
    confidence: rituals.confidence,
    totalRupees: budget.totalEstimatePaise / 100,
    overRupees: budget.overBudgetPaise / 100,
    unpriced: budget.unpriced.length,
    adjustments: budget.adjustments,
  };
}

/** Sample events come from saved answers, so only the feature under test uses quota. */
async function withSamples<T>(run: () => Promise<T>): Promise<T> {
  process.env.DEMO_MODE = "true";
  try {
    return await run();
  } finally {
    process.env.DEMO_MODE = "false";
  }
}

/** A small striped PNG in reds and golds, so the image path gets a real, decodable picture. */
function samplePng(): Buffer {
  const size = 64;
  const rows = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    const start = y * (size * 3 + 1);
    const [r, g, b] = y % 16 < 8 ? [127, 29, 29] : [245, 158, 11];
    for (let x = 0; x < size; x++) rows.set([r ?? 0, g ?? 0, b ?? 0], start + 1 + x * 3);
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (data: Buffer) => (data.reduce((c, byte) => (crcTable[(c ^ byte) & 0xff] ?? 0) ^ (c >>> 8), 0xffffffff) ^ 0xffffffff) >>> 0;
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([length, body, sum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 2], 8); // 8-bit RGB
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", header), chunk("IDAT", deflateSync(rows)), chunk("IEND", Buffer.alloc(0))]);
}

async function checkFeatures(): Promise<boolean[]> {
  const repo = getEventRepository();
  const wedding = await withSamples(() => createDemoEvent(repo));
  const festival = await withSamples(async () => (await bodyOf<{ event: StoredEvent }>(await createEvent(jsonRequest("POST", FESTIVAL)))).event);

  return [
    await check("quote x-ray (PDF)", async () => {
      const form = new FormData();
      form.set("file", new File([await readFile(path.join(process.cwd(), "public/samples/sample-caterer-quote.pdf"))], "sample.pdf"));
      form.set("category", "catering");
      const { quote } = await bodyOf<{ quote: StoredQuote }>(await quotes(new Request("http://check", { method: "POST", body: form }), params(wedding.id)));
      return { flags: quote.analysis.flags.map((f) => f.title), negotiation: quote.negotiationMessage };
    }),
    await check("vibe (photo and notes)", async () => {
      const form = new FormData();
      form.set("notes", "Warm red and gold, with fresh marigolds.");
      form.append("images", new File([new Uint8Array(samplePng())], "sample.png", { type: "image/png" }));
      return bodyOf(await vibe(new Request("http://check", { method: "POST", body: form }), params(wedding.id)));
    }),
    await check("family council", async () => bodyOf(await council(jsonRequest("POST"), params(wedding.id)))),
    await check("live incident", async () => bodyOf(await live(jsonRequest("POST", { incident: "Photographer 30 min late" }), params(wedding.id)))),
    await check("change summary (350 guests)", async () => {
      const { diff } = await bodyOf<{ diff: { explanation: string; recoveryOptions: { title: string }[]; conflicts: { message: string }[] } }>(
        await patchEvent(jsonRequest("PATCH", { field: "guest_count", value: 350 }), params(wedding.id)),
      );
      return { explanation: diff.explanation, recovery: diff.recoveryOptions.map((o) => o.title), conflicts: diff.conflicts.map((c) => c.message) };
    }),
    await check("sponsorship pitch", async () =>
      bodyOf(await sponsorship(jsonRequest("POST", { organiser: "Sample Residents' Association", contact: "Sample contact", targetPaise: 2_00_000_00, cause: "The stage, sound system and a free community meal" }), params(festival.id))),
    ),
  ];
}

console.log(`Provider: ${deps.gemini ? "gemini" : "anthropic"}`);
const results = [await check(`fast model: ${deps.resolveModel("fast")}`, () => ask("fast")), await check(`smart model: ${deps.resolveModel("smart")}`, () => ask("smart"))];
if (process.argv.includes("--plan")) results.push(await check("full plan: sample wedding", buildPlan));
if (process.argv.includes("--features")) results.push(...(await checkFeatures()));
process.exitCode = results.every(Boolean) ? 0 : 1;
