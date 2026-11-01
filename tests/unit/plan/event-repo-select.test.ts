import { describe, expect, it } from "vitest";
import { usesPostgres } from "@/lib/plan/event-repo";

describe("usesPostgres", () => {
  const url = "postgresql://user:pass@example.test:5432/postgres";

  it("saves to the database when one is configured", () => {
    expect(usesPostgres({ DATABASE_URL: url })).toBe(true);
    expect(usesPostgres({ DATABASE_URL: url, DEMO_MODE: "false" })).toBe(true);
  });

  it("keeps demo mode away from the real database", () => {
    expect(usesPostgres({ DATABASE_URL: url, DEMO_MODE: "true" })).toBe(false);
  });

  it("stays in memory without a database", () => {
    expect(usesPostgres({})).toBe(false);
    expect(usesPostgres({ DATABASE_URL: "  " })).toBe(false);
  });
});
