import { apiError, errorResponse, invalidInput, readJson } from "@/lib/api/errors";
import { FieldChange } from "@/lib/graph/types";
import { changeEvent } from "@/lib/plan/change-service";
import { getEventRepository } from "@/lib/plan/event-repo";
import { toISTDate } from "@/lib/rules/dates";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const NOT_FOUND = "We couldn't find that event. It may have been created before the server restarted.";

/** GET /api/events/:id — the full plan. */
export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;
  try {
    const event = await getEventRepository().get(id);
    if (!event) return apiError(404, "NOT_FOUND", NOT_FOUND);
    return Response.json({ event });
  } catch (err) {
    return errorResponse(err, `GET /api/events/${id}`);
  }
}

/**
 * PATCH /api/events/:id — { field, value } → runs the cascade and returns { event, diff }.
 * `?dryRun=true` returns the projected event and diff without saving (What-If).
 */
export async function PATCH(req: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;
  const body = await readJson(req);
  if (!body.ok) return body.response;
  const parsed = FieldChange.safeParse(body.value);
  if (!parsed.success) return invalidInput(parsed.error);
  const dryRun = new URL(req.url).searchParams.get("dryRun") === "true";

  try {
    const outcome = await changeEvent(getEventRepository(), id, parsed.data, { today: toISTDate(new Date()), dryRun });
    switch (outcome.kind) {
      case "not_found":
        return apiError(404, "NOT_FOUND", NOT_FOUND);
      case "version_conflict":
        return apiError(409, "VERSION_CONFLICT", "This plan changed while you were editing. Reload and try again.");
      case "noop":
        return Response.json({ event: outcome.event, diff: outcome.diff, noop: true });
      case "preview":
        return Response.json({ event: outcome.event, diff: outcome.diff, dryRun: true });
      case "applied":
        return Response.json({ event: outcome.event, diff: outcome.diff });
    }
  } catch (err) {
    return errorResponse(err, `PATCH /api/events/${id}`);
  }
}
