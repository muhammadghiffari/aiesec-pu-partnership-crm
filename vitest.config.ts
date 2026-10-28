import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // PGlite (in-process PostgreSQL, packages/db) needs ~3-5s to boot and migrate.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    include: ["tests/**/*.test.ts", "packages/*/src/**/*.test.ts", "apps/worker/src/**/*.test.ts"],
  },
});
