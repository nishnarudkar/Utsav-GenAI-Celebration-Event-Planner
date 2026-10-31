import { z } from "zod";
import { AIFixtureMissingError } from "@/lib/ai/errors";
import { apiError, errorResponse, invalidInput, readJson } from "@/lib/api/errors";
import { getEventRepository } from "@/lib/plan/event-repo";
import { confirmReshuffle, proposeReshuffle } from "@/lib/plan/live-service";
import { toISTDate } from "@/lib/rules/dates";
import { IncidentInput } from "@/lib/schemas/dayof";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const NOT_FOUND = "We couldn't find that event.";
const Body = z.union([IncidentInput, z.object({ confirm: z.string().min(1) })]);

/** POST /api/events/:id/live — { incident } → proposal; { confirm: proposalId } → apply and notify. */
export async function POST(req: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;
  const body = await readJson(req);
  if (!body.ok) return body.response;
  const parsed = Body.safeParse(body.value);
  if (!parsed.success) return invalidInput(parsed.error);

  try {
    const repo = getEventRepository();
    if ("confirm" in parsed.data) {
      const outcome = await confirmReshuffle(repo, id, parsed.data.confirm);
      if (outcome.kind === "not_found") return apiError(404, "NOT_FOUND", NOT_FOUND);
      if (outcome.kind === "stale") return apiError(409, "VERSION_CONFLICT", "That update is no longer current. Report the problem again to get a fresh one.");
      return Response.json({ live: outcome.event.live });
    }
    const proposal = await proposeReshuffle(repo, id, parsed.data.incident, { today: toISTDate(new Date()) });
    if (!proposal) return apiError(404, "NOT_FOUND", NOT_FOUND);
    return Response.json({ proposal });
  } catch (err) {
    if (err instanceof AIFixtureMissingError) {
      return apiError(422, "DEMO_FIXTURE_MISSING", "Demo mode only has saved answers for the sample problems on the demo wedding. Pick one of those, or turn demo mode off.");
    }
    return errorResponse(err, `POST /api/events/${id}/live`);
  }
}
