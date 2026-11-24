// Integration tests against a real PostgreSQL server (used in CI).
// Requires ROUA_TEST_ADMIN_URL, e.g. postgres://postgres:postgres@localhost:5432/postgres
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@roua-dev/core": r("./packages/core/src/index.ts"),
      "@roua-dev/app": r("./packages/app/src/index.ts"),
    },
  },
  test: {
    include: ["packages/*/test/**/*.pg.test.ts"],
    testTimeout: 60000,
    fileParallelism: false,
  },
});
