import { z } from "zod";
import { apiError, errorResponse, parseBody } from "@/lib/api/errors";
import { getPermits } from "@/lib/kb/permits";
import { getEventRepository } from "@/lib/plan/event-repo";

export const dynamic = "force-dynamic";

const Body = z.object({
  permitId: z.string().min(1).max(100),
  done: z.boolean(),
});

/** PUT /api/events/:id/permits — tick or untick one permission. */
export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  const parsed = await parseBody(req, Body);
  if (!parsed.ok) return parsed.response;

  try {
    if (!getPermits().items.some((p) => p.id === parsed.data.permitId)) {
      return apiError(400, "INVALID_INPUT", "That isn't on the permissions checklist.");
    }
    const permitsDone = await getEventRepository().setPermitDone(id, parsed.data.permitId, parsed.data.done);
    if (!permitsDone) return apiError(404, "NOT_FOUND", "We couldn't find that event.");
    return Response.json({ permitsDone });
  } catch (err) {
    return errorResponse(err, `PUT /api/events/${id}/permits`);
  }
}
