import { apiError, errorResponse } from "@/lib/api/errors";
import { getEventRepository } from "@/lib/plan/event-repo";

export const dynamic = "force-dynamic";

/** GET /api/events/:id — the full plan. (PATCH, which triggers a cascade, comes in Phase 2.) */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  try {
    const event = await getEventRepository().get(id);
    if (!event) return apiError(404, "NOT_FOUND", "We couldn't find that event. It may have been created before the server restarted.");
    return Response.json({ event });
  } catch (err) {
    return errorResponse(err, `GET /api/events/${id}`);
  }
}
