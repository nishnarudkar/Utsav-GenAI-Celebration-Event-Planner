import { apiError, errorResponse } from "@/lib/api/errors";
import { changeSummary } from "@/lib/plan/change-service";
import { getEventRepository } from "@/lib/plan/event-repo";

export const dynamic = "force-dynamic";

/** POST /api/events/:id/undo — restore the plan from before the latest change. */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  try {
    const result = await getEventRepository().undoLatest(id);
    if (!result.ok) {
      return result.error === "not_found"
        ? apiError(404, "NOT_FOUND", "We couldn't find that event.")
        : apiError(409, "NOTHING_TO_UNDO", "There's no change left to undo.");
    }
    return Response.json({ event: result.event, undone: changeSummary(result.undone) });
  } catch (err) {
    return errorResponse(err, `POST /api/events/${id}/undo`);
  }
}
