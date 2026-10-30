import { apiError, errorResponse } from "@/lib/api/errors";
import { getEventRepository } from "@/lib/plan/event-repo";
import { eventToICS, exportFileName } from "@/lib/plan/export-ics";
import { eventToPDF } from "@/lib/plan/export-pdf";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/events/:id/export?format=pdf|ics — the plan as a file to keep. */
export async function GET(req: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;
  const format = new URL(req.url).searchParams.get("format");
  if (format !== "pdf" && format !== "ics") return apiError(400, "INVALID_INPUT", "Choose pdf or ics.");

  try {
    const event = await getEventRepository().get(id);
    if (!event) return apiError(404, "NOT_FOUND", "We couldn't find that event.");

    const body = format === "pdf" ? new Uint8Array(await eventToPDF(event)) : eventToICS(event);
    return new Response(body, {
      headers: {
        "Content-Type": format === "pdf" ? "application/pdf" : "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="${exportFileName(event.title, format)}"`,
      },
    });
  } catch (err) {
    return errorResponse(err, `GET /api/events/${id}/export`);
  }
}
