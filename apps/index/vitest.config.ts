import { defineConfig } from "vitest/config";

/** `pnpm test` runs hermetic tests; `pnpm test:testnet` runs the live testnet payment flow. */
export default defineConfig({
  test: {
    include: process.env.E2E === "1" ? ["test/testnet.ts"] : ["test/**/*.test.ts"],
    testTimeout: 240_000,
    hookTimeout: 120_000,
  },
});
