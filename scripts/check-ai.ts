import { z } from "zod";
import { POST as createEvent } from "@/app/api/events/route";
import { callStructured, defaultStructuredDeps } from "@/lib/ai/structured";

/**
 * Sends small, made-up requests to the configured AI provider to prove the connection works.
 * With --plan it also builds the demo wedding through the real agents. Ignores DEMO_MODE, prints
 * no keys, and uses real quota. Run it with `pnpm ai:check` or `pnpm ai:check --plan`.
 */

process.env.DEMO_MODE = "false";

const deps = defaultStructuredDeps();
const Reply = z.object({ greeting: z.string().min(1), languages: z.array(z.string()).min(2).max(3) });
const WEDDING = { eventType: "wedding", culture: "bengali_hindu", city: "Kolkata", startDate: "2027-02-14", guestCount: 250, budgetTotalPaise: 15_00_000_00 };

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
    console.log(`OK   ${label} (${((Date.now() - started) / 1000).toFixed(1)}s)\n     ${JSON.stringify(result).slice(0, 400)}`);
    return true;
  } catch (err) {
    console.error(`FAIL ${label}: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

const ask = (model: "smart" | "fast") =>
  callStructured(
    { schema: Reply, name: "emit_check", model, maxTokens: 2000, system: "You test an app's connection.", messages: [{ role: "user", content: "Give a short festive greeting and name two Indian languages." }] },
    deps,
  );

async function buildPlan() {
  const res = await createEvent(new Request("http://check", { method: "POST", body: JSON.stringify(WEDDING) }));
  const body = (await res.json()) as {
    error?: { message: string };
    event?: { plan: { functions: { name: string }[] }; rituals: { rituals: unknown[]; confidence: string }; budget: { overBudgetPaise: number; unpriced: unknown[] }; timeline: unknown };
  };
  if (!res.ok || !body.event) throw new Error(`HTTP ${res.status}: ${body.error?.message ?? "no event"}`);
  const { plan, rituals, budget } = body.event;
  return { functions: plan.functions.map((f) => f.name), rituals: rituals.rituals.length, confidence: rituals.confidence, overBudgetPaise: budget.overBudgetPaise, unpriced: budget.unpriced.length };
}

console.log(`Provider: ${deps.gemini ? "gemini" : "anthropic"}`);
const results = [await check(`fast model: ${deps.resolveModel("fast")}`, () => ask("fast")), await check(`smart model: ${deps.resolveModel("smart")}`, () => ask("smart"))];
if (process.argv.includes("--plan")) results.push(await check("full plan: demo wedding", buildPlan));
process.exitCode = results.every(Boolean) ? 0 : 1;
