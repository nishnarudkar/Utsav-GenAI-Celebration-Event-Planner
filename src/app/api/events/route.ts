import { errorResponse, parseBody } from "@/lib/api/errors";
import { buildEventPlan } from "@/lib/plan/build-plan";
import { getEventRepository } from "@/lib/plan/event-repo";
import { OnboardingAnswers } from "@/lib/schemas/event";

export const dynamic = "force-dynamic";

/** POST /api/events — onboarding answers → full plan (rituals, structure, budget, timeline). */
export async function POST(req: Request): Promise<Response> {
  const parsed = await parseBody(req, OnboardingAnswers);
  if (!parsed.ok) return parsed.response;

  try {
    const plan = await buildEventPlan(parsed.data);
    const event = await getEventRepository().create(plan);
    return Response.json({ event }, { status: 201 });
  } catch (err) {
    return errorResponse(err, "POST /api/events");
  }
}
