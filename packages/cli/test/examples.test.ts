import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { planPostgres, validateConfig } from "@roua-dev/core";

const dir = fileURLToPath(new URL("../../../examples/", import.meta.url));
// The examples are dated around the 0.1 release; validate them as of that day.
const RELEASE_DAY = new Date("2026-11-23T12:00:00Z");

describe("examples", () => {
  const files = readdirSync(dir).filter((f) => f.endsWith(".yaml"));
  it("there is one per profile at least", () => expect(files.length).toBeGreaterThanOrEqual(8));
  it.each(files)("%s is valid and plans", (f) => {
    const v = validateConfig(parse(readFileSync(dir + f, "utf8")), { now: RELEASE_DAY });
    expect(v.errors).toEqual([]);
    const plan = planPostgres(v.config!, { now: RELEASE_DAY, secret: { kind: "placeholder" } });
    expect(plan.setupSql).toContain("COMMIT;");
  });
});
