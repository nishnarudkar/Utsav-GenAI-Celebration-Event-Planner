import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { VIBE_PROMPT_V1 } from "@/lib/ai/prompts/vibe";
import { callStructured, type CallStructuredOptions } from "@/lib/ai/structured";
import { cultureLabel } from "@/lib/onboarding/steps";
import type { EventPlan } from "@/lib/plan/types";
import type { VibeImageType } from "@/lib/rules/vibe-file";
import { VibeProfile } from "@/lib/schemas/vibe";

/**
 * Vibe agent (smart, vision). CLAUDE.md asks for temperature 0.8 here, but current models reject
 * `temperature`, so it runs at the default (see docs/DECISIONS.md).
 */

export interface VibeImage {
  mediaType: VibeImageType;
  /** Base64 file contents, without a data: prefix. */
  base64: string;
}

export interface VibeDeps {
  structured: (opts: CallStructuredOptions<typeof VibeProfile>) => Promise<VibeProfile>;
}

const defaultDeps: VibeDeps = { structured: (opts) => callStructured(opts) };

function imageBlock(image: VibeImage): Anthropic.Beta.BetaContentBlockParam {
  return { type: "image", source: { type: "base64", media_type: image.mediaType, data: image.base64 } };
}

export async function generateVibe(state: EventPlan, input: { images: readonly VibeImage[]; notes: string }, deps: VibeDeps = defaultDeps): Promise<VibeProfile> {
  const { eventType, culture, city } = state.answers;
  const context = [
    `Event: ${eventType} in ${city}.`,
    culture === "generic" ? null : `Tradition: ${cultureLabel(culture)}.`,
    `Functions: ${state.plan.functions.map((f) => f.name).join(", ")}.`,
    input.notes ? `The family's notes: ${input.notes}` : "No notes; go by the images.",
  ]
    .filter(Boolean)
    .join("\n");

  return deps.structured({
    schema: VibeProfile,
    name: "emit_vibe",
    fixtureKey: `emit_vibe.${culture}.${eventType}`,
    model: "smart",
    system: VIBE_PROMPT_V1,
    messages: [{ role: "user", content: [...input.images.map(imageBlock), { type: "text", text: context }] }],
  });
}
