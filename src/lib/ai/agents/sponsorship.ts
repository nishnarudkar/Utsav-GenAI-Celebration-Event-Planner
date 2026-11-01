import "server-only";
import { SPONSORSHIP_PROMPT_V2 } from "@/lib/ai/prompts/sponsorship";
import { callStructured, type CallStructuredOptions } from "@/lib/ai/structured";
import type { EventPlan } from "@/lib/plan/types";
import { SponsorshipWords, type SponsorshipInput } from "@/lib/schemas/community";

/** Sponsorship agent (fast). Words only, so the fixture suits any community event. */

export interface SponsorshipDeps {
  structured: (opts: CallStructuredOptions<typeof SponsorshipWords>) => Promise<SponsorshipWords>;
}

const defaultDeps: SponsorshipDeps = { structured: (opts) => callStructured(opts) };

export async function generateSponsorshipWords(
  state: EventPlan,
  input: SponsorshipInput,
  deps: SponsorshipDeps = defaultDeps,
): Promise<SponsorshipWords> {
  const context = [
    `Community event in ${state.answers.city}.`,
    `Parts of the event: ${state.plan.functions.map((f) => f.name).join(", ")}.`,
    `What the money pays for: ${input.cause}`,
  ].join("\n");

  return deps.structured({
    schema: SponsorshipWords,
    name: "emit_sponsorship",
    fixtureKey: "emit_sponsorship.community",
    model: "fast",
    system: SPONSORSHIP_PROMPT_V2,
    messages: [{ role: "user", content: context }],
  });
}
