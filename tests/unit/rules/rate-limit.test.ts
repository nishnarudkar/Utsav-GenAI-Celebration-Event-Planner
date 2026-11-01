import { describe, expect, it } from "vitest";
import { checkRateLimit, spendsAIQuota } from "@/lib/rules/rate-limit";

const LIMIT = { max: 2, windowMs: 60_000 };

describe("checkRateLimit", () => {
  it("allows up to the limit, then says when to retry", () => {
    const windows = new Map();
    expect(checkRateLimit(windows, "a", 0, LIMIT).allowed).toBe(true);
    expect(checkRateLimit(windows, "a", 1_000, LIMIT).allowed).toBe(true);
    expect(checkRateLimit(windows, "a", 30_000, LIMIT)).toEqual({ allowed: false, retryAfterSeconds: 30 });
  });

  it("counts each client separately", () => {
    const windows = new Map();
    checkRateLimit(windows, "a", 0, LIMIT);
    checkRateLimit(windows, "a", 0, LIMIT);
    expect(checkRateLimit(windows, "b", 0, LIMIT).allowed).toBe(true);
  });

  it("starts afresh when the window ends", () => {
    const windows = new Map();
    for (let i = 0; i < 3; i++) checkRateLimit(windows, "a", 0, LIMIT);
    expect(checkRateLimit(windows, "a", 60_000, LIMIT).allowed).toBe(true);
  });

  it("can't be made to grow without bound", () => {
    const windows = new Map();
    for (let i = 0; i < 12_000; i++) checkRateLimit(windows, `ip${i}`, 0, LIMIT);
    expect(windows.size).toBeLessThanOrEqual(5_000);
  });
});

describe("spendsAIQuota", () => {
  const id = "18879082-21ed-4ad5-89d0-9ccfba95f4e8";

  it.each([
    "/api/events",
    ...["quotes", "vibe", "council", "live", "sponsorship", "assistant"].map((r) => `/api/events/${id}/${r}`),
  ])("covers POST %s", (path) => {
    expect(spendsAIQuota("POST", path)).toBe(true);
  });

  it("leaves reads and non-AI writes alone", () => {
    expect(spendsAIQuota("GET", `/api/events/${id}/quotes`)).toBe(false);
    expect(spendsAIQuota("POST", `/api/events/${id}/volunteers`)).toBe(false);
    expect(spendsAIQuota("POST", `/api/events/${id}/undo`)).toBe(false);
    expect(spendsAIQuota("POST", "/api/demo")).toBe(false);
  });
});
