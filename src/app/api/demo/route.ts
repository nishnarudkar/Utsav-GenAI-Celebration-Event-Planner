import { errorResponse } from "@/lib/api/errors";
import { createDemoEvent } from "@/lib/plan/demo-event";
import { getEventRepository } from "@/lib/plan/event-repo";

export const dynamic = "force-dynamic";

/** POST /api/demo — a fresh copy of the demo wedding, with its family and sample quote. */
export async function POST(): Promise<Response> {
  try {
    const event = await createDemoEvent(getEventRepository());
    return Response.json({ event }, { status: 201 });
  } catch (err) {
    return errorResponse(err, "POST /api/demo");
  }
}
