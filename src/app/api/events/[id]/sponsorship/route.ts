import { generateSponsorshipWords } from "@/lib/ai/agents/sponsorship";
import { apiError, errorResponse, parseBody } from "@/lib/api/errors";
import { getEventRepository } from "@/lib/plan/event-repo";
import { pitchFor } from "@/lib/rules/sponsorship";
import { SponsorshipInput } from "@/lib/schemas/community";

export const dynamic = "force-dynamic";

/** POST /api/events/:id/sponsorship — write a sponsorship pitch, replacing any earlier one. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  const parsed = await parseBody(req, SponsorshipInput);
  if (!parsed.ok) return parsed.response;

  try {
    const repo = getEventRepository();
    const event = await repo.get(id);
    if (!event || event.answers.eventType !== "community")
      return apiError(404, "NOT_FOUND", "We couldn't find that event.");

    const words = await generateSponsorshipWords(event, parsed.data);
    const saved = { input: parsed.data, words };
    await repo.setSponsorship(id, saved);
    return Response.json({ pitch: pitchFor(event, saved) });
  } catch (err) {
    return errorResponse(err, `POST /api/events/${id}/sponsorship`);
  }
}
