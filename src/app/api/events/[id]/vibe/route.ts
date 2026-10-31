import { generateVibe, type VibeImage } from "@/lib/ai/agents/vibe";
import { AIFixtureMissingError } from "@/lib/ai/errors";
import { apiError, errorResponse } from "@/lib/api/errors";
import { getEventRepository } from "@/lib/plan/event-repo";
import { sniffMediaType } from "@/lib/rules/quote-file";
import { MAX_VIBE_IMAGE_BYTES, MAX_VIBE_IMAGES } from "@/lib/rules/vibe-file";
import { VibeInput } from "@/lib/schemas/vibe";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const TOO_BIG = "Each photo can be up to 5 MB.";

/** POST /api/events/:id/vibe — multipart { images[], notes } → the event's look. Images aren't kept. */
export async function POST(req: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;
  // Refuse oversized uploads before buffering them (allowing for multipart overhead).
  if (Number(req.headers.get("content-length") ?? 0) > MAX_VIBE_IMAGES * MAX_VIBE_IMAGE_BYTES + 64 * 1024) return apiError(413, "INVALID_INPUT", TOO_BIG);

  const form = await req.formData().catch(() => null);
  const files = (form?.getAll("images") ?? []).filter((f): f is File => f instanceof File && f.size > 0);
  const notes = VibeInput.safeParse({ notes: form?.get("notes") ?? "" });
  if (!notes.success) return apiError(400, "INVALID_INPUT", "Keep your notes to 300 characters.");
  if (files.length === 0 && !notes.data.notes) return apiError(400, "INVALID_INPUT", "Add a photo, or describe the look you want.");
  if (files.length > MAX_VIBE_IMAGES) return apiError(400, "INVALID_INPUT", `Choose up to ${MAX_VIBE_IMAGES} photos.`);
  if (files.some((f) => f.size > MAX_VIBE_IMAGE_BYTES)) return apiError(413, "INVALID_INPUT", TOO_BIG);

  const images: VibeImage[] = [];
  for (const file of files) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const mediaType = sniffMediaType(bytes);
    if (!mediaType || mediaType === "application/pdf") return apiError(415, "INVALID_INPUT", "Use JPG, PNG or WebP photos.");
    images.push({ mediaType, base64: Buffer.from(bytes).toString("base64") });
  }

  try {
    const repo = getEventRepository();
    const event = await repo.get(id);
    if (!event) return apiError(404, "NOT_FOUND", "We couldn't find that event.");
    const vibe = await generateVibe(event, { images, notes: notes.data.notes });
    await repo.setVibe(id, vibe);
    return Response.json({ vibe });
  } catch (err) {
    if (err instanceof AIFixtureMissingError) {
      return apiError(422, "DEMO_FIXTURE_MISSING", "Demo mode only has a saved look for the demo wedding. Try that one, or turn demo mode off.");
    }
    return errorResponse(err, `POST /api/events/${id}/vibe`);
  }
}
