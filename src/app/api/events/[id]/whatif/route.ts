import { apiError, errorResponse, invalidInput, readJson } from "@/lib/api/errors";
import { generateRecoveryOptions } from "@/lib/graph/recovery";
import { applyScenario, describeScenario, projectScenario } from "@/lib/graph/whatif";
import { getEventRepository } from "@/lib/plan/event-repo";
import { toISTDate } from "@/lib/rules/dates";
import { WhatIfScenario } from "@/lib/schemas/whatif";
import { z } from "zod";

export const dynamic = "force-dynamic";

const Body = z.object({ scenario: WhatIfScenario, apply: z.boolean().default(false) });

/**
 * POST /api/events/:id/whatif — { scenario } projects it without saving (no AI, so sliders
 * stay fast). { scenario, apply: true } saves it as a logged change, returning { event, diff }.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  const body = await readJson(req);
  if (!body.ok) return body.response;
  const parsed = Body.safeParse(body.value);
  if (!parsed.success) return invalidInput(parsed.error);
  const { scenario, apply } = parsed.data;

  try {
    const repo = getEventRepository();
    const event = await repo.get(id);
    if (!event) return apiError(404, "NOT_FOUND", "We couldn't find that event.");
    const cascade = { version: event.version, today: toISTDate(new Date()) };

    if (!apply) return Response.json({ projection: projectScenario(event, scenario, cascade) });

    const title = describeScenario(scenario);
    const result = applyScenario(event, scenario, cascade, `Applied your What-If scenario: ${title}.`);
    const diff = { ...result.diff, recoveryOptions: generateRecoveryOptions(result.state, cascade) };
    const applied = await repo.applyChange(id, event.version, result.state, {
      trigger: { field: "whatif", optionId: "scenario", value: title, from: null },
      diff,
    });
    if (!applied.ok) {
      return applied.error === "not_found"
        ? apiError(404, "NOT_FOUND", "We couldn't find that event.")
        : apiError(409, "VERSION_CONFLICT", "This plan changed while you were editing. Reload and try again.");
    }
    return Response.json({ event: applied.event, diff });
  } catch (err) {
    return errorResponse(err, `POST /api/events/${id}/whatif`);
  }
}
