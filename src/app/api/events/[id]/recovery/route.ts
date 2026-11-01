import { z } from "zod";
import { apiError, errorResponse, parseBody } from "@/lib/api/errors";
import { applyRecovery } from "@/lib/plan/change-service";
import { getEventRepository } from "@/lib/plan/event-repo";
import { toISTDate } from "@/lib/rules/dates";

export const dynamic = "force-dynamic";

const Body = z.object({ optionId: z.string().min(1).max(100) });

/** POST /api/events/:id/recovery — apply a recovery option from the latest change. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  const parsed = await parseBody(req, Body);
  if (!parsed.ok) return parsed.response;

  try {
    const outcome = await applyRecovery(getEventRepository(), id, parsed.data.optionId, {
      today: toISTDate(new Date()),
    });
    switch (outcome.kind) {
      case "not_found":
        return apiError(404, "NOT_FOUND", "We couldn't find that event.");
      case "option_not_found":
        return apiError(
          409,
          "VERSION_CONFLICT",
          "That option is no longer available — the plan has changed since. Make the change again to see fresh options.",
        );
      case "version_conflict":
        return apiError(409, "VERSION_CONFLICT", "This plan changed while you were editing. Reload and try again.");
      case "applied":
        return Response.json({ event: outcome.event, diff: outcome.diff });
    }
  } catch (err) {
    return errorResponse(err, `POST /api/events/${id}/recovery`);
  }
}
