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
    include: ["packages/*/test/**/*.test.ts", "apps/*/test/**/*.test.ts"],
    exclude: ["**/*.pg.test.ts", "**/node_modules/**"],
    testTimeout: 60000,
  },
});
