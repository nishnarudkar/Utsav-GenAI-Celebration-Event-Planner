import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    passWithNoTests: true,
    include: ["tests/unit/**/*.test.ts", "tests/unit/**/*.test.tsx"],
    // "server-only" throws outside a React Server Component bundle; stub it in tests.
    alias: {
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
    },
  },
});
