import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const fromRoot = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: {
      "@": fromRoot("./src"),
      // "server-only" throws outside a React Server Component bundle; stub it in tests.
      "server-only": fromRoot("./tests/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    passWithNoTests: true,
    // Unit tests are tiny; one worker thread keeps memory low on dev laptops (see DECISIONS.md).
    pool: "threads",
    poolOptions: { threads: { singleThread: true } },
    include: ["tests/unit/**/*.test.ts", "tests/unit/**/*.test.tsx"],
  },
});
