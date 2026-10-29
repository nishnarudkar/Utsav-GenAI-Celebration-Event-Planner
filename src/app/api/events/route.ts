import { errorResponse, invalidInput, readJson } from "@/lib/api/errors";
import { buildEventPlan } from "@/lib/plan/build-plan";
import { getEventRepository } from "@/lib/plan/event-repo";
import { OnboardingAnswers } from "@/lib/schemas/event";

export const dynamic = "force-dynamic";

/** POST /api/events — onboarding answers → full plan (rituals, structure, budget, timeline). */
export async function POST(req: Request): Promise<Response> {
  const body = await readJson(req);
  if (!body.ok) return body.response;
  const parsed = OnboardingAnswers.safeParse(body.value);
  if (!parsed.success) return invalidInput(parsed.error);

  try {
    const plan = await buildEventPlan(parsed.data);
    const event = await getEventRepository().create(plan);
    return Response.json({ event }, { status: 201 });
  } catch (err) {
    return errorResponse(err, "POST /api/events");
  }
}

/** GET /api/events — summaries, newest first. */
export async function GET(): Promise<Response> {
  try {
    return Response.json({ events: await getEventRepository().list() });
  } catch (err) {
    return errorResponse(err, "GET /api/events");
  }
}
