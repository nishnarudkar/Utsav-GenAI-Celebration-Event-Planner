import { NextResponse, type NextRequest } from "next/server";
import { checkRateLimit, spendsAIQuota, type RateLimit } from "@/lib/rules/rate-limit";

/** A person can plan and explore freely; a script can't drain the day's AI allowance. */
const AI_LIMIT: RateLimit = { max: 30, windowMs: 10 * 60_000 };

const windows = new Map<string, { count: number; resetAt: number }>();

export function middleware(req: NextRequest): NextResponse {
  // Demo mode serves saved answers, so there's no quota to protect.
  if (process.env.DEMO_MODE === "true" || !spendsAIQuota(req.method, req.nextUrl.pathname)) return NextResponse.next();

  const client = req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const { allowed, retryAfterSeconds } = checkRateLimit(windows, client, Date.now(), AI_LIMIT);
  if (allowed) return NextResponse.next();

  return NextResponse.json(
    { error: { code: "RATE_LIMITED", message: "That's a lot of requests — please wait a few minutes and try again." } },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
  );
}

export const config = { matcher: "/api/events/:path*" };
