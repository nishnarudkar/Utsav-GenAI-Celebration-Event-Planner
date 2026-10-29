import { z } from "zod";
import { apiError, errorResponse, invalidInput, readJson } from "@/lib/api/errors";
import { getEventRepository } from "@/lib/plan/event-repo";
import { checklistItemIds } from "@/lib/plan/timeline-view";

export const dynamic = "force-dynamic";

const Body = z.object({
  itemId: z.string().min(1).max(100),
  procured: z.boolean(),
});

/** PUT /api/events/:id/ritual-items — tick or untick one ritual item. */
export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  const body = await readJson(req);
  if (!body.ok) return body.response;
  const parsed = Body.safeParse(body.value);
  if (!parsed.success) return invalidInput(parsed.error);

  try {
    const repo = getEventRepository();
    const event = await repo.get(id);
    if (!event) return apiError(404, "NOT_FOUND", "We couldn't find that event.");
    if (!checklistItemIds(event).has(parsed.data.itemId)) {
      return apiError(400, "INVALID_INPUT", "That item isn't on this event's ritual checklist.");
    }
    const procuredItems = await repo.setItemProcured(id, parsed.data.itemId, parsed.data.procured);
    return Response.json({ procuredItems });
  } catch (err) {
    return errorResponse(err, `PUT /api/events/${id}/ritual-items`);
  }
}
