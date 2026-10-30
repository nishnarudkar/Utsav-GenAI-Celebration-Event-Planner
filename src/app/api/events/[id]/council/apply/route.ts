import { z } from "zod";
import { apiError, errorResponse, invalidInput, readJson } from "@/lib/api/errors";
import { applyCompromise } from "@/lib/plan/council-service";
import { getEventRepository } from "@/lib/plan/event-repo";
import { toISTDate } from "@/lib/rules/dates";

export const dynamic = "force-dynamic";

const Body = z.object({ optionId: z.string().min(1).max(40) });

/** POST /api/events/:id/council/apply — apply a compromise; returns { event, diff }. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  const body = await readJson(req);
  if (!body.ok) return body.response;
  const parsed = Body.safeParse(body.value);
  if (!parsed.success) return invalidInput(parsed.error);

  try {
    const outcome = await applyCompromise(getEventRepository(), id, parsed.data.optionId, { today: toISTDate(new Date()) });
    switch (outcome.kind) {
      case "not_found":
        return apiError(404, "NOT_FOUND", "We couldn't find that event.");
      case "option_not_found":
        return apiError(404, "NOT_FOUND", "That option isn't available any more. Hold the council again.");
      case "stale":
        return apiError(409, "VERSION_CONFLICT", "The plan has changed since these options were made. Hold the council again for up-to-date costs.");
      case "version_conflict":
        return apiError(409, "VERSION_CONFLICT", "This plan changed while you were editing. Reload and try again.");
      case "applied":
        return Response.json({ event: outcome.event, diff: outcome.diff });
    }
  } catch (err) {
    return errorResponse(err, `POST /api/events/${id}/council/apply`);
  }
}
