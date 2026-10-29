import { apiError, errorResponse } from "@/lib/api/errors";
import { changeSummary } from "@/lib/plan/change-service";
import { getEventRepository } from "@/lib/plan/event-repo";

export const dynamic = "force-dynamic";

/** GET /api/events/:id/changes — the change log, newest first. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  try {
    const changes = await getEventRepository().listChanges(id);
    if (!changes) return apiError(404, "NOT_FOUND", "We couldn't find that event.");
    return Response.json({ changes: changes.map(changeSummary) });
  } catch (err) {
    return errorResponse(err, `GET /api/events/${id}/changes`);
  }
}
