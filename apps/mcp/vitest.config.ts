import { defineConfig } from "vitest/config";

/** `pnpm test` runs unit tests; `pnpm e2e` runs the Hermes/stdio flow only. */
export default defineConfig({
  test: {
    include: process.env.E2E === "1" ? ["test/e2e.ts"] : ["test/**/*.test.ts"],
    testTimeout: 180_000,
    hookTimeout: 180_000,
  },
});
