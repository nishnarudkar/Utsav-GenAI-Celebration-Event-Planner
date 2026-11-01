import { askAssistant } from "@/lib/ai/agents/assistant";
import { AIFixtureMissingError } from "@/lib/ai/errors";
import { withSavedAnswers } from "@/lib/ai/structured";
import { apiError, errorResponse, parseBody } from "@/lib/api/errors";
import { getEventRepository } from "@/lib/plan/event-repo";
import { toISTDate } from "@/lib/rules/dates";
import { ASSISTANT_SUGGESTIONS, AssistantRequest } from "@/lib/schemas/assistant";

export const dynamic = "force-dynamic";

/** POST /api/events/:id/assistant — { message, history } → a reply, and maybe an action to confirm. Changes nothing itself. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  const parsed = await parseBody(req, AssistantRequest);
  if (!parsed.ok) return parsed.response;

  try {
    const event = await getEventRepository().get(id);
    if (!event) return apiError(404, "NOT_FOUND", "We couldn't find that event.");
    const answer = () => askAssistant(event, parsed.data, { eventId: id, today: toISTDate(new Date()) });
    // The suggested questions don't depend on the model, so a judge or a busy AI service can't slow them down.
    return Response.json(
      await (ASSISTANT_SUGGESTIONS.includes(parsed.data.message) ? withSavedAnswers(answer) : answer()),
    );
  } catch (err) {
    if (err instanceof AIFixtureMissingError) {
      return apiError(
        422,
        "DEMO_FIXTURE_MISSING",
        "Demo mode only understands the suggested questions. Pick one of those, or turn demo mode off.",
      );
    }
    return errorResponse(err, `POST /api/events/${id}/assistant`);
  }
}
