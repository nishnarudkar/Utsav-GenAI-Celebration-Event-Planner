import { apiError, errorResponse } from "@/lib/api/errors";
import { getEventRepository } from "@/lib/plan/event-repo";

export const dynamic = "force-dynamic";

/** DELETE /api/events/:id/stakeholders/:stakeholderId */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string; stakeholderId: string }> }): Promise<Response> {
  const { id, stakeholderId } = await ctx.params;
  try {
    const removed = await getEventRepository().removeStakeholder(id, stakeholderId);
    if (!removed) return apiError(404, "NOT_FOUND", "We couldn't find that person.");
    return new Response(null, { status: 204 });
  } catch (err) {
    return errorResponse(err, `DELETE /api/events/${id}/stakeholders/${stakeholderId}`);
  }
}
