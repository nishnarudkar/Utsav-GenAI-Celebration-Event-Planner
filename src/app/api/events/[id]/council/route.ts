import { AIFixtureMissingError } from "@/lib/ai/errors";
import { apiError, errorResponse } from "@/lib/api/errors";
import { holdCouncil, MIN_STAKEHOLDERS } from "@/lib/plan/council-service";
import { getEventRepository } from "@/lib/plan/event-repo";
import { toISTDate } from "@/lib/rules/dates";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const NOT_FOUND = "We couldn't find that event.";

/** GET /api/events/:id/council — stakeholders and the latest result. */
export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;
  try {
    const event = await getEventRepository().get(id);
    if (!event) return apiError(404, "NOT_FOUND", NOT_FOUND);
    return Response.json({ stakeholders: event.stakeholders, council: event.council });
  } catch (err) {
    return errorResponse(err, `GET /api/events/${id}/council`);
  }
}

/** POST /api/events/:id/council — find conflicts and propose compromises. */
export async function POST(_req: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;
  try {
    const outcome = await holdCouncil(getEventRepository(), id, { today: toISTDate(new Date()) });
    switch (outcome.kind) {
      case "not_found":
        return apiError(404, "NOT_FOUND", NOT_FOUND);
      case "too_few":
        return apiError(400, "INVALID_INPUT", `Add at least ${MIN_STAKEHOLDERS} people to hold a council.`);
      case "ok":
        return Response.json({ council: outcome.council }, { status: 201 });
    }
  } catch (err) {
    if (err instanceof AIFixtureMissingError) {
      return apiError(422, "DEMO_FIXTURE_MISSING", "Demo mode only has a sample council for the Bengali wedding. Use that plan, or turn demo mode off.");
    }
    return errorResponse(err, `POST /api/events/${id}/council`);
  }
}
