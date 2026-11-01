/**
 * Fixed-window request limiter. Pure apart from the Map it's given. On serverless each instance
 * keeps its own counts, so this slows casual abuse rather than giving an exact global limit.
 */

export interface RateLimit {
  max: number;
  windowMs: number;
}

interface Window {
  count: number;
  resetAt: number;
}

/** Above this many tracked clients, expired entries are dropped so memory stays bounded. */
const MAX_TRACKED = 5_000;

export function checkRateLimit(
  windows: Map<string, Window>,
  key: string,
  now: number,
  limit: RateLimit,
): { allowed: boolean; retryAfterSeconds: number } {
  if (windows.size >= MAX_TRACKED) {
    for (const [k, w] of windows) if (w.resetAt <= now) windows.delete(k);
    if (windows.size >= MAX_TRACKED) windows.clear();
  }

  const current = windows.get(key);
  if (!current || current.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + limit.windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }
  current.count += 1;
  return { allowed: current.count <= limit.max, retryAfterSeconds: Math.ceil((current.resetAt - now) / 1000) };
}

/** Routes that spend AI quota. Everything else is cheap and left alone. */
export function spendsAIQuota(method: string, pathname: string): boolean {
  if (method !== "POST") return false;
  return (
    pathname === "/api/events" ||
    /^\/api\/events\/[^/]+\/(quotes|vibe|council|live|sponsorship|assistant)$/.test(pathname)
  );
}
