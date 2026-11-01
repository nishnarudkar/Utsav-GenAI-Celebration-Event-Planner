import { z } from "zod";
import { apiError, errorResponse, invalidInput, readJson } from "@/lib/api/errors";
import { getEventRepository } from "@/lib/plan/event-repo";
import { VolunteerInput } from "@/lib/schemas/community";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const NO_EVENT = "We couldn't find that event.";
const RemoveBody = z.object({ volunteerId: z.string().min(1).max(100) });

/** POST /api/events/:id/volunteers — add someone to a shift. */
export async function POST(req: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;
  const body = await readJson(req);
  if (!body.ok) return body.response;
  const parsed = VolunteerInput.safeParse(body.value);
  if (!parsed.success) return invalidInput(parsed.error);

  try {
    const repo = getEventRepository();
    const event = await repo.get(id);
    if (!event || event.answers.eventType !== "community") return apiError(404, "NOT_FOUND", NO_EVENT);

    const { name, functionName } = parsed.data;
    if (!event.plan.functions.some((f) => f.name === functionName)) return apiError(400, "INVALID_INPUT", "That part of the event isn't in the plan.");
    if (event.volunteers.some((v) => v.functionName === functionName && v.name.toLowerCase() === name.toLowerCase())) {
      return apiError(400, "INVALID_INPUT", `${name} is already on this shift.`);
    }
    const volunteer = await repo.addVolunteer(id, parsed.data);
    return Response.json({ volunteer }, { status: 201 });
  } catch (err) {
    return errorResponse(err, `POST /api/events/${id}/volunteers`);
  }
}

/** DELETE /api/events/:id/volunteers — take someone off a shift. */
export async function DELETE(req: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;
  const body = await readJson(req);
  if (!body.ok) return body.response;
  const parsed = RemoveBody.safeParse(body.value);
  if (!parsed.success) return invalidInput(parsed.error);

  try {
    const removed = await getEventRepository().removeVolunteer(id, parsed.data.volunteerId);
    if (removed === null) return apiError(404, "NOT_FOUND", NO_EVENT);
    if (!removed) return apiError(404, "NOT_FOUND", "That volunteer is no longer on the roster.");
    return new Response(null, { status: 204 });
  } catch (err) {
    return errorResponse(err, `DELETE /api/events/${id}/volunteers`);
  }
}
