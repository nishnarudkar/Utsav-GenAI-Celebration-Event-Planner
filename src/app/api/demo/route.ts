import { withSavedAnswers } from "@/lib/ai/structured";
import { errorResponse } from "@/lib/api/errors";
import { createDemoEvent } from "@/lib/plan/demo-event";
import { getEventRepository } from "@/lib/plan/event-repo";

export const dynamic = "force-dynamic";

/** POST /api/demo — a fresh copy of the demo wedding, built from saved answers so it always works and uses no quota. */
export async function POST(): Promise<Response> {
  try {
    const event = await withSavedAnswers(() => createDemoEvent(getEventRepository()));
    return Response.json({ event }, { status: 201 });
  } catch (err) {
    return errorResponse(err, "POST /api/demo");
  }
}
