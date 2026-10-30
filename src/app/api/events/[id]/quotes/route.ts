import { AIFixtureMissingError } from "@/lib/ai/errors";
import { apiError, errorResponse } from "@/lib/api/errors";
import { getEventRepository } from "@/lib/plan/event-repo";
import { checkQuote } from "@/lib/plan/quote-service";
import { MAX_QUOTE_BYTES, sniffMediaType } from "@/lib/rules/quote-file";
import { BudgetCategory } from "@/lib/schemas/enums";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const NOT_FOUND = "We couldn't find that event.";
const TOO_BIG = "That file is too big. Quotes can be up to 10 MB.";

/** POST /api/events/:id/quotes — multipart { file, category } → checked quote. */
export async function POST(req: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;
  // Refuse oversized uploads before buffering them (allowing for multipart overhead).
  if (Number(req.headers.get("content-length") ?? 0) > MAX_QUOTE_BYTES + 64 * 1024) return apiError(413, "INVALID_INPUT", TOO_BIG);

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const category = BudgetCategory.safeParse(form?.get("category"));
  if (!(file instanceof File) || file.size === 0) return apiError(400, "INVALID_INPUT", "Choose a photo or PDF of the quote.");
  if (!category.success) return apiError(400, "INVALID_INPUT", "Choose what kind of vendor this quote is from.");
  if (file.size > MAX_QUOTE_BYTES) return apiError(413, "INVALID_INPUT", TOO_BIG);

  const bytes = new Uint8Array(await file.arrayBuffer());
  const mediaType = sniffMediaType(bytes);
  if (!mediaType) return apiError(415, "INVALID_INPUT", "That file type isn't supported. Upload a JPG, PNG, WebP or PDF.");

  try {
    const quote = await checkQuote(getEventRepository(), id, {
      file: { mediaType, base64: Buffer.from(bytes).toString("base64") },
      fileName: file.name.slice(0, 120),
      category: category.data,
    });
    if (!quote) return apiError(404, "NOT_FOUND", NOT_FOUND);
    return Response.json({ quote }, { status: 201 });
  } catch (err) {
    if (err instanceof AIFixtureMissingError) {
      return apiError(422, "DEMO_FIXTURE_MISSING", "Demo mode only has a sample for catering quotes. Choose Catering, or turn demo mode off.");
    }
    return errorResponse(err, `POST /api/events/${id}/quotes`);
  }
}

/** GET /api/events/:id/quotes — checked quotes, newest first. */
export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;
  try {
    const event = await getEventRepository().get(id);
    if (!event) return apiError(404, "NOT_FOUND", NOT_FOUND);
    return Response.json({ quotes: event.quotes });
  } catch (err) {
    return errorResponse(err, `GET /api/events/${id}/quotes`);
  }
}
