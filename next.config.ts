import type { NextConfig } from "next";

/** Files read from disk at runtime, which Next can't discover by following imports. */
const RUNTIME_FILES = ["./kb/**/*", "./tests/fixtures/llm/**/*", "./public/samples/**/*", "./node_modules/@fontsource/noto-sans/files/noto-sans-latin-*-normal.woff", "./node_modules/@fontsource/noto-sans/files/noto-sans-latin-ext-*-normal.woff"];

const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  outputFileTracingIncludes: { "/api/**/*": RUNTIME_FILES, "/events/**/*": RUNTIME_FILES },
  headers: async () => [{ source: "/:path*", headers: SECURITY_HEADERS }],
};

export default nextConfig;
