import { apiError, errorResponse, parseBody } from "@/lib/api/errors";
import { getEventRepository } from "@/lib/plan/event-repo";
import { StakeholderInput } from "@/lib/schemas/council";

export const dynamic = "force-dynamic";

/** POST /api/events/:id/stakeholders — add a family member and their preferences. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  const parsed = await parseBody(req, StakeholderInput);
  if (!parsed.ok) return parsed.response;

  try {
    const stakeholder = await getEventRepository().addStakeholder(id, parsed.data);
    if (!stakeholder) return apiError(404, "NOT_FOUND", "We couldn't find that event.");
    return Response.json({ stakeholder }, { status: 201 });
  } catch (err) {
    return errorResponse(err, `POST /api/events/${id}/stakeholders`);
  }
}
